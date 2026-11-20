import { authorize, type ChatGPTUser } from '@/app/chatgpt-auth';
import { query, executeBatch } from './neon';
import {
  listTransactionRecords,
  saveTransactionRecord,
} from './transaction-register';
import {
  planAutomaticTransaction,
  type AutomaticOptions,
} from '@/lib/automatic-transaction';
import { amountValue, isoDate } from '@/lib/finance';
import {
  automaticDocumentFormat,
  unsupportedDocumentMessage,
} from '@/lib/document-format';

export async function createAutomaticTransaction(
  documentId: string,
  input: AutomaticOptions & { text: string; extractionError?: string },
  user: ChatGPTUser,
) {
  authorize(user, 'write');
  const org = user.organizationId;
  const document = (
    await query<{
      id: string;
      filename: string;
      mimetype: string;
      linkedid: string | null;
      hash: string | null;
    }>(
      `SELECT id,file_name AS filename,mime_type AS mimetype,linked_transaction_id AS linkedid,content_hash AS hash FROM documents WHERE id=$1 AND organization_id=$2`,
      [documentId, org],
    )
  )[0];
  if (!document) throw new Error('Document not found.');
  const transactions = await listTransactionRecords();
  const existing = transactions.find(
    (t) => t.id === document.linkedid || t.id === 'AUTO-' + documentId,
  );
  if (existing)
    return { status: 'existing' as const, transaction: existing, issues: [] };
  if (document.linkedid)
    throw new Error(
      'This document is already linked. Review its existing record.',
    );
  if (typeof input.text !== 'string' || input.text.length > 100000)
    throw new Error(
      'Provide extracted document text up to 100,000 characters.',
    );
  const sameFile = document.hash
    ? (
        await query<{ id: string }>(
          `SELECT linked_transaction_id AS id FROM documents WHERE organization_id=$1 AND content_hash=$2 AND linked_transaction_id IS NOT NULL LIMIT 1`,
          [org, document.hash],
        )
      )[0]
    : null;
  const sameTransaction = transactions.find((t) => t.id === sameFile?.id);
  const readingIssue = !automaticDocumentFormat(
    document.filename,
    document.mimetype,
  )
    ? unsupportedDocumentMessage
    : typeof input.extractionError === 'string' && input.extractionError.trim()
      ? input.extractionError.trim().slice(0, 500)
      : !input.text.trim()
        ? 'No readable text found. Try another file or enter the transaction details manually.'
        : '';
  const plan = planAutomaticTransaction(
    readingIssue ? '' : input.text,
    documentId,
    input,
  );
  // A failed reader has no evidence to validate. Persist its cause instead of a cascade of missing fields.
  if (readingIssue) plan.issues = [readingIssue];
  const setProcessing = async (status: string) =>
    executeBatch([
      {
        text: 'UPDATE documents SET processing_status=$3,extraction_json=$4 WHERE id=$1 AND organization_id=$2 AND linked_transaction_id IS NULL',
        parameters: [
          documentId,
          org,
          status,
          JSON.stringify({ ...plan.draft, issues: plan.issues }),
        ],
      },
    ]);
  if (sameTransaction) {
    await setProcessing('Duplicate');
    return {
      status: 'duplicate' as const,
      transaction: sameTransaction,
      issues: ['This file already has a transaction.'],
    };
  }
  if (plan.issues.length) {
    await setProcessing('Needs review');
    return {
      status: 'needs_review' as const,
      issues: plan.issues,
      draft: plan.draft,
    };
  }
  try {
    const transaction = await saveTransactionRecord(plan.draft, user);
    return { status: 'created' as const, transaction, issues: [] };
  } catch (error) {
    const rows = await listTransactionRecords();
    const match = rows.find(
      (t) =>
        t.id === plan.draft.id ||
        (t.reference === plan.draft.reference &&
          t.party === plan.draft.party &&
          t.currency === plan.draft.currency &&
          isoDate(t.date) === plan.draft.date &&
          amountValue(t.amount) === amountValue(plan.draft.amount)),
    );
    if (match) {
      await setProcessing('Duplicate');
      return {
        status: 'duplicate' as const,
        transaction: match,
        issues: ['This invoice already has a transaction.'],
      };
    }
    const issue =
      error instanceof Error ? error.message : 'Automatic creation failed.';
    plan.issues.push(issue);
    await setProcessing('Needs review');
    return {
      status: 'needs_review' as const,
      issues: plan.issues,
      draft: plan.draft,
    };
  }
}

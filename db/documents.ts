import { authorize } from '@/app/chatgpt-auth';
import { createHash } from 'node:crypto';
import { workspaceId, scopedKey } from '@/app/chatgpt-auth';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { executeBatch, query } from '@/db/neon';

const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export type DocumentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  status: string;
  linkedReference: string | null;
  uploadedBy: string;
  createdAt: string;
  processingStatus?: string;
  linkedTransactionCount?: number;
  suggestedTransaction?: Record<string, unknown> | null;
};

export async function listDocuments(): Promise<DocumentSummary[]> {
  const organizationId = await workspaceId();
  const rows = await query<{
    id: string;
    filename: string;
    mimetype: string;
    sizebytes: number;
    category: string;
    status: string;
    linkedreference: string | null;
    uploadedby: string | null;
    createdat: string;
    processingstatus: string;
    extractionjson: string | null;
    linkcount: string;
  }>(
    `
    SELECT d.id, d.file_name AS filename, d.mime_type AS mimetype, d.size_bytes AS sizebytes,
      d.category, d.status, d.linked_reference AS linkedreference,
      COALESCE(u.display_name, 'Unknown') AS uploadedby, d.created_at AS createdat,
      d.processing_status AS processingstatus,d.extraction_json AS extractionjson,
      (SELECT COUNT(*) FROM document_transaction_links l JOIN transactions t ON t.id=l.transaction_id WHERE l.document_id=d.id AND l.organization_id=d.organization_id AND t.posting_status != 'deleted') AS linkcount
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.organization_id = $1
    ORDER BY d.created_at DESC
  `,
    [organizationId],
  );

  return rows.map((row) => ({
    id: row.id,
    fileName: row.filename,
    mimeType: row.mimetype,
    sizeBytes: Number(row.sizebytes),
    category: row.category,
    status: row.status,
    linkedReference: row.linkedreference,
    uploadedBy: row.uploadedby || 'Unknown',
    createdAt: row.createdat,
    processingStatus: row.processingstatus,
    linkedTransactionCount: Number(row.linkcount),
    suggestedTransaction: row.extractionjson
      ? JSON.parse(row.extractionjson)
      : null,
  }));
}

export async function uploadDocument(
  input: {
    fileName: string;
    mimeType: string;
    contentBase64: string;
    category?: string;
    linkedReference?: string;
  },
  user: ChatGPTUser,
): Promise<DocumentSummary> {
  const organizationId = await workspaceId();
  if (!input.fileName || !input.contentBase64)
    throw new Error('A file name and file content are required.');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64))
    throw new Error('Invalid file content.');
  const sizeBytes = Buffer.from(input.contentBase64, 'base64').length;
  if (sizeBytes > MAX_SIZE_BYTES) throw new Error('Files are limited to 8 MB.');

  const id = crypto.randomUUID();
  const userId = `user-${stableKey(scopedKey(organizationId, user.userId))}`;
  await executeBatch([
    {
      text: `INSERT INTO organizations (id, name, code, functional_currency, timezone, fiscal_year_start_month)
      VALUES ($1, 'LedgerFlow Organization', $1, 'KHR', 'Asia/Phnom_Penh', 1)
      ON CONFLICT(id) DO NOTHING`,
      parameters: [organizationId],
    },
    {
      text: `INSERT INTO users (id, organization_id, external_user_id, email, display_name, status)
      VALUES ($1, $2, $3, $4, $5, 'active') ON CONFLICT(id) DO UPDATE SET email = excluded.email,
      display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP`,
      parameters: [
        userId,
        organizationId,
        user.userId,
        user.email,
        user.displayName,
      ],
    },
    {
      text: `INSERT INTO documents (id, organization_id, file_name, mime_type, size_bytes, category, status, linked_reference, content_base64, uploaded_by,content_hash)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending review', $7, $8, $9,$10)`,
      parameters: [
        id,
        organizationId,
        input.fileName,
        input.mimeType || 'application/octet-stream',
        sizeBytes,
        input.category || 'Other',
        input.linkedReference || null,
        input.contentBase64,
        userId,
        createHash('sha256')
          .update(Buffer.from(input.contentBase64, 'base64'))
          .digest('hex'),
      ],
    },
  ]);

  const saved = (await listDocuments()).find((d) => d.id === id);
  if (!saved)
    throw new Error('Document was uploaded but could not be reloaded.');
  return saved;
}

export async function getDocumentContent(id: string): Promise<{
  fileName: string;
  mimeType: string;
  contentBase64: string;
} | null> {
  const organizationId = await workspaceId();
  const row = (
    await query<{ filename: string; mimetype: string; content: string }>(
      `
    SELECT file_name AS filename, mime_type AS mimetype, content_base64 AS content
    FROM documents WHERE id = $1 AND organization_id = $2
  `,
      [id, organizationId],
    )
  )[0];
  if (!row) return null;
  return {
    fileName: row.filename,
    mimeType: row.mimetype,
    contentBase64: row.content,
  };
}

function stableKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36).toUpperCase();
}

export async function reviewDocument(
  input: { id: string; linkedReference: string; verify?: boolean },
  user: ChatGPTUser,
) {
  authorize(user, 'write');
  const organizationId = user.organizationId;
  const imported = await query<{ transactiondate: string }>(
    `SELECT t.transaction_date::text AS transactiondate FROM document_transaction_links l JOIN transactions t ON t.id=l.transaction_id WHERE l.document_id=$1 AND l.organization_id=$2 AND t.organization_id=$2 AND t.posting_status != 'deleted'`,
    [input.id, organizationId],
  );
  if (imported.length) {
    await executeBatch(
      [
        {
          text: 'UPDATE documents SET status=$3 WHERE id=$1 AND organization_id=$2',
          parameters: [
            input.id,
            organizationId,
            input.verify ? 'Verified' : 'Pending review',
          ],
        },
        {
          text: `INSERT INTO audit_logs(id,organization_id,action,resource_type,resource_id,new_json,correlation_id) VALUES($1,$2,'review','document',$3,$4,$1)`,
          parameters: [
            crypto.randomUUID(),
            organizationId,
            input.id,
            JSON.stringify({
              actor: user.userId,
              verify: !!input.verify,
              importedRows: imported.length,
            }),
          ],
        },
      ],
      {
        organizationId,
        dates: [
          ...new Set(
            imported.map((t) => t.transactiondate.slice(0, 7) + '-01'),
          ),
        ],
      },
    );
    return listDocuments();
  }
  if (!input.linkedReference?.trim())
    throw new Error(
      'Link an existing transaction reference before verification.',
    );
  await executeBatch(
    [
      {
        text: `SELECT ledgerflow_assert(EXISTS(SELECT 1 FROM documents WHERE id=$1 AND organization_id=$2), 'Document not found.')`,
        parameters: [input.id, organizationId],
      },
      {
        text: `SELECT ledgerflow_assert((SELECT COUNT(*) = 1 FROM transactions WHERE (reference_number=$1 OR id=$1) AND organization_id=$2 AND posting_status != 'deleted'), 'Use a unique transaction ID or reference.')`,
        parameters: [input.linkedReference.trim(), organizationId],
      },
      {
        text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transactions t JOIN closed_periods c ON c.organization_id=t.organization_id AND c.period=to_char(t.transaction_date,'YYYY-MM') WHERE t.organization_id=$1 AND (t.reference_number=$2 OR t.id=$2 OR t.id=(SELECT linked_transaction_id FROM documents WHERE id=$3))), 'Reopen the period before changing its evidence.')`,
        parameters: [organizationId, input.linkedReference.trim(), input.id],
      },
      {
        text: `UPDATE documents SET linked_reference=$3,status=$4,linked_transaction_id=(SELECT id FROM transactions WHERE organization_id=$2 AND (reference_number=$3 OR id=$3) AND posting_status != 'deleted') WHERE id=$1 AND organization_id=$2`,
        parameters: [
          input.id,
          organizationId,
          input.linkedReference.trim(),
          input.verify ? 'Verified' : 'Pending review',
        ],
      },
      {
        text: `INSERT INTO audit_logs(id,organization_id,action,resource_type,resource_id,new_json,correlation_id) VALUES($1,$2,'review','document',$3,$4,$1)`,
        parameters: [
          crypto.randomUUID(),
          organizationId,
          input.id,
          JSON.stringify({ ...input, actor: user.userId }),
        ],
      },
    ],
    { organizationId },
  );
  return listDocuments();
}

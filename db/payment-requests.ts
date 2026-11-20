import {
  authorize,
  scopedKey,
  workspaceId,
  type ChatGPTUser,
} from '@/app/chatgpt-auth';
import { executeBatch, query } from './neon';
import {
  listTransactionRecords,
  saveTransactionRecord,
} from './transaction-register';
import { isoDate, minor } from '@/lib/finance';

export type RequestInput = {
  requestId?: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  exchangeRate: string;
  party: string;
  department: string;
  date: string;
  dueDate?: string;
  reference: string;
};
export type PaymentRequestItem = RequestInput & {
  id: string;
  status: string;
  canSubmit: boolean;
};
export async function listPaymentRequests(): Promise<PaymentRequestItem[]> {
  const org = await workspaceId();
  const [rows, transactions] = await Promise.all([
    query<{
      id: string;
      title: string;
      category: string;
      amountminor: string;
      currency: string;
      status: string;
      metadata: string | null;
    }>(
      `SELECT request_number AS id,title,category,amount_minor AS amountminor,currency,status,metadata_json AS metadata FROM payment_requests WHERE organization_id=$1 ORDER BY created_at DESC`,
      [org],
    ),
    listTransactionRecords(),
  ]);
  return rows.map((row) => {
    const details = row.metadata
      ? (JSON.parse(row.metadata) as RequestInput)
      : null;
    const transaction = transactions.find((item) => item.id === row.id);
    return {
      title: row.title,
      category: row.category,
      amount: Number(row.amountminor) / 100,
      currency: row.currency,
      exchangeRate: '',
      party: '',
      department: '',
      date: '',
      reference: '',
      ...details,
      id: row.id,
      status: transaction
        ? transaction.status === 'Paid'
          ? 'Paid'
          : transaction.approval
        : row.status,
      canSubmit: !!details && !transaction,
    };
  });
}
export async function createPaymentRequest(
  input: RequestInput,
  user: ChatGPTUser,
) {
  authorize(user, 'write');
  const org = user.organizationId;
  if (
    ![
      input.title,
      input.party,
      input.department,
      input.reference,
      input.category,
    ].every((v) => typeof v === 'string' && v.trim())
  )
    throw new Error('Complete the request details.');
  if (
    !['KHR', 'USD'].includes(input.currency) ||
    !Number.isFinite(Number(input.exchangeRate)) ||
    Number(input.exchangeRate) <= 0 ||
    minor(input.amount) <= 0
  )
    throw new Error('Enter a positive amount and exchange rate.');
  input.date = isoDate(input.date);
  if (input.dueDate) input.dueDate = isoDate(input.dueDate);
  const id = input.requestId || `REQ-${crypto.randomUUID()}`;
  const previous = input.requestId
    ? (
        await query<{ id: string; metadata: string | null }>(
          'SELECT id,metadata_json AS metadata FROM payment_requests WHERE request_number=$1 AND organization_id=$2',
          [id, org],
        )
      )[0]
    : null;
  if (input.requestId && !previous) throw new Error('Draft not found.');
  await executeBatch(
    [
      {
        text: `SELECT ledgerflow_assert(NOT EXISTS(SELECT 1 FROM transactions WHERE id=$1 AND organization_id=$2), 'Submitted requests must be edited from Transactions.')`,
        parameters: [id, org],
      },
      {
        text: `INSERT INTO organizations(id,name,code) VALUES($1,'LedgerFlow Organization',$1) ON CONFLICT DO NOTHING`,
        parameters: [org],
      },
      {
        text: `INSERT INTO payment_requests(id,organization_id,request_number,title,category,amount_minor,currency,status,metadata_json)
      VALUES($1,$2,$3,$4,$5,$6,$7,'Draft',$8) ON CONFLICT(organization_id,request_number) DO UPDATE SET title=excluded.title,category=excluded.category,amount_minor=excluded.amount_minor,currency=excluded.currency,metadata_json=excluded.metadata_json,version=payment_requests.version+1,updated_at=now()`,
        parameters: [
          previous?.id || scopedKey(org, id),
          org,
          id,
          input.title,
          input.category,
          minor(input.amount),
          input.currency,
          JSON.stringify(input),
        ],
      },
    ],
    { organizationId: org, dates: [input.date] },
  );
  return listPaymentRequests();
}
export async function submitPaymentRequest(id: string, user: ChatGPTUser) {
  authorize(user, 'write');
  const input = (await listPaymentRequests()).find((row) => row.id === id);
  if (!input) throw new Error('Request not found.');
  if (!input.canSubmit)
    throw new Error(
      'Request has already been submitted, or is a legacy draft without required details.',
    );
  await saveTransactionRecord(
    {
      id,
      date: input.date,
      type: 'Expense',
      reference: input.reference,
      party: input.party,
      department: input.department,
      category: input.category,
      amount: String(input.amount),
      currency: input.currency,
      exchangeRate: input.currency === 'KHR' ? '1' : input.exchangeRate,
      description: input.title,
      dueDate: input.dueDate,
      approval: 'Finance review',
      status: 'Pending',
      owner: user.displayName,
      documentType: 'Payment request',
      tax: '0',
      subtotal: String(input.amount),
    },
    user,
  );
  return listPaymentRequests();
}

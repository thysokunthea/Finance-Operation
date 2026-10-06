import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listTransactionRecords } from '@/db/transaction-register';
import { listBudgets } from '@/db/budgets';
import { listTasks } from '@/db/tasks';
import { listPaymentRequests } from '@/db/payment-requests';
import { listDocuments } from '@/db/documents';
import { listPendingApprovals } from '@/db/approval-workflow';
import { closingChecklist, getClosingStatus } from '@/db/closing';
import { getComplianceSettings } from '@/db/compliance-settings';

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';
const MAX_HISTORY_MESSAGES = 12;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

function currentPeriodKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return Response.json({ error: 'AI Assistant is not configured. Add OPENROUTER_API_KEY to enable live answers.' }, { status: 503 });

  let messages: ChatMessage[];
  try {
    const body = (await request.json()) as { question?: string; messages?: ChatMessage[] };
    if (Array.isArray(body.messages) && body.messages.length) {
      messages = body.messages
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .map((message) => ({ role: message.role, content: message.content.slice(0, 2000) }))
        .slice(-MAX_HISTORY_MESSAGES);
    } else {
      const question = (body.question || '').slice(0, 2000);
      if (!question.trim()) throw new Error('empty');
      messages = [{ role: 'user', content: question }];
    }
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') throw new Error('empty');
  } catch {
    return Response.json({ error: 'A question is required.' }, { status: 400 });
  }

  const period = currentPeriodKey();
  const [transactions, budgets, tasks, paymentRequests, documents, approvals, closingStatus, compliance] = await Promise.all([
    listTransactionRecords(),
    listBudgets(),
    listTasks(),
    listPaymentRequests(),
    listDocuments(),
    listPendingApprovals(),
    getClosingStatus(period),
    getComplianceSettings(),
  ]);

  const context = {
    today: new Date().toISOString().slice(0, 10),
    currentPeriod: period,
    transactionCount: transactions.length,
    transactions: transactions.slice(0, 500).map((t) => ({
      id: t.id, date: t.date, type: t.type, party: t.party, department: t.department,
      category: t.category, amount: t.amount, currency: t.currency, status: t.status,
      approval: t.approval, dueDate: t.dueDate, taxTreatment: t.taxTreatment,
      journalType: t.journalType, accountCode: t.accountCode, accountName: t.accountName,
    })),
    budgets,
    tasks: tasks.map((item) => ({ id: item.id, name: item.name, category: item.category, related: item.related, due: item.due, priority: item.priority, status: item.status })),
    paymentRequests: paymentRequests.map((item) => ({ id: item.id, title: item.title, category: item.category, amount: item.amount, currency: item.currency, status: item.status })),
    documents: documents.map((doc) => ({ fileName: doc.fileName, category: doc.category, status: doc.status, linkedReference: doc.linkedReference, sizeBytes: doc.sizeBytes })),
    pendingApprovals: approvals.map((item) => ({ id: item.id, name: item.name, amount: item.amount, status: item.status, department: item.department, date: item.date, owner: item.owner })),
    monthlyClosing: { period, checklist: closingChecklist, status: closingStatus },
    complianceProfile: compliance,
  };

  const systemPrompt = `You are LedgerFlow's finance assistant for a Cambodia-based SME finance operations workspace. The organization uses KHR (Cambodian riel) as statutory currency and USD as a common secondary transaction currency; amounts in the data are pre-formatted currency strings.

You have read-only access to the organization's live transactions, budgets, tasks, payment requests, documents, pending approvals, the current month's closing checklist, and its compliance profile — all provided as JSON below. Ground every answer strictly in this data: never invent numbers, customers, vendors, dates, or records that are not present in it. If the data does not contain what's needed to answer, say so plainly and suggest where in the app the user could find or enter it (e.g. "Add this on the Budgets page").

Each transaction also carries journalType (one of: sales, purchases, cash_receipts, cash_disbursements, general — the Cambodia GDT small-taxpayer special journal it's recorded in) and accountCode/accountName (a simplified chart-of-accounts tag). This is single-entry tagging, not full double-entry — there are no separate debit/credit lines to reconcile. Use these fields when asked about journals, specific accounts, or account balances (e.g. "what's in the sales journal this month?" or "how much is in Software & Subscriptions?").

Be genuinely useful, not just literal:
- Reason across multiple data sources together when relevant (e.g. connect overdue invoices to cash flow, or a pending approval to a task).
- Surface trends, concentrations, and risks the user didn't explicitly ask about when they're clearly relevant (e.g. "3 of these 5 overdue invoices are from the same customer").
- When asked open-ended questions ("how are we doing?", "anything I should worry about?"), proactively synthesize an overview from the most material items rather than picking one metric arbitrarily.
- Do basic math yourself (sums, percentages, month-over-month deltas) rather than just listing raw rows.
- Remember the conversation so far and answer follow-ups in context (e.g. "what about last month?" refers to whatever you were just discussing).

Formatting: keep answers focused and skimmable — short paragraphs or a tight bullet list, not a wall of text. Quote amounts using the currency already present in the record (e.g. $1,234.56 or ៛450,000). You are strictly read-only: never imply you can post, approve, pay, or edit anything — only report and recommend.

DATA:
${JSON.stringify(context)}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ledgerflow.app',
        'X-Title': 'LedgerFlow Finance Assistant',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.3,
        max_tokens: 900,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `AI Assistant request failed: ${errText.slice(0, 200)}` }, { status: 502 });
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) return Response.json({ error: 'AI Assistant returned an empty response.' }, { status: 502 });
    return Response.json({ answer });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'AI Assistant request failed.' }, { status: 502 });
  }
}

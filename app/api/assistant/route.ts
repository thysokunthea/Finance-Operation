import { getChatGPTUser } from '@/app/chatgpt-auth';
import { listTransactionRecords } from '@/db/transaction-register';
import { listBudgets } from '@/db/budgets';

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return Response.json({ error: 'AI Assistant is not configured. Add OPENROUTER_API_KEY to enable live answers.' }, { status: 503 });

  let question: string;
  try {
    const body = (await request.json()) as { question: string };
    question = (body.question || '').slice(0, 2000);
    if (!question.trim()) throw new Error('empty');
  } catch {
    return Response.json({ error: 'A question is required.' }, { status: 400 });
  }

  const [transactions, budgets] = await Promise.all([listTransactionRecords(), listBudgets()]);
  const context = {
    transactionCount: transactions.length,
    transactions: transactions.slice(0, 200).map((t) => ({
      date: t.date, type: t.type, party: t.party, department: t.department,
      amount: t.amount, status: t.status, approval: t.approval, dueDate: t.dueDate,
    })),
    budgets,
  };

  const systemPrompt = `You are LedgerFlow's finance assistant. Answer only using the JSON data provided below — never invent numbers, customers, or transactions that are not present in it. If the data does not contain the answer, say so plainly. Keep answers concise (2-4 sentences), quote dollar amounts formatted like $1,234.56, and never claim posting or approval authority — you are read-only.

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
          { role: 'user', content: question },
        ],
        temperature: 0.2,
        max_tokens: 400,
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

import { FinanceShell } from '@/components/finance-shell';
import { TransactionsContent } from '@/components/transactions-content';
import { getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';
export default async function ExpensesApPage() { const user = await getChatGPTUser(); return <FinanceShell active="expenses-ap" userName={user?.displayName ?? 'Jordan Lee'} userEmail={user?.email ?? 'finance.manager@northstar.demo'} demo={!user}><TransactionsContent type="Expense" /></FinanceShell>; }

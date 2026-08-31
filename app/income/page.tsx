import { FinanceShell } from '@/components/finance-shell';
import { TransactionsContent } from '@/components/transactions-content';
import { getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';
export default async function IncomePage() { const user = await getChatGPTUser(); return <FinanceShell active="income" userName={user?.displayName ?? 'Jordan Lee'} userEmail={user?.email ?? 'finance.manager@northstar.demo'} demo={!user}><TransactionsContent type="Income" /></FinanceShell>; }

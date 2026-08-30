import { FinanceShell } from '@/components/finance-shell';
import { TransactionsContent } from '@/components/transactions-content';
import { getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const user = await getChatGPTUser();
  return <FinanceShell active="transactions" userName={user?.displayName ?? 'Jordan Lee'} userEmail={user?.email ?? 'finance.manager@northstar.demo'} demo={!user}><TransactionsContent /></FinanceShell>;
}

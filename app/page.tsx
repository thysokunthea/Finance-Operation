import { DashboardContent } from '@/components/dashboard-content';
import { FinanceShell } from '@/components/finance-shell';
import { getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <FinanceShell active="dashboard" userName={user?.displayName ?? 'Jordan Lee'} userEmail={user?.email ?? 'finance.manager@northstar.demo'} demo={!user}>
      <DashboardContent />
    </FinanceShell>
  );
}

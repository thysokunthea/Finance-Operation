import { FinanceShell } from '@/components/finance-shell';
import { VendorsContent } from '@/components/vendors-content';
import { getChatGPTUser } from '../chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function VendorsPage() {
  const user = await getChatGPTUser();
  return (
    <FinanceShell
      active="vendors"
      userName={user?.displayName ?? 'Guest'}
      userEmail={user?.email ?? ''}
      demo={!user}
    >
      <VendorsContent />
    </FinanceShell>
  );
}

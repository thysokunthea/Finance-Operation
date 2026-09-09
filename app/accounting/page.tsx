import { FinanceShell } from '@/components/finance-shell';
import { ExtendedModuleContent } from '@/components/extended-module-content';
import { getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';
export default async function AccountingPage() { const user = await getChatGPTUser(); return <FinanceShell active="accounting" userName={user?.displayName ?? 'Jordan Lee'} userEmail={user?.email ?? 'finance.manager@northstar.demo'} demo={!user}><ExtendedModuleContent kind="accounting" /></FinanceShell>; }

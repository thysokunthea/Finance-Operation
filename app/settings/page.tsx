import { ExtendedModuleContent } from '@/components/extended-module-content';
import { FinanceShell } from '@/components/finance-shell';
import { getChatGPTUser } from '../chatgpt-auth';

export const dynamic = 'force-dynamic';
export default async function SettingsPage() { const user = await getChatGPTUser(); return <FinanceShell active="settings" userName={user?.displayName ?? 'Jordan Lee'} userEmail={user?.email ?? 'finance.manager@northstar.demo'} demo={!user}><ExtendedModuleContent kind="settings" /></FinanceShell>; }

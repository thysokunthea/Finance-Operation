import { FinanceShell } from '@/components/finance-shell'; import { LedgerModule } from '@/components/ledger-module'; import { getChatGPTUser } from '../chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page(){const user=await getChatGPTUser();return <FinanceShell active="receivables" userName={user?.displayName??'Jordan Lee'} userEmail={user?.email??'finance.manager@northstar.demo'} demo={!user}><LedgerModule kind="ar" /></FinanceShell>}

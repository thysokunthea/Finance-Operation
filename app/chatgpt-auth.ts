import { cache } from 'react';
import { redirect } from 'next/navigation';

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
  organizationId: string;
  role: FinanceRole;
};

const SIGN_IN_PATH = '/signin-with-chatgpt';
const SIGN_OUT_PATH = '/signout-with-chatgpt';
const CALLBACK_PATH = '/callback';

async function readFinanceUser(): Promise<ChatGPTUser | null> {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const { currentUser } = await import('@clerk/nextjs/server');
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!user || !email) return null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const metadata = user.publicMetadata as {
    financeRole?: string;
    financeOrganizationId?: string;
  };
  const admins = (process.env.FINANCE_ADMIN_EMAILS || '')
    .toLowerCase()
    .split(',')
    .map((item) => item.trim());
  const bootstrapAdmin =
    user.primaryEmailAddress?.verification?.status === 'verified' &&
    admins.includes(email.toLowerCase());
  const role = bootstrapAdmin ? 'admin' : metadata.financeRole;
  return {
    userId: user.id,
    email,
    fullName: fullName || null,
    displayName: fullName || email,
    organizationId:
      metadata.financeOrganizationId ||
      (bootstrapAdmin
        ? process.env.FINANCE_ORGANIZATION_ID || 'ledgerflow-org'
        : ''),
    role: ['admin', 'finance', 'approver', 'viewer'].includes(role || '')
      ? (role as FinanceRole)
      : 'unassigned',
  };
}
export const getChatGPTUser = cache(readFinanceUser);

export type FinanceRole =
  | 'admin'
  | 'finance'
  | 'approver'
  | 'viewer'
  | 'unassigned';
export type Permission = 'read' | 'write' | 'approve' | 'admin';
export function authorize(user: ChatGPTUser, permission: Permission = 'read') {
  const allowed =
    permission === 'read'
      ? ['admin', 'finance', 'approver', 'viewer']
      : permission === 'write'
        ? ['admin', 'finance']
        : permission === 'approve'
          ? ['admin', 'approver']
          : ['admin'];
  if (!user.organizationId || !allowed.includes(user.role))
    throw new Error(
      'Forbidden: your workspace role does not permit this action.',
    );
}
export async function workspaceId() {
  const user = await getChatGPTUser();
  if (!user) throw new Error('Authentication required.');
  authorize(user);
  return user.organizationId;
}
export function scopedKey(organization: string, value: string) {
  return organization === 'ledgerflow-org' ? value : organization + ':' + value;
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';

  let url: URL;
  try {
    url = new URL(value, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

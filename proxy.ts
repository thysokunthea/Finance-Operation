import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';

function isPublicRoute(pathname: string) {
  return (
    pathname === '/api/health' ||
    pathname === '/sign-in' ||
    pathname.startsWith('/sign-in/')
  );
}

function signedOutResponse(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = pathname.startsWith('/api/')
    ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    : NextResponse.redirect(
        new URL(`/sign-in?redirect_url=${encodeURIComponent(pathname)}`, request.url),
      );
  response.cookies.delete('__session');
  response.cookies.delete('__client_uat');
  response.cookies.delete('__clerk_db_jwt');
  return response;
}

const handleClerk = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (isPublicRoute(pathname)) return;

  const { userId, redirectToSignIn } = await auth();
  if (userId) return;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return redirectToSignIn({ returnBackUrl: request.url });
});

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  try {
    return await handleClerk(request, event);
  } catch {
    // Stale/mismatched Clerk session or handshake token (e.g. from a prior Clerk
    // instance): treat as signed out instead of crashing the request.
    return signedOutResponse(request);
  }
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|mjs|webmanifest)).*)',
    '/(api)(.*)',
  ],
};

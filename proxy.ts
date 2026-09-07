import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

function isPublicRoute(pathname: string) {
  return (
    pathname === '/api/health' ||
    pathname === '/sign-in' ||
    pathname.startsWith('/sign-in/')
  );
}

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  if (isPublicRoute(pathname)) return;

  const { userId, redirectToSignIn } = await auth();
  if (userId) return;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return redirectToSignIn({ returnBackUrl: request.url });
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|mjs|webmanifest)).*)',
    '/(api)(.*)',
  ],
};

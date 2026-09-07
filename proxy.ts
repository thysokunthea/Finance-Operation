import { clerkMiddleware } from '@clerk/nextjs/server';

function isPublicRoute(pathname: string) {
  return pathname === '/sign-in' || pathname.startsWith('/sign-in/');
}

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request.nextUrl.pathname)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|mjs|webmanifest)).*)',
    '/(api)(.*)',
  ],
};

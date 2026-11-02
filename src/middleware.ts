import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/user');

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/admin/:path*', '/driver/:path*', '/user/:path*'],
};

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

// Edge-safe auth gate: decodes the Auth.js JWT cookie with jose — MUST NOT import
// Prisma/pg/next-auth config here (Node-only deps break the edge runtime).
export default async function proxy(req: NextRequest) {
  // Production (HTTPS) stores the session in `__Secure-authjs.session-token`; without
  // this flag getToken looks for the unprefixed cookie name, never finds it, and
  // bounces every authenticated navigation back to /login.
  const isHttps =
    req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie: isHttps });
  const isLoggedIn = Boolean(token?.sub);

  const { pathname } = req.nextUrl;
  const isProtected =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/driver') ||
    pathname.startsWith('/user');

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/driver/:path*', '/user/:path*'],
};
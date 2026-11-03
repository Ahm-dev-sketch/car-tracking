import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

// Edge-safe auth gate: decodes the Auth.js JWT cookie with jose — MUST NOT import
// Prisma/pg/next-auth config here (Node-only deps break the edge runtime).
export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
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
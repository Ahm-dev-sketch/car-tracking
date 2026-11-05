import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { encode } from 'next-auth/jwt';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email).toLowerCase().trim();
        const password = String(credentials.password);

        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.code,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.userId as string) ?? (token.sub as string);
        session.user.role = token.role as string;
        if (process.env.AUTH_SECRET) {
          try {
            (session as unknown as { token?: string }).token = await encode({
              token: {
                userId: session.user.id,
                sub: session.user.id,
                role: session.user.role,
                exp: Math.floor(Date.now() / 1000) + 3600 * 24,
              },
              secret: process.env.AUTH_SECRET,
              salt: 'authjs.session-token',
            });
          } catch {
            // Non-fatal if token encoding fails
          }
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

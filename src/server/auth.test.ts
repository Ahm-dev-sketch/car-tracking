import { describe, it, expect, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import bcrypt from 'bcryptjs';
import { ApiError } from '@/lib/errors';
import { requireRole, getSessionUser } from '@/lib/auth-guard';
import type { Session } from 'next-auth';

describe('Auth & Security Unit Tests', () => {
  describe('bcryptjs hash and verify roundtrip', () => {
    it('hashes password and verifies successfully with correct password', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await bcrypt.hash(password, 10);

      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);

      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('rejects incorrect password against valid hash', async () => {
      const password = 'CorrectPassword123';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare('WrongPassword456', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('ApiError behavior', () => {
    it('creates error with status, code and message', () => {
      const error = new ApiError(403, 'FORBIDDEN', 'Access denied');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect(error.status).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Access denied');
    });

    it('preserves optional details', () => {
      const details = { field: 'email', reason: 'already taken' };
      const error = new ApiError(409, 'CONFLICT', 'Resource exists', details);
      expect(error.details).toEqual(details);
    });
  });

  describe('Role Guard (requireRole and getSessionUser)', () => {
    const adminSession: Session = {
      user: {
        id: 'usr_admin',
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
      expires: '2099-01-01',
    };

    const userSession: Session = {
      user: {
        id: 'usr_user',
        name: 'Normal User',
        email: 'user@example.com',
        role: 'USER',
      },
      expires: '2099-01-01',
    };

    it('allows user with matching role', () => {
      expect(() => requireRole(adminSession, 'ADMIN')).not.toThrow();
      const user = requireRole(adminSession, 'ADMIN');
      expect(user.id).toBe('usr_admin');
      expect(user.role).toBe('ADMIN');
    });

    it('allows user matching any of the allowed roles', () => {
      expect(() => requireRole(userSession, 'ADMIN', 'USER')).not.toThrow();
    });

    it('rejects user with wrong role and throws 403 ApiError', () => {
      expect(() => requireRole(userSession, 'ADMIN')).toThrowError(ApiError);
      try {
        requireRole(userSession, 'ADMIN');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.code).toBe('FORBIDDEN');
      }
    });

    it('rejects null or undefined session with 401 ApiError', () => {
      expect(() => requireRole(null, 'ADMIN')).toThrowError(ApiError);
      try {
        requireRole(null, 'ADMIN');
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.code).toBe('UNAUTHORIZED');
      }
    });

    it('getSessionUser returns typed user from valid session', async () => {
      const user = await getSessionUser(adminSession);
      expect(user.id).toBe('usr_admin');
      expect(user.role).toBe('ADMIN');
    });

    it('getSessionUser throws 401 ApiError if session is null', async () => {
      await expect(getSessionUser(null)).rejects.toThrowError(ApiError);
      try {
        await getSessionUser(null);
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.code).toBe('UNAUTHORIZED');
      }
    });
  });
});

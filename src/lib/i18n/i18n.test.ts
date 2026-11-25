import { describe, expect, it } from 'vitest';
import { id } from './id';
import { en } from './en';
import {
  DEFAULT_LOCALE,
  formatEtaText,
  formatMessage,
  resolveLocale,
  translateMovement,
  translateStatus,
} from './index';

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (Array.isArray(obj)) {
    return obj.flatMap((item, idx) => collectKeys(item, `${prefix}[${idx}]`));
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([key, value]) =>
      collectKeys(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

function getValueAtPath(obj: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

describe('i18n dictionaries & helpers', () => {
  it('defaults to Indonesian (id)', () => {
    expect(DEFAULT_LOCALE).toBe('id');
    expect(resolveLocale(undefined)).toBe('id');
    expect(resolveLocale('')).toBe('id');
    expect(resolveLocale('fr')).toBe('id');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('id-ID')).toBe('id');
  });

  it('has 100% key parity and non-empty strings between id and en', () => {
    const idKeys = collectKeys(id);
    const enKeys = collectKeys(en);

    expect(enKeys).toEqual(idKeys);

    for (const key of idKeys) {
      const idVal = getValueAtPath(id, key);
      const enVal = getValueAtPath(en, key);
      expect(typeof idVal, `id.${key} should be string`).toBe('string');
      expect(typeof enVal, `en.${key} should be string`).toBe('string');
      expect((idVal as string).trim().length, `id.${key} should be non-empty`).toBeGreaterThan(0);
      expect((enVal as string).trim().length, `en.${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('translates statuses cleanly without leaving raw UPPER_SNAKE_CASE enums', () => {
    const knownStatuses = [
      'PENDING',
      'APPROVED',
      'SEARCHING_DRIVER',
      'DRIVER_NOTIFIED',
      'DRIVER_ASSIGNED',
      'DRIVER_EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'REJECTED',
      'NO_DRIVER_AVAILABLE',
      'ADMIN_INTERVENTION',
      'AVAILABLE',
      'RESERVED',
      'IN_USE',
      'MAINTENANCE',
      'INACTIVE',
      'OFFLINE',
      'ONLINE',
      'ON_TRIP',
      'ACTIVE',
      'ABORTED',
    ];

    for (const status of knownStatuses) {
      const idLabel = translateStatus('id', status);
      const enLabel = translateStatus('en', status);
      expect(idLabel).not.toContain('_');
      expect(enLabel).not.toContain('_');
      expect(idLabel === status && status.length > 2).toBe(false);
    }

    expect(translateStatus('id', 'PENDING')).toBe('Menunggu Persetujuan Admin');
    expect(translateStatus('en', 'PENDING')).toBe('Awaiting Admin Approval');
    expect(translateStatus('id', 'PENDING_COMPLETION', false)).toBe('Menunggu Nota Dinas');
    expect(translateStatus('id', 'PENDING_COMPLETION', true)).toBe('Menunggu Verifikasi Nota');
    expect(translateStatus('en', 'PENDING_COMPLETION', false)).toBe('Awaiting Official Note');
    expect(translateStatus('en', 'PENDING_COMPLETION', true)).toBe('Verifying Official Note');
  });

  it('formats template messages, movement states, and ETA labels', () => {
    expect(formatMessage('Halo {name} ({count})', { name: 'Budi', count: 3 })).toBe('Halo Budi (3)');
    expect(translateMovement('id', 'MOVING')).toBe('Bergerak');
    expect(translateMovement('en', 'NO_SIGNAL')).toBe('GPS Lost');
    expect(formatEtaText('id', 180, true)).toBe('~3 mnt (estimasi)');
    expect(formatEtaText('en', 180, false)).toBe('~3 min');
  });
});

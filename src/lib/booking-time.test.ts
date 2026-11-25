import { describe, expect, it } from 'vitest';
import {
  formatBookingDateTime,
  formatJakartaDate,
  formatJakartaTime,
  isLastMinuteBooking,
} from './booking-time';

describe('booking-time helpers (Asia/Jakarta WIB)', () => {
  it('formats timestamps in Asia/Jakarta for id and en locales', () => {
    // 2026-11-25T08:55:00Z === 2026-11-25 15:55 WIB
    const iso = '2026-11-25T08:55:00.000Z';

    const idFormatted = formatBookingDateTime(iso, 'id');
    expect(idFormatted).toContain('25');
    expect(idFormatted).toContain('Nov');
    expect(idFormatted).toContain('2026');
    expect(idFormatted).toMatch(/15[.:]55\s*WIB/);

    const enFormatted = formatBookingDateTime(iso, 'en');
    expect(enFormatted).toContain('Nov');
    expect(enFormatted).toContain('25');
    expect(enFormatted).toContain('2026');
    expect(enFormatted).toMatch(/3:55\s*PM\s*WIB/);

    expect(formatJakartaDate(iso, 'id', { includeYear: true })).toContain('2026');
    expect(formatJakartaTime(iso, 'id')).toMatch(/15[.:]55\s*WIB/);
    expect(formatJakartaTime(iso, 'en')).toMatch(/3:55\s*PM\s*WIB/);
  });

  it('returns fallback dash on null or invalid dates', () => {
    expect(formatBookingDateTime(null, 'id')).toBe('—');
    expect(formatBookingDateTime('not-a-date', 'en')).toBe('—');
    expect(formatJakartaTime(undefined, 'id')).toBe('—');
  });

  it('flags last-minute bookings when departure is less than 60 minutes after creation', () => {
    const createdAt = '2026-11-25T08:00:00.000Z';
    expect(isLastMinuteBooking(createdAt, '2026-11-25T08:30:00.000Z')).toBe(true);
    expect(isLastMinuteBooking(createdAt, '2026-11-25T08:59:00.000Z')).toBe(true);
    expect(isLastMinuteBooking(createdAt, '2026-11-25T09:00:00.000Z')).toBe(false);
    expect(isLastMinuteBooking(createdAt, '2026-11-25T10:00:00.000Z')).toBe(false);
    // Slight negative clock skew when requesting immediate departure
    expect(isLastMinuteBooking(createdAt, '2026-11-25T07:58:00.000Z')).toBe(true);
    // Backdated departure from previous day is not flagged as last-minute
    expect(isLastMinuteBooking(createdAt, '2026-11-24T08:00:00.000Z')).toBe(false);
  });
});

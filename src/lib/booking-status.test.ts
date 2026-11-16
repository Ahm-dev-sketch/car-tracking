import { describe, expect, it } from 'vitest';
import {
  PRE_DEPARTURE_STATUSES,
  TERMINAL_STATUSES,
  selectNextDeparture,
} from './booking-status';

const NOW = new Date('2026-11-16T09:00:00Z');

const booking = (overrides: { status: string; departureAt?: string } = { status: 'PENDING', departureAt: '2026-11-16T10:00:00Z' }) => ({
  id: 'b1',
  status: overrides.status,
  departureAt: overrides.departureAt ?? '2026-11-16T10:00:00Z',
});

describe('PRE_DEPARTURE_STATUSES', () => {
  it('includes genuine pre-departure statuses', () => {
    for (const s of ['PENDING', 'APPROVED', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED']) {
      expect(PRE_DEPARTURE_STATUSES).toContain(s);
    }
  });

  it('excludes terminal/post-trip statuses', () => {
    for (const s of ['CANCELLED', 'REJECTED', 'COMPLETED', 'PENDING_COMPLETION', 'NO_DRIVER_AVAILABLE', 'ADMIN_INTERVENTION']) {
      expect(PRE_DEPARTURE_STATUSES).not.toContain(s);
      expect(TERMINAL_STATUSES).toContain(s);
    }
  });
});

describe('selectNextDeparture', () => {
  it('returns the soonest upcoming pre-departure booking', () => {
    const result = selectNextDeparture(
      [
        booking({ status: 'PENDING', departureAt: '2026-11-16T14:00:00Z' }),
        booking({ status: 'APPROVED', departureAt: '2026-11-16T11:00:00Z' }),
      ],
      NOW,
    );
    expect(result?.departureAt).toBe('2026-11-16T11:00:00Z');
  });

  it('never selects a CANCELLED booking', () => {
    const result = selectNextDeparture(
      [booking({ status: 'CANCELLED', departureAt: '2026-11-16T14:00:00Z' })],
      NOW,
    );
    expect(result).toBeUndefined();
  });

  it('never selects a PENDING_COMPLETION (Menunggu Approval Nota) booking', () => {
    const result = selectNextDeparture(
      [booking({ status: 'PENDING_COMPLETION', departureAt: '2026-11-16T14:00:00Z' })],
      NOW,
    );
    expect(result).toBeUndefined();
  });

  it('never selects COMPLETED or other terminal statuses', () => {
    for (const s of ['COMPLETED', 'REJECTED', 'NO_DRIVER_AVAILABLE', 'ADMIN_INTERVENTION']) {
      const result = selectNextDeparture(
        [booking({ status: s, departureAt: '2026-11-16T14:00:00Z' })],
        NOW,
      );
      expect(result).toBeUndefined();
    }
  });

  it('ignores a pre-departure booking whose departure is in the past', () => {
    const result = selectNextDeparture(
      [booking({ status: 'PENDING', departureAt: '2026-11-16T08:00:00Z' })],
      NOW,
    );
    expect(result).toBeUndefined();
  });

  it('skips terminal bookings and still finds a valid upcoming one', () => {
    const result = selectNextDeparture(
      [
        booking({ status: 'CANCELLED', departureAt: '2026-11-16T10:30:00Z' }),
        booking({ status: 'PENDING_COMPLETION', departureAt: '2026-11-16T10:15:00Z' }),
        booking({ status: 'PENDING', departureAt: '2026-11-16T12:00:00Z' }),
      ],
      NOW,
    );
    expect(result?.status).toBe('PENDING');
    expect(result?.departureAt).toBe('2026-11-16T12:00:00Z');
  });

  it('returns undefined for an empty list', () => {
    expect(selectNextDeparture([], NOW)).toBeUndefined();
  });
});

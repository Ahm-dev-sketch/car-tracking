import { describe, it, expect } from 'vitest';
import {
  calculateEta,
  isLocationFresh,
  checkLocationMatch,
  isCapacitySufficient,
  isPreferenceMatching,
} from '@/server/dispatch/service';
import { DISPATCH_CONFIG } from '@/server/dispatch/config';

describe('Phase 9 Unit Tests: Dispatch Engine Logic', () => {
  it('1. calculateEta: valid coordinates return etaSeconds and etaEstimated: true', () => {
    // Distance from Hanoi (21.0285, 105.8542) to nearby point (21.0385, 105.8642) ~1.5 km
    const result = calculateEta(21.0285, 105.8542, 21.0385, 105.8642);

    expect(result.etaEstimated).toBe(true);
    expect(result.etaSeconds).toBeGreaterThan(0);
    // 1500m / 11 m/s ~= 136s
    expect(result.etaSeconds).toBeCloseTo(138, -2);
  });

  it('2. calculateEta: missing driver coords returns null and etaEstimated: false', () => {
    const res1 = calculateEta(null, 105.8542, 21.0385, 105.8642);
    expect(res1).toEqual({ etaSeconds: null, etaEstimated: false });

    const res2 = calculateEta(21.0285, undefined, 21.0385, 105.8642);
    expect(res2).toEqual({ etaSeconds: null, etaEstimated: false });
  });

  it('3. calculateEta: missing pickup coords returns null and etaEstimated: false', () => {
    const res1 = calculateEta(21.0285, 105.8542, null, 105.8642);
    expect(res1).toEqual({ etaSeconds: null, etaEstimated: false });

    const res2 = calculateEta(21.0285, 105.8542, 21.0385, null);
    expect(res2).toEqual({ etaSeconds: null, etaEstimated: false });
  });

  it('4. ranking order predicate: eta asc, then freshness desc, then driverId asc', () => {
    const candidates = [
      { driverId: 'd3', etaSeconds: 300, receivedAt: new Date(1000) },
      { driverId: 'd1', etaSeconds: 120, receivedAt: new Date(2000) },
      { driverId: 'd2', etaSeconds: 120, receivedAt: new Date(3000) },
      { driverId: 'd4', etaSeconds: null, receivedAt: new Date(5000) },
      { driverId: 'd5', etaSeconds: null, receivedAt: new Date(4000) },
    ];

    candidates.sort((a, b) => {
      if (a.etaSeconds !== null && b.etaSeconds !== null) {
        if (a.etaSeconds !== b.etaSeconds) {
          return a.etaSeconds - b.etaSeconds;
        }
      } else if (a.etaSeconds !== null) {
        return -1;
      } else if (b.etaSeconds !== null) {
        return 1;
      }

      const timeA = a.receivedAt ? a.receivedAt.getTime() : 0;
      const timeB = b.receivedAt ? b.receivedAt.getTime() : 0;
      if (timeA !== timeB) {
        return timeB - timeA;
      }

      return a.driverId.localeCompare(b.driverId);
    });

    expect(candidates.map((c) => c.driverId)).toEqual(['d2', 'd1', 'd3', 'd4', 'd5']);
  });

  it('5. eligibility predicate: location rule on/off', () => {
    const locA = 'loc-a';
    const locB = 'loc-b';

    const vehicleA = { homeLocationId: locA, currentLocationId: locA };
    const vehicleB = { homeLocationId: locB, currentLocationId: locB };
    const vehicleCurrentA = { homeLocationId: locB, currentLocationId: locA };

    // When crossLocationDispatch = false (default)
    expect(checkLocationMatch(vehicleA, locA, false)).toBe(true);
    expect(checkLocationMatch(vehicleB, locA, false)).toBe(false);
    expect(checkLocationMatch(vehicleCurrentA, locA, false)).toBe(true);

    // When crossLocationDispatch = true
    expect(checkLocationMatch(vehicleB, locA, true)).toBe(true);
  });

  it('6. eligibility predicate: GPS freshness check', () => {
    const now = new Date(1700000000000);
    const threshold = new Date(now.getTime() - 40000); // 40s ago

    const freshDate = new Date(now.getTime() - 10000); // 10s ago
    const staleDate = new Date(now.getTime() - 50000); // 50s ago

    expect(isLocationFresh(freshDate, threshold)).toBe(true);
    expect(isLocationFresh(staleDate, threshold)).toBe(false);
    expect(isLocationFresh(null, threshold)).toBe(false);
    expect(isLocationFresh(undefined, threshold)).toBe(false);
  });

  it('7. eligibility predicate: seating capacity', () => {
    expect(isCapacitySufficient(7, 4)).toBe(true);
    expect(isCapacitySufficient(4, 4)).toBe(true);
    expect(isCapacitySufficient(4, 5)).toBe(false);
  });

  it('8. eligibility predicate: preference restriction', () => {
    expect(isPreferenceMatching('v1', 'v1')).toBe(true);
    expect(isPreferenceMatching('v2', 'v1')).toBe(false);
    expect(isPreferenceMatching('v1', null)).toBe(true);
    expect(isPreferenceMatching('v1', undefined)).toBe(true);
  });

  it('9. dispatch config values match specifications', () => {
    expect(DISPATCH_CONFIG.offerTimeoutSec).toBe(30);
    expect(DISPATCH_CONFIG.overallTimeoutSec).toBe(480);
    expect(DISPATCH_CONFIG.maxAttempts).toBe(8);
    expect(DISPATCH_CONFIG.crossLocationDispatch).toBe(false);
    expect(DISPATCH_CONFIG.etaAvgSpeedMps).toBe(11);
    expect(DISPATCH_CONFIG.gpsFreshnessIdleMultiplier).toBe(2);
    expect(DISPATCH_CONFIG.sweepIntervalSec).toBe(15);
  });
});

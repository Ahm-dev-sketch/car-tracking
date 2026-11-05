import { describe, it, expect, beforeEach } from 'vitest';
import {
  GpsJitterFilter,
  calculateConfidenceScore,
  haversineMeters,
} from './gps-filter';
import { GeoPoint } from '@/hooks/useGeolocation';

describe('GPS Jitter Filter & Confidence Scorer', () => {
  let filter: GpsJitterFilter;

  beforeEach(() => {
    filter = new GpsJitterFilter({
      maxRealisticSpeedMps: 45, // ~162 km/h
      maxAcceptableAccuracyM: 65,
      minQualityAccuracyM: 25,
    });
  });

  it('calculates 90%+ confidence score when accuracy is within 25 meters', () => {
    expect(calculateConfidenceScore(4)).toBe(99);
    expect(calculateConfidenceScore(12)).toBe(95);
    expect(calculateConfidenceScore(25)).toBe(90);
    expect(calculateConfidenceScore(50)).toBe(70);
    expect(calculateConfidenceScore(100)).toBe(20);
  });

  it('calculates accurate haversine distance between coordinates', () => {
    // Halim (-6.244, 106.888) to Karawang (-6.365, 107.288) ~ 46 km
    const dist = haversineMeters(-6.244, 106.888, -6.365, 107.288);
    expect(Math.round(dist / 1000)).toBe(46);
  });

  it('accepts smooth consecutive points with high precision GPS source', () => {
    const t0 = new Date('2026-11-04T10:00:00Z').toISOString();
    const p1: GeoPoint = {
      lat: -6.244,
      lng: 106.888,
      accuracyM: 10,
      speedMps: 15,
      headingDeg: 90,
      recordedAt: t0,
    };

    const res1 = filter.filter(p1);
    expect(res1.isJumpy).toBe(false);
    expect(res1.confidenceScore).toBe(95);
    expect(res1.source).toBe('gps_high_precision');
  });

  it('rejects jumpy anomaly spikes (teleportation caused by multipath signal reflection)', () => {
    const t0 = new Date('2026-11-04T10:00:00Z').getTime();
    const p1: GeoPoint = {
      lat: -6.244,
      lng: 106.888,
      accuracyM: 12,
      speedMps: 10,
      headingDeg: 90,
      recordedAt: new Date(t0).toISOString(),
    };
    filter.filter(p1);

    // 1 second later, sudden jump of 1.5 km (~1500 m/s impossible speed)
    const p2: GeoPoint = {
      lat: -6.257,
      lng: 106.888,
      accuracyM: 15,
      speedMps: 10,
      headingDeg: 90,
      recordedAt: new Date(t0 + 1000).toISOString(),
    };

    const res2 = filter.filter(p2);
    expect(res2.isJumpy).toBe(true);
    expect(res2.rejectedReason).toMatch(/TELEPORTATION_SPIKE/);
  });

  it('tags degraded accuracy points as Wi-Fi / Cell tower triangulation fallback', () => {
    const p1: GeoPoint = {
      lat: -6.244,
      lng: 106.888,
      accuracyM: 45, // Degraded (>25m min quality)
      speedMps: null,
      headingDeg: null,
      recordedAt: new Date().toISOString(),
    };

    const res1 = filter.filter(p1);
    expect(res1.isJumpy).toBe(false);
    expect(res1.source).toBe('wifi_cell_triangulation');
    expect(res1.confidenceScore).toBe(70);
  });
});

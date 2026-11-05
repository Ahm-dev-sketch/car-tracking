/**
 * High-Precision GPS Jitter Filter and Kalman Smoother.
 * Rejects jumpy anomaly points, multipath signal reflections, and
 * blends GPS satellite fixes with Wi-Fi / Cell Tower triangulation fallback.
 */

import { GeoPoint } from '@/hooks/useGeolocation';

export interface FilteredLocation {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  recordedAt: string;
  source: 'gps_high_precision' | 'wifi_cell_triangulation' | 'kalman_filtered';
  confidenceScore: number; // 0 - 100%
  isJumpy: boolean;
  rejectedReason?: string | null;
}

export interface GpsFilterOptions {
  maxRealisticSpeedMps?: number; // default: 50 m/s (~180 km/h)
  maxAcceptableAccuracyM?: number; // default: 65 m
  minQualityAccuracyM?: number; // default: 25 m (90%+ confidence)
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateConfidenceScore(accuracyM: number): number {
  if (accuracyM <= 5) return 99;
  if (accuracyM <= 15) return 95;
  if (accuracyM <= 25) return 90; // 90%+ target
  if (accuracyM <= 35) return 82;
  if (accuracyM <= 50) return 70;
  if (accuracyM <= 80) return 55;
  return Math.max(20, Math.round(100 - accuracyM));
}

/**
 * 2D Kalman Filter state for Latitude & Longitude smoothing
 */
export class GpsKalmanFilter {
  private lat: number | null = null;
  private lng: number | null = null;
  private variance: number = -1; // P
  private readonly Q: number = 3.0; // Process noise (meters per second)
  private lastTimestampMs: number = 0;

  constructor(processNoise = 3.0) {
    this.Q = processNoise;
  }

  public reset() {
    this.lat = null;
    this.lng = null;
    this.variance = -1;
    this.lastTimestampMs = 0;
  }

  public update(lat: number, lng: number, accuracyM: number, timestampMs: number): { lat: number; lng: number } {
    if (this.variance < 0 || this.lat === null || this.lng === null) {
      this.lat = lat;
      this.lng = lng;
      this.variance = accuracyM * accuracyM;
      this.lastTimestampMs = timestampMs;
      return { lat, lng };
    }

    const dt = Math.max(0.1, (timestampMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = timestampMs;

    // Time update: process variance expands
    this.variance += (this.Q * this.Q * dt);

    // Measurement update
    const measurementVariance = accuracyM * accuracyM;
    const K = this.variance / (this.variance + measurementVariance); // Kalman gain

    this.lat += K * (lat - this.lat);
    this.lng += K * (lng - this.lng);
    this.variance = (1 - K) * this.variance;

    return { lat: this.lat, lng: this.lng };
  }
}

/**
 * Main GpsJitterFilter engine
 */
export class GpsJitterFilter {
  private lastAcceptedPoint: GeoPoint | null = null;
  private kalman = new GpsKalmanFilter();
  private maxSpeedMps: number;
  private maxAccuracyM: number;
  private minQualityAccuracyM: number;

  constructor(options: GpsFilterOptions = {}) {
    this.maxSpeedMps = options.maxRealisticSpeedMps ?? 50; // ~180 km/h
    this.maxAccuracyM = options.maxAcceptableAccuracyM ?? 65;
    this.minQualityAccuracyM = options.minQualityAccuracyM ?? 25;
  }

  public reset() {
    this.lastAcceptedPoint = null;
    this.kalman.reset();
  }

  public filter(rawPoint: GeoPoint): FilteredLocation {
    const timestampMs = new Date(rawPoint.recordedAt).getTime() || Date.now();
    const confidence = calculateConfidenceScore(rawPoint.accuracyM);
    const isNetworkOrCellFallback = rawPoint.accuracyM > this.minQualityAccuracyM;

    // 1. Initial point
    if (!this.lastAcceptedPoint) {
      // Discard initial point only if absurdly imprecise (> 150m)
      if (rawPoint.accuracyM > 150) {
        return {
          ...rawPoint,
          source: 'wifi_cell_triangulation',
          confidenceScore: confidence,
          isJumpy: true,
          rejectedReason: 'EXCESSIVE_INITIAL_UNCERTAINTY',
        };
      }

      this.lastAcceptedPoint = rawPoint;
      const smoothed = this.kalman.update(rawPoint.lat, rawPoint.lng, rawPoint.accuracyM, timestampMs);
      return {
        ...rawPoint,
        lat: smoothed.lat,
        lng: smoothed.lng,
        source: isNetworkOrCellFallback ? 'wifi_cell_triangulation' : 'gps_high_precision',
        confidenceScore: confidence,
        isJumpy: false,
        rejectedReason: null,
      };
    }

    // 2. Accuracy check (reject wild points if we already have reliable lock)
    if (rawPoint.accuracyM > this.maxAccuracyM && this.lastAcceptedPoint.accuracyM <= this.minQualityAccuracyM) {
      return {
        ...rawPoint,
        source: 'wifi_cell_triangulation',
        confidenceScore: confidence,
        isJumpy: true,
        rejectedReason: `ACCURACY_DEGRADED_${Math.round(rawPoint.accuracyM)}M`,
      };
    }

    // 3. Jumpy / Teleportation check via speed & distance
    const lastTimestampMs = new Date(this.lastAcceptedPoint.recordedAt).getTime();
    const deltaSeconds = Math.max(0.2, (timestampMs - lastTimestampMs) / 1000);
    const distanceMeters = haversineMeters(
      this.lastAcceptedPoint.lat,
      this.lastAcceptedPoint.lng,
      rawPoint.lat,
      rawPoint.lng
    );

    const calculatedSpeedMps = distanceMeters / deltaSeconds;
    // Allow distance buffer based on combined GPS uncertainty circles
    const allowedDistance = (this.maxSpeedMps * deltaSeconds) + (this.lastAcceptedPoint.accuracyM + rawPoint.accuracyM);

    if (distanceMeters > allowedDistance && calculatedSpeedMps > this.maxSpeedMps) {
      // Impossible jump detected! (e.g. 500m in 1 second)
      return {
        ...rawPoint,
        source: isNetworkOrCellFallback ? 'wifi_cell_triangulation' : 'gps_high_precision',
        confidenceScore: Math.min(confidence, 30),
        isJumpy: true,
        rejectedReason: `TELEPORTATION_SPIKE_${Math.round(calculatedSpeedMps)}MPS`,
      };
    }

    // 4. Point accepted! Apply Kalman smoothing
    this.lastAcceptedPoint = rawPoint;
    const smoothed = this.kalman.update(rawPoint.lat, rawPoint.lng, rawPoint.accuracyM, timestampMs);

    return {
      ...rawPoint,
      lat: smoothed.lat,
      lng: smoothed.lng,
      source: isNetworkOrCellFallback ? 'wifi_cell_triangulation' : 'kalman_filtered',
      confidenceScore: confidence,
      isJumpy: false,
      rejectedReason: null,
    };
  }
}

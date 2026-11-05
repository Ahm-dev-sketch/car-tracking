'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  createLocationBuffer,
  getGeolocation,
  normalizeGeolocationError,
  requestCurrentPosition,
} from '@/lib/geolocation';
import { GpsJitterFilter, calculateConfidenceScore } from '@/lib/gps-filter';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  recordedAt: string;
}

export type AccuracyQuality = 'HIGH' | 'MEDIUM' | 'LOW';
export type GPSSignal = 'green' | 'amber' | 'red';
export type MovementStatus = 'MOVING' | 'STOPPED' | 'GPS_LOST';
export type LocationSource = 'gps_high_precision' | 'wifi_cell_triangulation' | 'kalman_filtered';

export interface UseGeolocationOptions {
  intervalSec?: number;
  onFlush?: (points: GeoPoint[]) => Promise<void> | void;
}

export function useGeolocation({ intervalSec = 5, onFlush }: UseGeolocationOptions = {}) {
  const [isTracking, setIsTracking] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<GeoPoint | null>(null);
  const [quality, setQuality] = useState<AccuracyQuality>('LOW');
  const [signalStatus, setSignalStatus] = useState<GPSSignal>('red');
  const [movement, setMovement] = useState<MovementStatus>('STOPPED');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [confidenceScore, setConfidenceScore] = useState<number>(0);
  const [locationSource, setLocationSource] = useState<LocationSource>('gps_high_precision');
  const [jumpyDiscardCount, setJumpyDiscardCount] = useState<number>(0);

  const watchIdRef = useRef<number | null>(null);
  const geolocationRef = useRef<Geolocation | null>(null);
  const watchGenerationRef = useRef(0);
  const trackingRef = useRef(false);
  const trackingStartedAt = useRef(0);
  const requestGenerationRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFlushRef = useRef(onFlush);
  const bufferRef = useRef<ReturnType<typeof createLocationBuffer<GeoPoint>> | null>(null);
  const latestPositionRef = useRef<GeoPoint | null>(null);
  const jitterFilterRef = useRef<GpsJitterFilter>(new GpsJitterFilter());
  useEffect(() => {
    onFlushRef.current = onFlush;
    bufferRef.current ??= createLocationBuffer<GeoPoint>(() => onFlushRef.current);
  }, [onFlush]);

  const getCurrentPosition = useCallback(async (): Promise<GeoPoint> => {
    const generation = ++requestGenerationRef.current;
    try {
      const pos = await requestCurrentPosition();
      const accuracy = Math.round(pos.coords.accuracy);
      const rawPoint: GeoPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: accuracy,
        speedMps: pos.coords.speed !== null && !isNaN(pos.coords.speed) ? pos.coords.speed : null,
        headingDeg: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
        recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
      };

      const filtered = jitterFilterRef.current.filter(rawPoint);
      const point: GeoPoint = {
        lat: filtered.lat,
        lng: filtered.lng,
        accuracyM: filtered.accuracyM,
        speedMps: filtered.speedMps,
        headingDeg: filtered.headingDeg,
        recordedAt: filtered.recordedAt,
      };

      latestPositionRef.current = point;
      if (generation === requestGenerationRef.current) {
        setPermissionDenied(false);
        setError(null);
        setConfidenceScore(filtered.confidenceScore);
        setLocationSource(filtered.source);
        const isPrecise = accuracy <= 25; // 90%+ confidence threshold
        setQuality(isPrecise ? 'HIGH' : accuracy <= 70 ? 'MEDIUM' : 'LOW');
        setSignalStatus(isPrecise ? 'green' : accuracy <= 70 ? 'amber' : 'red');
        setCurrentPosition(point);
        setLastUpdated(new Date());
        setIsStale(false);
        if (trackingRef.current) bufferRef.current?.push(point);
      }
      return point;
    } catch (cause) {
      const err = normalizeGeolocationError(cause);
      if (generation === requestGenerationRef.current) {
        setPermissionDenied(err.code === 1);
        setError(err.message);
        setSignalStatus('red');
      }
      throw err;
    }
  }, []);

  const flushBuffer = useCallback(() => bufferRef.current?.flush() ?? Promise.resolve(), []);

  const stopWatch = useCallback((discard = true) => {
    trackingRef.current = false;
    watchGenerationRef.current += 1;
    requestGenerationRef.current += 1;
    if (watchIdRef.current !== null) {
      geolocationRef.current?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (discard) bufferRef.current?.clear();
  }, []);

  const stopTracking = useCallback((discard = true) => {
    stopWatch(discard);
    setIsTracking(false);
    setIsStale(false);
  }, [stopWatch]);

  const startTracking = useCallback(() => {
    if (trackingRef.current) return;
    let geolocation: Geolocation;
    try {
      geolocation = getGeolocation();
    } catch (cause) {
      setError(normalizeGeolocationError(cause).message);
      setSignalStatus('red');
      return;
    }

    const generation = ++watchGenerationRef.current;
    requestGenerationRef.current += 1;
    trackingRef.current = true;
    trackingStartedAt.current = Date.now();
    geolocationRef.current = geolocation;
    setIsTracking(true);
    setError(null);
    setPermissionDenied(false);

    try {
      const watchId = geolocation.watchPosition(
      (pos) => {
        if (!trackingRef.current || generation !== watchGenerationRef.current) return;
        const accuracy = Math.round(pos.coords.accuracy);
        const speed = pos.coords.speed !== null && !isNaN(pos.coords.speed) ? pos.coords.speed : null;
        const now = new Date();

        const rawPoint: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: accuracy,
          speedMps: speed,
          headingDeg: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
          recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        };

        const filterResult = jitterFilterRef.current.filter(rawPoint);
        if (filterResult.isJumpy) {
          // Discard jumpy spike (multipath reflection / teleportation anomaly)
          setJumpyDiscardCount((prev) => prev + 1);
          return;
        }

        const point: GeoPoint = {
          lat: filterResult.lat,
          lng: filterResult.lng,
          accuracyM: filterResult.accuracyM,
          speedMps: filterResult.speedMps,
          headingDeg: filterResult.headingDeg,
          recordedAt: filterResult.recordedAt,
        };

        const isPrecise = filterResult.accuracyM <= 25; // 90%+ confidence threshold
        const q: AccuracyQuality = isPrecise ? 'HIGH' : filterResult.accuracyM <= 70 ? 'MEDIUM' : 'LOW';
        const s: GPSSignal = isPrecise ? 'green' : filterResult.accuracyM <= 70 ? 'amber' : 'red';
        const m: MovementStatus = speed && speed > 1.5 ? 'MOVING' : 'STOPPED';

        latestPositionRef.current = point;
        setCurrentPosition(point);
        setConfidenceScore(filterResult.confidenceScore);
        setLocationSource(filterResult.source);
        setQuality(q);
        setSignalStatus(s);
        setMovement(m);
        setLastUpdated(now);
        setIsStale(false);
        setError(null);
        setPermissionDenied(false);

        bufferRef.current?.push(point);
      },
      (cause) => {
        if (!trackingRef.current || generation !== watchGenerationRef.current) return;
        const err = normalizeGeolocationError(cause);

        // Cell Tower / Wi-Fi triangulation fallback when GPS satellite lock is lost or degraded
        if (err.code === 2 || err.code === 3) {
          try {
            geolocation.getCurrentPosition(
              (fallbackPos) => {
                if (!trackingRef.current || generation !== watchGenerationRef.current) return;
                const acc = Math.round(fallbackPos.coords.accuracy);
                const fbPoint: GeoPoint = {
                  lat: fallbackPos.coords.latitude,
                  lng: fallbackPos.coords.longitude,
                  accuracyM: acc,
                  speedMps: fallbackPos.coords.speed !== null && !isNaN(fallbackPos.coords.speed) ? fallbackPos.coords.speed : null,
                  headingDeg: fallbackPos.coords.heading !== null && !isNaN(fallbackPos.coords.heading) ? fallbackPos.coords.heading : null,
                  recordedAt: new Date(fallbackPos.timestamp || Date.now()).toISOString(),
                };
                const fr = jitterFilterRef.current.filter(fbPoint);
                if (!fr.isJumpy) {
                  const resolvedPoint: GeoPoint = {
                    ...fbPoint,
                    lat: fr.lat,
                    lng: fr.lng,
                  };
                  latestPositionRef.current = resolvedPoint;
                  setCurrentPosition(resolvedPoint);
                  setLocationSource('wifi_cell_triangulation');
                  setConfidenceScore(fr.confidenceScore);
                  setQuality(acc <= 40 ? 'MEDIUM' : 'LOW');
                  setSignalStatus(acc <= 40 ? 'amber' : 'red');
                  setError(null);
                  bufferRef.current?.push(resolvedPoint);
                  return;
                }
              },
              () => {},
              { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
            );
          } catch {
            // Ignore fallback failure
          }
        }

        setPermissionDenied(err.code === 1);
        setError(err.message);
        setSignalStatus('red');
        setMovement('GPS_LOST');
        if (err.code === 1) stopTracking();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
      );
      // A native implementation can invoke an error callback before returning its ID.
      if (!trackingRef.current || generation !== watchGenerationRef.current) {
        geolocation.clearWatch(watchId);
        return;
      }
      watchIdRef.current = watchId;
      flushTimerRef.current = setInterval(() => {
        // If device is stationary (no movement-driven watch updates queued), keep-alive telemetry
        if (trackingRef.current && latestPositionRef.current && !bufferRef.current?.hasPending()) {
          bufferRef.current?.push({
            ...latestPositionRef.current,
            recordedAt: new Date().toISOString(),
            speedMps: 0,
          });
        }
        void flushBuffer().catch((cause: unknown) => {
          if (generation !== watchGenerationRef.current) return;
          setError(cause instanceof Error ? cause.message : 'Unable to send location updates. Will retry.');
        });
      }, intervalSec * 1000);
    } catch (cause) {
      const err = normalizeGeolocationError(cause);
      stopTracking();
      setPermissionDenied(err.code === 1);
      setError(err.message);
      setSignalStatus('red');
    }
  }, [flushBuffer, intervalSec, stopTracking]);

  // Staleness monitor: if last update is older than 2x interval while tracking
  useEffect(() => {
    if (!isTracking) return;

    const checkStaleness = () => {
      const diffMs = Date.now() - (lastUpdated?.getTime() ?? trackingStartedAt.current);
      const thresholdMs = intervalSec * 2 * 1000;
      if (diffMs > thresholdMs) {
        setIsStale(true);
        setSignalStatus((prev) => (prev === 'green' ? 'amber' : prev));
      } else {
        setIsStale(false);
      }
    };

    const timer = setInterval(checkStaleness, 1000);
    return () => clearInterval(timer);
  }, [isTracking, lastUpdated, intervalSec]);

  // Foreground recovery: immediately fetch position when returning to visible tab
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isTracking) {
        getCurrentPosition().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isTracking, getCurrentPosition]);

  // Screen Wake Lock API: Prevent driver phone screen from locking/sleeping during active tracking
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isTracking && document.visibilityState === 'visible') {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          wakeLockSentinel?.addEventListener?.('release', () => {
            wakeLockSentinel = null;
          });
        } catch {
          // Battery saver or system policy may deny lock; fail safely
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockSentinel) {
        try {
          await wakeLockSentinel.release();
        } catch {
          // ignore
        }
        wakeLockSentinel = null;
      }
    };

    if (isTracking) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTracking && !wakeLockSentinel) {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [isTracking]);

  useEffect(() => () => stopWatch(), [stopWatch]);

  return {
    isTracking,
    currentPosition,
    quality,
    signalStatus,
    movement,
    permissionDenied,
    error,
    lastUpdated,
    isStale,
    confidenceScore,
    locationSource,
    jumpyDiscardCount,
    getCurrentPosition,
    startTracking,
    stopTracking,
    flushBuffer,
  };
}

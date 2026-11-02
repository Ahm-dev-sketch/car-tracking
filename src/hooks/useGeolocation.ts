'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

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

  const watchIdRef = useRef<number | null>(null);
  const bufferRef = useRef<GeoPoint[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  const getCurrentPosition = useCallback((): Promise<GeoPoint> => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !navigator.geolocation) {
        const err = new Error('Geolocation is not supported by your browser');
        setError(err.message);
        reject(err);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPermissionDenied(false);
          setError(null);
          const accuracy = Math.round(pos.coords.accuracy);
          const point: GeoPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: accuracy,
            speedMps: pos.coords.speed !== null && !isNaN(pos.coords.speed) ? pos.coords.speed : null,
            headingDeg: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
            recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
          };

          const q: AccuracyQuality = accuracy <= 30 ? 'HIGH' : accuracy <= 100 ? 'MEDIUM' : 'LOW';
          const s: GPSSignal = accuracy <= 30 ? 'green' : accuracy <= 100 ? 'amber' : 'red';
          setQuality(q);
          setSignalStatus(s);
          setCurrentPosition(point);
          setLastUpdated(new Date());
          resolve(point);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionDenied(true);
            setError('Location permission denied. Please allow location access in your browser settings.');
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setError('Position unavailable. Check your device GPS signal.');
          } else if (err.code === err.TIMEOUT) {
            setError('GPS request timed out. Retrying...');
          } else {
            setError(err.message || 'Unknown geolocation error');
          }
          setSignalStatus('red');
          reject(err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }, []);

  const flushBuffer = useCallback(async () => {
    if (bufferRef.current.length === 0) return;
    const batch = bufferRef.current.splice(0, 5);
    if (onFlushRef.current) {
      try {
        await onFlushRef.current(batch);
      } catch (err) {
        // Put unsent points back to head of buffer if needed, cap at 20
        bufferRef.current = [...batch, ...bufferRef.current].slice(0, 20);
      }
    }
  }, []);

  const startTracking = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    if (watchIdRef.current !== null) {
      return;
    }

    setIsTracking(true);
    setError(null);
    setPermissionDenied(false);
    bufferRef.current = [];

    // Periodic flush timer
    flushTimerRef.current = setInterval(() => {
      flushBuffer();
    }, intervalSec * 1000);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const accuracy = Math.round(pos.coords.accuracy);
        const speed = pos.coords.speed !== null && !isNaN(pos.coords.speed) ? pos.coords.speed : null;
        const now = new Date();

        const point: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: accuracy,
          speedMps: speed,
          headingDeg: pos.coords.heading !== null && !isNaN(pos.coords.heading) ? pos.coords.heading : null,
          recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        };

        const q: AccuracyQuality = accuracy <= 30 ? 'HIGH' : accuracy <= 100 ? 'MEDIUM' : 'LOW';
        const s: GPSSignal = accuracy <= 30 ? 'green' : accuracy <= 100 ? 'amber' : 'red';
        const m: MovementStatus = speed && speed > 1.5 ? 'MOVING' : 'STOPPED';

        setCurrentPosition(point);
        setQuality(q);
        setSignalStatus(s);
        setMovement(m);
        setLastUpdated(now);
        setIsStale(false);
        setError(null);

        // Append to buffer, cap at 20 points
        if (bufferRef.current.length < 20) {
          bufferRef.current.push(point);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionDenied(true);
          setError('Location permission denied. Please allow GPS access.');
          setSignalStatus('red');
          stopTracking();
        } else {
          setSignalStatus('red');
          setMovement('GPS_LOST');
          setError('GPS signal weak or unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, [flushBuffer, intervalSec]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    // Final flush
    flushBuffer();
    setIsTracking(false);
    setIsStale(false);
  }, [flushBuffer]);

  // Staleness monitor: if last update is older than 2x interval while tracking
  useEffect(() => {
    if (!isTracking) {
      setIsStale(false);
      return;
    }

    const checkStaleness = () => {
      if (!lastUpdated) return;
      const diffMs = Date.now() - lastUpdated.getTime();
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

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
      }
    };
  }, []);

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
    getCurrentPosition,
    startTracking,
    stopTracking,
    flushBuffer,
  };
}

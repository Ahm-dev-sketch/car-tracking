export const TRACKING_CONFIG = {
  tripIntervalSec: 5,
  idleIntervalSec: 20,
  accuracyCapTripM: 100,
  accuracyCapIdleM: 250,
  maxFutureSkewSec: 60,
  maxStaleMultiplier: 2,
  maxBatchSize: 5,
  maxSpeedMps: 150,
} as const;

export type TrackingConfig = typeof TRACKING_CONFIG;

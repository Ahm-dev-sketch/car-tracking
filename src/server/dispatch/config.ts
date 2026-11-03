export const DISPATCH_CONFIG = {
  offerTimeoutSec: 30, // 30s per driver offer
  overallTimeoutSec: 480, // 8 minutes default timeout (5-10min range per doc §4)
  maxAttempts: 8, // 8 attempts per doc §4
  crossLocationDispatch: false, // cross-location disabled by default
  etaAvgSpeedMps: 11, // ~40 km/h city speed
  gpsFreshnessIdleMultiplier: 2, // 2x idle interval freshness check
  sweepIntervalSec: 15, // 15s cron sweep
};

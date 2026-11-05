export const DISPATCH_CONFIG = {
  offerTimeoutSec: 60, // 60s (1 min) per driver offer
  overallTimeoutSec: 480, // 8 minutes default timeout (5-10min range per doc §4)
  maxAttempts: 8, // 8 attempts per doc §4
  crossLocationDispatch: false, // cross-location disabled by default
  etaAvgSpeedMps: 11, // ~40 km/h city speed
  gpsFreshnessIdleMultiplier: 2, // 2x idle interval freshness check
  sweepIntervalSec: 15, // 15s cron sweep
  baseCooldownSec: 30, // 30s base cooldown before re-offering to the same driver
  cooldownMultiplier: 1.5, // Exponential backoff multiplier per repeat offer
  maxCooldownSec: 120, // Max 2 minutes cooldown cap
};

export function computeDriverCooldown(
  driverAttempts: number,
  now: Date = new Date()
): Date {
  const attempts = Math.max(1, driverAttempts);
  const cooldownSec = Math.min(
    DISPATCH_CONFIG.maxCooldownSec,
    Math.round(DISPATCH_CONFIG.baseCooldownSec * Math.pow(DISPATCH_CONFIG.cooldownMultiplier, attempts - 1))
  );
  return new Date(now.getTime() + cooldownSec * 1000);
}

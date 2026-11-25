/**
 * Demo quick-fill UI guard.
 * Demo accounts must stay hidden in production unless ALLOW_DEMO_AUTH === '1'.
 */
export function isDemoModeEnabled(
  env: { ALLOW_DEMO_AUTH?: string; NODE_ENV?: string } = process.env
): boolean {
  return env.ALLOW_DEMO_AUTH === '1' || env.NODE_ENV !== 'production';
}

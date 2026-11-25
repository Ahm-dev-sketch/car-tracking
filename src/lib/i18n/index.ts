import { id, type Dictionary } from './id';
import { en } from './en';
import { DEFAULT_LOCALE, formatMessage, resolveLocale, type Locale } from './types';

export * from './types';
export type { Dictionary } from './id';

export const dictionaries: Record<Locale, Dictionary> = {
  id,
  en,
};

export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[resolveLocale(locale)];
}

export function translateStatus(
  locale: Locale,
  status?: string | null,
  hasNotaDinas?: boolean
): string {
  const dict = getDictionary(locale);
  const normalized = (status || '').toUpperCase().trim();
  if (!normalized) return dict.common.noDataDash;

  if (normalized === 'PENDING_COMPLETION') {
    return hasNotaDinas
      ? dict.statuses.PENDING_COMPLETION_WITH_NOTA
      : dict.statuses.PENDING_COMPLETION_NO_NOTA;
  }

  const mapped = (dict.statuses as Record<string, string | undefined>)[normalized];
  if (mapped) return mapped;

  // Fallback: Title Case instead of raw UPPER_SNAKE_CASE
  return normalized
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

export function translateVehicleCondition(locale: Locale, conditionBadgeText: string): string {
  const dict = getDictionary(locale);
  const mapped = (dict.vehicleConditions as Record<string, string | undefined>)[
    conditionBadgeText
  ];
  return mapped || conditionBadgeText;
}

export function translateVehicleType(locale: Locale, vehicleType?: string | null): string {
  if (!vehicleType) return '';
  const dict = getDictionary(locale);
  const normalized = vehicleType.toUpperCase().trim();
  return (dict.vehicleTypes as Record<string, string | undefined>)[normalized] || vehicleType;
}

export function translateTransmission(locale: Locale, transmission?: string | null): string {
  if (!transmission) return '';
  const dict = getDictionary(locale);
  const normalized = transmission.toUpperCase().trim();
  return (dict.transmissions as Record<string, string | undefined>)[normalized] || transmission;
}

export function translateServiceType(
  locale: Locale,
  serviceType?: string | null,
  short = false
): string {
  const dict = getDictionary(locale);
  const normalized = (serviceType || 'DROP_OFF').toUpperCase().trim();
  if (normalized === 'STANDBY') {
    return short ? dict.serviceTypes.STANDBY_SHORT : dict.serviceTypes.STANDBY;
  }
  return short ? dict.serviceTypes.DROP_OFF_SHORT : dict.serviceTypes.DROP_OFF;
}

export function translateMovement(locale: Locale, movement?: string | null): string {
  const dict = getDictionary(locale);
  const normalized = (movement || 'OFFLINE').toUpperCase().trim();
  return (dict.movements as Record<string, string | undefined>)[normalized] || dict.movements.OFFLINE;
}

export function translateRole(locale: Locale, role?: string | null): string {
  const dict = getDictionary(locale);
  const normalized = (role || 'USER').toUpperCase().trim();
  return (dict.nav.roles as Record<string, string | undefined>)[normalized] || role || dict.nav.roles.USER;
}

export function formatEtaText(
  locale: Locale,
  etaSeconds?: number | null,
  etaEstimated?: boolean
): string | null {
  if (typeof etaSeconds !== 'number' || Number.isNaN(etaSeconds) || etaSeconds <= 0) {
    return null;
  }
  const dict = getDictionary(locale);
  const minutes = Math.max(1, Math.round(etaSeconds / 60));
  return formatMessage(etaEstimated ? dict.time.etaApprox : dict.time.etaExact, { minutes });
}

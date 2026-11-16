export interface ResolvedLocation {
  lat: number;
  lng: number;
  label: string;
  resolvedUrl: string;
}

export const TRUSTED_GOOGLE_HOSTS: ReadonlySet<string> = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
  'google.co.id',
]);

const PIN_COORDS_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const VIEWPORT_COORDS_RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const QUERY_COORDS_RE = /[?&](?:q|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i;

const PLACE_LABEL_RE = /\/maps\/place\/([^/]+)\//;
const ALT_PLACE_LABEL_RE = /\/(?:place|maps)\/([^/?#]+)/;

const DEFAULT_LABEL = 'Pinned Google Maps Location';

function parseHostname(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function looksLikeGoogleMapsUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;

  const hostname = parseHostname(trimmed);
  if (!hostname) return false;

  if (TRUSTED_GOOGLE_HOSTS.has(hostname)) return true;

  return (
    hostname === 'google.com' ||
    hostname.endsWith('.google.com') ||
    hostname === 'goo.gl' ||
    hostname.endsWith('.goo.gl')
  );
}

export function isShortLink(url: string): boolean {
  const hostname = parseHostname(url);
  if (!hostname) return false;

  return hostname === 'maps.app.goo.gl' || hostname === 'goo.gl';
}

function toCoords(latStr: string, lngStr: string): { lat: number; lng: number } | null {
  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function extractCoords(url: string): { lat: number; lng: number } | null {
  const pin = url.match(PIN_COORDS_RE);
  if (pin) return toCoords(pin[1], pin[2]);

  const viewport = url.match(VIEWPORT_COORDS_RE);
  if (viewport) return toCoords(viewport[1], viewport[2]);

  const query = url.match(QUERY_COORDS_RE);
  if (query) return toCoords(query[1], query[2]);

  return null;
}

function decodeLabel(raw: string): string {
  let label = raw;
  try {
    label = decodeURIComponent(raw);
  } catch {
    // keep raw on malformed percent-encoding
  }
  return label.replace(/\+/g, ' ');
}

function extractLabel(url: string): string {
  const place = url.match(PLACE_LABEL_RE);
  if (place) return decodeLabel(place[1]);

  const alt = url.match(ALT_PLACE_LABEL_RE);
  if (alt && alt[1].toLowerCase() !== 'place' && alt[1].toLowerCase() !== 'maps') {
    return decodeLabel(alt[1]);
  }

  return DEFAULT_LABEL;
}

export function parseGoogleMapsUrl(url: string): ResolvedLocation | null {
  const coords = extractCoords(url);
  if (!coords) return null;

  return {
    lat: coords.lat,
    lng: coords.lng,
    label: extractLabel(url),
    resolvedUrl: url,
  };
}

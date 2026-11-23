import { ApiError } from '@/lib/errors';
import {
  TRUSTED_GOOGLE_HOSTS,
  isShortLink,
  looksLikeGoogleMapsUrl,
  parseGoogleMapsUrl,
} from '@/lib/google-maps-url';
import type { ResolvedLocation } from '@/lib/google-maps-url';

const SHORT_LINK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const NOMINATIM_USER_AGENT = 'KCIC-FleetTrack/1.0';

function isTrustedGoogleHost(hostname: string): boolean {
  if (TRUSTED_GOOGLE_HOSTS.has(hostname)) return true;
  return (
    hostname === 'google.com' ||
    hostname.endsWith('.google.com') ||
    hostname === 'goo.gl' ||
    hostname.endsWith('.goo.gl')
  );
}

function extractTextQuery(url: string): string | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get('q');
    if (q && q.trim()) return q.trim();

    const placeMatch = u.pathname.match(/\/maps\/place\/([^/]+)/);
    if (placeMatch && placeMatch[1]) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    }

    const searchMatch = u.pathname.match(/\/maps\/search\/([^/]+)/);
    if (searchMatch && searchMatch[1]) {
      return decodeURIComponent(searchMatch[1].replace(/\+/g, ' ')).trim();
    }
    return null;
  } catch {
    return null;
  }
}

interface NominatimHit {
  lat?: string | number;
  lon?: string | number;
  lng?: string | number;
  name?: string;
  display_name?: string;
}

const DEFAULT_LABEL = 'Pinned Location';

function buildGeocodeCandidates(rawQuery: string): string[] {
  const candidates: string[] = [];
  const clean = rawQuery.replace(/\+/g, ' ').trim();
  if (clean) candidates.push(clean);

  const parts = clean.split(/[,–-]/);
  for (const part of parts) {
    const seg = part.trim();
    if (seg.length >= 2 && !candidates.includes(seg)) candidates.push(seg);
  }
  return candidates.slice(0, 6);
}

async function geocodeViaNominatim(
  query: string,
  resolvedUrl: string,
  fetchImpl: typeof fetch
): Promise<ResolvedLocation | null> {
  for (const q of buildGeocodeCandidates(query)) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetchImpl(url, {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as NominatimHit[];
      const first = Array.isArray(data) ? data[0] : undefined;
      const lat = first?.lat !== undefined ? Number(first.lat) : NaN;
      const lngRaw = first?.lon ?? first?.lng;
      const lng = lngRaw !== undefined ? Number(lngRaw) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          lat,
          lng,
          label:
            first && first.name && first.name.trim()
              ? first.name
              : first?.display_name ?? DEFAULT_LABEL,
          resolvedUrl,
        };
      }
    } catch {
      // Try next
    }
  }
  return null;
}

export async function resolveMapsLink(
  url: string,
  fetchImpl: typeof fetch
): Promise<ResolvedLocation> {
  if (!looksLikeGoogleMapsUrl(url)) {
    throw new ApiError(400, 'INVALID_URL', 'Only Google Maps URLs are supported');
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    throw new ApiError(400, 'INVALID_URL', 'Only Google Maps URLs are supported');
  }
  if (!isTrustedGoogleHost(hostname)) {
    throw new ApiError(400, 'INVALID_URL', 'Only Google Maps URLs are supported');
  }

  let finalUrl = url;
  if (isShortLink(url)) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        redirect: 'follow',
        headers: { 'User-Agent': SHORT_LINK_USER_AGENT },
      });
    } catch {
      throw new ApiError(502, 'RESOLVE_FAILED', 'Could not expand short link');
    }

    const expanded = (res as Response & { finalUrl?: string }).finalUrl ?? res.url;
    if (!expanded) {
      throw new ApiError(502, 'RESOLVE_FAILED', 'Could not expand short link');
    }
    finalUrl = expanded;
  }

  const parsed = parseGoogleMapsUrl(finalUrl);
  if (parsed) {
    return parsed;
  }

  const query = extractTextQuery(finalUrl);
  if (query) {
    const geocoded = await geocodeViaNominatim(query, finalUrl, fetchImpl);
    if (geocoded) {
      return geocoded;
    }
  }

  throw new ApiError(400, 'NO_COORDINATES', 'Could not extract coordinates from this link');
}

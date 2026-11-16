import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { withRateLimit } from '@/lib/rate-limit';
import {
  TRUSTED_GOOGLE_HOSTS,
  isShortLink,
  looksLikeGoogleMapsUrl,
  parseGoogleMapsUrl,
} from '@/lib/google-maps-url';
import type { ResolvedLocation } from '@/lib/google-maps-url';

export const dynamic = 'force-dynamic';

const SHORT_LINK_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const NOMINATIM_USER_AGENT = 'KCIC-FleetTrack/1.0';

// Same host rule as the parser: a trusted host, or any subdomain of google.com / goo.gl.
function isTrustedGoogleHost(hostname: string): boolean {
  if (TRUSTED_GOOGLE_HOSTS.has(hostname)) return true;
  return (
    hostname === 'google.com' ||
    hostname.endsWith('.google.com') ||
    hostname === 'goo.gl' ||
    hostname.endsWith('.goo.gl')
  );
}

// Free-text query from a `?q=` param, `/maps/place/NAME/`, or `/maps/search/NAME/` segment.
function extractTextQuery(url: string): string | null {
  try {
    const q = new URL(url).searchParams.get('q');
    if (q && q.trim()) return q.trim();
  } catch {
    // fall through to path-segment extraction
  }

  const m = url.match(/\/maps\/(?:place|search)\/([^/?@]+)/);
  if (m && m[1]) {
    const segment = m[1].replace(/\+/g, ' ').trim();
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
  return null;
}

// Nominatim returns `lon` (NOT `lng`). Accept both for safety/tests.
interface NominatimHit {
  lat?: string | number;
  lon?: string | number;
  lng?: string | number;
  name?: string;
  display_name?: string;
}

const DEFAULT_LABEL = 'Pinned Google Maps Location';

// Build a small ordered list of candidate queries: the full text first, then each
// comma-separated segment left-to-right (venue/business names before street/city
// segments). Google place names often carry brand prefixes ("CGV Cinemas ...") and
// trailing addresses that Nominatim cannot match as a whole; a shorter segment
// usually resolves. Capped to stay within Nominatim's light-usage policy.
function buildGeocodeCandidates(query: string): string[] {
  const trimmed = query.trim();
  const candidates: string[] = [trimmed];
  for (const part of trimmed.split(',')) {
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
      // Try the next candidate.
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

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    await getSessionUser();

    let body: { url?: unknown };
    try {
      body = (await req.json()) as { url?: unknown };
    } catch {
      throw new ApiError(400, 'VALIDATION_ERROR', 'url is required');
    }

    const url = body?.url;
    if (typeof url !== 'string' || url.trim() === '') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'url is required');
    }

    const result = await resolveMapsLink(url.trim(), fetch);
    return NextResponse.json({ data: result });
  }),
  { limit: 30, windowMs: 60_000 }
);

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

const cache = new Map<string, { address: string; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const GET = withErrorHandling(async (req: Request) => {
  await getSessionUser();

  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'invalid coordinates' }, { status: 400 });
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ data: { address: cached.address, lat, lng } });
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'KCIC-FleetTrack/1.0',
          'Accept-Language': 'id,en',
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.status}`);
    }

    const data = await res.json();
    const addr = data.address || {};

    const parts = [
      data.name,
      addr.amenity || addr.building || addr.shop || addr.office,
      [addr.road, addr.house_number].filter(Boolean).join(' '),
      addr.neighbourhood,
      addr.city_block,
      addr.village,
      addr.suburb,
      addr.city_district || addr.county,
      addr.city || addr.town || addr.municipality,
    ].filter(Boolean);

    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const p of parts) {
      const s = String(p).trim();
      const lower = s.toLowerCase();
      if (s && !seen.has(lower)) {
        seen.add(lower);
        filtered.push(s);
      }
    }

    let formatted = '';
    if (filtered.length >= 2) {
      formatted = filtered.slice(0, 4).join(', ');
    } else if (data.display_name) {
      formatted = data.display_name
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => !/^\d{5}$/.test(s) && s.toLowerCase() !== 'indonesia')
        .slice(0, 4)
        .join(', ');
    }

    if (!formatted) {
      formatted = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    cache.set(cacheKey, { address: formatted, timestamp: Date.now() });

    return NextResponse.json({ data: { address: formatted, lat, lng } });
  } catch {
    return NextResponse.json({
      data: {
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        lat,
        lng,
      },
    });
  }
});

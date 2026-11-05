/**
 * KCIC High-Speed Railway Operational Locations & Hubs
 * Defines standard coordinates, zoom levels, and geographic helpers
 * for Halim, Karawang, Padalarang, Tegalluar Station & Tegalluar Depo.
 */

export interface OperationalHubInfo {
  name: string;
  code: string;
  lat: number;
  lng: number;
  zoom: number;
  description: string;
}

export const DEFAULT_OPS_CENTER: [number, number] = [-6.2088, 106.8456]; // Jakarta Ops
export const DEFAULT_OPS_ZOOM = 12;

export const OPERATIONAL_HUBS: Record<string, OperationalHubInfo> = {
  // Halim (Code: 102)
  '102': {
    name: 'Halim',
    code: '102',
    lat: -6.2443,
    lng: 106.8863,
    zoom: 15,
    description: 'Halim, Jakarta Timur',
  },
  // Karawang (Code: 202)
  '202': {
    name: 'Karawang',
    code: '202',
    lat: -6.3712,
    lng: 107.2885,
    zoom: 15,
    description: 'Karawang (202)',
  },
  // Karawang (Code: 204)
  '204': {
    name: 'Karawang',
    code: '204',
    lat: -6.3750,
    lng: 107.2910,
    zoom: 15,
    description: 'Karawang (204)',
  },
  // Padalarang (Code: 802)
  '802': {
    name: 'Padalarang',
    code: '802',
    lat: -6.8407,
    lng: 107.4988,
    zoom: 15,
    description: 'Padalarang, Bandung Barat',
  },
  // Tegalluar Station (Code: 402) - Yang station hanya Tegalluar
  '402': {
    name: 'Tegalluar Station',
    code: '402',
    lat: -6.9644,
    lng: 107.7126,
    zoom: 15,
    description: 'Tegalluar Station, Bandung',
  },
  // Tegalluar Depo (Code: 502)
  '502': {
    name: 'Tegalluar Depo',
    code: '502',
    lat: -6.9715,
    lng: 107.7289,
    zoom: 15,
    description: 'Tegalluar Depo, Bandung',
  },

  // Aliases for backward compatibility
  '201': {
    name: 'Karawang',
    code: '202',
    lat: -6.3712,
    lng: 107.2885,
    zoom: 15,
    description: 'Karawang',
  },
  '202-depo': {
    name: 'Tegalluar Depo',
    code: '502',
    lat: -6.9715,
    lng: 107.7289,
    zoom: 15,
    description: 'Tegalluar Depo, Bandung',
  },
  '202-depot': {
    name: 'Tegalluar Depo',
    code: '502',
    lat: -6.9715,
    lng: 107.7289,
    zoom: 15,
    description: 'Tegalluar Depo, Bandung',
  },
};

/**
 * Returns [lat, lng] coordinates for a given location code or name.
 */
export function getHubCoordinates(nameOrCode?: string | null): [number, number] | null {
  if (!nameOrCode) return null;
  const key = nameOrCode.trim();

  // Match by code first
  if (OPERATIONAL_HUBS[key]) {
    return [OPERATIONAL_HUBS[key].lat, OPERATIONAL_HUBS[key].lng];
  }

  const lower = key.toLowerCase();
  // Exact name match first
  for (const hub of Object.values(OPERATIONAL_HUBS)) {
    if (hub.name.toLowerCase() === lower) {
      return [hub.lat, hub.lng];
    }
  }

  // Substring match
  for (const hub of Object.values(OPERATIONAL_HUBS)) {
    if (lower.includes(hub.name.toLowerCase()) || hub.name.toLowerCase().includes(lower)) {
      return [hub.lat, hub.lng];
    }
  }

  return null;
}

/**
 * Returns map center & zoom level for a given hub.
 */
export function getHubMapCenter(nameOrCode?: string | null): { center: [number, number]; zoom: number } {
  const coords = getHubCoordinates(nameOrCode);
  if (!coords) {
    return { center: DEFAULT_OPS_CENTER, zoom: DEFAULT_OPS_ZOOM };
  }

  // Find matching zoom
  const key = nameOrCode?.trim() || '';
  if (OPERATIONAL_HUBS[key]) {
    return { center: coords, zoom: OPERATIONAL_HUBS[key].zoom };
  }

  return { center: coords, zoom: 14 };
}

/**
 * Haversine formula to calculate distance in meters between two lat/lng coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Finds the nearest operational location from given GPS coordinates.
 */
export function findNearestHub<T extends { id: string; name: string; code: string }>(
  lat: number,
  lng: number,
  locations: T[]
): { location: T; distanceMeters: number } | null {
  if (!locations || locations.length === 0) return null;

  let best: { location: T; distanceMeters: number } | null = null;

  for (const loc of locations) {
    const coords = getHubCoordinates(loc.code) || getHubCoordinates(loc.name);
    if (!coords) continue;
    const distance = calculateDistanceMeters(lat, lng, coords[0], coords[1]);
    if (!best || distance < best.distanceMeters) {
      best = { location: loc, distanceMeters: distance };
    }
  }

  return best;
}

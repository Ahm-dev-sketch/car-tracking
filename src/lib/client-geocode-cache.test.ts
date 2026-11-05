import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getSpatialKey,
  getCachedGeocode,
  setCachedGeocode,
  reverseGeocodeWithCache,
  resetMemoryGeocodeCache,
} from './client-geocode-cache';

describe('Client Geocode Cache (IndexedDB / LocalStorage / Memory)', () => {
  beforeEach(() => {
    resetMemoryGeocodeCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('quantizes nearby coordinates within ~11 meters to the same spatial key', () => {
    const key1 = getSpatialKey(-6.24401, 106.88802);
    const key2 = getSpatialKey(-6.24404, 106.88804);
    expect(key1).toBe('-6.2440,106.8880');
    expect(key2).toBe('-6.2440,106.8880');
    expect(key1).toBe(key2);
  });

  it('serves address from memory cache without network call', async () => {
    await setCachedGeocode(-6.2440, 106.8880, 'Stasiun Halim KCIC, Jakarta');

    const cached = await getCachedGeocode(-6.24401, 106.88803);
    expect(cached).toBe('Stasiun Halim KCIC, Jakarta');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches from API on cache miss and stores for subsequent calls', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        data: { address: 'Jl. Stasiun Padalarang No. 1, Bandung Barat' },
      }),
    };
    (fetch as any).mockResolvedValueOnce(mockResponse);

    const addr1 = await reverseGeocodeWithCache(-6.8361, 107.4721);
    expect(addr1).toBe('Jl. Stasiun Padalarang No. 1, Bandung Barat');
    expect(fetch).toHaveBeenCalledTimes(1);

    // Second call for slightly shifted coordinate (same ~11m grid) -> 0 fetch calls
    const addr2 = await reverseGeocodeWithCache(-6.83612, 107.47211);
    expect(addr2).toBe('Jl. Stasiun Padalarang No. 1, Bandung Barat');
    expect(fetch).toHaveBeenCalledTimes(1); // Still 1! 0 additional network calls
  });

  it('falls back to provided hub name on API failure', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('Network offline'));

    const addr = await reverseGeocodeWithCache(-6.9880, 107.7120, 'Tegalluar Depo');
    expect(addr).toBe('Tegalluar Depo');
  });
});

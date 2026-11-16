import { describe, expect, it, vi } from 'vitest';
import { resolveMapsLink } from '@/app/api/maps/resolve/route';

vi.mock('@/lib/auth-guard', () => ({
  getSessionUser: vi.fn(async () => ({
    id: 'user-1',
    role: 'USER',
    name: 'Tester',
    email: 'tester@example.com',
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: (handler: unknown) => handler,
}));

const noFetch = vi.fn() as unknown as typeof fetch;

describe('resolveMapsLink', () => {
  it('expands a short link and extracts coordinates', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      url: 'https://www.google.com/maps/place/Stasiun/@-6.245,106.885,17z',
    })) as unknown as typeof fetch;

    const result = await resolveMapsLink('https://goo.gl/maps/abcdef', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.lat).toBeCloseTo(-6.245);
    expect(result.lng).toBeCloseTo(106.885);
    expect(result.resolvedUrl).toContain('google.com/maps');
  });

  it('rejects non-Google hosts before any network call', async () => {
    await expect(resolveMapsLink('https://evil.com/maps', noFetch)).rejects.toMatchObject({
      code: 'INVALID_URL',
    });
    expect(noFetch).not.toHaveBeenCalled();
  });

  it('parses a full Google Maps URL without a network call', async () => {
    const result = await resolveMapsLink(
      'https://www.google.com/maps/place/Stasiun/@-6.245,106.885,17z',
      noFetch
    );

    expect(noFetch).not.toHaveBeenCalled();
    expect(result.lat).toBeCloseTo(-6.245);
    expect(result.lng).toBeCloseTo(106.885);
  });

  it('falls back to Nominatim for a text query URL', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: '-6.2', lng: '106.8', display_name: 'Stasiun Halim' }],
    })) as unknown as typeof fetch;

    const result = await resolveMapsLink(
      'https://www.google.com/maps/search/Stasiun+Halim',
      fetchImpl
    );

    expect(result.lat).toBe(-6.2);
    expect(result.lng).toBe(106.8);
    expect(result.label).toBe('Stasiun Halim');
  });

  it('throws NO_COORDINATES when neither coordinates nor a text query exist', async () => {
    await expect(resolveMapsLink('https://www.google.com/maps', noFetch)).rejects.toMatchObject({
      code: 'NO_COORDINATES',
    });
    expect(noFetch).not.toHaveBeenCalled();
  });
});

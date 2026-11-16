import { describe, it, expect } from 'vitest';
import {
  looksLikeGoogleMapsUrl,
  isShortLink,
  parseGoogleMapsUrl,
} from './google-maps-url';

describe('looksLikeGoogleMapsUrl', () => {
  it('accepts trusted Google hosts and subdomains', () => {
    expect(looksLikeGoogleMapsUrl('https://maps.app.goo.gl/abc')).toBe(true);
    expect(looksLikeGoogleMapsUrl('https://goo.gl/maps/xyz')).toBe(true);
    expect(looksLikeGoogleMapsUrl('https://www.google.com/maps/...')).toBe(true);
    expect(looksLikeGoogleMapsUrl('https://maps.google.com/...')).toBe(true);
  });

  it('rejects non-Google hosts and host-lookalikes', () => {
    expect(looksLikeGoogleMapsUrl('https://evil.com/maps')).toBe(false);
    expect(looksLikeGoogleMapsUrl('https://google.com.evil.com')).toBe(false);
    expect(looksLikeGoogleMapsUrl('https://notgoogle.com/?q=1,2')).toBe(false);
    expect(looksLikeGoogleMapsUrl('hello')).toBe(false);
    expect(looksLikeGoogleMapsUrl('')).toBe(false);
  });

  it('rejects SSRF host-suffix tricks', () => {
    expect(looksLikeGoogleMapsUrl('https://maps.app.goo.gl.evil.com/x')).toBe(false);
    expect(looksLikeGoogleMapsUrl('https://google.com.evil.com/maps')).toBe(false);
  });
});

describe('isShortLink', () => {
  it('detects goo.gl short links', () => {
    expect(isShortLink('https://maps.app.goo.gl/abc')).toBe(true);
    expect(isShortLink('https://goo.gl/maps/xyz')).toBe(true);
    expect(isShortLink('https://www.google.com/maps/...')).toBe(false);
  });
});

describe('parseGoogleMapsUrl', () => {
  it('parses @lat,lng viewport coords', () => {
    const url = 'https://www.google.com/maps/place/Tegalluar/@-6.9254,107.6534,17z';
    const result = parseGoogleMapsUrl(url);
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(-6.9254);
    expect(result!.lng).toBe(107.6534);
    expect(result!.resolvedUrl).toBe(url);
  });

  it('prefers !3d/!4d pin coords over @viewport', () => {
    const result = parseGoogleMapsUrl(
      'https://www.google.com/maps/place/Halim/@-6.245,106.885,17z/data=!3m1!4b1!4m6!3m5!1s0x2e69f3!8m2!3d-6.2000!4d106.8456',
    );
    expect(result).not.toBeNull();
    expect(result!.lat).toBe(-6.2);
    expect(result!.lng).toBe(106.8456);
  });

  it('decodes + and %20 place labels', () => {
    expect(
      parseGoogleMapsUrl('https://www.google.com/maps/place/Stasiun+Halim/@-6.245,106.885,17z')!
        .label,
    ).toBe('Stasiun Halim');
    expect(
      parseGoogleMapsUrl('https://www.google.com/maps/place/Kantor%20Depo/@-6.245,106.885,17z')!
        .label,
    ).toBe('Kantor Depo');
  });

  it('parses query param coords with comma and %2C separators', () => {
    const comma = parseGoogleMapsUrl('https://www.google.com/maps?q=-6.245,106.885');
    expect(comma).not.toBeNull();
    expect(comma!.lat).toBe(-6.245);
    expect(comma!.lng).toBe(106.885);

    const encoded = parseGoogleMapsUrl('https://www.google.com/maps?q=-6.245%2C106.885');
    expect(encoded).not.toBeNull();
    expect(encoded!.lat).toBe(-6.245);
    expect(encoded!.lng).toBe(106.885);
  });

  it('returns null for URLs without coordinates', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/place/Somewhere/')).toBeNull();
  });

  it('returns null for out-of-range coordinates', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/@-999,999,17z')).toBeNull();
  });
});

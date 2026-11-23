import { ImageResponse } from 'next/og';

export const alt = 'KCIC Fleet · Live Tracking';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#F8FAFC',
          color: '#0F172A',
          display: 'flex',
          flexDirection: 'column',
          padding: 64,
          position: 'relative',
          fontFamily: 'Geist, sans-serif',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: '#C8102E',
                display: 'flex',
              }}
            />
            <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: -0.4 }}>KCIC Fleet</div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 0.4,
              color: '#059669',
              border: '1px solid #A7F3D0',
              background: '#ECFDF5',
              borderRadius: 999,
              padding: '8px 18px',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 999, background: '#059669' }} />
            Live tracking
          </div>
        </div>

        {/* wordmark */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 22,
            paddingTop: 24,
          }}
        >
          <div style={{ fontSize: 116, fontWeight: 700, letterSpacing: -4.6, lineHeight: '112px' }}>
            Armada Whoosh,
          </div>
          <div style={{ fontSize: 116, fontWeight: 700, letterSpacing: -4.6, lineHeight: '112px' }}>
            terpantau tiap detik.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
            <div style={{ width: 40, height: 2, background: '#C8102E', display: 'flex' }} />
            <div style={{ fontSize: 24, fontWeight: 500, color: '#64748B', letterSpacing: 0.2 }}>
              Telemetri GPS · Dispatch pengemudi · Operasional stasiun
            </div>
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #E2E8F0',
            paddingTop: 28,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#0F172A' }}>
              PT Kereta Cepat Indonesia China
            </div>
            <div style={{ fontSize: 14, fontWeight: 400, color: '#94A3B8' }}>
              Workplace mobility · 2026
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              borderRadius: 16,
              padding: '16px 22px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                }}
              >
                GPS precision
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: -0.8,
                  color: '#0F172A',
                }}
              >
                ±3 m
              </div>
            </div>
            <div style={{ width: 1, height: 34, background: '#E2E8F0', display: 'flex' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1.2,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                }}
              >
                Update
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  letterSpacing: -0.8,
                  color: '#0F172A',
                }}
              >
                5 dtk
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

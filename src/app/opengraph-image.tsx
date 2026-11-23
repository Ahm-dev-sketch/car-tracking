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
          display: 'flex',
          flexDirection: 'column',
          padding: 72,
          position: 'relative',
          fontFamily: 'Geist, sans-serif',
          color: '#0F172A',
        }}
      >
        {/* crimson speed-line accent across the top edge */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 168,
            height: 4,
            background: '#C8102E',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 168,
            width: 56,
            height: 4,
            background: '#C8102E',
            opacity: 0.35,
          }}
        />

        {/* brand row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 34,
                height: 34,
                background: '#C8102E',
                borderRadius: 7,
                display: 'flex',
              }}
            />
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 4.5,
                color: '#0F172A',
              }}
            >
              KCIC FLEET
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: 3,
              color: '#64748B',
              textTransform: 'uppercase',
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                background: '#C8102E',
                display: 'flex',
              }}
            />
            Live
          </div>
        </div>

        {/* headline block */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 30,
          }}
        >
          <div
            style={{
              fontSize: 112,
              fontWeight: 800,
              letterSpacing: -5.5,
              lineHeight: '108px',
              color: '#0F172A',
            }}
          >
            KCIC FLEET
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{ width: 64, height: 3, background: '#C8102E', display: 'flex' }} />
            <div
              style={{
                fontSize: 25,
                fontWeight: 600,
                letterSpacing: 5,
                color: '#475569',
                textTransform: 'uppercase',
              }}
            >
              Workplace Mobility · Live Tracking
            </div>
          </div>
        </div>

        {/* hairline divider */}
        <div style={{ height: 1, background: '#E2E8F0', width: '100%', display: 'flex' }} />

        {/* footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 34,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 500, color: '#64748B' }}>
            Vehicle tracking &amp; driver dispatch
          </div>
          <svg width="132" height="132" viewBox="0 0 176 176">
            <circle cx="88" cy="88" r="80" fill="none" stroke="#CBD5E1" strokeWidth="1.5" />
            <circle cx="88" cy="88" r="46" fill="none" stroke="#CBD5E1" strokeWidth="1.5" />
            <line x1="8" y1="88" x2="168" y2="88" stroke="#CBD5E1" strokeWidth="1.5" />
            <line x1="88" y1="8" x2="88" y2="168" stroke="#CBD5E1" strokeWidth="1.5" />
            <line x1="88" y1="88" x2="146" y2="38" stroke="#C8102E" strokeWidth="2.5" />
            <circle cx="146" cy="38" r="7" fill="#C8102E" />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

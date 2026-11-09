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
          background: '#faf9f5',
          color: '#000',
          display: 'flex',
          flexDirection: 'column',
          padding: 56,
          position: 'relative',
          fontFamily: 'Geist, sans-serif',
        }}
      >
        {/* thick black frame */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: '12px solid #000',
            boxSizing: 'border-box',
          }}
        />

        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: 32,
                height: 32,
                background: '#be123c',
                border: '3px solid #000',
                boxShadow: '5px 5px 0 0 #000',
              }}
            />
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>KCIC FLEET</div>
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 3,
              border: '3px solid #000',
              background: '#fff',
              padding: '8px 20px',
              boxShadow: '6px 6px 0 0 #000',
            }}
          >
            LIVE
          </div>
        </div>

        {/* wordmark */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 28,
          }}
        >
          <div style={{ fontSize: 128, fontWeight: 900, letterSpacing: -7, lineHeight: '120px' }}>
            KCIC FLEET
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div style={{ width: 88, height: 18, background: '#be123c', border: '3px solid #000' }} />
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6 }}>
              WORKPLACE MOBILITY · LIVE TRACKING
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 26, color: '#3f3f46' }}>Vehicle tracking & driver dispatch</div>
          <svg width="176" height="176" viewBox="0 0 176 176">
            <circle cx="88" cy="88" r="80" fill="none" stroke="#000" strokeWidth="5" />
            <circle cx="88" cy="88" r="46" fill="none" stroke="#000" strokeWidth="5" />
            <line x1="8" y1="88" x2="168" y2="88" stroke="#000" strokeWidth="4" />
            <line x1="88" y1="8" x2="88" y2="168" stroke="#000" strokeWidth="4" />
            <line x1="88" y1="88" x2="146" y2="38" stroke="#be123c" strokeWidth="9" />
            <circle cx="146" cy="38" r="13" fill="#be123c" stroke="#000" strokeWidth="4" />
          </svg>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
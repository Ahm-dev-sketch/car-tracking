'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';

export function VehicleTracking3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isBoosted, setIsBoosted] = useState(false);
  const [speed, setSpeed] = useState(88);
  const [radarCount, setRadarCount] = useState(0);
  const [isHighBeam, setIsHighBeam] = useState(true);

  // Dynamic speedometer jitter (simulating real vehicle telemetry)
  useEffect(() => {
    const interval = setInterval(() => {
      setSpeed((prev) => {
        if (isBoosted) {
          // Boosted speed jitter around 124 km/h
          const delta = (Math.random() - 0.5) * 4;
          return Math.min(132, Math.max(118, Math.round(prev + delta)));
        } else {
          // Cruise speed jitter around 88 km/h
          const delta = (Math.random() - 0.5) * 3;
          return Math.min(93, Math.max(84, Math.round(prev + delta)));
        }
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isBoosted]);

  // Adjust base speed when boost is toggled
  const toggleBoost = useCallback(() => {
    setIsBoosted((b) => {
      const next = !b;
      setSpeed(next ? 122 : 88);
      return next;
    });
  }, []);

  // Trigger manual radar wave
  const triggerRadar = useCallback(() => {
    setRadarCount((c) => c + 1);
  }, []);

  // Mouse move handler for interactive 3D parallax tilt
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    // Tilt within -10 to +10 degrees
    setTilt({
      x: -(y * 14),
      y: x * 16,
    });
  }, []);

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0 });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative w-full select-none overflow-hidden rounded-2xl border-[3px] border-black bg-[#edf3ee] shadow-[6px_6px_0px_0px_#000] transition-shadow duration-300 hover:shadow-[8px_8px_0px_0px_#000]"
      style={{ perspective: '1100px' }}
      aria-label="3D Live Vehicle Tracking Simulation"
      role="region"
    >
      {/* 1. TOP TELEMETRY HUD BAR */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b-2 border-black bg-white/95 px-3.5 py-2.5 backdrop-blur-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full border border-black bg-emerald-500" />
          </span>
          <span className="font-mono text-xs font-black tracking-wider text-black">
            LIVE 3D RADAR // KCIC-08
          </span>
          <span className="hidden rounded-md border border-black bg-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase text-black sm:inline-block">
            Autonomous Feed
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-md border border-black bg-amber-200 px-2 py-0.5 font-mono text-[10px] font-black text-black">
            GPS 3D LOCK [14 SAT]
          </span>
          <span className="hidden font-mono text-[10px] font-bold text-zinc-600 sm:inline-block">
            5Hz TELEMETRY
          </span>
        </div>
      </div>

      {/* 2. 3D TILT STAGE VIEWPORT */}
      <div
        className="relative h-[280px] w-full overflow-hidden bg-[#e4ede6] sm:h-[320px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: isHovered ? 'transform 0.1s ease-out' : 'transform 0.5s ease-out',
        }}
      >
        {/* Subtle Blueprint / Grid Background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000 1px, transparent 1px),
              linear-gradient(to bottom, #000 1px, transparent 1px)
            `,
            backgroundSize: '34px 34px',
          }}
        />

        {/* Diagonal Route Vector Compass / Cardinal Overlay */}
        <div className="pointer-events-none absolute right-4 top-3 font-mono text-[10px] font-black text-zinc-400 opacity-60">
          BEARING: 134° SE // ELEV: 112M
        </div>

        {/* 3D ISOMETRIC HIGHWAY & VEHICLE SCENE */}
        <svg
          viewBox="0 0 580 340"
          className="relative h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            {/* Road Asphalt Pattern / Gradients */}
            <linearGradient id="roadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#18181b" />
              <stop offset="100%" stopColor="#27272a" />
            </linearGradient>

            {/* Headlight Beam Cone Gradient */}
            <linearGradient id="headlightCone" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef08a" stopOpacity={isHighBeam ? 0.75 : 0.45} />
              <stop offset="40%" stopColor="#fef08a" stopOpacity={isHighBeam ? 0.4 : 0.2} />
              <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
            </linearGradient>

            {/* Car Body Gradients */}
            <linearGradient id="carBodyLit" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="carBodyShade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#047857" />
              <stop offset="100%" stopColor="#064e3b" />
            </linearGradient>
            <linearGradient id="windshieldGlass" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a7f3d0" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient id="radarWaveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0" />
            </linearGradient>
          </defs>

          <style>
            {`
              @keyframes roadStream {
                from { stroke-dashoffset: 84; }
                to { stroke-dashoffset: 0; }
              }
              @keyframes wheelSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes carChassisBounce {
                0%, 100% { transform: translate(0px, 0px); }
                50% { transform: translate(-0.5px, 2.5px); }
              }
              @keyframes carChassisBounceBoost {
                0%, 100% { transform: translate(0px, 0px); }
                50% { transform: translate(-1px, 3.5px); }
              }
              @keyframes radarRingPulse {
                0% { r: 6; opacity: 0.9; stroke-width: 3.5; }
                50% { opacity: 0.6; }
                100% { r: 52; opacity: 0; stroke-width: 1.5; }
              }
              @keyframes waypointPass {
                0% { transform: translate(-120px, -55px); opacity: 0; }
                15% { opacity: 1; }
                85% { opacity: 1; }
                100% { transform: translate(220px, 102px); opacity: 0; }
              }
              @keyframes speedLines {
                0% { stroke-dashoffset: 120; opacity: 0.2; }
                50% { opacity: 0.9; }
                100% { stroke-dashoffset: 0; opacity: 0; }
              }
            `}
          </style>

          {/* ------------------------------------------- */}
          {/* A. 3D HIGHWAY BED (ANGLED ISOMETRIC RIBBON) */}
          {/* ------------------------------------------- */}
          <g id="highway-bed">
            {/* Ground Bed Drop Shadow */}
            <polygon
              points="-40,15 150,-15 670,225 480,395"
              fill="#000"
              opacity="0.18"
            />

            {/* Asphalt Highway Surface */}
            <polygon
              points="-50,0 140,-30 660,210 470,380"
              fill="url(#roadGradient)"
              stroke="#000"
              strokeWidth="3.5"
            />

            {/* Left Curb Hazard Stripe (Alternating White & Amber) */}
            <line
              x1="-50"
              y1="0"
              x2="470"
              y2="380"
              stroke="#f59e0b"
              strokeWidth="9"
              strokeDasharray="18 18"
            />
            <line
              x1="-50"
              y1="0"
              x2="470"
              y2="380"
              stroke="#000"
              strokeWidth="2.5"
            />

            {/* Right Curb Hazard Stripe */}
            <line
              x1="140"
              y1="-30"
              x2="660"
              y2="210"
              stroke="#f59e0b"
              strokeWidth="9"
              strokeDasharray="18 18"
            />
            <line
              x1="140"
              y1="-30"
              x2="660"
              y2="210"
              stroke="#000"
              strokeWidth="2.5"
            />

            {/* Road Surface Cross Telemetry Grid Ribs */}
            <g stroke="#ffffff" strokeWidth="1" opacity="0.15">
              <line x1="20" y1="-12" x2="-25" y2="25" />
              <line x1="120" y1="32" x2="75" y2="69" />
              <line x1="220" y1="76" x2="175" y2="113" />
              <line x1="320" y1="120" x2="275" y2="157" />
              <line x1="420" y1="164" x2="375" y2="201" />
              <line x1="520" y1="208" x2="475" y2="245" />
              <line x1="620" y1="252" x2="575" y2="289" />
            </g>

            {/* Animated Dashed Center Divider Line (Streams continuously) */}
            <line
              x1="45"
              y1="-15"
              x2="565"
              y2="295"
              stroke="#fef08a"
              strokeWidth="4"
              strokeDasharray="28 20"
              style={{
                animation: isBoosted
                  ? 'roadStream 0.4s linear infinite'
                  : 'roadStream 0.85s linear infinite',
              }}
            />
          </g>

          {/* ------------------------------------------- */}
          {/* B. ROADSIDE WAYPOINT MILESTONE (STREAMING) */}
          {/* ------------------------------------------- */}
          <g
            style={{
              animation: isBoosted
                ? 'waypointPass 2.2s linear infinite'
                : 'waypointPass 4.5s linear infinite',
            }}
          >
            {/* Waypoint Marker Post & Signboard */}
            <g transform="translate(190, 80)">
              {/* Post */}
              <rect x="0" y="0" width="5" height="32" fill="#000" rx="1" />
              {/* Signboard */}
              <rect
                x="-42"
                y="-26"
                width="88"
                height="28"
                rx="6"
                fill="#ffffff"
                stroke="#000"
                strokeWidth="2.5"
              />
              <rect x="-38" y="-22" width="80" height="6" fill="#f59e0b" rx="2" />
              <text
                x="2"
                y="-6"
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="900"
                fontFamily="monospace"
                fill="#000"
              >
                KM 42 // KARAWANG
              </text>
            </g>
          </g>

          {/* ------------------------------------------- */}
          {/* C. HEADLIGHT BEAM PROJECTION ON ROAD        */}
          {/* ------------------------------------------- */}
          <g id="headlight-illumination">
            {/* Primary Left/Right Forward Light Cone */}
            <polygon
              points="338,206 480,268 545,315 352,216"
              fill="url(#headlightCone)"
            />
            <polygon
              points="350,214 535,302 595,335 364,222"
              fill="url(#headlightCone)"
            />

            {/* Glowing Hotspot Directly in Front of Bumper */}
            <ellipse
              cx="440"
              cy="255"
              rx="45"
              ry="22"
              fill="#fef08a"
              opacity={isHighBeam ? 0.25 : 0.14}
            />
          </g>

          {/* ------------------------------------------- */}
          {/* D. BOOST SPEED LINES (Shown when boosted)   */}
          {/* ------------------------------------------- */}
          {isBoosted && (
            <g stroke="#34d399" strokeWidth="2.5" strokeDasharray="30 40">
              <line
                x1="20"
                y1="30"
                x2="560"
                y2="270"
                style={{ animation: 'speedLines 0.35s linear infinite' }}
              />
              <line
                x1="-30"
                y1="90"
                x2="510"
                y2="330"
                style={{ animation: 'speedLines 0.4s linear infinite' }}
              />
              <line
                x1="80"
                y1="0"
                x2="620"
                y2="240"
                style={{ animation: 'speedLines 0.3s linear infinite' }}
              />
            </g>
          )}

          {/* ------------------------------------------- */}
          {/* E. 3D CHUNKY NEOBRUTALIST VEHICLE (KCIC-08)  */}
          {/* ------------------------------------------- */}
          <g
            id="car-group"
            style={{
              animation: isBoosted
                ? 'carChassisBounceBoost 0.25s ease-in-out infinite'
                : 'carChassisBounce 0.5s ease-in-out infinite',
            }}
          >
            {/* 1. Car Drop Shadow on Road */}
            <polygon
              points="185,188 305,248 375,222 355,195 240,145 170,165"
              fill="#000"
              opacity="0.4"
            />

            {/* 2. Rear-Far Wheel (partially visible) */}
            <ellipse
              cx="245"
              cy="154"
              rx="11"
              ry="18"
              fill="#18181b"
              stroke="#000"
              strokeWidth="2.5"
              transform="rotate(22 245 154)"
            />

            {/* 3. Front-Far Wheel (partially visible) */}
            <ellipse
              cx="352"
              cy="198"
              rx="11"
              ry="18"
              fill="#18181b"
              stroke="#000"
              strokeWidth="2.5"
              transform="rotate(22 352 198)"
            />

            {/* 4. Rear-Near Wheel (Main Left-Rear) */}
            <g transform="translate(206, 192)">
              {/* Outer Rubber Tire */}
              <ellipse
                cx="0"
                cy="0"
                rx="14"
                ry="22"
                fill="#18181b"
                stroke="#000"
                strokeWidth="3"
                transform="rotate(24)"
              />
              {/* Rim Hubcap */}
              <ellipse
                cx="0"
                cy="0"
                rx="7"
                ry="12"
                fill="#34d399"
                stroke="#000"
                strokeWidth="2"
                transform="rotate(24)"
              />
              {/* Hub Spoke */}
              <circle cx="0" cy="0" r="3" fill="#000" />
            </g>

            {/* 5. Front-Near Wheel (Main Left-Front) */}
            <g transform="translate(316, 238)">
              {/* Outer Rubber Tire */}
              <ellipse
                cx="0"
                cy="0"
                rx="14"
                ry="22"
                fill="#18181b"
                stroke="#000"
                strokeWidth="3"
                transform="rotate(24)"
              />
              {/* Rim Hubcap */}
              <ellipse
                cx="0"
                cy="0"
                rx="7"
                ry="12"
                fill="#34d399"
                stroke="#000"
                strokeWidth="2"
                transform="rotate(24)"
              />
              {/* Hub Spoke */}
              <circle cx="0" cy="0" r="3" fill="#000" />
            </g>

            {/* 6. Car Lower Side Body (Near Side Facing Viewer) */}
            <path
              d="
                M 175,178
                L 192,178
                A 16 16 0 0 1 224,192
                L 302,228
                A 16 16 0 0 1 334,236
                L 348,226
                L 348,198
                L 292,212
                L 175,158
                Z
              "
              fill="url(#carBodyLit)"
              stroke="#000"
              strokeWidth="3"
            />

            {/* Black Protective Side Under-Skirting */}
            <path
              d="
                M 175,178
                L 192,178
                A 16 16 0 0 1 224,192
                L 302,228
                A 16 16 0 0 1 334,236
                L 348,226
                L 348,218
                L 332,226
                L 226,182
                L 175,168
                Z
              "
              fill="#18181b"
              stroke="#000"
              strokeWidth="2"
            />

            {/* KCIC Fleet Decal on Car Door */}
            <g transform="translate(236, 192) rotate(24)">
              <rect x="0" y="0" width="46" height="13" rx="2" fill="#ffffff" stroke="#000" strokeWidth="1.5" />
              <text x="23" y="9.5" textAnchor="middle" fontSize="7.5" fontWeight="900" fontFamily="sans-serif" fill="#059669">
                KCIC FLEET
              </text>
            </g>

            {/* 7. Front Nose & Bumper Facet (Angled Forward Down-Right) */}
            <polygon
              points="348,198 382,182 382,158 348,172"
              fill="url(#carBodyShade)"
              stroke="#000"
              strokeWidth="3"
            />

            {/* Front KCIC Aerodynamic Nose Grille */}
            <polygon
              points="356,192 376,182 376,170 356,179"
              fill="#18181b"
              stroke="#000"
              strokeWidth="2"
            />
            {/* Golden KCIC Wing Emblem */}
            <polygon points="364,178 368,176 368,181 364,183" fill="#f59e0b" />

            {/* Dual Front LED Headlights */}
            {/* Near Headlight */}
            <polygon
              points="347,192 355,188 355,178 347,181"
              fill="#fef08a"
              stroke="#000"
              strokeWidth="2"
            />
            {/* Far Headlight */}
            <polygon
              points="373,178 381,174 381,165 373,168"
              fill="#fef08a"
              stroke="#000"
              strokeWidth="2"
            />

            {/* 8. Front Aerodynamic Hood Panel */}
            <polygon
              points="292,212 348,172 382,158 328,142"
              fill="url(#carBodyLit)"
              stroke="#000"
              strokeWidth="3"
            />
            {/* Hood Center Ridge Line */}
            <line x1="310" y1="177" x2="355" y2="165" stroke="#000" strokeWidth="1.8" />

            {/* 9. Front Windshield (Angled Glass) */}
            <polygon
              points="292,212 328,142 306,118 266,168"
              fill="url(#windshieldGlass)"
              stroke="#000"
              strokeWidth="3"
            />
            {/* Windshield Reflection White Sheen */}
            <polygon
              points="286,195 318,140 312,132 280,188"
              fill="#ffffff"
              opacity="0.65"
            />

            {/* 10. Passenger Side Tinted Windows & Pillars */}
            <polygon
              points="266,168 196,132 196,146 266,186"
              fill="#09090b"
              stroke="#000"
              strokeWidth="3"
            />
            {/* Side Window White Specular Line */}
            <line x1="202" y1="138" x2="258" y2="166" stroke="#6ee7b7" strokeWidth="2" opacity="0.6" />
            {/* B-Pillar divider */}
            <line x1="230" y1="148" x2="230" y2="171" stroke="#000" strokeWidth="3" />

            {/* 11. Car Aerodynamic Roof Cap (Warm Ivory / Canary Accent) */}
            <polygon
              points="266,168 306,118 244,98 204,136"
              fill="#faf9f5"
              stroke="#000"
              strokeWidth="3"
            />

            {/* Rear LED Taillight Strip */}
            <polygon
              points="175,178 175,162 186,156 186,172"
              fill="#ef4444"
              stroke="#000"
              strokeWidth="2"
            />

            {/* 12. Roof Rack & GPS Telemetry Puck */}
            <ellipse
              cx="255"
              cy="128"
              rx="9"
              ry="5"
              fill="#10b981"
              stroke="#000"
              strokeWidth="2"
            />

            {/* 13. Radar Wave Rings Pulsing Outward in 3D Perspective */}
            <ellipse
              key={`radar-1-${radarCount}`}
              cx="255"
              cy="128"
              rx="18"
              ry="9"
              fill="none"
              stroke="#059669"
              strokeWidth="2.5"
              style={{ animation: 'radarRingPulse 2s ease-out infinite' }}
            />
            <ellipse
              key={`radar-2-${radarCount}`}
              cx="255"
              cy="128"
              rx="18"
              ry="9"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              style={{ animation: 'radarRingPulse 2s ease-out infinite 0.75s' }}
            />

            {/* ------------------------------------------- */}
            {/* F. HOLOGRAPHIC HUD LEADER LINE & TAG        */}
            {/* ------------------------------------------- */}
            {/* Vertical connector line from roof to HUD */}
            <line
              x1="255"
              y1="124"
              x2="255"
              y2="58"
              stroke="#000"
              strokeWidth="2.5"
              strokeDasharray="4 3"
            />
            <circle cx="255" cy="124" r="3.5" fill="#10b981" stroke="#000" strokeWidth="2" />

            {/* Floating 3D Billboard Tag */}
            <g transform="translate(175, 16)">
              {/* Hard Neobrutal Shadow */}
              <rect x="4" y="4" width="160" height="42" rx="8" fill="#000" />
              {/* Main Badge Container */}
              <rect
                x="0"
                y="0"
                width="160"
                height="42"
                rx="8"
                fill="#ffffff"
                stroke="#000"
                strokeWidth="2.5"
              />

              {/* Status Header */}
              <circle cx="14" cy="15" r="4" fill="#10b981" stroke="#000" strokeWidth="1.5" />
              <text x="24" y="18" fontSize="10" fontWeight="900" fontFamily="sans-serif" fill="#000">
                KCIC-08 // IN TRANSIT
              </text>

              <rect x="116" y="8" width="36" height="13" rx="3" fill="#fef08a" stroke="#000" strokeWidth="1.2" />
              <text x="134" y="17.5" textAnchor="middle" fontSize="8" fontWeight="900" fontFamily="monospace" fill="#000">
                ACTIVE
              </text>

              {/* Speed & Coordinate Subtitle */}
              <text x="14" y="32" fontSize="9" fontWeight="800" fontFamily="monospace" fill="#52525b">
                {speed} KM/H • -6.241° 106.882°
              </text>
            </g>
          </g>
        </svg>

        {/* 4. SPEEDOMETER & TELEMETRY HUD WIDGET (BOTTOM-LEFT) */}
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-xl border-2 border-black bg-white/95 p-2.5 shadow-[3px_3px_0px_0px_#000] backdrop-blur-xs">
          <div className="text-left">
            <span className="block text-[9px] font-black uppercase tracking-wider text-zinc-500">
              Cruise Speed
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-black tabular-nums text-black">
                {speed}
              </span>
              <span className="font-mono text-xs font-bold text-zinc-600">KM/H</span>
            </div>
          </div>

          {/* Mini Tachometer Bar */}
          <div className="flex flex-col gap-1 border-l-2 border-black/15 pl-2.5">
            <div className="flex items-center gap-1">
              <span className={`h-2.5 w-1.5 rounded-xs border border-black ${speed > 70 ? 'bg-emerald-400' : 'bg-zinc-200'}`} />
              <span className={`h-3 w-1.5 rounded-xs border border-black ${speed > 80 ? 'bg-emerald-400' : 'bg-zinc-200'}`} />
              <span className={`h-3.5 w-1.5 rounded-xs border border-black ${speed > 90 ? 'bg-emerald-500' : 'bg-zinc-200'}`} />
              <span className={`h-4 w-1.5 rounded-xs border border-black ${speed > 105 ? 'bg-amber-400' : 'bg-zinc-200'}`} />
              <span className={`h-4.5 w-1.5 rounded-xs border border-black ${speed > 120 ? 'bg-rose-500' : 'bg-zinc-200'}`} />
            </div>
            <span className="inline-flex items-center gap-1 font-mono text-[9px] font-black text-emerald-800">
              <Icon name="bolt" className="size-3 text-emerald-800" />
              {isBoosted ? 'BOOST' : 'CRUISE'}
            </span>
          </div>
        </div>

        {/* 5. INTERACTIVE ACTION PILLS (BOTTOM-RIGHT) */}
        <div className="absolute bottom-3 right-3 z-20 flex flex-wrap items-center gap-1.5">
          {/* Turbo Boost Button */}
          <button
            type="button"
            onClick={toggleBoost}
            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-black px-2.5 py-1 text-xs font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
              isBoosted
                ? 'bg-amber-400 text-black hover:bg-amber-300'
                : 'bg-white text-zinc-900 hover:bg-zinc-100'
            }`}
            title="Accelerate vehicle and road stream"
          >
            <Icon name="bolt" className="size-3.5" />
            <span>{isBoosted ? 'FAST' : 'BOOST'}</span>
          </button>

          {/* Radar Ping Button */}
          <button
            type="button"
            onClick={triggerRadar}
            className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-black bg-white px-2.5 py-1 text-xs font-black text-zinc-900 shadow-[2px_2px_0px_0px_#000] transition hover:bg-emerald-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            title="Broadcast instant radar wave"
          >
            <Icon name="signal" className="size-3.5 text-zinc-900" />
            <span>PING</span>
          </button>

          {/* High Beam Headlight Toggle */}
          <button
            type="button"
            onClick={() => setIsHighBeam((b) => !b)}
            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-black px-2.5 py-1 text-xs font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none ${
              isHighBeam
                ? 'bg-emerald-300 text-black'
                : 'bg-zinc-100 text-zinc-600'
            }`}
            title="Toggle headlight intensity"
          >
            <Icon name="sun" className="size-3.5" />
            <span>BEAM</span>
          </button>
        </div>
      </div>

      {/* 3. BOTTOM ROUTE PROGRESSION STRIP */}
      <div className="relative z-20 flex items-center justify-between border-t-2 border-black bg-white px-3.5 py-2 text-xs font-bold text-black">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-black uppercase text-emerald-800">
            HALIM
          </span>
          <Icon name="arrow" className="size-3 text-zinc-500" />
          <span className="font-mono text-[11px] font-black uppercase text-black">
            TEGALLUAR
          </span>
          <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline-block">
            (KM 42 of 142)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-24 overflow-hidden rounded-full border border-black bg-zinc-100 sm:w-32">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: isBoosted ? '58%' : '42%' }}
            />
          </div>
          <span className="font-mono text-[10px] font-black text-zinc-800">
            {isBoosted ? '58%' : '42%'}
          </span>
        </div>
      </div>
    </div>
  );
}

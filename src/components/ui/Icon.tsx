import type { SVGProps } from 'react';

const paths = {
  home: 'm3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',
  car: 'm5 7 2-4h10l2 4 2 3v8h-3v-2H6v2H3v-8l2-3Zm0 0h14M3 12h18M7 13v1m10-1v1',
  route: 'M5 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm10 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM9 5h6a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h6',
    mail: 'M4 5.5h16v13H4zM4 6l8 6 8-6',
    lock: 'M7.5 10V7a4.5 4.5 0 0 1 9 0v3M5 10h14v11H5zM12 14v3',
    tracking: 'M12 3v3m0 12v3M3 12h3m12 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    bookings: 'M7 4H4v17h16V4h-3M8 2h8v5H8zM8 12h8m-8 4h5',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Zm-4 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  calendar: 'M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 9h2m4 0h2m-8 3h2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M13 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  arrowUp: 'M6 18 18 6M6 6h12v12',
  close: 'm6 6 12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h10',
  clock: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  share: 'M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3',
  signal: 'M4 17v3m5-7v7m5-11v11m5-15v15',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  alert: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3ZM12 9v4m0 4h.01',
  satellite: 'M4 10a8 8 0 0 1 8-8m-8 13a13 13 0 0 1 13-13M2 2l20 20M7 17a3 3 0 1 0 4.24-4.24',
  wifi: 'M5 13a10 10 0 0 1 14 0m-11 3a6 6 0 0 1 8 0m-5 3a2 2 0 0 1 2 0',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  target: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 6a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm0 2a2 2 0 1 1-2 2 2 2 0 0 1 2-2Z',
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}

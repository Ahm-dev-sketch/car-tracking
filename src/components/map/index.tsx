'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';

export type { VehicleMarkerData } from './FleetMap';

export const FleetMap = dynamic(() => import('./FleetMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-lg bg-zinc-100 flex flex-col items-center justify-center border border-zinc-200 text-zinc-500 text-sm">
      <Spinner size="lg" className="mb-2" />
      <span>Loading fleet map...</span>
    </div>
  ),
});

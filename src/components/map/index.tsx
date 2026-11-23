'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';

export type { VehicleMarkerData, RoutePoint } from './FleetMap';
export { getVehicleConditionVisual } from './condition';
export type { ConditionVisual } from './condition';

export const FleetMap = dynamic(() => import('./FleetMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-lg bg-slate-100 flex flex-col items-center justify-center border border-slate-200 text-slate-500 text-sm">
      <Spinner size="lg" className="mb-2" />
      <span>Loading fleet map...</span>
    </div>
  ),
});

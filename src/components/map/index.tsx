'use client';

import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui/Spinner';

export type { VehicleMarkerData, RoutePoint } from './FleetMap';
export { getVehicleConditionVisual } from './condition';
export type { ConditionVisual } from './condition';

export const FleetMap = dynamic(() => import('./FleetMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--canvas)] text-xs text-slate-500">
      <Spinner size="md" className="text-[var(--kcic-red)]" />
      <span>Memuat peta armada&hellip;</span>
    </div>
  ),
});

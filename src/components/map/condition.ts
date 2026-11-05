export interface ConditionVisual {
  color: string;
  radarColor: string;
  pulseColor: string;
  badgeText: string;
  iconSvg: string;
}

export function getVehicleConditionVisual(
  status?: string | null,
  movement?: string | null
): ConditionVisual {
  const normStatus = (status || 'AVAILABLE').toUpperCase();
  const normMovement = (movement || 'STOPPED').toUpperCase();

  if (normStatus === 'MAINTENANCE') {
    return {
      color: '#ea580c', // Safety Orange
      radarColor: '#f97316',
      pulseColor: 'bg-orange-400',
      badgeText: 'MAINTENANCE',
      // Wrench icon
      iconSvg:
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
    };
  }

  if (normStatus === 'INACTIVE') {
    return {
      color: '#475569', // Slate Gray
      radarColor: '#64748b',
      pulseColor: 'bg-slate-400',
      badgeText: 'INACTIVE',
      // Ban/slash icon
      iconSvg:
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />',
    };
  }

  if (normStatus === 'RESERVED') {
    return {
      color: '#d97706', // Amber Yellow
      radarColor: '#f59e0b',
      pulseColor: 'bg-amber-400',
      badgeText: 'RESERVED',
      // Clock icon
      iconSvg:
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />',
    };
  }

  if (normStatus === 'IN_USE' || normMovement === 'MOVING') {
    return {
      color: normMovement === 'MOVING' ? '#be123c' : '#0284c7', // Crimson if moving, Sky if active stopped
      radarColor: normMovement === 'MOVING' ? '#e11d48' : '#38bdf8',
      pulseColor: normMovement === 'MOVING' ? 'bg-rose-500' : 'bg-sky-400',
      badgeText: normMovement === 'MOVING' ? 'IN USE (MOVING)' : 'IN USE (ACTIVE)',
      // Vehicle car icon
      iconSvg:
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="m5 8 2-4h10l2 4 2 3v7h-3v-2H6v2H3v-7l2-3Zm0 0h14M3 12h18M7 13v1m10-1v1" />',
    };
  }

  // Default: AVAILABLE (Ready at pool)
  return {
    color: '#0d9488', // Teal / Emerald
    radarColor: '#14b8a6',
    pulseColor: 'bg-teal-400',
    badgeText: 'AVAILABLE',
    // Vehicle car icon
    iconSvg:
      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="m5 8 2-4h10l2 4 2 3v7h-3v-2H6v2H3v-7l2-3Zm0 0h14M3 12h18M7 13v1m10-1v1" />',
  };
}

import { describe, expect, it } from 'vitest';
import { getVehicleConditionVisual } from '@/components/map/condition';

describe('getVehicleConditionVisual', () => {
  it('returns orange visual for MAINTENANCE', () => {
    const visual = getVehicleConditionVisual('MAINTENANCE', 'STOPPED');
    expect(visual.badgeText).toBe('MAINTENANCE');
    expect(visual.color).toBe('#ea580c');
  });

  it('returns slate visual for INACTIVE', () => {
    const visual = getVehicleConditionVisual('INACTIVE', 'OFFLINE');
    expect(visual.badgeText).toBe('INACTIVE');
    expect(visual.color).toBe('#475569');
  });

  it('returns amber visual for RESERVED', () => {
    const visual = getVehicleConditionVisual('RESERVED', 'STOPPED');
    expect(visual.badgeText).toBe('RESERVED');
    expect(visual.color).toBe('#d97706');
  });

  it('returns crimson / moving visual when vehicle is MOVING', () => {
    const visual = getVehicleConditionVisual('IN_USE', 'MOVING');
    expect(visual.badgeText).toBe('IN USE (MOVING)');
    expect(visual.color).toBe('#be123c');
  });

  it('returns sky visual when IN_USE but stationary', () => {
    const visual = getVehicleConditionVisual('IN_USE', 'STOPPED');
    expect(visual.badgeText).toBe('IN USE (ACTIVE)');
    expect(visual.color).toBe('#0284c7');
  });

  it('returns teal visual by default for AVAILABLE', () => {
    const visual = getVehicleConditionVisual('AVAILABLE', 'STOPPED');
    expect(visual.badgeText).toBe('AVAILABLE');
    expect(visual.color).toBe('#0d9488');
  });
});

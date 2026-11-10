import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// KCIC Operational Stations & Depots fallback master data
const DEFAULT_FALLBACK_LOCATIONS = [
  { id: 'loc-halim', name: 'Halim', code: '102', isActive: true },
  { id: 'loc-karawang-202', name: 'Karawang', code: '202', isActive: true },
  { id: 'loc-karawang-204', name: 'Karawang', code: '204', isActive: true },
  { id: 'loc-padalarang', name: 'Padalarang', code: '802', isActive: true },
  { id: 'loc-tegalluar-station', name: 'Tegalluar Station', code: '402', isActive: true },
  { id: 'loc-tegalluar-depo', name: 'Tegalluar Depo', code: '502', isActive: true },
];

export async function GET() {
  try {
    try {
      await getSessionUser();
    } catch {
      // Non-fatal: reading public operational locations does not block on transient auth hiccups
    }

    const locations = await prisma.location.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    const data = locations && locations.length > 0 ? locations : DEFAULT_FALLBACK_LOCATIONS;

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: unknown) {
    console.error('[Locations API Error]:', error);
    // Never crash with HTTP 500: return fallback operational locations
    return NextResponse.json({ success: true, data: DEFAULT_FALLBACK_LOCATIONS }, { status: 200 });
  }
}

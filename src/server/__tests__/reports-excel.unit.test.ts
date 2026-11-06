import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { BookingStatus, ServiceType } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  bookingFindMany: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user },
    booking: { findMany: mocks.bookingFindMany },
  },
}));

import { GET } from '@/app/api/admin/reports/excel/route';

describe('GET /api/admin/reports/excel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    mocks.auth.mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/admin/reports/excel');
    const res = await GET(req, undefined as any);

    expect(res.status).toBe(401);
  });

  it('rejects non-admin users with 403', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.user.mockResolvedValue({
      id: 'user-1',
      name: 'Regular User',
      email: 'user@test.com',
      isActive: true,
      role: { code: 'USER' },
    });

    const req = new NextRequest('http://localhost:3000/api/admin/reports/excel');
    const res = await GET(req, undefined as any);

    expect(res.status).toBe(403);
  });

  it('generates customized Excel file with Komodo Merah styling and Nota Dinas hyperlink', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.user.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin KCIC',
      email: 'admin@kcic.co.id',
      isActive: true,
      role: { code: 'ADMIN' },
    });

    const mockBookings = [
      {
        id: 'booking-1',
        bookingNumber: 'KCIC-2026-0001',
        serviceType: ServiceType.DROP_OFF,
        status: BookingStatus.COMPLETED,
        departureAt: new Date('2026-03-10T08:00:00Z'),
        expectedReturnAt: new Date('2026-03-10T11:00:00Z'),
        pickupLocation: 'Stasiun Halim',
        destination: 'Kantor Pusat KCIC',
        purpose: 'Drop Off Tamu Direksi',
        notes: '[Layanan Drop Off]',
        notaDinasUrl: '/uploads/nota-dinas/nota-001.pdf',
        notaDinasFilename: 'nota-tamu-direksi.pdf',
        rejectedReason: null,
        user: {
          id: 'user-1',
          name: 'Budi Santoso',
          email: 'budi@kcic.co.id',
          phone: '08123456789',
        },
        driver: {
          id: 'driver-1',
          user: {
            name: 'Ahmad Supir',
            phone: '08987654321',
          },
        },
        vehicle: {
          id: 'vehicle-1',
          plateNumber: 'B 1234 KC',
          brand: 'Toyota',
          model: 'Innova Zenix',
        },
        operationalLocation: {
          id: 'loc-1',
          name: 'Stasiun Halim Hub',
          code: 'HLM',
        },
        trips: [
          {
            id: 'trip-1',
            distanceMeters: 18500,
            status: 'COMPLETED',
          },
        ],
      },
    ];

    mocks.bookingFindMany.mockResolvedValue(mockBookings);

    const req = new NextRequest(
      'http://localhost:3000/api/admin/reports/excel?startDate=2026-03-01&endDate=2026-03-31&status=ALL&serviceType=ALL'
    );
    const res = await GET(req, undefined as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('spreadsheetml.sheet');
    expect(res.headers.get('Content-Disposition')).toContain('Laporan_Perjalanan_KCIC_');

    const arrayBuffer = await res.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(1000);

    // Parse the generated buffer with ExcelJS to assert content
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet('Laporan Perjalanan');
    expect(worksheet).toBeDefined();

    // Check title rows
    expect(worksheet?.getCell('A1').value).toContain('PT KERETA CEPAT INDONESIA CHINA');
    expect(worksheet?.getCell('A2').value).toContain('LAPORAN REKAPITULASI');

    // Check header row (row 7)
    expect(worksheet?.getCell('B7').value).toBe('NO. BOOKING');
    expect(worksheet?.getCell('P7').value).toBe('STATUS NOTA DINAS');
    expect(worksheet?.getCell('Q7').value).toBe('LINK DOKUMEN NOTA DINAS');

    // Check data row (row 8)
    const bookingNumCell = worksheet?.getCell('B8');
    expect(bookingNumCell?.value).toBe('KCIC-2026-0001');

    const serviceTypeCell = worksheet?.getCell('C8');
    expect(serviceTypeCell?.value).toBe('Drop Off');

    const distanceCell = worksheet?.getCell('O8');
    expect(distanceCell?.value).toBe(18.5);

    const notaStatusCell = worksheet?.getCell('P8');
    expect(notaStatusCell?.value).toBe('Terverifikasi & Selesai');

    const notaLinkCell = worksheet?.getCell('Q8');
    expect(notaLinkCell?.value).toMatchObject({
      text: 'nota-tamu-direksi.pdf',
      hyperlink: expect.stringContaining('/uploads/nota-dinas/nota-001.pdf'),
    });
  });
});

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { BookingStatus, ServiceType } from '@prisma/client';

export const dynamic = 'force-dynamic';

function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(/\./g, ':');
}

function formatStatus(status: BookingStatus): string {
  const map: Record<BookingStatus, string> = {
    PENDING: 'Menunggu Persetujuan',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    SEARCHING_DRIVER: 'Mencari Driver',
    DRIVER_NOTIFIED: 'Driver Dinotifikasi',
    DRIVER_ASSIGNED: 'Driver Ditugaskan',
    DRIVER_EN_ROUTE: 'Driver Menuju Lokasi',
    ARRIVED: 'Driver Tiba',
    IN_PROGRESS: 'Perjalanan Berlangsung',
    PENDING_COMPLETION: 'Menunggu Nota Dinas',
    COMPLETED: 'Selesai',
    CANCELLED: 'Dibatalkan',
    NO_DRIVER_AVAILABLE: 'Driver Tidak Tersedia',
    ADMIN_INTERVENTION: 'Intervensi Admin',
  };
  return map[status] || status;
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const { searchParams } = new URL(req.url);
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');
  const statusParam = searchParams.get('status');
  const serviceTypeParam = searchParams.get('serviceType');
  const locationIdParam = searchParams.get('locationId');

  // Default date: Current month if not specified
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const startDate = startDateStr ? new Date(`${startDateStr}T00:00:00.000Z`) : startOfMonth;
  const endDate = endDateStr ? new Date(`${endDateStr}T23:59:59.999Z`) : endOfMonth;

  const whereClause: any = {
    departureAt: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (statusParam && statusParam !== 'ALL') {
    whereClause.status = statusParam as BookingStatus;
  }

  if (serviceTypeParam && serviceTypeParam !== 'ALL') {
    whereClause.serviceType = serviceTypeParam as ServiceType;
  }

  if (locationIdParam && locationIdParam !== 'ALL') {
    whereClause.operationalLocationId = locationIdParam;
  }

  const bookings = await prisma.booking.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      driver: {
        include: {
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      },
      vehicle: true,
      operationalLocation: true,
      trips: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { departureAt: 'asc' },
  });

  // Calculate base URL for absolute hyperlinks
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || 'localhost:3000';
  const baseUrl = `${proto}://${host}`;

  // Build Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PT Kereta Cepat Indonesia China';
  workbook.lastModifiedBy = user.name || 'Admin KCIC';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Laporan Perjalanan', {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Color Constants (Komodo Merah Brand Guidelines)
  const COLOR_HEADER_BG = 'BE123C'; // #be123c KCIC Red
  const COLOR_DARK_CRIMSON = '4C0519'; // #4c0519
  const COLOR_WHITE = 'FFFFFF';
  const COLOR_ROW_ALT = 'FFF1F2'; // #fff1f2 Soft rose zebra
  const COLOR_BORDER = 'E4E4E7'; // zinc-200
  const COLOR_CARD_BG = 'FAFAFA';

  // 1. Title Block
  worksheet.mergeCells('A1:Q1');
  const title1 = worksheet.getCell('A1');
  title1.value = 'PT KERETA CEPAT INDONESIA CHINA (KCIC)';
  title1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLOR_DARK_CRIMSON } };
  title1.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 24;

  worksheet.mergeCells('A2:Q2');
  const title2 = worksheet.getCell('A2');
  title2.value = 'LAPORAN REKAPITULASI OPERASIONAL PERJALANAN ARMADA & NOTA DINAS';
  title2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: '18181B' } };
  title2.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 20;

  worksheet.mergeCells('A3:Q3');
  const title3 = worksheet.getCell('A3');
  const dateRangeStr = `${startDate.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })} s/d ${endDate.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}`;
  title3.value = `Periode: ${dateRangeStr}  |  Dicetak pada: ${formatDate(new Date())} WIB  |  Admin: ${user.name || user.email}`;
  title3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '71717A' } };
  title3.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(3).height = 18;

  // 2. Summary Statistics Row
  const totalBookings = bookings.length;
  const completedCount = bookings.filter((b) => b.status === BookingStatus.COMPLETED).length;
  const dropOffCount = bookings.filter((b) => b.serviceType === ServiceType.DROP_OFF).length;
  const standbyCount = bookings.filter((b) => b.serviceType === ServiceType.STANDBY).length;
  const notaDinasCount = bookings.filter((b) => Boolean(b.notaDinasUrl)).length;
  const totalDistanceMeters = bookings.reduce((sum, b) => {
    const tripDist = b.trips?.[0]?.distanceMeters || 0;
    return sum + tripDist;
  }, 0);
  const totalDistanceKm = (totalDistanceMeters / 1000).toFixed(2);

  worksheet.getRow(4).height = 10; // spacer

  // KPI Row
  worksheet.getRow(5).height = 26;
  const kpiItems = [
    { cell: 'A5:C5', label: `TOTAL PERJALANAN: ${totalBookings}`, color: '18181B', bg: 'F4F4F5' },
    { cell: 'D5:F5', label: `SELESAI (COMPLETED): ${completedCount}`, color: '15803D', bg: 'F0FDF4' },
    { cell: 'G5:I5', label: `DROP OFF: ${dropOffCount}  |  STANDBY: ${standbyCount}`, color: '9F1239', bg: 'FFF1F2' },
    { cell: 'J5:L5', label: `TOTAL JARAK: ${totalDistanceKm} KM`, color: '0369A1', bg: 'F0F9FF' },
    { cell: 'M5:Q5', label: `NOTA DINAS TERLAMPIR: ${notaDinasCount} / ${totalBookings}`, color: 'B45309', bg: 'FFFBEB' },
  ];

  kpiItems.forEach((kpi) => {
    worksheet.mergeCells(kpi.cell);
    const firstCellKey = kpi.cell.split(':')[0];
    const cell = worksheet.getCell(firstCellKey);
    cell.value = kpi.label;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: kpi.color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: kpi.bg } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'D4D4D8' } },
      bottom: { style: 'thin', color: { argb: 'D4D4D8' } },
      left: { style: 'thin', color: { argb: 'D4D4D8' } },
      right: { style: 'thin', color: { argb: 'D4D4D8' } },
    };
  });

  worksheet.getRow(6).height = 12; // spacer

  // 3. Table Column Headers
  const headers = [
    { header: 'NO', key: 'no', width: 6 },
    { header: 'NO. BOOKING', key: 'bookingNumber', width: 18 },
    { header: 'TIPE LAYANAN', key: 'serviceType', width: 14 },
    { header: 'STATUS PERJALANAN', key: 'status', width: 22 },
    { header: 'WAKTU BERANGKAT', key: 'departureAt', width: 18 },
    { header: 'WAKTU SELESAI', key: 'returnAt', width: 18 },
    { header: 'NAMA PEMESAN', key: 'userName', width: 22 },
    { header: 'KONTAK PEMESAN', key: 'userPhone', width: 16 },
    { header: 'LOKASI PENJEMPUTAN', key: 'pickupLocation', width: 28 },
    { header: 'TUJUAN', key: 'destination', width: 28 },
    { header: 'KEPERLUAN / CATATAN', key: 'purpose', width: 32 },
    { header: 'PENGEMUDI (DRIVER)', key: 'driverName', width: 22 },
    { header: 'KENDARAAN (PLAT)', key: 'vehiclePlate', width: 20 },
    { header: 'HUB OPERASIONAL', key: 'hubName', width: 20 },
    { header: 'JARAK (KM)', key: 'distanceKm', width: 14 },
    { header: 'STATUS NOTA DINAS', key: 'notaDinasStatus', width: 22 },
    { header: 'FOTO NOTA DINAS', key: 'notaDinasPhoto', width: 32 },
  ];

  const headerRowNumber = 7;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 28;

  headers.forEach((h, idx) => {
    const colNumber = idx + 1;
    const cell = headerRow.getCell(colNumber);
    cell.value = h.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    cell.border = {
      top: { style: 'medium', color: { argb: COLOR_DARK_CRIMSON } },
      bottom: { style: 'medium', color: { argb: COLOR_DARK_CRIMSON } },
      left: { style: 'thin', color: { argb: 'FDA4AF' } },
      right: { style: 'thin', color: { argb: 'FDA4AF' } },
    };

    worksheet.getColumn(colNumber).width = h.width;
  });

  // 4. Pre-fetch Nota Dinas photos in parallel (supporting both Supabase Storage remote URLs and local files)
  const photoMap = new Map<string, { buffer: Buffer; extension: 'png' | 'jpeg' }>();

  await Promise.all(
    bookings.map(async (b) => {
      if (!b.notaDinasUrl) return;

      const isPdf =
        Boolean(b.notaDinasUrl && b.notaDinasUrl.toLowerCase().endsWith('.pdf')) ||
        Boolean(b.notaDinasFilename && b.notaDinasFilename.toLowerCase().endsWith('.pdf'));

      if (isPdf) return;

      const fullNotaUrl = b.notaDinasUrl.startsWith('http')
        ? b.notaDinasUrl
        : `${baseUrl}${b.notaDinasUrl}`;

      try {
        let rawBuf: Buffer | null = null;

        // Try HTTP/HTTPS fetch (e.g. Supabase Storage remote URL)
        if (fullNotaUrl && (fullNotaUrl.startsWith('http://') || fullNotaUrl.startsWith('https://'))) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          try {
            const resp = await fetch(fullNotaUrl, { signal: controller.signal });
            if (resp.ok) {
              const arrayBuffer = await resp.arrayBuffer();
              rawBuf = Buffer.from(arrayBuffer);
            }
          } catch {
            // fallback to disk or ignore
          } finally {
            clearTimeout(timeoutId);
          }
        }

        // Try local disk read if not retrieved remotely
        if (!rawBuf) {
          const cleanPath = b.notaDinasUrl.replace(/^\//, '');
          const diskPath = path.join(process.cwd(), 'public', cleanPath);
          if (fs.existsSync(diskPath)) {
            rawBuf = await fs.promises.readFile(diskPath);
          }
        }

        if (rawBuf && rawBuf.length > 0) {
          try {
            const resized = await sharp(rawBuf)
              .resize({ width: 220, height: 110, fit: 'inside', withoutEnlargement: true })
              .png()
              .toBuffer();
            photoMap.set(b.id, { buffer: resized, extension: 'png' });
          } catch {
            // Fallback to raw buffer
            const isPng = rawBuf[0] === 0x89 && rawBuf[1] === 0x50;
            photoMap.set(b.id, { buffer: rawBuf, extension: isPng ? 'png' : 'jpeg' });
          }
        }
      } catch (err) {
        console.warn(`[Excel Export] Failed to fetch photo for booking ${b.bookingNumber}:`, err);
      }
    })
  );

  // 5. Data Rows
  for (let index = 0; index < bookings.length; index++) {
    const b = bookings[index];
    const rowNumber = headerRowNumber + 1 + index;
    const row = worksheet.getRow(rowNumber);

    const isEven = index % 2 === 1;
    const rowBg = isEven ? COLOR_ROW_ALT : COLOR_WHITE;

    const trip = b.trips?.[0];
    const distanceKm = trip?.distanceMeters ? (trip.distanceMeters / 1000).toFixed(2) : '-';

    let notaStatus = 'Belum Diunggah';
    if (b.notaDinasUrl) {
      if (b.status === BookingStatus.COMPLETED) {
        notaStatus = 'Terverifikasi & Selesai';
      } else if (b.rejectedReason) {
        notaStatus = `Ditolak: ${b.rejectedReason}`;
      } else {
        notaStatus = 'Menunggu Persetujuan';
      }
    } else if (b.rejectedReason) {
      notaStatus = `Ditolak: ${b.rejectedReason}`;
    }

    const fullNotaUrl = b.notaDinasUrl
      ? (b.notaDinasUrl.startsWith('http') ? b.notaDinasUrl : `${baseUrl}${b.notaDinasUrl}`)
      : null;

    const photoData = photoMap.get(b.id) || null;
    const hasPhoto = Boolean(photoData);
    const isPdf =
      Boolean(b.notaDinasUrl && b.notaDinasUrl.toLowerCase().endsWith('.pdf')) ||
      Boolean(b.notaDinasFilename && b.notaDinasFilename.toLowerCase().endsWith('.pdf'));

    // Adjust row height depending on content (photos get 80pt, pdfs 32pt, standard 24pt)
    if (hasPhoto) {
      row.height = 80;
    } else if (isPdf) {
      row.height = 32;
    } else {
      row.height = 24;
    }

    const rowData = [
      index + 1, // 1. NO
      b.bookingNumber, // 2. No Booking
      b.serviceType === ServiceType.STANDBY ? 'Standby' : 'Drop Off', // 3. Tipe Layanan
      formatStatus(b.status), // 4. Status
      formatDate(b.departureAt), // 5. Waktu Berangkat
      formatDate(b.expectedReturnAt), // 6. Waktu Selesai
      b.user.name, // 7. Nama Pemesan
      b.user.phone || '-', // 8. Kontak
      b.pickupLocation, // 9. Jemput
      b.destination, // 10. Tujuan
      [b.purpose, b.notes].filter(Boolean).join(' | '), // 11. Keperluan
      b.driver?.user?.name ? `${b.driver.user.name} (${b.driver.user.phone || '-'})` : 'Belum Ditugaskan', // 12. Driver
      b.vehicle ? `${b.vehicle.plateNumber} (${b.vehicle.brand} ${b.vehicle.model})` : 'Belum Ditentukan', // 13. Kendaraan
      b.operationalLocation ? `${b.operationalLocation.name} (${b.operationalLocation.code})` : '-', // 14. Hub
      distanceKm !== '-' ? Number(distanceKm) : '-', // 15. Jarak
      notaStatus, // 16. Status Nota
      hasPhoto
        ? (fullNotaUrl ? { text: ' ', hyperlink: fullNotaUrl } : '')
        : isPdf
        ? { text: `[Dokumen PDF] ${b.notaDinasFilename || 'Buka PDF'}`, hyperlink: fullNotaUrl }
        : fullNotaUrl
        ? { text: b.notaDinasFilename || 'Buka Dokumen', hyperlink: fullNotaUrl }
        : '-', // 17. Foto / Dokumen
    ];

    rowData.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val as any;
      cell.font = { name: 'Calibri', size: 10, color: { argb: '18181B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = {
        top: { style: 'thin', color: { argb: COLOR_BORDER } },
        bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
        left: { style: 'thin', color: { argb: COLOR_BORDER } },
        right: { style: 'thin', color: { argb: COLOR_BORDER } },
      };

      // Specific cell alignments
      if (colIdx === 0) {
        // No
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colIdx === 1) {
        // Booking Number
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_DARK_CRIMSON } };
      } else if (colIdx === 2 || colIdx === 3 || colIdx === 4 || colIdx === 5 || colIdx === 13) {
        // Type, Status, Dates, Hub
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colIdx === 14) {
        // Distance
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (typeof val === 'number') {
          cell.numFmt = '#,##0.00 "km"';
        }
      } else if (colIdx === 15) {
        // Status Nota
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (notaStatus.includes('Terverifikasi')) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '15803D' } };
        } else if (notaStatus.includes('Ditolak')) {
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'BE123C' } };
        }
      } else if (colIdx === 16) {
        // Foto / Link Nota Dinas
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (!hasPhoto && fullNotaUrl) {
          cell.font = { name: 'Calibri', size: 9, color: { argb: '1D4ED8' }, underline: true };
        }
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });

    // Embed photo directly inside the cell if available
    if (hasPhoto && photoData) {
      const imageId = workbook.addImage({
        buffer: photoData.buffer as any,
        extension: photoData.extension,
      });

      worksheet.addImage(imageId, {
        tl: { col: 16 + 0.05, row: rowNumber - 1 + 0.05 } as any,
        br: { col: 17 - 0.05, row: rowNumber - 0.05 } as any,
        editAs: 'oneCell',
        hyperlinks: fullNotaUrl
          ? {
              hyperlink: fullNotaUrl,
              tooltip: 'Klik untuk membuka foto ukuran penuh',
            }
          : undefined,
      });
    }
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  const filenameDate = `${startDate.toISOString().split('T')[0]}_sd_${endDate.toISOString().split('T')[0]}`;
  const filename = `Laporan_Perjalanan_KCIC_${filenameDate}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  });
});

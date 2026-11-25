import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { getSignedStorageUrl } from '@/server/storage/service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    let user;
    try {
      user = await getSessionUser();
    } catch (authErr: any) {
      console.error('[Download Nota Dinas Error]: Authentication required', authErr);
      return NextResponse.json(
        {
          success: false,
          message: 'Sesi login telah berakhir. Silakan login kembali.',
          error: { code: 'UNAUTHORIZED', message: authErr?.message || 'Authentication required' },
        },
        { status: 401 }
      );
    }

    // 2. Validate booking ID
    const resolvedParams = context?.params ? await Promise.resolve(context.params) : null;
    const id = resolvedParams?.id;
    if (!id || typeof id !== 'string') {
      console.error('[Download Nota Dinas Error]: Missing booking id');
      return NextResponse.json(
        {
          success: false,
          message: 'Booking ID tidak valid atau hilang',
          error: { code: 'INVALID_ID', message: 'Missing booking id' },
        },
        { status: 400 }
      );
    }

    // 3. Find booking in database
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { driver: true },
    });

    if (!booking) {
      console.error(`[Download Nota Dinas Error]: Booking #${id} not found`);
      return NextResponse.json(
        {
          success: false,
          message: 'Booking tidak ditemukan',
          error: { code: 'NOT_FOUND', message: 'Booking not found' },
        },
        { status: 404 }
      );
    }

    // 4. Authorization check: owner, assigned driver, or admin
    const isOwner = booking.userId === user.id;
    const isDriver = booking.driver?.userId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isOwner && !isDriver && !isAdmin) {
      console.error(
        `[Download Nota Dinas Error]: User ${user.id} (${user.role}) is not authorized to download for booking ${id}`
      );
      return NextResponse.json(
        {
          success: false,
          message: 'Hanya pemesan, driver, atau admin yang dapat mengunduh Nota Dinas untuk pesanan ini',
          error: { code: 'FORBIDDEN', message: 'Not authorized to download Nota Dinas' },
        },
        { status: 403 }
      );
    }

    // 5. No document uploaded
    if (!booking.notaDinasUrl) {
      return NextResponse.json(
        {
          success: false,
          message: 'Dokumen Nota Dinas belum diunggah',
          error: { code: 'NOT_FOUND', message: 'Nota Dinas not uploaded' },
        },
        { status: 404 }
      );
    }

    // 6. Local filesystem fallback: redirect to public static asset
    if (booking.notaDinasUrl.startsWith('/uploads/')) {
      return NextResponse.redirect(new URL(booking.notaDinasUrl, req.url));
    }

    // 7. Supabase object key: sign a short-lived URL
    const signedUrl = await getSignedStorageUrl('nota-dinas', booking.notaDinasUrl, 60);
    if (!signedUrl) {
      return NextResponse.json(
        {
          success: false,
          message: 'Gagal membuat tautan unduhan. Silakan coba lagi.',
          error: { code: 'SIGNED_URL_FAILED', message: 'Failed to generate signed URL' },
        },
        { status: 500 }
      );
    }

    return NextResponse.redirect(signedUrl);
  } catch (error: any) {
    console.error('[Download Nota Dinas Error]:', error);
    return NextResponse.json(
      {
        success: false,
        message: error?.message || 'Terjadi kesalahan internal server saat mengunduh Nota Dinas',
        error: {
          code: 'INTERNAL_ERROR',
          message: error?.message || 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}

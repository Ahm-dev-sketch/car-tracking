import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Prisma WHERE clause for a user's "My bookings" action-required badge:
 * - All active / attention-needed bookings (status NOT IN COMPLETED, CANCELLED, REJECTED)
 * - Unseen REJECTED bookings (status = REJECTED AND rejectionSeenAt IS NULL)
 */
export function getUserActionRequiredWhere(userId: string): Prisma.BookingWhereInput {
  return {
    userId,
    OR: [
      {
        status: {
          notIn: [
            BookingStatus.COMPLETED,
            BookingStatus.CANCELLED,
            BookingStatus.REJECTED,
          ],
        },
      },
      {
        status: BookingStatus.REJECTED,
        rejectionSeenAt: null,
      },
    ],
  };
}

export async function getUserActionRequiredCount(userId: string): Promise<number> {
  return prisma.booking.count({
    where: getUserActionRequiredWhere(userId),
  });
}

export async function acknowledgeRejectedBookings(
  userId: string,
  bookingIds: string[]
): Promise<{ updatedCount: number; count: number }> {
  const uniqueIds = Array.from(new Set(bookingIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      updatedCount: 0,
      count: await getUserActionRequiredCount(userId),
    };
  }

  const updateResult = await prisma.booking.updateMany({
    where: {
      userId,
      id: { in: uniqueIds },
      status: BookingStatus.REJECTED,
      rejectionSeenAt: null,
    },
    data: {
      rejectionSeenAt: new Date(),
    },
  });

  const count = await getUserActionRequiredCount(userId);
  return {
    updatedCount: updateResult.count,
    count,
  };
}

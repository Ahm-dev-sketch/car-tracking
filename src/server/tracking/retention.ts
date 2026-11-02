import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface RetentionPurgeResult {
  droppedPartitions: string[];
  prunedAuditLogsCount: number;
}

// Scheduled retention worker / cron entry point.
// Suggested deployment: Cloudflare Scheduled Worker / cron trigger every night at 02:00 UTC.
export async function purgeOldLocationPartitions(
  days: number = 90
): Promise<RetentionPurgeResult> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const droppedPartitions: string[] = [];

  // Query PostgreSQL catalog for all child partitions of driver_locations
  const childRows = await prisma.$queryRawUnsafe<Array<{ relname: string }>>(`
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'driver_locations';
  `);

  for (const row of childRows) {
    const match = row.relname.match(/^driver_locations_(\d{4})(\d{2})$/);
    if (!match) continue;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10); // 1-12
    // Partition upper bound is the 1st of next month
    const partitionEndDate = new Date(Date.UTC(year, month, 1));

    if (partitionEndDate <= cutoff) {
      logger.info({
        msg: `Dropping expired driver_locations partition: ${row.relname} (ended ${partitionEndDate.toISOString()}, cutoff ${cutoff.toISOString()})`,
        partition: row.relname,
      });
      await prisma.$executeRawUnsafe(
        `DROP TABLE IF EXISTS "${row.relname}" CASCADE;`
      );
      droppedPartitions.push(row.relname);
    }
  }

  // Prune audit logs older than 365 days per ARCHITECTURE.md §3 & §8
  const auditCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const auditDeleteResult = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: auditCutoff },
    },
  });

  return {
    droppedPartitions,
    prunedAuditLogsCount: auditDeleteResult.count,
  };
}

// CLI runner when invoked directly via `npm run retention:run`
if (require.main === module) {
  purgeOldLocationPartitions()
    .then((res) => {
      console.log('Retention purge completed successfully:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Retention purge failed:', err);
      process.exit(1);
    });
}

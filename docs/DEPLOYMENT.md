# Deployment Runbook — Cloudflare Workers & Neon PostgreSQL

Production deployment guide for `car-tracking` using `@opennextjs/cloudflare`, Cloudflare Workers, Hyperdrive, and Neon PostgreSQL.

---

## 1. Prerequisites

- **Node.js**: `v22.x` (LTS)
- **Cloudflare Account**: Workers Paid or Free, R2 enabled (for incremental cache)
- **Wrangler CLI**: authenticated via `npx wrangler login`
- **Neon Account**: Free or Pro tier PostgreSQL 16+ instance

---

## 2. Neon Database Provisioning

1. Create a Neon project (Region: choose closest to Cloudflare Workers region, e.g. `us-east-1` or `eu-west-1`).
2. Copy PostgreSQL pooled connection string:
   ```text
   postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require
   ```
3. Run database migrations from local workspace:
   ```bash
   DATABASE_URL="postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require" npx prisma migrate deploy
   ```
4. (Optional) Seed initial roles and test data:
   ```bash
   DATABASE_URL="postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require" npx prisma db seed
   ```

---

## 3. Cloudflare Hyperdrive Setup

Hyperdrive accelerates database queries by maintaining pooled connections and caching queries near Cloudflare Workers.

1. Create the Hyperdrive configuration:
   ```bash
   npx wrangler hyperdrive create car-tracking-hyperdrive \
     --connection-string="postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require"
   ```
2. Note the generated `id` (e.g. `4b09c5e317674bb9b3e1c6827010a30b`).
3. Update `wrangler.jsonc`:
   ```jsonc
   "hyperdrive": [
     {
       "binding": "HYPERDRIVE",
       "id": "<YOUR_HYPERDRIVE_ID>",
       "localConnectionString": "postgresql://postgres:postgres@localhost:5432/car_tracking?schema=public"
     }
   ]
   ```

---

## 4. Production Secrets Configuration

Set required secrets on Cloudflare Workers using Wrangler:

```bash
# 1. Auth.js secret key (generate with: openssl rand -base64 32)
npx wrangler secret put AUTH_SECRET

# 2. Database connection string fallback (Neon direct connection)
npx wrangler secret put DATABASE_URL

# 3. Internal token for realtime and scheduled worker communications
npx wrangler secret put REALTIME_INTERNAL_TOKEN

# 4. Production public URL
npx wrangler secret put NEXTAUTH_URL
```

---

## 5. Build and Deploy Steps

Build OpenNext bundle and deploy to Cloudflare:

```bash
# 1. Compile Next.js app + generate OpenNext worker bundle (.open-next/)
npm run deploy:build

# 2. Deploy bundle and static assets to Cloudflare Workers
npm run deploy
```

> **Dry-run check**: `npm run deploy:dry` builds the bundle and validates bundle output offline without touching remote infrastructure.

---

## 6. Custom Domain & Routing

Configure route in Cloudflare Dashboard:
1. Navigate to **Workers & Pages** -> `car-tracking` -> **Settings** -> **Domains & Routes**.
2. Add Custom Domain: e.g. `tracking.yourdomain.com`.
3. Cloudflare will automatically provision SSL/TLS certificate.

---

## 7. Realtime Durable Object Integration Checkpoint

- **Current State**: `realtime/durable-object.ts` implements `LocationHub` with WebSocket Hibernation and broadcast.
- **OpenNext Constraint**: OpenNext builds `.open-next/worker.js` as the worker entrypoint. Cloudflare requires any Durable Object class bound under `durable_objects.bindings` in the same worker to be exported from that entrypoint.
- **Production Architecture Paths**:
  - **Option A (Recommended — Separate Realtime Worker)**:
    Deploy `realtime/durable-object.ts` as an independent Cloudflare Worker (`car-tracking-realtime`).
    In `car-tracking/wrangler.jsonc`, reference it via `script_name`:
    ```jsonc
    "durable_objects": {
      "bindings": [
        {
          "name": "LOCATION_HUB",
          "class_name": "LocationHub",
          "script_name": "car-tracking-realtime"
        }
      ]
    }
    ```
    Route `https://tracking.yourdomain.com/ws/*` directly to `car-tracking-realtime`.
  - **Option B (Monolithic Worker Export)**:
    Re-export `LocationHub` from the OpenNext entrypoint bundle via custom build step before `wrangler deploy`.
- **Local Dev**: completely unaffected. `npm run realtime:dev` runs the Node WebSocket shim on port 3001 (`scripts/realtime-dev.mjs`).

---

## 8. Retention Cleanup Cron Setup

Retention logic lives in `src/server/tracking/retention.ts` (`purgeOldLocationPartitions`, dropping partitions older than 90 days and pruning audit logs >365 days).

Because OpenNext generates a Next.js HTTP server worker without exposed `scheduled` event exports, the recommended production setup is:

### Option A: Dedicated Cloudflare Cron Worker (Recommended)
Create a minimal separate worker with `[triggers]` crons:
```ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await fetch('https://tracking.yourdomain.com/api/admin/retention', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.REALTIME_INTERNAL_TOKEN}`,
      },
    });
  },
};
```

### Option B: Scheduled Pipeline / GitHub Actions
Execute retention script directly via Node on a schedule:
```bash
DATABASE_URL="<NEON_URL>" npm run retention:run
```

---

## 9. Next.js 16 Deprecated `middleware.ts` Checkpoint

- Next.js 16 marks `middleware.ts` as deprecated in favor of `proxy.ts`.
- `@opennextjs/cloudflare` (v1.20+) transparently supports both `middleware.ts` and `proxy.ts`, compiling either into `middleware.js` in the worker bundle.
- **Migration Checkpoint**: Run `npx @next/codemod@canary middleware-to-proxy .` to rename `src/middleware.ts` to `src/proxy.ts` whenever scheduled. The current build operates cleanly without modification.

---

## 10. Post-Deployment Smoke Checklist

Perform these verification checks on the deployed production domain:

- [ ] **Auth / Login**: Navigate to `/login`, authenticate as admin user, verify HTTP-only JWT cookie is set.
- [ ] **Fleet Management**: Navigate to `/admin/vehicles`, register a new vehicle, verify record saved in Neon.
- [ ] **Booking Flow**: As user (`/user/bookings`), create a reservation for the vehicle.
- [ ] **Approval & Assignment**: As admin (`/admin/bookings`), approve booking and assign a driver.
- [ ] **Trip Lifecycle**: As driver (`/driver/vehicle`), start trip.
- [ ] **GPS Ingestion**: Send test GPS ping to `/api/tracking/locations`, verify 200 response and partition routing.
- [ ] **Live Map**: View `/admin/fleet` or `/user/tracking`, verify vehicle marker renders on OpenStreetMap canvas.

---

## 11. Local Development Unaffected

- `npm run dev`: runs Next.js dev server on Node.
- `npm run dev:all`: concurrently starts Next.js + local WebSocket shim.
- `npm run test`: runs Vitest test suite with Prisma PG adapter against local database.
- `src/lib/prisma.ts` dynamically switches:
  - Uses `env.HYPERDRIVE.connectionString` inside Cloudflare Workers runtime.
  - Falls back to `process.env.DATABASE_URL` in Node runtime, local dev, and tests.

---

## 12. Dispatch Sweep Cadence

- **Cloudflare Cron Minimum**: Cloudflare Workers Cron Triggers enforce a 1-minute minimum granularity (`*/1 * * * *` configured in `wrangler.jsonc`). The sequential driver offer timeout is 30 seconds.
- **Lazy Sweep on Reads**: To bridge the 30s timeout without sub-minute cron triggers, a lazy sweep runs automatically on:
  - `GET /api/driver/offers` (when drivers check/refresh offers)
  - `GET /api/bookings` (when users/admins view booking status)
  This maintains an effective ~30s offer expiry cadence whenever users or drivers are actively monitoring the application.
- **Background Fallback**: In purely headless/background conditions with zero read traffic, background offers advance via the 1-minute cron sweep (worst-case ~60–90s timeout).
- **Guarded Sweep Endpoint**: External cron monitors can invoke `POST /api/admin/dispatch/sweep` (guarded with ADMIN role) at any custom sub-minute interval.
- **Local Dev**: Run `npm run dispatch:sweep` (`scripts/dispatch-sweep.mjs`).
- **OpenNext Deployment Checkpoint**: As documented in Section 8, OpenNext builds an HTTP server worker entrypoint without raw `scheduled` exports; cron events can be routed via a dedicated cron worker invoking the HTTP sweep endpoint or direct worker pipeline.

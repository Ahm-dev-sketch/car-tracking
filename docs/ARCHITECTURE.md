# Vehicle Management & Live Tracking System — Technical Architecture (PHASE 0)

Status: PROPOSAL — awaiting approval before Phase 1.

## 0. Repository Audit

- Directory `D:\laragon\www\car-tracking` is **empty**. No existing code, dependencies, or git history.
- Greenfield project. No legacy constraints, no migration burden. Laragon is the local dev host (Windows).
- Note: Laragon ships MariaDB by default; **PostgreSQL must be added** (Laragon menu → Tools → Add Postgres) or run via Docker for local dev.

## 1. Stack Proposal

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15+ (App Router), TypeScript | One codebase, server components, API route handlers, PWA-ready |
| Styling | Tailwind CSS v4 | Spec requirement, fast responsive iteration |
| Backend | Next.js route handlers + `src/server` service layer | Monolith v1: single deployable, shared types, lowest ops cost. Business logic isolated in plain TS modules (no Next imports) so a separate API service can be split out later without rewrite |
| DB | PostgreSQL 16 | Spec requirement; exclusion-constraint support for overlap prevention; partitioning for location history |
| ORM | Prisma 6 | Type-safe schema, tracked migrations. Raw SQL escape hatch for high-volume location ingest |
| Auth | Auth.js v5 (credentials) + JWT in httpOnly cookie; **bcryptjs** password hashing | Standard, session via DB optional later; role checks enforced in every API handler (never frontend-only). bcryptjs = pure JS, Worker-compatible (native bcrypt won't compile on Workers) |
| Realtime | Cloudflare-native WebSockets on **Durable Objects** (v1) | Decision: Cloudflare deploy. DO WebSocket Hibernation API = stateful WS on Workers, free tier covers v1. `location:update` events pushed from Workers to subscribed DOs. Local dev: Node WS shim implementing same protocol contract |
| Maps | Leaflet + react-leaflet + OpenStreetMap tiles (v1) | Free, no API key. Map-provider interface isolates swap to Mapbox/Google later. **Route drawing v1**: GPS track polyline only; turn-by-turn routing needs paid API (see §7) |
| Geolocation | Browser Geolocation API (watchPosition, high accuracy) | Spec requirement; foreground-only (see §6) |
| PWA | @serwist/next | Maintained successor of next-pwa; manifest + icons + service worker |
| Deployment | **Cloudflare**: Pages/Workers via `@opennextjs/cloudflare`; **Neon** (hosted Postgres) + Hyperdrive for DB | Decision: Cloudflare. Free tier (Pages + Workers + DO) matches this workload; Postgres stays external (Neon free tier) since Cloudflare offers no Postgres. Dev: local Postgres 17. **Worker-compat constraints**: bcryptjs (pure JS), Prisma driver adapter (`@prisma/adapter-pg` via Hyperdrive), no Node-only deps |
| Images | Local disk on VPS (public/), swap to R2/CDN later | Zero cost v1 |

Rejected: separate Express/Nest backend (ops cost, no benefit at this scale), Google Maps v1 (per-load cost), Pusher/Ably (per-connection cost), Supabase (splits stack, dev/prod drift).

## 2. Repository Structure

```
car-tracking/
├── prisma/                 # schema.prisma + migrations
├── src/
│   ├── app/
│   │   ├── (auth)/         # login, register
│   │   ├── (user)/         # booking, track, history dashboards
│   │   ├── (driver)/       # vehicle select, GPS session, trips
│   │   ├── (admin)/        # vehicles, drivers, bookings, stats
│   │   └── api/            # route handlers = thin HTTP layer
│   ├── server/             # business logic, zero Next imports (portable)
│   │   ├── auth/ users/ vehicles/ drivers/ bookings/
│   │   ├── tracking/ trips/ notifications/ audit/
│   │   └── realtime/       # Socket.io emit helpers
│   ├── lib/                # prisma client, session, validation, errors, rate-limit
│   ├── hooks/              # useGeolocation, useSocket, useVehiclePositions
│   ├── components/         # ui/ + map/ + driver-panel/
│   └── types/
├── docs/
├── server.js               # custom Next server mounting Socket.io
└── public/                 # PWA manifest, icons, images
```

## 3. Database Schema

### Enums
- `Role`: ADMIN, USER, DRIVER
- `VehicleStatus`: AVAILABLE, RESERVED, IN_USE, MAINTENANCE, INACTIVE
- `VehicleType`: SEDAN, SUV, MPV, VAN, TRUCK
- `Transmission`: MANUAL, AUTOMATIC
- `BookingStatus`: PENDING, APPROVED, REJECTED, DRIVER_ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED
- `TripStatus`: ACTIVE, COMPLETED, ABORTED
- `DriverStatus`: OFFLINE, AVAILABLE, ON_TRIP

### Tables

**roles** — `id` PK, `code` (unique: ADMIN/USER/DRIVER), `name`. Lookup table per spec; future permission expansion joins here.

**users** — `id` uuid PK, `email` unique, `password_hash`, `name`, `phone`, `role_id` FK→roles (RESTRICT), `avatar_url?`, `is_active` bool default true, `created_at`, `updated_at`. Index: `email`, `role_id`. Deletion: soft via `is_active`.

**drivers** — `id` uuid PK, `user_id` unique FK→users (RESTRICT), `license_number` unique, `status` DriverStatus default OFFLINE, `current_vehicle_id?` FK→vehicles (SET NULL), `created_at`, `updated_at`. 1:1 with users; phone/name/photo live on users.

**vehicles** — `id` uuid PK, `plate_number` unique (case-insensitive unique index), `brand`, `model`, `vehicle_type`, `seating_capacity` int check > 0, `transmission?`, `image_url?`, `status` VehicleStatus default AVAILABLE, `current_driver_id?` FK→drivers (SET NULL), `created_at`, `updated_at`. Index: `status`, `seating_capacity`. Deletion: soft via status=INACTIVE.

**vehicle_assignments** — `id` bigserial PK, `vehicle_id` FK→vehicles (RESTRICT), `driver_id` FK→drivers (RESTRICT), `assigned_at`, `unassigned_at?`, `reason?`. **Partial unique index**: `(vehicle_id) WHERE unassigned_at IS NULL` → guarantees one active driver per vehicle at DB level. Index: `driver_id`.

**bookings** — `id` uuid PK, `booking_number` unique (human-readable, e.g. `BK-2026-0001`), `user_id` FK→users (RESTRICT), `vehicle_id?` FK→vehicles (SET NULL), `driver_id?` FK→drivers (SET NULL), `pickup_location`, `destination`, `departure_at` timestamptz, `expected_return_at` timestamptz, `passenger_count` int, `purpose`, `notes?`, `status` BookingStatus default PENDING, `created_at`, `updated_at`.
- Check: `expected_return_at > departure_at`.
- Indexes: `(status, departure_at)`, `(user_id)`, `(vehicle_id, departure_at, expected_return_at)`.
- Overlap prevention: transactional row lock (§5).

**trips** — `id` uuid PK, `booking_id?` FK→bookings (SET NULL), `vehicle_id` FK→vehicles (RESTRICT), `driver_id` FK→drivers (RESTRICT), `started_at`, `ended_at?`, `start_lat`, `start_lng`, `end_lat?`, `end_lng?`, `distance_meters?`, `status` TripStatus. Indexes: `(vehicle_id, started_at DESC)`, `(driver_id, started_at DESC)`.

**vehicle_locations** (CURRENT, 1 row/vehicle) — `vehicle_id` PK/FK→vehicles (CASCADE), `driver_id` FK→drivers, `lat`, `lng`, `accuracy_m`, `speed_mps?`, `heading_deg?`, `recorded_at` (client clock), `received_at` (server clock), `movement` (MOVING/STOPPED/GPS_LOST/OFFLINE). Upsert on every accepted ingest. Optimizes realtime reads: single-row lookup, no history scan.

**driver_locations** (HISTORY) — `id` bigserial PK, `driver_id` FK (CASCADE), `vehicle_id` FK, `lat`, `lng`, `accuracy_m`, `speed_mps?`, `heading_deg?`, `recorded_at`, `received_at`. **Monthly partitioning by `recorded_at`**. Retention: cron purge partitions older than N days (default 90, configurable). Index: `(driver_id, recorded_at DESC)`.

**notifications** — `id` bigserial PK, `user_id` FK (CASCADE), `type`, `title`, `body`, `data` jsonb, `read_at?`, `created_at`. Index: `(user_id, read_at)`.

**audit_logs** — `id` bigserial PK, `actor_user_id?` FK (SET NULL), `action`, `entity_type`, `entity_id`, `old_value` jsonb, `new_value` jsonb, `ip`, `user_agent`, `created_at`. Index: `(entity_type, entity_id, created_at)`. Append-only; retention purge 1 year.

### ERD (ASCII)

```
roles 1──N users 1──1 drivers N──1 vehicles
  │                    │   │         │  │
  │                    │   │         │  │
  │                    │   └─────────┘  │  (current_vehicle_id / current_driver_id — denormalized mirrors of active assignment)
  │                    │                │
  │                    └─ N vehicle_assignments N ─┘ (partial-unique: 1 active per vehicle)
  │                    │
  │                    └─ N driver_locations ──┘
  │                        (partitioned history)
  users 1──N bookings N──1 vehicles
  │            │      │
  │            │      └── 1──1 vehicle_locations (current)
  │            └──N trips N──1 vehicles
  │
  users 1──N notifications
  users 1──N audit_logs (actor)
```

## 4. API Specification

Auth via Auth.js (`/api/auth/*`): credentials sign-in, JWT httpOnly cookie, middleware protects route groups. All handlers re-check role + ownership server-side.

### Vehicle (admin CRUD; read for authenticated users)
- `GET /api/vehicles` — query: `search` (plate/brand/model), `seats`, `status`, `page`, `limit`. Users see all except INACTIVE.
- `GET /api/vehicles/:id` — detail + current driver (admin only: full; user: only if linked to their active booking).
- `POST /api/vehicles` (ADMIN), `PATCH /api/vehicles/:id` (ADMIN), `DELETE /api/vehicles/:id` (ADMIN → soft-deactivate; fails if IN_USE or has ACTIVE trip).

### Drivers (admin)
- `GET /api/drivers` (query: `status`, `search`, `page`), `GET /api/drivers/:id`, `POST /api/drivers` (creates user+driver), `PATCH /api/drivers/:id`, `POST /api/drivers/:id/assign` (vehicle assignment), `POST /api/drivers/:id/unassign`.
- `GET /api/drivers/:id/location` — admin only.

### Bookings
- `POST /api/bookings` (USER) — validates availability, creates PENDING, audits.
- `GET /api/bookings` — user: own; admin: all + filters (`status`, `vehicle`, `date-range`, `page`).
- `GET /api/bookings/:id` — owner or admin.
- `POST /api/bookings/:id/cancel` — owner or admin (PENDING/APPROVED/DRIVER_ASSIGNED only).
- `POST /api/bookings/:id/approve` (ADMIN), `.../reject` (ADMIN), `.../assign-driver` (ADMIN).
- `PATCH /api/bookings/:id/status` (assigned DRIVER) — IN_PROGRESS / COMPLETED (opens/closes trip).
- Driver info panel fields returned only for owner-of-active-booking or admin.

### Tracking
- `GET /api/tracking/config` — authenticated; returns interval by session type (trip 5s / idle 15–30s), accuracy thresholds. Server-driven config.
- `POST /api/tracking/locations` (DRIVER) — batch up to 5 points; requires active trip or assigned session; validates ranges, rejects stale/future timestamps.
- `GET /api/tracking/live` — user: positions of vehicles in their APPROVED/DRIVER_ASSIGNED/IN_PROGRESS bookings; admin: all.
- `GET /api/tracking/vehicle/:id` — latest point + movement status; same authorization as `live`.
- WS `/ws` (Socket.io) events: `location:update`, `booking:update`, `notification`. Auth via JWT handshake.

### Trips
- `POST /api/trips` (DRIVER, opens session), `PATCH /api/trips/:id/end` (DRIVER), `GET /api/trips` (admin all / driver own), `GET /api/trips/:id`, `GET /api/trips/:id/locations` (admin, driver-own, or user with booking on that trip).

### Notifications / Admin
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`.
- `GET /api/admin/stats` (ADMIN) — fleet availability, active trips, bookings by status, utilization.

Rate limiting: in-app sliding-window limiter per user+IP on auth, booking, and tracking endpoints. In-memory v1 (single instance); Redis slot reserved for multi-instance.

## 5. Key Design Decisions

1. **Booking overlap prevention** — in a transaction: `SELECT vehicle FOR UPDATE`, then check no conflicting booking (`status IN (APPROVED, DRIVER_ASSIGNED, IN_PROGRESS)` and time-window overlap), then insert. Row lock serializes concurrent requests; DB constraint + partial unique on assignments back it up. Integration test required (Phase 8).
2. **Current vs historical location split** — `vehicle_locations` (upsert, 1 row/vehicle) serves realtime reads; `driver_locations` (partitioned) is append-only history. Prevents realtime queries from scanning history.
3. **Location trust** — server rejects: timestamp > 60s in future or > 2× interval old, lat/lng out of range, accuracy > configured cap (accept <100m in-trip, <250m idle; tag quality LOW/MEDIUM/HIGH). Never claims guaranteed accuracy.
4. **Movement status** — server-computed: MOVING (speed > 2 m/s or delta > 50 m between accepted points), STOPPED (no significant delta within 2× interval), GPS_LOST (no accepted point within threshold), OFFLINE (session ended / no data > 5 min). **No traffic classification v1** — a stationary coordinate alone never implies congestion; traffic requires external API (Mapbox Directions/TomTom), isolated behind a provider interface.
5. **Driver info gating** — precise coordinates + phone exposed only to: booking owner with ACTIVE booking on that vehicle, assigned driver, or ADMIN. Enforced in every handler, not by hiding UI.
6. **PWA ≠ background GPS** — v1 is foreground-only `watchPosition`. Tracking session lives server-side (trip/session record) so a future native/hybrid client (Capacitor/TWA) can push the same ingest API unchanged. Abstraction boundary: `POST /api/tracking/locations` + session auth = the contract.

## 6. GPS Tracking Design (v1)

Driver flow: open driver dashboard → select vehicle by plate (validated: no other active assignment, status AVAILABLE/RESERVED-for-compatible-booking) → start tracking → browser asks permission → `watchPosition(highAccuracy: true, enableHighAccuracy)` → client throttles to server-configured interval → batches points → `POST /api/tracking/locations` → server validates + upserts current + appends history + broadcasts `location:update` → map markers update without page refresh.

Handled cases: permission denial (banner + fallback manual status update, no fake data), signal loss (client-side stale filter, server GPS_LOST), battery/network (interval config, batch upload), HTTPS requirement (secure context — localhost OK in dev; VPS must serve HTTPS, hence Caddy). iOS Safari: permission prompt requires user gesture; installed PWA may re-prompt. Documented, not silently "fixed".

Future native integration (Capacitor + background location plugin) reuses the same ingest API and session model — no architecture change.

## 7. Third-Party & Infra Costs

| Item | v1 choice | Cost |
|---|---|---|
| Hosting | Cloudflare Pages + Workers + Durable Objects | $0 free tier (100k req/day, 1M DO req/mo) |
| Domain + HTTPS | Cloudflare-managed domain, free TLS | ~$10–12/yr |
| Postgres | Dev: local Postgres 17. Prod: Neon free tier (0.5 GB) via Hyperdrive | $0 free tier |
| Maps tiles | OSM via Leaflet | $0 |
| Routing | none v1 (GPS track only); Mapbox Directions when needed | $0 → ~$0.50/1k requests |
| Realtime | Durable Objects WebSockets | $0 free tier |
| Backups | Neon built-in (7d PITR) | $0 |
| Email (notifications) | SMTP (free tier) | $0 |
| WhatsApp | `wa.me` deep link, no API | $0 |
| Total | | **≈ $1–2/mo** |

Vercel/VPS alternatives rejected: Vercel Pro $20/mo + WS unfit for serverless GPS; VPS needs manual OS patching/backups. Cloudflare free tier + DO WebSockets wins on cost and fits the realtime workload. Tradeoff: Workers runtime constraints (no Node-only packages, DB via Hyperdrive), accepted for the cost.

## 8. Security

- bcrypt password hashing; httpOnly, SameSite, Secure cookies; JWT short-lived.
- Server-side role checks on every mutation; ownership checks on every entity read.
- Location/phone redaction by permission tier (never shipped to client unless authorized).
- Input validation at every trust boundary (zod); rate limits on auth/booking/tracking.
- Audit log: auth events, vehicle/booking/assignment state changes, location session start/stop.
- Retention: location history purge (90d default), audit purge (1y). Driver consent screen before first tracking; persistent "tracking active" indicator in driver UI.
- No secrets in code; `.env` only; migrations tracked in git.

## 9. Roadmap (Phase 1 entry = this doc approved)

| Phase | Scope | Exit criteria |
|---|---|---|
| 1 Backend foundation | Prisma + Postgres, roles/users/drivers/vehicles schema, Auth.js, RBAC middleware, zod validation, error handling, audit logging, rate limit; auth + RBAC tests | Migrations applied; auth/RBAC tests green |
| 2 Vehicle/Driver mgmt | CRUD, assignment, availability, search/filter/pagination, validation | API tests green |
| 3 Booking | create/approve/reject/assign/cancel, overlap prevention (row-lock + constraint), status machine | Concurrency test proves no double-booking |
| 4 GPS backend | ingest API, validation, current+history storage, partitioning, stale detection, session mgmt | Ingest/staleness tests green |
| 5 Realtime | Socket.io server, auth handshake, location/booking/notification events, reconnect | WS broadcast verified (2 browsers) |
| 6 Frontend | login, 3 dashboards, vehicle list/filter, booking flow, map + driver panel, trip history | Manual flows on desktop+mobile pass |
| 7 PWA/mobile | Serwist manifest+icons+SW, installability, iOS/Android fixes, permission UX, offline states | Installs on iOS+Android, tracking works |
| 8 Test/deploy | unit/integration/API/auth/concurrency/GPS tests, security review, VPS deploy + Caddy, docs | Deployed staging, checklist signed |

Ordering is deliberate: backend reviewed before any frontend; tracking ingestion precedes realtime; realtime precedes maps.

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Browser GPS stops when backgrounded/locked | High (expected) | Foreground-only v1, explicit UX + "tracking active" indicator; native client later reuses same API |
| iOS Safari PWA location permission quirks | Medium | Test matrix on iOS Safari + installed PWA; user-gesture prompts |
| Double-booking race | High | Row lock + partial unique assignment constraint + concurrency test |
| Laragon lacks Postgres | Low | Add Postgres tool or Docker dev container |
| Single VPS availability/backups | Medium | Daily pg_dump off-site, Caddy auto-renew, restart policy |
| Map tile rate limits at scale | Low | Tile cache; swap provider behind interface |
| Real cost drift on maps/routing | Low | Free v1; paid APIs only behind feature flag |

## 11. Decisions (approved)

1. Realtime: **Cloudflare Durable Objects WebSockets** (local dev: Node WS shim, same protocol).
2. Maps: **Leaflet + OSM** (free), provider interface for Mapbox/Google later.
3. Deployment: **Cloudflare** Pages/Workers + Neon Postgres (prod) / local Postgres 17 (dev).
4. Location history retention default: **90 days** (configurable), monthly partitioning.

# Rezerve

Multi-tenant appointment booking SaaS with a fully Turkish UI (built for
Turkish local businesses). Business owners sign up, configure services and
weekly hours, and get a public booking page — customers book without an
account, optionally paying a deposit (kapora) via iyzico.

## Features

- **Multi-tenant** — each business gets its own `/r/[slug]` booking page
  (Better Auth organizations, one business per owner)
- **Slot engine** — availability computed from weekly hours (split shifts
  supported), service duration, slot granularity, lead time and booking
  window; timezone-correct across DST transitions (`@date-fns/tz`)
- **Race-safe booking** — a Postgres `EXCLUDE USING gist` constraint makes
  double-booking impossible at the database level, even under concurrent
  requests
- **iyzico deposits** — services can require a deposit (kapora): the slot is
  held as `pending` for 30 minutes and confirmed by an idempotent payment
  callback (server-side token verification); abandoned checkouts release the
  hold automatically
- **Email notifications** — confirmation/cancellation emails to customer and
  owner (React Email + Brevo SMTP), formatted in the business timezone
- **Owner dashboard** — bookings (upcoming/past, cancel), services CRUD,
  weekly availability editor, booking rules

## Stack

Next.js (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui
(Base UI) · Postgres (Neon) + Drizzle ORM · Better Auth · iyzico ·
React Email + Nodemailer · Bun · Biome · Vitest

## Development

```bash
bun install
cp .env.example .env        # fill in DATABASE_URL etc.
bun run db:migrate
bun dev
```

Useful scripts: `bun run check` (Biome), `bun run typecheck`,
`bun run test` (unit + DB integration tests), `bun run db:studio`,
`bun run seed:demo` (creates the public demo business at `/r/demo`).

Payments use the iyzico sandbox by default (`IYZICO_BASE_URL`); create
sandbox keys at sandbox-merchant.iyzipay.com.

## Routes

Everything is Turkish, including the URLs:

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page |
| `/giris` · `/kayit` · `/kurulum` | Login, signup, business onboarding |
| `/panel` (+ `randevular` `hizmetler` `saatler` `ayarlar`) | Owner dashboard |
| `/r/[slug]` | Public booking page (no customer account) |
| `/r/[slug]/onay/[bookingId]` | Booking confirmation |
| `/api/r/[slug]/slots` | Availability API |
| `/api/odeme/iyzico` | iyzico payment callback |

## Testing

- `lib/booking/slots.test.ts` — pure slot-engine tests incl. DST
  spring-forward/fall-back days
- `lib/actions/bookings.integration.test.ts` — real-DB tests incl. a
  parallel double-submit race (exactly one booking wins)
- `lib/payments/handle-payment-result.integration.test.ts` — payment
  callback idempotency: duplicate callbacks, wrong tokens, out-of-order
  success-after-cancel

## Architecture notes

- Bookings are stored as UTC instants; availability rules as minutes-from-
  midnight in the business's local wall time. Conversion happens in one
  place (`lib/booking/slots.ts`).
- The exclusion constraint (`lib/db/migrations/0001_*.sql`) covers
  `pending` holds too, so a held slot can't be double-sold; expired holds
  are released by the payment callback, by a lazy cleanup on the next
  booking attempt, and filtered out of availability queries.
- The iyzico callback never trusts the browser POST: the result is
  re-fetched from iyzico's API and matched against the stored payment
  token before any state change.
- Server actions handle all mutations; route handlers exist only for the
  slots API, Better Auth, and the iyzico payment callback.

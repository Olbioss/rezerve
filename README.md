# Slotly

Multi-tenant appointment booking SaaS with a fully Turkish UI (built for
Turkish local businesses). Business owners sign up, configure services and
weekly hours, and get a public booking page — customers book without an
account, optionally paying a deposit via Stripe.

## Features

- **Multi-tenant** — each business gets its own `/b/[slug]` booking page
  (Better Auth organizations, one business per owner)
- **Slot engine** — availability computed from weekly hours (split shifts
  supported), service duration, slot granularity, lead time and booking
  window; timezone-correct across DST transitions (`@date-fns/tz`)
- **Race-safe booking** — a Postgres `EXCLUDE USING gist` constraint makes
  double-booking impossible at the database level, even under concurrent
  requests
- **Stripe deposits** — services can require a deposit: the slot is held as
  `pending` for 30 minutes and confirmed by an idempotent
  `checkout.session.completed` webhook; abandoned checkouts release the hold
- **Email notifications** — confirmation/cancellation emails to customer and
  owner (React Email + Brevo SMTP), formatted in the business timezone
- **Owner dashboard** — bookings (upcoming/past, cancel), services CRUD,
  weekly availability editor, booking rules

## Stack

Next.js (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui
(Base UI) · Postgres (Neon) + Drizzle ORM · Better Auth · Stripe ·
React Email + Nodemailer · Bun · Biome · Vitest

## Development

```bash
bun install
cp .env.example .env        # fill in DATABASE_URL etc.
bun run db:migrate
bun dev
```

Useful scripts: `bun run check` (Biome), `bun run typecheck`,
`bun run test` (unit + DB integration tests), `bun run db:studio`.

Stripe webhooks locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Testing

- `lib/booking/slots.test.ts` — pure slot-engine tests incl. DST
  spring-forward/fall-back days
- `lib/actions/bookings.integration.test.ts` — real-DB tests incl. a
  parallel double-submit race (exactly one booking wins)
- `lib/stripe/handle-webhook-event.integration.test.ts` — webhook
  idempotency: duplicate deliveries, out-of-order completed-after-expired

## Architecture notes

- Bookings are stored as UTC instants; availability rules as minutes-from-
  midnight in the business's local wall time. Conversion happens in one
  place (`lib/booking/slots.ts`).
- The exclusion constraint (`lib/db/migrations/0001_*.sql`) covers
  `pending` holds too, so a held slot can't be double-sold; expired holds
  are released by webhook, by a lazy cleanup on the next booking attempt,
  and filtered out of availability queries.
- Server actions handle all mutations; route handlers exist only for the
  slots API, Better Auth, and the Stripe webhook.

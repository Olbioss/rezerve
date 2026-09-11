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
- **Subscriptions (Ücretsiz / Pro ₺299 ay)** — online kapora is the paid
  feature. Entitlements are resolved once in `requireOwner()` and enforced
  server-side; a lapsed plan keeps its stored kapora amounts but stops
  charging them, so nothing is lost on re-upgrade
- **Marketplace payouts** — each business is onboarded as an iyzico
  submerchant, so a kapora settles into *its* account and not the platform's
  (`subMerchantPrice === price`: no commission)

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
`bun run seed:demo` (creates two demo businesses: `/r/demo` on Pro, and
`/r/demo-ucretsiz` on the free plan with the *same* services — the only way to
see the downgrade rule rather than read about it).

Payments use the iyzico sandbox by default (`IYZICO_BASE_URL`); create
sandbox keys at sandbox-merchant.iyzipay.com.

### Payment drivers

Two switches, because the two halves of the iyzico integration are in
different states:

| Variable | Covers | Status |
| --- | --- | --- |
| `PAYMENTS_DRIVER_DEPOSITS` | Kapora checkout + submerchant onboarding | Works against a Marketplace-enabled account |
| `PAYMENTS_DRIVER_BILLING` | Rezerve's own subscription revenue | Stored-card billing (see below) |

Each takes `fake` (default) or `iyzico`. Everything past the hosted payment
page — callbacks, server-side verification, token-bound idempotent
transitions, entitlements — is the same code either way, so the `fake` driver
simulates only the payment page itself (`/demo-odeme`, where you pick the
outcome). That keeps a fresh clone fully walkable with no credentials.

### Why there is no iyzico Abonelik integration

**iyzico does not offer Abonelik on a marketplace account.** Their integration
team was explicit: *"Pazaryeri iş modelimizde tekrarlı ödemeler abonelik
özelliği ile sağlanamamaktadır"* — recurring payments in the marketplace
business model are done with card storage instead. The API agrees: every
`/v2/subscription/*` endpoint returns `100001`, before and after the account
was switched to marketplace.

The two products are account *modes*, not independent flags — the enablement
email says the account's *iş modeli* was "updated to" marketplace. And the SDK
shows why they can't coexist: **no subscription request model accepts a
submerchant field**, so iyzico's subscription engine has no way to route a
recurring charge to a submerchant. On a marketplace account, it is switched
off wholesale.

So Rezerve owns its own billing schedule:

- **Card capture rides the first payment.** `/v2/ucs/init` (hosted card
  storage without a payment) returns `42205 Ucs müşteri için aktif değil`, and
  iyzico's documented alternatives put the card form — and the PAN — on your
  own server. Instead the first ₺299 checkout stores the card, and the
  callback reads the token back, falling back to `cardList` if the retrieve
  response omits it. **The card number never reaches this server.**
- **Renewals are a daily cron** (`vercel.json` → `/api/cron/abonelik`,
  bearer-authenticated with `CRON_SECRET`) charging the stored token. The check
  is timing-safe and **fails closed**: an unset `CRON_SECRET` returns 503 and
  runs nothing, rather than treating "no secret configured" as "allow
  everyone". It lives in `lib/billing/cron-auth.ts` so that guarantee is unit
  tested. There is no auth middleware in this project — every other route is
  guarded in-handler by `requireOwner()` — so nothing needs excluding.
- **Double-billing is prevented by the database.** `subscription_charges` is
  `UNIQUE (organization_id, period_start)`, so a replayed or concurrent run
  loses the insert; retries then advance an attempt counter under an
  optimistic lock. The period key is anchored to `currentPeriodEndsAt`, never
  to `nextChargeAt` — keying on the latter would open a new billing period on
  every dunning retry.
- **Dunning:** a decline drops entitlement to `past_due` and retries daily for
  `RETRY_DAYS` (3, matching `PAST_DUE_GRACE_DAYS` so entitlement and retries
  expire together), then expires.
- **The 14-day trial takes no card at all.** Capturing one would require
  charging for it, so the trial grants Pro outright and lapses to free unless
  the owner subscribes — which also makes "kredi kartı gerekmez" literally
  true. A production build wanting auto-conversion would capture the card up
  front with a pre-auth (`checkoutFormInitializePreAuth`) instead.

### What the sandbox account can and cannot do

Probed directly against the sandbox keys in `.env`:

| Call | Result |
| --- | --- |
| `POST /payment/iyzipos/checkoutform/initialize/auth/ecom` | works, returns `paymentPageUrl` |
| the same **with `subMerchantKey` + `subMerchantPrice`** | works — the kapora split is real |
| `POST /onboarding/submerchant` | works (after iyzico enabled Marketplace) |
| `POST /cardstorage/card` → `cardList` → `payment/auth` on the stored card | works |
| `POST /v2/subscription/*` | `100001` — unavailable on a marketplace account |
| `POST /v2/ucs/init` | `42205` — hosted card storage not enabled |

The iyzico SDK hangs under **Bun** (it uses `postman-request`), so any script
touching it must run under Node. The app is unaffected: `next.config.ts` marks
`iyzipay` as a server-external package, so it runs in Node there too.

## Routes

Everything is Turkish, including the URLs:

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing page |
| `/giris` · `/kayit` · `/kurulum` | Login, signup, business onboarding |
| `/panel` (+ `randevular` `hizmetler` `saatler` `ayarlar`) | Owner dashboard |
| `/panel/abonelik` (+ `odeme-hesabi`) | Plan, and the submerchant payout form |
| `/r/[slug]` | Public booking page (no customer account) |
| `/r/[slug]/onay/[bookingId]` | Booking confirmation |
| `/api/r/[slug]/slots` | Availability API |
| `/api/odeme/iyzico` | iyzico deposit callback |
| `/api/odeme/abonelik` | Subscription callback (stores the card mandate) |
| `/api/cron/abonelik` | Daily renewal run (bearer-authenticated) |
| `/demo-odeme` | Simulated hosted checkout (fake driver only) |

## Testing

- `lib/booking/slots.test.ts` — pure slot-engine tests incl. DST
  spring-forward/fall-back days
- `lib/actions/bookings.integration.test.ts` — real-DB tests incl. a
  parallel double-submit race (exactly one booking wins)
- `lib/payments/handle-payment-result.integration.test.ts` — payment
  callback idempotency: duplicate callbacks, wrong tokens, out-of-order
  success-after-cancel
- `lib/billing/entitlements.test.ts` — plan resolution with an injected clock,
  including the cancelled-but-still-paid-for window
- `lib/billing/validators.test.ts` — real TCKN/VKN check digits and IBAN mod-97
- `lib/actions/bookings-billing.integration.test.ts` — the enforcement proof:
  an unentitled org books free with `depositCents = null` and never starts a
  payment; an entitled one holds the slot and passes a `subMerchantKey`
- `lib/billing/handle-subscription-result.integration.test.ts` — subscription
  callback idempotency and card-mandate capture
- `lib/billing/charge-subscription.integration.test.ts` — renewal billing: a
  replayed run and two concurrent runs each charge exactly once, dunning
  retries then expires, and a trial lapses instead of charging

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

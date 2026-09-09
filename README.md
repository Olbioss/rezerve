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

`PAYMENTS_DRIVER` picks the driver: `fake` (default) or `iyzico`.

The real driver needs **Marketplace (pazaryeri)** *and* **Abonelik** enabled on
the iyzico merchant account. An ordinary account has neither, and answers
`subMerchant.create` with error `2000` ("Bu servis sadece pazaryeri
müşterilerine açıktır") and every `/v2/subscription/*` endpoint with `100001`.
Until iyzico enables both, the `fake` driver simulates only the hosted payment
page — `/demo-odeme`, where you pick the outcome. Everything downstream is the
same code either way: the same callback routes, the same server-side re-fetch,
the same token-bound idempotent transitions.

Once iyzico has enabled them: run `bun run billing:setup` (which prints
`IYZICO_PRODUCT_REF` / `IYZICO_PRICING_PLAN_REF` for `.env`) and set
`PAYMENTS_DRIVER=iyzico`.

Note that `billing:setup` runs under **Node, not Bun** — the iyzico SDK uses
`postman-request`, whose requests never call back under Bun's runtime. The app
is unaffected: `next.config.ts` marks `iyzipay` as a server-external package,
so it runs in Node there too.

### What the sandbox account can and cannot do

Probed directly against the sandbox keys in `.env`:

| Call | Result |
| --- | --- |
| `POST /payment/iyzipos/checkoutform/initialize/auth/ecom` | ✅ success (returns `paymentPageUrl`) |
| `POST /onboarding/submerchant` | ❌ `2000` — "Bu servis sadece pazaryeri müşterilerine açıktır" |
| `POST /v2/subscription/products` · `GET` same · `POST /v2/subscription/checkoutform/initialize` | ❌ `100001` — "Sistem hatası" |
| `POST /cardstorage/card` (store a card) | ✅ success (returns `cardUserKey` + `cardToken`) |
| `POST /payment/auth` with a stored card, no customer present | ✅ success (`paymentId` returned, `fraudStatus: 1`) |

Ordinary payments work, so the credentials are fine; Marketplace and Abonelik
are simply not provisioned on the account.

### Documented fallback: self-run billing on stored cards

If iyzico never enables Abonelik, subscriptions do **not** have to stay
simulated. The last two rows above are the fallback: iyzico's card storage
returns a `cardUserKey`/`cardToken` pair, and an ordinary payment call charges
it with the customer absent. That is standard merchant-initiated-transaction
billing, and it is verified working on this account — a ₺299 charge went
through with `paymentGroup: SUBSCRIPTION`.

It is deliberately **not** built, for three reasons:

1. **It only fixes half the problem.** There is no card-storage equivalent for
   settling funds into a third party's account — that is exactly what
   Pazaryeri gates. Kapora routing still needs `2000` cleared.
2. **It inverts who owns the billing loop.** Today iyzico would own the
   schedule and `lib/billing/sync-subscription.ts` only *reads* status, which
   is why lazy-reconcile-on-read is sufficient and the project needs no cron.
   Self-run billing has the opposite property — no scheduled run, no revenue —
   so it would require Vercel Cron, idempotent charging (a retried run must not
   double-charge, and unlike bookings there is no exclusion constraint to fall
   back on), decline retries and dunning.
3. **Card capture would have to move.** The probe sent a raw PAN server-side,
   which is fine for a probe and wrong for production: it pulls the app into a
   much wider PCI scope. The real version would store the card through
   iyzico's hosted form (checkout form with card registration, or
   `UniversalCardStorageInitialize`) so the number never reaches this server.

Given the scope, the `fake` driver covers the demo and this stays a documented
plan B rather than a third driver.

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
| `/api/odeme/abonelik` | Subscription callback |
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
- `lib/billing/handle-subscription-result.integration.test.ts` and
  `sync-subscription.integration.test.ts` — subscription callback idempotency
  and provider-status mapping

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

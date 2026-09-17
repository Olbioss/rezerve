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
  submerchant, so a kapora settles into _its_ account and not the platform's
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
`bun run demo:submerchant` (creates the demo business's iyzico submerchant),
`bun run seed:demo` (creates two demo businesses: `/r/demo` on Pro, and
`/r/demo-ucretsiz` on the free plan with the _same_ services — the only way to
see the downgrade rule rather than read about it).

Payments use the iyzico sandbox by default (`IYZICO_BASE_URL`); create
sandbox keys at sandbox-merchant.iyzipay.com.

### Payments are always real iyzico calls

There is one payment code path. An in-app simulation used to stand in while
iyzico had neither Marketplace nor a usable recurring path, but a second path
that production never exercises is somewhere the real one can rot unnoticed —
so it was removed. The app requires iyzico credentials to run.

Sandbox versus production is a separate axis: `IYZICO_BASE_URL` decides which
iyzico you reach. Sandbox gives real API calls, real submerchants, real hosted
payment pages and real callbacks, with test cards and no money moving. That is
the default, and `IS_TEST_MODE` is derived from it rather than carried as its
own flag, so the "Test modu" banner can never disagree with reality.

First-time setup for the demo business:

```bash
bun run demo:submerchant   # creates its iyzico submerchant, prints the key
# put DEMO_SUBMERCHANT_KEY=... in .env
bun run seed:demo
```

`demo:submerchant` runs under **Node, not Bun** — see the SDK note below.

### Why there is no iyzico Abonelik integration

**iyzico does not offer Abonelik on a marketplace account.** Their integration
team was explicit: _"Pazaryeri iş modelimizde tekrarlı ödemeler abonelik
özelliği ile sağlanamamaktadır"_ — recurring payments in the marketplace
business model are done with card storage instead. The API agrees: every
`/v2/subscription/*` endpoint returns `100001`, before and after the account
was switched to marketplace.

The two products are account _modes_, not independent flags — the enablement
email says the account's _iş modeli_ was "updated to" marketplace. And the SDK
shows why they can't coexist: **no subscription request model accepts a
submerchant field**, so iyzico's subscription engine has no way to route a
recurring charge to a submerchant. On a marketplace account, it is switched
off wholesale.

So Rezerve owns its own billing schedule:

- **The card is entered in Rezerve, not on an iyzico page.** There is no
  hosted way to store a card on a marketplace account: `registerCard` lives
  only inside the `PaymentCard` model, which only the _direct_ payment API
  sends — the Checkout Form and PayWithIyzico carry no card object at all,
  and the hosted vault (`/v2/ucs/init`) returns `42205 Ucs müşteri için aktif
değil`. iyzico's integration team directs recurring billing through card
  storage on the direct API, so `/panel/abonelik` collects the card and posts
  it to a server action, which passes it straight to
  `payment.create` with `registerCard: 1`. The number is never logged and
  never persisted; only the returned `cardToken`/`cardUserKey` are kept.
  A production build taking real cards would route this first payment through
  `threedsInitialize` and carry the matching PCI scope (SAQ A-EP); renewals
  stay non-3DS either way, since the customer is not present.
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

### Known gap: marketplace transactions are never approved

**Kapora reaches the right submerchant and is never released.** In iyzico
Marketplace the platform sits between buyer and seller, so a payment is held
until the platform approves the item transaction
(`POST /payment/iyzipos/item/approve`) — the "service was delivered, release
the funds" signal, whose twin `Disapproval` refunds instead. Rezerve never
calls either.

Verified directly: a marketplace payment to the demo submerchant returned
`subMerchantPayoutAmount: 289.28`, `merchantPayoutAmount: 0`,
`subMerchantPayoutRate: 100` — the split is correct — and
`approval.create({ paymentTransactionId })` then succeeded. The call works; it
is simply not wired in.

What is *not* established: whether approval is the only thing standing between
a payment and a payout. `reportingPayoutCompleted` has returned no rows at any
point, including three days after that approval succeeded, so sandbox may not
simulate settlement at all, or may settle on a longer cycle. Approval is
required either way — this note is only to say the payout side remains
unobserved.

Fixing it needs three things, none of them large:

1. Store the item transaction id. `bookings` keeps `paymentToken` (the
   checkout token) but not the transaction id, which arrives in the callback
   as `CheckoutFormRetrieveResult.paymentItems[].paymentTransactionId` and is
   currently discarded.
2. Decide _when_ to approve. For appointments the natural signal is after the
   appointment ends and the booking was not cancelled — which also leaves a
   window to refund a no-show before the money is gone. Approving on payment
   is simpler but removes that protection.
3. A daily approval run, alongside the renewal cron.

### What the sandbox account can and cannot do

Probed directly against the sandbox keys in `.env`:

| Call                                                                      | Result                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------- |
| `POST /payment/iyzipos/checkoutform/initialize/auth/ecom`                 | works, returns `paymentPageUrl`                     |
| the same **with `subMerchantKey` + `subMerchantPrice`**                   | works — the kapora split is real                    |
| `POST /onboarding/submerchant`                                            | works (after iyzico enabled Marketplace)            |
| `POST /cardstorage/card` → `cardList` → `payment/auth` on the stored card | works                                               |
| `POST /v2/subscription/*`                                                 | `100001` — unavailable on a marketplace account     |
| `POST /v2/ucs/init`                                                       | `42205` — hosted card storage not enabled           |
| `POST /payment/iyzipos/item/approve`                                      | works — but nothing in the app calls it (see above) |
| fix the approval gap.                                                     |

The iyzico SDK hangs under **Bun** (it uses `postman-request`), so any script
touching it must run under Node. The app is unaffected: `next.config.ts` marks
`iyzipay` as a server-external package, so it runs in Node there too.

## Routes

Everything is Turkish, including the URLs:

| Route                                                     | Purpose                                              |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `/`                                                       | Marketing landing page                               |
| `/giris` · `/kayit` · `/kurulum`                          | Login, signup, business onboarding                   |
| `/panel` (+ `randevular` `hizmetler` `saatler` `ayarlar`) | Owner dashboard                                      |
| `/panel/odemeler`                                         | Kapora over 7/30/90 days, with iyzico's cut itemised |
| `/panel/abonelik` (+ `odeme-hesabi`)                      | Plan, and the submerchant payout form                |
| `/r/[slug]`                                               | Public booking page (no customer account)            |
| `/r/[slug]/onay/[bookingId]`                              | Booking confirmation                                 |
| `/api/r/[slug]/slots`                                     | Availability API                                     |
| `/api/odeme/iyzico`                                       | iyzico deposit callback                              |
| `/api/cron/abonelik`                                      | Daily renewal run (bearer-authenticated)             |

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
- `lib/billing/activate-subscription.integration.test.ts` — turning a payment
  into an active subscription: the mandate is stored, a double-submitted form
  does not slide the renewal date, and a payment that returns no card leaves
  the renewal cron disarmed rather than failing daily
- `lib/panel/payouts.test.ts` — tenant isolation for the payouts view: iyzico's
  settlement reporting is platform-wide and carries no submerchant id, so the
  match runs against org-scoped bookings and another business's rows can only
  ever be dropped
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

# Rezerve

[![CI](https://github.com/Olbioss/rezerve/actions/workflows/ci.yml/badge.svg)](https://github.com/Olbioss/rezerve/actions/workflows/ci.yml)

Online booking for Turkish local businesses — salons, barbers, clinics. An
owner sets up services and hours, and gets a public page where customers book,
and can pay a deposit (_kapora_), without an account. The UI is in Turkish.

**Live: [rezerve-iota.vercel.app](https://rezerve-iota.vercel.app)**

- **Book as a customer** at [`/r/demo`](https://rezerve-iota.vercel.app/r/demo).
  Cilt Bakımı takes a ₺300 kapora through iyzico's sandbox: use a test card
  such as `5311 5700 0000 0005` with any future expiry and any CVC.
- **Run the business** at [`/giris`](https://rezerve-iota.vercel.app/giris) as
  `demo@rezerve.app` / `rezerve-demo` (Pro), or `ucretsiz@rezerve.app` /
  `rezerve-demo` (free plan: the same services, but the kapora is not
  collected).
- Both demos reset every morning, so change anything.

## Worth a look

1. **Correctness lives in the database.** Two customers can take the same slot
   at the same instant and only one booking will exist: an `EXCLUDE USING gist`
   constraint over the time range decides, pending holds included. The race is
   a test: fifty simultaneous attempts, exactly one booking. Run with the
   constraint dropped, eight of the fifty got the slot — the app's own
   availability check catches most of a race, never all of it. Special-day
   ranges cannot overlap for the same reason; a renewal
   cannot bill twice because a unique key refuses the second charge; a refund
   claims its idempotency marker before iyzico is ever called.
2. **Entitlements are resolved in one place, on the server.** Every panel page
   and owner action goes through `requireOwner()`, which resolves the plan
   once; the public booking path reads the business's own billing rows. Nothing
   in the browser decides what a business may do, and a lapsed plan keeps its
   kapora amounts but stops charging them.
3. **A real payment integration, with its dead ends written down.** iyzico
   Marketplace with a submerchant per business, approval and release, refunds,
   and self-run subscription billing because iyzico's own subscriptions do not
   exist on a marketplace account. The constraints below were probed against
   the API, not assumed — starting with how the card is handled.

## Card handling, deliberately

Upgrading to Pro takes the card number in Rezerve's own form
(`/panel/abonelik`), and a server action passes it to iyzico's direct payment
API with `registerCard: 1`, without 3-D Secure. The number is never logged and
never stored; only the returned `cardToken` and `cardUserKey` are kept, for
renewals.

On an iyzico **marketplace** account that is the only way recurring billing
works: the hosted Checkout Form carries no card object, the hosted card vault
(`/v2/ucs/init`) answers `42205`, and iyzico's integration team points
recurring payments at card storage on the direct API. (Why this is a
marketplace account at all is under
[Why there is no iyzico Abonelik integration](#why-there-is-no-iyzico-abonelik-integration).)

Against the sandbox, with test cards, that costs nothing. With real cards it
would cost two things this build deliberately stops short of. A card number
passing through the server puts the whole deployment in PCI DSS scope — SAQ D,
not the SAQ A a hosted payment page allows. And the first payment would have to
go through `threedsInitialize` for 3-D Secure; renewals stay non-3DS either way,
since the customer is not there to authenticate.

## Features

- **Multi-tenant** — each business gets its own `/r/[slug]` booking page
  (Better Auth organizations, one business per owner)
- **Slot engine** — availability computed from weekly hours (split shifts
  supported), service duration, slot granularity, lead time and booking
  window; timezone-correct across DST transitions (`@date-fns/tz`)
- **Holidays and one-off hours** — a date range can be closed or given its
  own hours, replacing the weekly hours for those dates only; a Postgres
  exclusion constraint keeps one business's ranges from overlapping
- **Race-safe booking** — a Postgres `EXCLUDE USING gist` constraint makes
  double-booking impossible at the database level, even under concurrent
  requests
- **iyzico deposits** — services can require a deposit (kapora): the slot is
  held as `pending` for 30 minutes and confirmed by an idempotent payment
  callback (server-side token verification); abandoned checkouts release the
  hold automatically
- **Email notifications** — confirmation, reschedule and cancellation emails
  to customer and owner (React Email + Brevo SMTP), formatted in the business
  timezone; the customer's confirmation and reschedule emails link back to the
  booking and carry it as a calendar file
- **Add to calendar** — a confirmed booking offers a Google Calendar link and
  an `.ics` file. The file is written by hand to RFC 5545 (UTC times, escaping,
  folding that never splits a ğ), and keeps the booking's id as its UID, so the
  copy sent after a move replaces the event instead of adding a second
- **Link previews** — every booking page describes itself and has its own
  social card, the business's name in the brand's type, since businesses share
  these links on Instagram and in messages
- **Owner dashboard** — bookings (upcoming/past; add, move and cancel — an
  owner may book outside the published hours once asked, never over another
  appointment), services CRUD, weekly availability and special days, booking
  rules, and the business's name and public address
- **Addresses that survive a move** — moving the public address keeps every
  link already shared working: `/r/<old>` leads to the current page however
  many moves ago it was, and a released address stays reserved for the
  business that held it, which can take it back
- **Subscriptions (Ücretsiz / Pro ₺299 ay)** — online kapora is the paid
  feature. Entitlements are resolved once in `requireOwner()` and enforced
  server-side; a lapsed plan keeps its stored kapora amounts but stops
  charging them, so nothing is lost on re-upgrade
- **Marketplace payouts** — each business is onboarded as an iyzico
  submerchant, so a kapora settles into _its_ account and not the platform's
  (`subMerchantPrice === price`: no commission)

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript ·
Tailwind v4 + shadcn/ui (Base UI) · Postgres (Neon) + Drizzle ORM ·
Better Auth · iyzico · React Email + Nodemailer · Bun · Biome · Vitest ·
Playwright

## Development

```bash
bun install
cp .env.example .env        # fill in DATABASE_URL etc.
bun run db:migrate
bun dev
```

Useful scripts: `bun run check` (Biome), `bun run typecheck`,
`bun run test` (unit + DB integration tests), `bun run e2e` (Playwright
against a production build — it refuses any `DATABASE_URL` that is not on
this machine, since it books appointments and resets the demos),
`bun run db:studio`,
`bun run demo:submerchant` (creates the demo business's iyzico submerchant),
`bun run seed:demo` (creates two demo businesses: `/r/demo` on Pro, and
`/r/demo-ucretsiz` on the free plan with the _same_ services — the only way to
see the downgrade rule rather than read about it). It is a reset, not an
additive seed: both demos go back to exactly their published state, with a
fresh booking history, and the daily cron runs the same reset
(`lib/demo/reset.ts`) because their logins are public.

Payments use the iyzico sandbox by default (`IYZICO_BASE_URL`); create
sandbox keys at sandbox-merchant.iyzipay.com.

### Payments are always real iyzico calls

There is one payment code path. An in-app simulation used to stand in while
iyzico had neither Marketplace nor a usable recurring path, but a second path
that production never exercises is somewhere the real one can rot unnoticed —
so it was removed. Every payment path needs iyzico credentials; the rest of
the app runs without them, which is how the end-to-end suite books on the
free demo in CI.

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
  never persisted; only the returned `cardToken`/`cardUserKey` are kept. What
  that would mean with real cards, for PCI scope and 3-D Secure, is under
  [Card handling, deliberately](#card-handling-deliberately).
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

### Releasing the kapora

A marketplace payment is **held** by iyzico until the platform approves the
item transaction (`POST /payment/iyzipos/item/approve`) — the "service was
delivered, release the funds" signal. Skip it and the kapora reaches the
business's submerchant and never leaves; iyzico's own panel shows
Alt Üye İşyeri Ödemeleri as empty.

Rezerve approves as soon as the payment succeeds, inside `confirmPaidBooking`.
A kapora is a non-refundable booking deposit, so there is nothing to wait for —
and doing it in the same guarded transition means it happens exactly once, since
a replayed callback matches zero rows and never reaches the call.

If approval fails the booking is still confirmed: the customer has paid, and
refusing to confirm would be worse than a payout that needs releasing by hand.
`bookings.payment_transaction_id` is stored precisely so that is possible.

`/panel/odemeler` reports released and held money separately rather than as
one figure — an unapproved kapora is still iyzico's, and showing it as the
owner's would repeat an overstatement this page has already been corrected for
once. Approval state comes from `transactionStatus` on the payment's item
(2 = released, 1 = held), read live on every page load rather than cached, so
the state is never stale. iyzico's own panel surfaces the same thing as "Onay
Durumu", under Detayı Göster on a single payment.

The page asks iyzico about each deposit booking by its own id
(`/v2/reporting/payment/details`) rather than listing a day's transactions.
The daily listing (`/v2/reporting/payment/transactions`) is platform-wide, so
it hands back every business's payments to be filtered — and on 23 September
it listed none of that day's payments for hours, intermittently failing with
"Sistem hatası", while the details endpoint returned every one. Asking per
booking costs a round trip each, capped at the newest 40 in the range, and a
lookup that fails costs that row rather than the page.

**A payment can also land on a booking that no longer exists** — the owner
cancelled a pending hold while the customer was paying, or `cancelExpiredHolds`
swept the lapsed hold during someone else's booking attempt, which is the
likelier of the two. `confirmPaidBooking`'s guard matches nothing in that case,
so nothing else would ever notice the money. It now stores the transaction id
and refunds instead. The id is stored *before* refunding: without it the
payment has no handle at all, so a refund that fails would leave money at
iyzico with nothing pointing at it.

**Cancelling returns the kapora.** `cancelBooking` sits behind
`requireOwner()`, so every cancellation in the app is the business calling the
appointment off — the customer should not be out of pocket, and a kapora only
earns its keep against a no-show, which this is not. The refund is idempotent
through `bookings.deposit_refunded_at`, claimed before iyzico is called and
released again on failure so a booking is never silently stuck as refunded.
The cancellation email tells the customer, since otherwise nothing would.

Two notes on the surrounding API, both verified rather than assumed.
`Disapproval` is *not* a cancellation tool — it only undoes an approval that
already happened, and returns `5103 Bu ödeme kırılımı onaylanmamıştır` on a
held payment. `refund` is what returns money, and it works both on a held
payment and on one already approved and released — which is why approving at
payment time costs nothing in flexibility.

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
| `POST /payment/iyzipos/item/approve`                                      | works — called on every paid kapora (see above)     |
| `GET /v2/reporting/payment/details`                                       | works — has a payment within seconds                |
| `GET /v2/reporting/payment/transactions`                                  | unreliable — see the payouts note above             |

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
| `/r/[slug]/onay/[bookingId]/takvim`                       | The booking as an `.ics` file                        |
| `/api/r/[slug]/slots`                                     | Availability API                                     |
| `/api/odeme/iyzico`                                       | iyzico deposit callback                              |
| `/api/cron/abonelik`                                      | Daily: renewals, hold sweep, demo reset (bearer)     |

## Testing

- `lib/booking/slots.test.ts` — pure slot-engine tests incl. DST
  spring-forward/fall-back days
- `lib/actions/bookings.integration.test.ts` — real-DB tests incl. a
  parallel double-submit race (exactly one booking wins). It also caught
  Postgres resolving that race as a deadlock (`40P01`) rather than an
  exclusion violation, which is why `isExclusionConflict` treats both as
  "the slot is taken"
- `lib/actions/booking-race.integration.test.ts` — fifty simultaneous
  reservations for one slot: one booking, and forty-nine visitors told the
  slot is gone. The pool is widened so all fifty are inside Postgres at once
  (the peak is recorded, about 57 connections), each arrives from its own
  address so the throttle stays out of it, and with the exclusion constraint
  dropped the test fails (eight of the fifty got the slot in that run)
- `lib/booking/exceptions.test.ts` — holidays and one-off hours resolved
  before the slot engine: a closed date has no slots, a Sunday opening does
- `lib/actions/owner-bookings.integration.test.ts` — an owner booking or
  moving an appointment: outside the hours only after asking, never over
  another appointment, never another business's booking
- `lib/demo/reset.integration.test.ts` — the nightly demo reset, playing the
  visitor who renames, strips and closes the demo: one run puts every piece
  back, and touches no other business
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
- `lib/panel/payouts.test.ts` — the payouts view: only a successful payment
  answering for one of our own bookings becomes a row, a retried checkout
  counts once, held money is never shown as released, and iyzico's
  Istanbul-time timestamps are not read as UTC
- `lib/billing/charge-subscription.integration.test.ts` — renewal billing: a
  replayed run and two concurrent runs each charge exactly once, dunning
  retries then expires, and a trial lapses instead of charging
- `lib/actions/business-identity.integration.test.ts` — moving an address:
  old addresses lead to the current one through any number of moves, stay
  reserved for their business, and can be taken back
- `lib/calendar/ics.test.ts` — RFC 5545 escaping, UTC times, and folding at
  75 octets without splitting a multi-byte Turkish character
- `e2e/` — Playwright against the production build, in CI: a booking on the
  free demo; the slot-loading race, with the API stubbed so the previous
  day's answer arrives last (it fails if the fix is reverted); the demo login;
  not-found pages; security headers; link previews; old addresses; the
  calendar file

## Architecture notes

- Bookings are stored as UTC instants; availability rules as minutes-from-
  midnight in the business's local wall time. Conversion lives in
  `lib/booking/` — `slots.ts` for the slot engine, `opening-hours.ts` for
  times an owner types in.
- Date exceptions (`lib/booking/exceptions.ts`) are resolved into a day's
  intervals *before* the slot engine runs, so the engine and its DST tests
  are unchanged. One-off hours are stamped with the date's weekday, which is
  what lets a Sunday opening survive the engine's weekday filter. A second
  exclusion constraint (`0010_*.sql`, `daterange … WITH &&`) keeps each date
  answering to at most one exception.
- The exclusion constraint (`lib/db/migrations/0001_*.sql`) covers
  `pending` holds too, so a held slot can't be double-sold; expired holds
  are released by the payment callback, by a lazy cleanup on the next
  booking attempt and by the daily cron's sweep, and filtered out of
  availability queries.
- The iyzico callback never trusts the browser POST: the result is
  re-fetched from iyzico's API and matched against the stored payment
  token before any state change.
- Server actions handle all mutations; route handlers exist only for the
  slots API, Better Auth, the iyzico payment callback, the daily cron and the
  calendar file.
- Rendering is partial prerendering (`cacheComponents`): every page's static
  part is prerendered and served at once — the landing page's shell is the
  whole signed-out page — and only what depends on the request streams in.
  The price, accepted: inside a streamed boundary the response has already
  begun as a 200, so a booking page for an unknown business is a 200 marked
  `noindex` rather than a 404, and an old address or a signed-out `/panel`
  redirects from the browser rather than with a 307. Link previewers do not
  run that redirect, so an old address's tags and card follow the move.
- The database is reached through Neon's PgBouncer pooler, and
  `attachDatabasePool` lets Fluid Compute close idle connections before it
  suspends an instance. A pasted `sslmode=require` is rewritten to
  `verify-full`, so the certificate is always checked.
- Every response refuses framing (`X-Frame-Options: DENY`,
  `frame-ancestors 'none'`) and carries `nosniff`, a strict referrer policy
  and a Permissions-Policy; a script-src policy would need per-request nonces
  and is not attempted.

## Deliberately out of scope

Each of these is a real requirement for a product, and not for this one. They
are named because a gap a reader finds named reads as judgment, and the same
gap unexplained reads as an oversight.

- **Legal pages** — KVKK aydınlatma metni, Mesafeli Satış Sözleşmesi, İptal ve
  İade Koşulları. Required to leave the iyzico sandbox and take real money;
  this build never does, and says so.
- **3-D Secure and PCI compliance** for the subscription card. No real card
  touches this app. What taking one would require is spelled out under
  [Card handling, deliberately](#card-handling-deliberately).
- **Multi-staff scheduling.** `bookings_no_overlap` excludes on
  `(organization_id, tstzrange)`, so one business is deliberately one chair.
  Concurrent staff means a resource dimension through the constraint, the
  availability rules, the slot engine and the booking flow — a different
  product.
- **Email verification on signup.** Actively unwanted here: it would put an
  inbox round-trip between a reader and the app.
- **Error tracking and structured logging.** Sentry on an app with two demo
  businesses is ceremony; `console.error` and the platform's runtime logs are
  proportionate.

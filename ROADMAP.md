# Roadmap to v1.0

Rezerve is a **portfolio build**. It runs against the iyzico sandbox and is
not a production merchant, which decides most of what follows: the work
between here and 1.0 is not "can this take money from a Turkish salon" but
"can someone reach it, and does what they find hold up".

That reframing removes more than it adds. Legal pages, PCI scope and
multi-staff scheduling are all real requirements for a product and none of
them are requirements for this one — see [Deliberately out of
scope](#deliberately-out-of-scope), which is the section worth reading if
you are evaluating the project rather than working on it.

Current state, verified: `typecheck` clean, `biome check` clean but for one
deliberate `!important` under `prefers-reduced-motion`, 190 tests across 20
files passing, production build green across 21 routes, no TODO or FIXME in
the tree.

Effort figures are focused working days for one developer.

---

## Unreachable — 2 days

A portfolio piece nobody can open is worth nothing, whatever the code does.
Everything here is hours.

- [x] **Seed an owner account so `/panel` can be reached at all.** `0.5d`

  `scripts/seed-demo.ts` inserts organizations, services, availability, a Pro
  subscription and an active payout account — but never a `user`, `account`
  or `member` row. `requireOwner()` resolves a business through `member`, so
  no credential anywhere reaches the demo data, and a fresh signup lands in
  `/kurulum` with an empty organization instead.

  Eight of twenty-one routes render only for a business that nobody can sign
  in as: the entitlement gating, the subscription lifecycle, the held-versus-
  released payout split, the availability editor, the week heatmap. That is
  the majority of the engineering in this repo and today the test suite is
  the only thing that sees it.

  Seed the owner through Better Auth's sign-up API rather than inserting
  rows directly, so the password hashes the way the login path expects, and
  publish the credentials on the landing page.

- [x] **Push `feat/billing-subscriptions` and merge to `main`.** `0.5d`

  Twenty-one commits ahead of `main` and absent from `origin` —
  subscriptions, entitlements, payouts, refunds, the renewal cron. For a
  portfolio build the repository is the deliverable, so the best work in the
  project is currently not part of the portfolio at all.

- [~] **Deploy it.** `1d` — live and building; migrations not yet applied to Neon

  No `.vercel` directory; the project has never been linked. `vercel.json`
  declares the renewal cron and nothing runs it. Needs a Vercel project, a
  Neon branch, the environment from `.env.example`, and one smoke test all
  the way through the booking flow — nobody is going to clone this, register
  a sandbox merchant and run a seed script to see it.

---

## First impression — 1.5 days

What a reviewer forms an opinion from before they read a single function.

- [ ] **Give the README a top that lands in twenty seconds.** `0.5d`

  It is the strongest asset in the repo — the iyzico probe table, the
  reasoning about why Abonelik is unavailable on a marketplace account, the
  kapora release semantics — and it opens like internal engineering notes
  with the payoff four screens down. It needs the live URL, the demo
  credentials, and the three things worth noticing: correctness pushed into
  the database, entitlements resolved server-side in one place, and a real
  API integration with its dead ends written down.

- [x] **Add CI, so the tests are visible.** `0.5d`

  No `.github/` at all. The suite is one of the best things here — a real
  parallel double-submit race, payment-callback idempotency, DST spring-
  forward and fall-back — and there is no way to see it pass without running
  it locally. A workflow with a Postgres service container covering
  `typecheck`, `check` and `test`, plus a badge, converts private quality
  into public evidence.

- [ ] **Move the card-handling trade-off into the README.** `0.3d`

  `startProSubscription` posts a raw card number to iyzico's direct API
  without 3DS. Against the sandbox that is harmless, but a reader who knows
  payments will find it, and what they conclude depends on whether you got
  there first. The judgment is already written at
  `lib/payments/iyzico.ts:398` — why a marketplace account leaves no hosted
  alternative, what production would require (`threedsInitialize`, PCI
  SAQ A-EP), and why a sandbox build stops short. The same code reads as a
  liability or as a decision depending on that paragraph.

- [ ] **Replace create-next-app's leftovers with original marks.** `0.5d`

  `next.svg`, `vercel.svg`, `window.svg`, `globe.svg` and `file.svg` sit in
  `public/`, referenced by nothing.

- [x] **Fix the comment that contradicts its own function.** `0.1d`

  `lib/billing/plans.ts:42` reads "the Pro trial does ask for a card up
  front". `startTrial` takes no card, and the README says so. Billing is
  where comments get read most carefully, and one that disagrees with its
  code undermines the ones that are right.

---

## Depth — 9.4 days

What holds up if someone clicks around for ten minutes rather than two.
None of this is needed to publish; all of it is needed to look finished.

- [ ] **Owner-side create and reschedule.** `2.5d`

  `lib/actions/bookings.ts` exports the public `createBooking` and
  `cancelBooking` and nothing else, so cancel is the only verb an owner has
  and nothing anywhere can move a booking. The slot validation is already
  written; this is a form and a guarded action.

- [ ] **Date exceptions — holidays, vacation, one-off hours.** `2.5d`

  `availability_rules` holds weekly rules only. Turkey has roughly fifteen
  public holiday days plus two multi-day bayrams, and today a business
  closing for a week deletes its hours and restores them by hand.

- [ ] ~~**Reminder emails.**~~ `1d` — deselected for v1.0

  Confirmation and cancellation only. The daily cron and the React Email
  templates both already exist, so this is the cheapest way to make the
  scheduled-work story concrete — and no-shows are the stated thesis behind
  kapora, which nothing in the product currently acts on.

- [ ] **Phone numbers, and a business profile worth showing.** `1d`

  Bookings capture a name and an email; the public page carries no phone,
  address or description. The cancellation email tells the customer to
  contact the business directly and gives them no way to.

- [~] **Demo integrity — throttle the booking form, reseed nightly.** `0.7d`

  Throttle done; the nightly reseed lands after the depth items, so its
  desired state covers everything they add.

  `createBooking` has no rate limit and no captcha, and every booking holds
  its slot permanently through the exclusion constraint. Once the URL is
  public, one bored visitor fills the calendar and every reviewer after them
  sees a wrecked demo. An IP-plus-email throttle, and a reseed on the cron
  that already exists. (Related: `rateLimit.storage` is `"memory"`, which on
  Fluid Compute is per-instance — `"database"` is the honest setting.)

- [x] **Let the business change its name and slug.** `0.5d`

  `updateSettings` never touches either; only `completeOnboarding` sets them,
  so a typo at signup is permanent.

- [x] **Paginate and search the bookings list.** `0.5d`

  Both tabs hard-limit to 100 rows with no way to find one customer.

- [ ] ~~**`robots.ts`, `sitemap.ts`, `manifest.ts`.**~~ `0.3d` — deselected for v1.0

  Every `/r/[slug]` page is public surface and nothing tells a crawler it
  exists.

- [x] **Sweep expired holds on the cron.** `0.2d`

  `cancelExpiredHolds` runs on the next booking attempt for that
  organization, so a quiet business keeps a dead thirty-minute hold visible
  until someone else tries to book — on a low-traffic demo, the normal case
  rather than the edge case. About five lines in the job that already runs.

- [x] **Drop the currencies that can never be selected.** `0.2d`

  The settings page offers usd, eur and gbp; iyzico Marketplace settles TRY
  and `updateSettings` rejects anything else whenever online kapora is on.

---

## Deliberately out of scope

Each of these is a genuine requirement for a product and not for this one.
They are listed because a gap a reader finds named reads as judgment, and
the same gap unexplained reads as an oversight.

**Legal pages — KVKK aydınlatma metni, Mesafeli Satış Sözleşmesi, İptal ve
İade Koşulları.** Required to leave the iyzico sandbox and take real money.
This build never does, and says so.

**3-D Secure and PCI SAQ A-EP.** No real card touches this app; the
subscription form takes sandbox test cards. The awareness matters and is
documented — the implementation does not.

**Multi-staff scheduling.** `bookings_no_overlap` excludes on
`(organization_id, tstzrange)`, so one business is deliberately one chair.
Supporting concurrent staff means a resource dimension through the
constraint, the availability rules, the slot engine and the booking flow —
roughly two weeks, and a different product.

**Email verification on signup.** Actively unwanted here: it puts an inbox
round-trip between a reader and the app. `autoSignIn` stays.

**Error tracking and structured logging.** Sentry on an app with two demo
businesses is ceremony. `console.error` plus the platform's own runtime logs
is proportionate, and the proportion is the point.

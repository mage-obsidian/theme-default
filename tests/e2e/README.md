# End-to-end suite

Playwright coverage for the OBSIDIAN account area, its authentication screens and
the header navigation. It drives a real storefront: no mocks, no fixtures injected
into the page — if a block stops rendering, a spec goes red.

## Running it

```bash
pnpm install
pnpm seed            # writes the fixture account into the Magento environment
pnpm test            # the whole suite
pnpm test --project=desktop --grep "order history"
pnpm report          # last HTML report
```

Point it somewhere else with `E2E_BASE_URL` (default `https://zento-obsidian.test`),
and override the account with `E2E_EMAIL` / `E2E_PASSWORD` if you seeded your own.

**No password lives in this repository.** The seed mints a fresh one on every run
(or takes `E2E_PASSWORD` if you pin it) and hands it to the suite through
`.artifacts/fixture.json`, which git ignores.

## The fixture

`tools/seed.php` runs inside the Magento container and tops the account up to what
the assertions need: **13 orders** (one invoiced, shipped and refunded, three more
forced into distinct states so the chips have more than one tone), **13 wish-list
items**, **3 reviews**, two addresses and a newsletter subscription. Thirteen is the
number that matters — every account list pages at ten, so anything less would let a
missing pager pass unnoticed.

It is idempotent and cheap to re-run. It leaves `.artifacts/fixture.json` behind
with the credentials and the ids the specs need (the documented order, the
trackable one, a live password-reset token); specs that depend on it skip when it
is absent, and the sign-in fails with an instruction to run the seed.

**It is for development environments only.** It writes customers and orders, and it
turns the storefront CAPTCHA off — see below.

## Projects

| Project | What it covers |
|---|---|
| `signin` | Signs the fixture customer in through the real form and saves the session |
| `desktop` | The account area at 1440×900 |
| `mobile` | The same shell on a Pixel 7 — the rail as a scroll-snapped strip |
| `guest` | The five authentication screens, signed out |
| `signout` | Runs last: signing out invalidates the session the others share |

## Known gaps, carried as tests

- **CAPTCHA.** Magento demands one after a few sign-ins and the login template has
  nowhere to put it, so from that point a real customer cannot get in and the page
  never says why. The seed switches the challenge off to keep the suite moving;
  `auth.guest.spec.ts` carries a `test.fixme` so the gap stays visible in the report
  rather than being silently accommodated.
- **Downloadables and stored cards.** Their modules are not wired in every
  environment. `account-extras.spec.ts` checks the route is live before asserting,
  so an unwired module skips instead of reporting a defect that is not there.

## Notes worth knowing before you debug a failure

- Some development environments carry `Development_CustomerBypass`, which lets any
  password through. That is why the rejected-sign-in spec uses an unknown account
  rather than a wrong password.
- `innerText` returns what CSS rendered, uppercase transforms included. Read pager
  totals with `textContent`.
- Playwright restarts the worker after a failure, so no spec may assume the one
  before it ran; anything a test needs, it creates.

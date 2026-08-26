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

## The parity registry

`registry/parity.json` records every frontend layout handle the installed Magento
core ships and what MageObsidian does about it. It is **generated**, never written
by hand — a hand-written inventory reflects what its author remembers migrating,
which is how a previous survey declared the migration complete with a large gap
still open.

```bash
npm run test:unit                          # the tools' own unit tests
npm run parity:handles -- --vendor <vendor/magento>
node tools/parity/report.ts --vendor <v> --workspace <ObsidianProject> --contract <contract.json>
node tools/registry/generate.ts --vendor <v> --workspace <w> --contract <c> --version 2.4.9
npm run registry:verify                    # registry against the suite, both ways
```

Every test carries a `@cap:<handle>` or `@behaviour:<name>` tag naming what it
verifies. `registry:verify` fails when an entry claims a test the runner does not
list, when a covered entry rests on a test that never runs, when a pending test
has no entry explaining it, or when a tag names a capability the registry does not
know. That cross-check is what keeps the registry from drifting into fiction.

Two files are written by hand and merged in: `registry/known-gaps.json` (blocked
capabilities with what would unblock them) and
`registry/suppressed-classification.json` (why a suppressed core handle is out of
scope, gateway-dependent, or a real gap). A suppressed handle left unclassified is
reported, so it cannot pass as covered.

## Performance budgets

`perf/budgets.json` holds a ceiling per page type for what the browser measures
and for what the server pays. Every ceiling records the measurement and the date
that justify it — a ceiling with nothing behind it is rejected, and so is one set
under its own measurement.

```bash
PERF=1 npx playwright test --project=perf     # measure and check against the budgets
PERF=1 PERF_RUN=baseline npx playwright test --project=perf
npm run perf:queries                          # count the queries each page costs
npm run perf:record -- baseline cold          # write the budgets from those two runs
npm run perf:verify -- baseline cold          # budgets are backed, runs stay inside
```

The protocol lives in `src/perf/protocol.ts`, not in prose: page-cache state, CPU
throttling, viewport, session, sample count and the tolerance each metric is
allowed to drift between two runs. `perf-stability.perf.spec.ts` runs the same
protocol twice and fails if it does not reproduce.

Three traps this protocol exists to avoid:

- **The browser cache is not the page cache.** Sampling the same URL three times
  in a row measures one first visit and two repeat visits; the median then means
  nothing. Every sample clears the browser cache, so `cache: "warm" | "cold"`
  refers only to Varnish.
- **Measuring cold must not warm anything first.** `RequestLedger` mints a URL the
  instrumentation has never requested and refuses to hand back one it has.
- **Layout shift during the document's arrival is not the theme's.** Every shift
  is recorded with `document.readyState` at the moment it happened, and the
  report splits `clsWhileLoading` from `clsAfterLoad`.

Two page-cache facts the measurements turned up: `/checkout/` **is** served from
the edge cache (deliberately — the private half arrives through the section
endpoint), and the first request for any search term is always `UNCACHEABLE`,
which is core Magento, not this storefront.

## What each page costs the server

`npm run perf:queries` counts the database queries a page render costs and
attributes each one. It needs the query log on:

```bash
zento compose exec -T php-noxdebug php bin/magento dev:query-log:enable
zento restart php php-noxdebug     # env.php is in the opcache until you do
```

The report names, for every query, the nearest application frame and — separately
— the nearest **MageObsidian** frame in the stack. That second column is the one
that matters: without it every query on a category page attributes to a core
resource model, and the question "is this ours?" cannot be answered. Repeated
patterns are grouped by normalised SQL **and** origin, so the same statement from
two callers stays two findings.

## The security audit

Three registers under `security/`, each generated or hand-written and each held to
by a test in the suite:

```bash
npm run security:classify      # regenerate the rule half of the output classification
npm run security:unescaped     # audit the theme: unclassified points fail
npm run security:environment   # what this deployment relaxes, into .artifacts/
PERF=1 npx playwright test --project=guest specs/csp.guest.spec.ts
```

**Unescaped output.** `tools/security/unescaped.ts` finds every `|raw` in the
theme's templates, works out the markup context it sits in (text, attribute, tag,
script, style) and fingerprints it as file + expression + context. The fingerprint
is the point: move the same expression from text into an attribute and the old
classification stops covering it. `security/unescaped-classification.json` holds
one entry per point, split into what six declared rules cover and what was
classified by hand against the code that produces the value. A point classified as
end-user content must name the guarantee that it was escaped upstream, or it is a
defect. A point recorded as a defect keeps being reported on every run rather than
passing quietly.

The raw text search finds 164 and the extractor 162 — the difference is two
`|raw` mentions that sit inside Twig comments.

**Embedded data.** Every JSON-LD block, every `application/json` script and every
`data-props` attribute must parse as JSON, on every public page, including one
loaded with a search term that tries to close a script element and a product whose
review title is `<!--<script>` — the tokenizer trap rather than the obvious one.

**Content security policy.** The suite applies its own enforcing policy in the
browser (`src/csp.ts`) rather than reading the deployment's, so the check says the
same thing wherever it runs. `security/csp-accepted.json` names every fragment the
policy blocks and who emits it; a fragment nobody declared fails. The storefront
does not run clean under that policy today, and the register is what makes that
concrete instead of vague.

**What the environment relaxes.** `tools/security/environment.php` reports the
mode, the store and every control this deployment loosens — a module that accepts
any password, an administrator who can assume a customer session, a challenge
switched off, a policy in report-only. Each one becomes a **not-executed** line in
the run summary naming the control. A check whose control is relaxed never counts
as passed.

## The competitive comparison

`competitive/` holds four files and nothing is written into any of them by hand
without evidence behind it:

| File | What it is |
|---|---|
| `perimeter.json` | which of the reference's repositories are public, their licence, the revision each comparison was made against, and what is explicitly outside |
| `capabilities.json` | one entry per module the reference ships and this project does not, each landing on gap, equivalence by another path, or discarded by architecture |
| `backlog.json` | those gaps, prioritised, with the criteria that put them in that order — and the licence analysis |
| `migration.json` | what a store on the reference stack would face moving here |

```bash
npm run competitive:compare -- --reference <checkout of the reference repos>
npm run competitive:verify
```

**Two evidence regimes, never mixed.** A claim `derived-from-code` pins the
revision it was derived from. A claim `declared-by-source` cites the source and
the product version, and the schema refuses to let it carry a revision — the
commercial parts have no public source, so nothing about them can be derived and
the register must not pretend otherwise.

**A difference in template count is not a gap.** The reference splits a page into
more partials than this project does, and it gives some capabilities a module
directory of their own that live inside another one here — swatches is the clearest
case: seven renderers there, inlined into the catalog templates here, and exercised
by the suite on both the product page and the layered navigation. Only the parity
register decides whether a capability is covered.

**Detecting is not incorporating.** Every backlog item starts `not-approved`, and
`competitive.guest.spec.ts` fails if any of them is approved without a recorded
date. The reference is OSL-3.0 and this project is MIT: the two do not compose in
that direction, so every item derived from its code is marked
`reimplementFromBehaviour`, and the schema rejects one that is not.

## Three states, not two

The run summary distinguishes passed, failed and **not executed**, each with its
reason, and writes `.artifacts/run-summary.json`. A check that cannot observe its
phenomenon in the environment it runs in reports as not executed — never as
passed. Two exist today: the back/forward cache assertions (this deployment
answers `no-store`, and Chromium keeps nothing while headless) and the paint
assertions (without CPU throttling the gap they look for is invisible).

## Running it in CI

```bash
pnpm run verify          # informative: reports, never fails the run
pnpm run verify:gate     # gate: fails when a gating check fails
pnpm run map             # write the map to .artifacts/map.md
```

`tools/ci/checks.ts` declares each check, whether it gates, and whether it needs a
storefront to drive. A check that needs one and finds none reports as **not
executed with the reason** rather than passing on an environment that could not
observe anything. The suite depends on the seed: if the seed fails, the suite is
reported as not executed too, because a suite run against a spent fixture says
nothing. `.github/workflows/verification.yml` runs the informative mode on every
push and the gate on demand.

Three gates were verified by breaking them on purpose and watching them recover:

| Broken on purpose | What caught it |
|---|---|
| a ceiling lowered under its own measurement | `budgets-backed` |
| a covered entry pointing at a test nobody wrote | `registry` — `missing-test` |
| a test tagged with a behaviour the register does not declare | `registry` — `orphan-behaviour` |
| a check that did not run and named no register entry | `registry` — `unexplained-absence` |
| a new unescaped output point with no classification | `unescaped-output` — `unclassified` |

That last pair is the point of the whole register: a check that quietly stops
running, and a value that quietly stops being escaped, are the two ways a green
suite starts lying.

## What the platform carries

A capability can be migrated and still not be reachable: the contract decides
which modules contribute layout, and a module that is not in it leaves the core
handle suppressed with nothing replacing it. The page then answers **200 with an
empty `#maincontent`** — no error, no message. `registry:generate` marks those
handles `declared-not-installed` and blocks them, naming the module to install.

Registering a module by symlink is not enough: **PHP-FPM must be restarted**.
Its opcache keeps the previous autoload map, so the module registers, reports
`enabled`, passes `isOutputEnabled`, and still contributes no layout at all —
with no error anywhere. Seven modules looked broken for exactly that reason
until `zento restart php php-noxdebug`.

## Projects

| Project | What it covers |
|---|---|
| `signin` | Signs the fixture customer in through the real form and saves the session |
| `desktop` | The account area at 1440×900 |
| `mobile` | The same shell on a Pixel 7 — the rail as a scroll-snapped strip |
| `guest` | The five authentication screens, signed out |
| `signout` | Runs last: signing out invalidates the session the others share |
| `paint` | Throttled and signed out: what the client does to the markup the server sent |
| `bfcache` | Headed on purpose: back/forward restoration, which headless cannot observe |
| `perf` | Opt-in through `PERF=1`: measures the budgets under the declared protocol |
| `perf-account` | The same, signed in |

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

- **"Not enough items for sale" at checkout, and the wish list paging tests
  failing together**, is the suite eating its own fixture: every full run places
  real orders, which reserve stock, and moves wish list items into the cart. Run
  `pnpm seed` between full runs — it tops the salable quantity back up to the
  floor and refills the list. The wish list target carries margin for exactly this
  reason: a run spends about five items and the paging check needs more than ten,
  so a target that only just cleared the threshold failed on the second run. Nothing is broken; the symptom just reads like a
  product defect.
- **Static assets 503 while the HTML is 200** means Varnish is holding a stale
  backend, not that the theme broke. Anything that recreates the `app` container
  changes its IP and Varnish is not recreated with it, so the island scripts never
  arrive and the symptom reads as "the add-to-cart button is missing".
  `zento restart varnish`.
- **A shell with `HTTPS_PROXY` set** sends `.test` through the corporate proxy and
  reports `000` or a proxy 503 against a healthy stack. Export `NO_PROXY=…,.test`
  before running the suite; `curl` needs `--noproxy '*'`.
- **Transactional emails go to mailcatcher**: `zento service mailcatcher on`, then
  `npm run emails:send && npm run emails:verify`.

- Some development environments carry `Development_CustomerBypass`, which lets any
  password through. That is why the rejected-sign-in spec uses an unknown account
  rather than a wrong password.
- `innerText` returns what CSS rendered, uppercase transforms included. Read pager
  totals with `textContent`.
- Playwright restarts the worker after a failure, so no spec may assume the one
  before it ran; anything a test needs, it creates.

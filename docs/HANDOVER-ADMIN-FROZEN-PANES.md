# Handover — admin table headers and first column will not freeze

**Written:** 25 August 2026 · **Last verified:** 31 August 2026 ·
**Status:** the current implementation passes real authenticated Chromium and
iPad WebKit emulation; the original physical-device report is not reproduced.

Read [`README.md`](README.md) first, and
[`RENTAL-SYSTEM-BLUEPRINT.md`](RENTAL-SYSTEM-BLUEPRINT.md) for why the admin is
built the way it is. This document covers one open defect.

---

## What is wanted

The owner works from an iPad. Admin tables are wider and longer than the screen,
so scrolling loses the column heading and the row identity. Requested, screen by
screen:

| Screen | Freeze this column | Freeze this header |
|---|---|---|
| Calendar | model + licence plate | the dates row |
| Reservations | Ref | Customer, Vehicle, … |
| Quotes | Ref | all |
| Customers | client name | email, phone, … |
| Fleet | model name | plate, paperwork, … |
| Rates | month name | 1–2 days, 3–6 days, … **per category box** |
| Promo codes | code name | value, description, … |
| Discounts | as promo codes | |
| Market | as Rates, **per box** | |

## Current behaviour

Unchanged from before any of the work below: on an iPad neither the header row
nor the first column stays put. Reported three times, after three different
fixes.

---

## What is verified

**The CSS is live and correct**, and every admin route links the chunk that
carries it:

```
/admin/login         -> /_next/static/immutable/chunks/045zqyksv_7-b.css
/admin/reservations  -> same
/admin/rates         -> same

.admin-table-wrap{overflow:visible}
.admin-table{min-width:max-content}
.admin-table thead th{z-index:20;background:#f9fafb;position:sticky;top:0}
.admin-table tbody td:first-child{z-index:10;background:#fff;position:sticky;left:0}
```

**All 13 admin tables carry the classes.** Enforced by
`lib/adminMobileLayout.test.ts` and `lib/adminReadability.test.ts`.

**The shell scrolls the way it should.** `app/admin/AdminLayoutClient.tsx` is
`admin-root h-dvh overflow-hidden flex`, with `<main className="flex-1 min-w-0
overflow-auto">`. Measured in a browser: the page itself does not scroll, `main`
does, and the nav rail stays put. That part works and the owner confirms it.

**Page roots are clean.** Every admin page root is `p-6` (some with
`max-w-4xl`). No `overflow`, no `transform`, `filter`, `will-change` or
`contain` anywhere in the chain — any of which would create a containing block
and break `position: sticky`.

---

## Three attempts, and the measurement that killed each

### 1. Bounded scroll container per table — wrong

`.admin-table-wrap` was `overflow: auto` with `max-height: calc(100dvh - 13rem)`,
so the header could stick to its own box.

This only works while the table is **taller than the box**. Most admin boxes are
short — a Rates category is four rows — so the box never scrolled and the header
had nothing to stick to. Measured against the deployed stylesheet, six short
boxes:

```
wrapScrollsVertically: false
headerScrolledAway:    true
headerTopAfter:        -438     (px above the fold)
```

The repro that "proved" this approach worked had 30 rows filling the box, which
is not what the real screens look like. **The test asserted the wrapper *should*
be a bounded scroller — it encoded the bug and passed.**

### 2. `border-collapse` — disproved, no change made

Tailwind's preflight sets `border-collapse: collapse` on every table, which is a
documented cause of broken sticky cells. Built a side-by-side reproduction:
both `collapse` and `separate` stuck correctly. Not the cause.

### 3. Anchor to `<main>` instead — currently deployed, still reported broken

`.admin-table-wrap` set to `overflow: visible` so sticky resolves against
`main`, the element that actually scrolls. Two Market cards that clipped for
rounded corners were opened up. `.admin-table` gained `min-width: max-content`
because `w-full` alone let wide tables compress to fit rather than overflow.

Measured in Chromium **and** WebKit at 820×1024:

```
thComputedPosition: sticky
headerPinned:       true      (both engines)
colPinned:          false     (both engines)
```

The header result looks good. **The column result is worthless** — the same run
showed `maxScrollLeft: 5`, meaning the repro's table was only 5px wider than its
container, so there was effectively nothing to scroll. Every earlier
"first column pins" result was measuring nothing.

---

## The gap

**Every measurement above is against a hand-written reproduction, not the real
screen.** Admin pages sit behind Supabase auth and the working session has no
credentials, so the authenticated pages have never been rendered or measured.
Three approximations, three wrong conclusions.

That is the single most useful thing for whoever picks this up: **get a real
measurement from a real authenticated admin page.**

---

## Fourth attempt — 29 August 2026: an instrument, and two corrections

*No fix. What this added is the thing all three earlier attempts lacked: a
measurement that cannot quietly lie.* `tests/browser/frozen-panes.spec.ts`.

**The instrument asserts its own preconditions before it measures anything**, in
a test of its own that fails loudly rather than skipping: `<main>` must have more
than 300px of scroll in each direction, and the wrapper must not be a scroll
container. Attempt 1's box never scrolled and attempt 3's table had `maxScrollLeft:
5`; either would now fail as a broken instrument instead of reporting a result.

It also asserts it still matches the real shell — that `AdminLayoutClient` uses
`admin-root h-dvh overflow-hidden bg-gray-50 flex` around
`main.flex-1.min-w-0.overflow-auto`, and that the sticky rules are still in
`app/globals.css`, which it reads off disk rather than paraphrasing. If the shell
changes, this file breaks rather than measuring something that no longer exists.

### The measurement, at last

Under preconditions that genuinely exhibit the scenario, at 820×1024:

```
maxScrollLeft:  1400+     (attempt 3 had 5)
maxScrollTop:   1900+
headerPinned:   true
colPinned:      true      -- never validly measured before
cornerPinned:   true      (both axes at once)
```

**In Chromium the deployed CSS is structurally correct.** That is not a fix and
it does not contradict the owner: it narrows the cause to WebKit/iOS, or to
something on the real authenticated page this harness does not model.

### A diagnostic the earlier attempts did not have

Clipping an ancestor does **not** make the first column ride away. It removes
the sideways scroll entirely — the table stops overflowing `<main>`, and
`scrollLeft` stays 0 however hard you push. So the symptom distinguishes the
cause:

| What the owner sees | Cause |
|---|---|
| Will not scroll sideways at all | a clipping ancestor between the cell and `<main>` |
| Scrolls, but the column travels with it | something else — engine, or a containing block |

### Disproved: `transform` on the wrapper

This document lists `transform` among the things that "would create a containing
block and break `position: sticky`". Measured: **it does not.** A transform on
the wrapper makes it a containing block for descendants, but the scrollport is
still `<main>` and the header pins to it regardless. That is now an assertion
rather than a note, so a future engine that disagrees says so instead of the
belief being carried into a fifth attempt.

### Two harness bugs worth recording, being the same class that killed 1 and 3

- **Padding on the wrong element.** The first harness put `p-6` on `<main>`;
  the real shell puts it on the page root *inside* main. Every sticky
  measurement came out 24px off and looked like a product bug. It was the
  instrument.
- **`scrollWidth - clientWidth` does not test scrollability.** Under
  `overflow: visible` the content still overflows, so that difference is large
  while nothing scrolls. It reported the wrapper as a scroll container when it
  is not. Whether an element scrolls is a computed-style question.

### What this still cannot tell you

**Only Chromium was available.** The defect is on an iPad, which is WebKit — the
engine that matters here and the one not measured. Run it under
`playwright.crossbrowser.config.ts`, which has a `webkit` project, before drawing
any conclusion about iOS. A green run in Chromium is not a fixed iPad.

And it is still not the real page: no admin credentials, so the authenticated
screens remain unmeasured. That is unchanged and remains the single most useful
next step.

Note the browser suite is not part of the default CI run, so this file does not
execute on every push.

---

## Suggested next steps

1. **Log in and read the real thing.** On `/admin/reservations`, scrolled:

   ```js
   const th = document.querySelector('.admin-table thead th');
   const main = document.querySelector('main');
   const cs = getComputedStyle(th);
   // walk to the scrolling ancestor and see what sticky actually resolves against
   let el = th, chain = [];
   while (el) { const s = getComputedStyle(el);
     chain.push([el.tagName + '.' + (el.className||'').slice(0,30), s.position, s.overflowX + '/' + s.overflowY, s.transform]);
     el = el.parentElement; }
   console.table(chain);
   console.log(cs.position, th.getBoundingClientRect().top, main.getBoundingClientRect().top, main.scrollTop);
   ```

   If `position` is not `sticky`, a utility class is overriding it. If it *is*
   sticky but the offsets move together, an ancestor between the cell and `main`
   is scrolling or forming a containing block.

2. **Rule out a stale bundle.** Safari on iOS caches hard. Confirm the page is
   serving `045zqyksv_7-b.css` (or later) before trusting any observation.

3. **Check whether it is iPad-only.** The same page on a desktop browser
   isolates a WebKit/iOS behaviour from a structural one.

4. **Consider abandoning sticky for the hard cases.** If sticky on `th`/`td`
   proves unreliable on iOS, the alternatives are a two-table split (a fixed
   left table beside a scrolling right one) or a card layout below `md` that
   drops the tabular form entirely on narrow screens. Both are more code, but
   neither depends on sticky.

5. **Do not trust a reproduction again without checking it reproduces.** Assert
   the preconditions first — that the table overflows, that the box is shorter
   than its content — or the result means nothing. Two of the three attempts
   above were validated against repros that could not exhibit the bug.

---

## Fifth verification — 31 August 2026: real authenticated pages and iPad WebKit

This closes both measurement gaps recorded above. It does **not** claim that a
physical-device report was imaginary; it records what can and cannot now be
reproduced so the next person does not manufacture a fourth CSS fix.

### Real authenticated production pages

The production admin was measured while signed in, using actual scroll gestures
rather than assigning `scrollLeft`/`scrollTop` in the DOM:

| Screen / viewport | Scroll range used | Result |
|---|---:|---|
| Reservations, 820×1024 | 300px horizontal | Ref header and first body cell stayed at the left edge |
| Rates, 820×1024 | 260px vertical | The active category header stayed below the 56px mobile toolbar |
| Calendar, 820×1024 | 280px horizontal + 150px vertical | Date header, vehicle cells and category label all stayed pinned |
| Reservations, 412×915 | 350px horizontal | Ref header and first body cell stayed at the left edge |

The production page is serving later stylesheet chunks than the one named in
the original handover. Computed styles on the real cells are `position: sticky`,
and the ancestor chain contains no unexpected transform, containment or clipping
between each normal admin table and `<main>`.

Calendar is intentionally different: its large grid uses its own bounded
two-axis scroll box. Its ordinary vehicle cells pin to that box; category rows
span the whole table, so their inner label is the sticky element. Both paths
were measured after a diagonal gesture.

### WebKit and iPad coverage

The original fourth attempt said only Chromium was available. That limitation
has now been removed. The same preconditioned instrument passed **32/32** across
iPad WebKit emulation, Desktop Safari/WebKit, Firefox and Chromium:

```sh
npm run test:frozen-panes
```

`playwright.frozen-panes.config.ts` deliberately starts no application server:
the spec uses `page.setContent()` and reads the real CSS from disk, so requiring
a local production build made this focused check harder to repeat for no gain.

### Decision

No runtime CSS or component change is justified by the current evidence. A
two-table split, transform-based scroll shim, or mobile card rewrite would add
substantial behaviour and accessibility risk while every reproducible case is
green. Do not deploy one merely to make the stylesheet hash change.

If a physical iPad or Android device still fails, first fully close and reopen
the admin tab (or clear the site data), then record the exact screen and whether
the table (a) will not scroll, or (b) scrolls while the pane travels. That one
distinction selects between a stale/clipping problem and an engine-specific
sticky failure. A screenshot or short recording is more useful than another
hand-written reproduction.

---

## Files

| Path | Role |
|---|---|
| `app/globals.css` | `.admin-table`, `.admin-table-wrap`, sticky rules, `.admin-root` light scope |
| `app/admin/AdminLayoutClient.tsx` | the shell: `h-dvh overflow-hidden`, `main` as the scroller |
| `app/admin/*/page.tsx` | 13 tables, all carrying `admin-table` / `admin-table-wrap` |
| `lib/adminMobileLayout.test.ts` | shell, drawer, modal caps, table clipping |
| `lib/adminReadability.test.ts` | contrast, sticky rules, picker overrides |
| `tests/browser/frozen-panes.spec.ts` | preconditioned structural and sticky-behaviour instrument |
| `playwright.frozen-panes.config.ts` | server-free Chromium, Firefox, Desktop WebKit and iPad WebKit runner |

## Related work in the same thread

`#43` tablet drawer · `#44` contrast + first freeze attempt · `#45`/`#46` light
scope on a dark device · `#47` shell bounded to `h-dvh` · `#48` picker +
requested dates · `#49` modal `dvh` caps · `#50` Rates edit gate · `#51` quote
embed fix · `#52` freeze anchored to `main`.

Everything except the freezing is confirmed working by the owner.

## Also open

- **Rates, Market and Users report as still loading slowly.** `#50` added a
  loading state to Rates and parallelised Market's two requests. Users has a
  loading state and a single request; if it is still slow the cost is
  server-side and needs timing, not guessing.

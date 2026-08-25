# Handover — admin table headers and first column will not freeze

**Written:** 25 August 2026 · **Against:** `ed381a2`, live on anadyon.gr ·
**Status:** unresolved after three attempts.

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

## Files

| Path | Role |
|---|---|
| `app/globals.css` | `.admin-table`, `.admin-table-wrap`, sticky rules, `.admin-root` light scope |
| `app/admin/AdminLayoutClient.tsx` | the shell: `h-dvh overflow-hidden`, `main` as the scroller |
| `app/admin/*/page.tsx` | 13 tables, all carrying `admin-table` / `admin-table-wrap` |
| `lib/adminMobileLayout.test.ts` | shell, drawer, modal caps, table clipping |
| `lib/adminReadability.test.ts` | contrast, sticky rules, picker overrides |

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

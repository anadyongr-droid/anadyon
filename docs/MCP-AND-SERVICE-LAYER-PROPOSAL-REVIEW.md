# Review: core application + MCP/AI integration strategy

**Last verified:** 22 October 2026, Claude — first review, written against the
code rather than against the proposal's own description of it.

**Status: the proposal is accepted in principle and is not yet a decision.**
Three corrections are material, one of them a security gap the proposal does
not mention, and the stage order conflicts with the blueprint's §7 build order
without arguing it down. Nothing here is implemented. Per `AGENTS.md` the role
for this work has not been stated, so this is a review, not an architect's
blueprint section.

---

## 1. The verdict in one paragraph

**The guiding principle is already this project's principle, and that is the
strongest thing that can be said for it.** "Build the business logic once and
expose it through multiple interfaces" is `DEFINING-STATEMENTS.md` §5
generalised from pricing to everything else — and §5 was not a preference, it
was written after the alternative cost real production time. The proposal is
therefore not a new direction; it is the existing direction extended, which is
why it can be accepted in principle without reopening anything.

**What it gets wrong is the current state of the codebase**, in three specific
ways that change what the work actually is. And it is silent on the one thing
that makes a second interface dangerous here.

---

## 2. What the proposal gets right, with the project's own reasons

### 2.1 One implementation, many callers — §5 already says exactly this

> *"One implementation, two callers. That is what stops the two drifting: not
> calculating in a single place at runtime, but having a single module neither
> side can bypass."* — `DEFINING-STATEMENTS.md` §5

The proposal's section 5 ("Why we should NOT build a large MCP backend now")
reaches the same conclusion by the same argument. Accepted without
qualification.

### 2.2 Availability behind a boundary — already a stated goal, and not met

This is the most valuable item in the proposal and it needs no MCP
justification at all. `DEFINING-STATEMENTS.md` §7 already says:

> *"Keep the question 'is this free?' answerable through one place rather than
> inlined wherever it is asked."*

**It is not currently in one place.** Read from the code on 22 October 2026,
the answer to "is this vehicle free?" is assembled from at least:

| Module | What it contributes |
| --- | --- |
| `lib/calendarReservations.ts` | date-range overlap (`overlapsCalendarRange`) |
| `lib/operations.ts` | turnaround between a return and the next collection |
| `lib/vehicleBlocks.ts` | maintenance and statutory blocks |
| `lib/damageBlock.ts`, `lib/openDamage.ts` | damage holds |
| `lib/fleetStatus.ts` | fleet state |
| `lib/reservationStatus.ts` | reservation state |
| `lib/quoteVehicleAssignment.ts` | assignment validation |

Each is sound on its own. Together they are the §7 condition unmet, and a
caller that forgets one of them gets a wrong answer rather than an error.
**`availabilityService` is worth building whether or not MCP ever exists**, and
it should be argued for on §7's grounds, not on AI's.

### 2.3 Business concepts, never raw SQL

Section 9 of the proposal — prefer `extend_reservation` over `execute_sql` — is
correct and consistent with how agent access has already been built here. The
read-only production query workflow takes **a committed file name**, never SQL,
precisely so that "every question an agent asks of production is in git, with a
diff and a review". The same reasoning applies to business operations.

### 2.4 Read-only first, and model independence

Both correct and both cheap. The read-only-first discipline is the one this
project has actually followed with the production query workflow, and it
worked.

---

## 3. Three corrections, because the proposal describes a codebase that has moved on

### 3.1 Stage 2 is largely done, and framing it as "gradually move business logic into clean reusable services" understates what exists

Measured 22 October 2026:

- **68 non-test modules in `lib/`, 9,357 lines** — against **7,359 lines across
  62 API route handlers**. The majority of the logic is already outside the
  routes.
- `lib/pricing.ts` is already the single pricing implementation called by both
  the form and the quote API, with the server's result winning (§5).
- `lib/aadeXml.ts`, `lib/filingBacklog.ts`, `lib/insurancePolicy.ts`,
  `lib/licenceGate.ts`, `lib/confirmPaidBooking.ts` and others are services in
  everything but name.

**So the honest version of Stage 2 is not "build a service layer" but "finish
and name the one that exists".** Two concrete pieces of work, rather than a
programme:

1. **`availabilityService`** — §2.2 above. The real gap.
2. **The fat routes.** `app/api/quote/route.ts` is **864 lines**, the largest
   file in the API by a factor of 2.5 over the next one
   (`morning-briefing`, 348). That is where logic still lives in a handler.

**What should not happen is renaming `lib/` to `services/`.** It would touch
every import in the project, produce an enormous diff that reviews as noise,
and change nothing about who can call what. The directory name is not the
boundary; the module's interface is.

### 3.2 The payments and accounting diagram does not match what is integrated

The proposal's diagram names **Viva, myPOS, Wise, Epsilon/myDATA**. Read from
the code:

| System | In the codebase? |
| --- | --- |
| **Stripe** | **Yes** — `app/api/stripe-webhook/`, `app/api/admin/stripe/create-payment-link/`, `app/api/admin/stripe/success/`, `lib/confirmPaidBooking.ts`, `lib/outstandingDeposits.ts` |
| **Wise** | **Yes** — `/api/admin/wise/deposit` |
| **AADE / myDATA** | **Yes** — `lib/aadeXml.ts`, `lib/aadeDclResponse.ts`, `lib/filingBacklog.ts` |
| **Viva** | No |
| **myPOS** | No |
| **Epsilon** | No. The only `epsilon` in the code is `Number.EPSILON` in `lib/targetPricing.ts` |

**Stripe is the system actually taking customer money today, and it is absent
from the diagram.** Two readings, and they need different answers:

- **If the diagram is aspirational** — a plan to move to Greek providers — then
  Stage 5 is **new integration work plus a payment-provider migration**, not
  "introduce reusable integration services". That is a far larger piece than
  its HIGH/MEDIUM label suggests, and **changing how a customer pays is
  `DEFINING-STATEMENTS.md` §13 territory**, needing Tasos's explicit approval
  of the specific change.
- **If it is a description** — it is wrong, and the correction is above.

Either way this needs Tasos to say which, because the two readings imply
different quarters of work.

### 3.3 The flagship worked example does not exist, and is correctly blocked

`extendReservation` / `extend_reservation` is the proposal's central
illustration, used in sections 4, 9 and 13. **Nothing in `lib/` or `app/api`
implements reservation extension today.** So it is a new feature, not a
refactor of an existing one.

It is also **ordered after blueprint phase 2** whether anyone intends that or
not, because its own flow depends on facts phase 2 produces — turnaround rules
and handover state. Blueprint §7 calls phase 2 "the largest unlock" and
"the source of every later contract, charge, damage and service decision". A
plan whose showcase example quietly depends on an unbuilt phase should say so.

---

## 4. The security gap the proposal does not mention, and it is the important one

**Authorisation in this system lives entirely in the HTTP edge. The service
layer has no concept of a caller.**

How it works today, from `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md` §4 and the
routes themselves:

- `proxy.ts` (the Next.js middleware) builds a cookie-backed Supabase client,
  calls `auth.getUser()`, resolves the person's role from `app_metadata` —
  which the account holder cannot edit — and forwards it as an
  `x-anadyon-role` header, **after deleting any inbound copy so it cannot be
  spoofed**. It fails closed on an 8-second timeout. That part is sound.
- Routes then check the header at the point of use:
  `app/api/admin/vehicles/[id]/route.ts:27` reads it to decide `isAdmin`, and
  gates each field against a `STAFF_WRITABLE` allowlist.
- **`lib/` exports no `requireAdmin`, no `isAdmin`, no caller concept at all.**
  Searched: there is none.

**The consequence for the proposed architecture is direct.** An MCP server that
calls `reservationService.extendReservation(...)` as a function does not make
an HTTP request. `proxy.ts` never runs. No `x-anadyon-role` exists. Every
admin-versus-staff distinction, and every `STAFF_WRITABLE` field allowlist,
**is simply absent on that path**. The MCP interface would be *more privileged
than any human member of staff*, by construction and silently.

**Two further gaps compound it:**

- **It would be unaudited.** `pgaudit` is armed at the **role level** on
  `postgres` (migration 049), because Supabase forbids the database level. An
  MCP server reaching Supabase as `service_role` is outside that switch — the
  migration's own header says so: it "does **not** cover the application's own
  reads, which arrive as `authenticator` → `anon`/`authenticated`/
  `service_role`".
- **It would be unattributable.** `docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md`
  exists because staff identity never reaches the database. An agent's writes
  would be indistinguishable from the application's in any row or log.

### 4.1 What follows, and it changes the proposal's section 7

The proposal puts permissions **in the MCP layer** — Levels 1 to 4, read,
operational write, financial, destructive. That is the wrong place, by the
proposal's own §5 argument. If the gate is MCP-side then the gate is bypassable
by anything else that calls the service, which is precisely the property §5
exists to prevent: *"a single module neither side can bypass."*

**So authorisation must move into the service layer along with the business
rules.** Concretely, a service takes an explicit *actor* — who is asking, with
what role, through which interface — and refuses on its own authority rather
than trusting that someone upstream checked. The web app passes the actor it
got from `proxy.ts`; MCP passes the actor it authenticated; neither can
construct an actor the service will not validate.

That is more work than the proposal implies, and it is the work that makes the
rest safe. **It is also worth doing for the web application alone**: five
copies of `const ROLE_HEADER = "x-anadyon-role"` currently exist in separate
route files, each re-implementing the check.

---

## 5. The stage order conflicts with blueprint §7, and §9 says that must be argued, not ignored

Blueprint §7 is a dependency-ordered build order with a named rationale per
phase:

| Phase | Scope |
| --- | --- |
| **Gate 0** | Clear audit area 5; confirm counter retention, agreement, insurance and adjustment wording with counsel and the accountant |
| **1** | Fleet foundation — **built** |
| **2** | Check-out / check-in, template photos, damage observations, itemised adjustments |
| **3** | Versioned digital agreement and signature |
| **4** | Partner-channel pilot |
| **5** | Reporting — utilisation, RevPAV, margin per vehicle |
| **6** | Alerts and daily plan |

The proposal's Stages 3 to 6 cut across this: its Stage 6 is reporting, which
blueprint phase 5 **deliberately places after phase 2** because reporting
"needs phase 2 data to mean anything". `DEFINING-STATEMENTS.md` §9 is explicit
that a recorded decision "stays recorded until it is argued down".

**Two things must be said about Gate 0 in particular.** It is held by counsel
and the accountant (`docs/GATE-0-QUESTIONS.md`), it is still open, and
blueprint §7 says it "directly determines what phase 2 may collect, retain and
charge". A refactor plan that does not mention it risks building services
around wording that may change.

**The reconciliation is easy and should be written down rather than assumed:**
the service-layer work is **not a phase**, it is how each phase is built. The
proposal's "VERY HIGH" Stages 2 and 3 are the right way to implement blueprint
phase 2; they are not a competing queue.

---

## 6. Stages 8 and 9 are §13 decisions, not architecture decisions

This is the governance point and it is not negotiable by an agent.

`DEFINING-STATEMENTS.md` §13 reserves to Tasos, explicitly, *"the steps staff
or customers must follow, and changes to who may take an operational action"*.

An AI agent that can call `extend_reservation`, `record_payment`,
`issue_refund`, `create_invoice` or `cancel_reservation` **changes who may take
an operational action.** That is §13's list, almost word for word.

So:

- **Accepting this architecture is not approval of any write capability.** §13
  says approval "must identify the proposal closely enough that there is no
  reasonable doubt what customer or operational effect Tasos accepted", and
  that "a general instruction to carry on" is not approval.
- **Each write tool needs its own approval**, at the point it is built, naming
  what it can do and to whom.
- **Stages 1 to 7 need none of that.** Read-only tools over authenticated
  services change nothing about who may act. The line falls exactly where the
  proposal puts Stage 8, which is to its credit — it just needs naming as a
  governance boundary rather than a technical milestone.

---

## 7. The commercial section is a different question, and bigger

Section 12 — "ask your rental business anything" as a product feature —
presumes Anadyon is commercialised, which blueprint §1.8 treats as an open
question ("build or buy the counter?") against eleven benchmarked systems.
Worth keeping as a note; not a reason to shape the architecture today, and
§7's "build for the owned fleet" rule already covers how to behave at that kind
of crossroads: take the option that keeps the door open, build nothing
speculative.

---

## 8. What should actually happen next

In order, and none of it is MCP work:

1. **Tasos answers the payments question** (§3.2): is Viva/myPOS/Epsilon a plan
   or a mistake? It changes a quarter of work either way.
2. **Build `availabilityService`** on §7's grounds, consolidating the seven
   modules in §2.2 behind one answer. Worth doing with no AI in sight.
3. **Introduce an explicit actor in the service layer** (§4.1), starting by
   collapsing the five copies of the role-header check. This is the
   prerequisite for *any* second interface, and it improves the first one.
4. **Thin `app/api/quote/route.ts`** — 864 lines, and the pricing it orchestrates
   already lives in a module.
5. **Write the service-layer convention into the blueprint** as part of phase 2
   rather than as a competing stage list — once Tasos says who holds the
   architect's role for it.
6. **Only then** consider a read-only MCP, and treat the first write tool as a
   §13 submission rather than a sprint item.

**What should not happen now:** building an MCP server, renaming `lib/`, or
starting Stage 5's payment work before question 1 is answered.

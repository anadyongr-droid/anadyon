@AGENTS.md
@DEFINING-STATEMENTS.md

<!--
Both files load, every session, for every agent. That is deliberate and it is
the whole point.

Until 20 September 2026 only AGENTS.md loaded. DEFINING-STATEMENTS.md held the
project's thirteen binding principles and was read only when an agent happened
to go looking — so §13, written the day before to require Tasos's approval for
changes to the operating model, did not reach the agents it was written to
constrain. Five others (§1, §2, §3, §5, §6) were cited nowhere in the loaded
file at all, among them "Pricing is calculated in one place" and "Customer data
is not exposed by default".

A principle an agent cannot see is not a principle. Tasos's instruction on 20
September was that all of them bind, non-stop, without exceptions, so all of
them load. The combined cost is about 34 KB of context, which is the cheapest
part of any session.

lib/governanceWiring.test.ts fails the build if either import is removed, if a
principle is deleted or renumbered, or if AGENTS.md cites a section that does
not exist.
-->

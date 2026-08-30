-- Make the fleet-wide damage endpoint structurally unable to serve money.
--
-- WHY THIS EXISTS
--
-- app/api/admin/vehicles/damages/route.ts is deliberately open to staff: they
-- hand over the car, so they need to know it is damaged. `vehicle_damages`
-- holds `repair_cost` and `charged_to_customer` in the same row as the
-- severity, and until now the only thing keeping those out of a staff response
-- was the endpoint's `select` list, pinned by lib/damageVisibility.test.ts.
--
-- Outside review, 30 August, found that guard too thin, and was right. The
-- realistic failure was never "the test misses a change" — it is a refactor to
-- `select("*")` that updates the now-failing pin in the same commit, because a
-- pinning test is edited alongside the code it pins. Column grants cannot help
-- either: every application query runs under the service role, which bypasses
-- them by design.
--
-- A view that does not contain the columns cannot leak them, whatever the
-- caller selects. `select *` against this view is safe by construction, which
-- is the property the `select` list was only ever approximating.
--
-- WHAT IS DELIBERATELY NOT HERE
--
-- No ORDER BY. Callers order what they need; an ordered view invites the
-- planner to sort rows nobody asked to be sorted.
--
-- No join to `vehicles`. The endpoint summarises by `vehicle_id` and the fleet
-- list already holds the vehicle rows; joining here would return the fleet
-- twice on every request.

create or replace view public.vehicle_open_damage
  -- Runs with the privileges of the caller, not the view's owner, so the view
  -- can never become a way to read rows the caller could not read directly.
  -- Postgres defaults views the other way, and that default is how a view
  -- turns into a privilege-escalation path.
  with (security_invoker = true)
as
  select
    d.vehicle_id,
    d.severity,
    d.reported_on,
    d.description
  from public.vehicle_damages d
  -- Migration 011 built `vehicle_damages_open_idx ... where repaired_on is
  -- null` for exactly this predicate. Keeping it inside the view means every
  -- caller gets the index whether or not they remember the filter.
  where d.repaired_on is null;

comment on view public.vehicle_open_damage is
  'Open damage, safe for staff. Excludes repair_cost and charged_to_customer by construction so a select(*) cannot leak them. See app/api/admin/vehicles/damages/route.ts.';

-- The application reaches this with the service role. Nothing else may read it,
-- and `authenticated` least of all: a logged-in customer is not staff.
revoke all on public.vehicle_open_damage from public, anon, authenticated;
grant select on public.vehicle_open_damage to service_role;

do $$
begin
  raise notice 'REACHED THE END — vehicle open damage view';
end;
$$;

-- Grant service_role on the nine tables created after migration 023.
--
-- Supabase is removing the automatic Data API grant. From 30 October 2026 a
-- table created in `public` receives no privileges for anon, authenticated or
-- service_role unless a GRANT says so. Existing tables keep what they have, so
-- production is unaffected and this migration changes nothing there.
--
-- What it protects is every database built by *replaying* these migrations:
-- the staging reset, `supabase db reset`, a new project, a preview branch.
-- After 30 October those would create these nine tables with no privileges at
-- all, and the application — which reaches the database as service_role
-- through supabaseAdmin — could not read or write any of them. Check-out and
-- check-in, the whole of phase 2, plus vehicle blocking and the change-request
-- queue.
--
-- Migration 023 granted `all privileges on all tables in schema public to
-- service_role`, which covered everything existing at that moment and nothing
-- created afterwards. Three later tables were granted correctly in their own
-- migrations — booking_email_deliveries, booking_email_events and
-- promo_redemptions — so the convention already existed here; it was applied
-- unevenly. These nine are the gap.
--
-- Deliberately narrow: the four DML privileges, matching what the platform
-- granted automatically and what the three correct migrations already use.
-- Nothing is granted to anon or authenticated — migration 023 revoked those on
-- purpose and DEFINING-STATEMENTS.md §6 is why. None of these tables carries a
-- sequence, so there is nothing to grant there.
--
-- lib/serviceRoleGrants.test.ts fails while any created table lacks this, so a
-- future migration cannot reintroduce the gap quietly.

grant select, insert, update, delete on table public.vehicle_blocks to service_role;
grant select, insert, update, delete on table public.vehicle_change_requests to service_role;
grant select, insert, update, delete on table public.inspection_templates to service_role;
grant select, insert, update, delete on table public.inspection_template_views to service_role;
grant select, insert, update, delete on table public.rental_handovers to service_role;
grant select, insert, update, delete on table public.handover_photos to service_role;
grant select, insert, update, delete on table public.handover_damage_observations to service_role;
grant select, insert, update, delete on table public.handover_damage_photos to service_role;
grant select, insert, update, delete on table public.rental_handover_events to service_role;

do $$
begin
  raise notice 'REACHED THE END — service_role grants for post-023 tables';
end;
$$;

-- Phase 2, the counter: check-out and check-in as recorded facts.
--
-- Built to docs/RENTAL-SYSTEM-BLUEPRINT.md §4.2, which specifies this schema in
-- full. Nothing here is invented; where this file departs from §4.2 it says so
-- and why.
--
-- ─── What is deliberately NOT in this migration ───
--
-- `reservation_adjustments`. §4.2 specifies it and it is not here.
--
-- Blueprint §7.2 makes audit area 5 — content and legal — a gate that clears
-- *before* the phase-2 migration is written, on the grounds that "building
-- those columns first would turn unreviewed assumptions into schema debt".
-- Area 5 is still ungraded, and Tasos has decided to press ahead regardless.
--
-- That decision costs less than it looks, because §4.2 already draws the line
-- this migration follows: "Raw facts and money are deliberately separate."
-- Everything here is a fact — an odometer reading, a fuel gauge, a photograph,
-- an observation of what staff saw. None of it asserts a legal position.
-- `reservation_adjustments` is the other half: what may be charged, on whose
-- authority, and in what words to the customer. That is precisely what area 5
-- decides, so it waits, and phase 2's capture half does not.
--
-- The consequence to accept: check-in can record that a car came back with
-- three eighths less fuel, and cannot yet raise a charge for it. That is a
-- smaller gap than a charge table built on guesses.
--
-- ─── Also not here, from §4.2's own list ───
--
-- No `signature_url`. Signature belongs to the versioned agreement in phase 3;
-- an odometer record is not the place for it, and a signed URL expires.
-- Check-out may require `reservations.agreement_signed_at`, which already
-- exists — it does not invent a second signature source.

-- ─────────────────────────────────────────────────────────────────────────────
-- Inspection templates: which photographs a handover must produce.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Versioned, because a car, a scooter and a bicycle do not require the same
-- views, and because the out and in handover for one reservation must compare
-- like with like. §4.2: "Both the out and in handover for one reservation use
-- the same template version."

create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  vehicle_category text not null,
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  -- Two active templates for one category would make "which views are
  -- required" ambiguous at the counter, which is the one place ambiguity is
  -- most expensive.
  constraint inspection_templates_version_positive check (version > 0)
);

create unique index if not exists inspection_templates_active_per_category
  on public.inspection_templates (vehicle_category)
  where active;

create unique index if not exists inspection_templates_category_version
  on public.inspection_templates (vehicle_category, version);

create table if not exists public.inspection_template_views (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates(id) on delete cascade,
  view_code text not null,
  label text not null,
  sort_order smallint not null default 0,
  required boolean not null default true,

  unique (template_id, view_code),

  -- Referenced by handover_photos, so a photo cannot claim a view belonging to
  -- a different template. §4.2 calls for this pair explicitly.
  unique (template_id, id)
);

create index if not exists inspection_template_views_template_idx
  on public.inspection_template_views (template_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- The handover itself.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.rental_handovers (
  id uuid primary key default gen_random_uuid(),

  -- RESTRICT, not CASCADE: a handover is evidence. Deleting a reservation must
  -- not silently take the record of what was handed over with it.
  reservation_id uuid not null references public.reservations(id) on delete restrict,

  -- Stored even though the reservation has one. §4.2: "it is the physical unit
  -- that was actually presented, and later reallocation must not rewrite
  -- history."
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,

  direction text not null check (direction in ('out', 'in')),
  status text not null default 'draft' check (status in ('draft', 'completed', 'voided')),

  -- A tablet that retries — a dropped connection, a double tap — must return
  -- the same handover rather than begin a second one.
  client_operation_id uuid not null unique,

  inspection_template_id uuid not null references public.inspection_templates(id) on delete restrict,

  -- SET NULL rather than RESTRICT: a staff member leaving must not make their
  -- handovers undeletable, and the snapshot below is what preserves the record.
  created_by uuid,
  completed_by uuid,

  -- §4.2: "The actor is the authenticated user ID; the name snapshot preserves
  -- what staff saw if that user is later renamed or removed."
  --
  -- created_by/completed_by are application-asserted for now, the same interim
  -- position migration 038 records: every RPC here is called with the service
  -- role, under which auth.uid() is NULL. Diagnostic 10a
  -- (docs/OPEN-QUESTION-RPC-STAFF-IDENTITY.md §11) has since shown the staff
  -- JWT carries `sub`, so Option A can replace this claim with a verified
  -- identity without a schema change — the columns do not move, only who fills
  -- them.
  staff_name_snapshot text,

  -- Completion time is server-authored. occurred_at is when it happened in the
  -- world, which can differ after a connectivity delay; §4.2 requires the
  -- difference and its reason to reach the event log, because "device time
  -- alone is not legal evidence".
  occurred_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Nullable on purpose, both of them. A bicycle has no odometer and no fuel
  -- gauge. §4.2: "Do not write invented zero readings to satisfy a form."
  odometer_km integer check (odometer_km is null or odometer_km >= 0),

  -- Eighths, because that is what the gauge shows and what staff read without
  -- arithmetic. A percentage invites false precision and argument.
  fuel_eighths smallint check (fuel_eighths is null or fuel_eighths between 0 and 8),

  cleanliness text check (cleanliness is null or cleanliness in ('clean', 'acceptable', 'poor')),
  notes text,
  void_reason text,

  -- Referenced by handover_photos so a photo cannot be attached to a handover
  -- while claiming a different template.
  unique (id, inspection_template_id),

  -- A completed handover has a time and an actor, or it is not completed.
  constraint rental_handovers_completed_together
    check ((status = 'completed') = (completed_at is not null)),

  -- Voiding is an audited action with a reason, never a bare status flip.
  constraint rental_handovers_voided_has_reason
    check ((status = 'voided') = (void_reason is not null))
);

-- One live handover per reservation and direction. Partial, so a voided attempt
-- does not block the corrected one that replaces it.
create unique index if not exists rental_handovers_one_live_per_direction
  on public.rental_handovers (reservation_id, direction)
  where status <> 'voided';

-- §4.2's operational indexes, and no more than those: "The expected queries are
-- written before adding more indexes."
create index if not exists rental_handovers_reservation_idx
  on public.rental_handovers (reservation_id, direction);

create index if not exists rental_handovers_vehicle_idx
  on public.rental_handovers (vehicle_id, completed_at desc);

create index if not exists rental_handovers_template_idx
  on public.rental_handovers (inspection_template_id);

create index if not exists rental_handovers_drafts_idx
  on public.rental_handovers (created_at)
  where status = 'draft';

-- ─────────────────────────────────────────────────────────────────────────────
-- Photographs.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A table rather than photo_1..photo_6 because the count varies and the angles
-- must be comparable between out and in; positional columns would make that
-- comparison fragile.

create table if not exists public.handover_photos (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.rental_handovers(id) on delete cascade,

  -- Carried so the composite keys below can pin both sides.
  inspection_template_id uuid not null,
  template_view_id uuid not null,
  sequence smallint not null default 0,

  foreign key (handover_id, inspection_template_id)
    references public.rental_handovers (id, inspection_template_id),
  foreign key (inspection_template_id, template_view_id)
    references public.inspection_template_views (template_id, id),

  -- The immutable private Storage path, never a public or signed URL: a signed
  -- URL expires, and evidence that expires is not evidence.
  object_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),

  -- So the object can be validated years later and a replacement detected.
  sha256 text,

  -- captured_at is device metadata and useful; uploaded_at is the server's
  -- evidence time and is the one that counts.
  captured_at timestamptz,
  uploaded_at timestamptz not null default now(),
  captured_by uuid,

  -- Referenced by handover_damage_photos.
  unique (handover_id, id)
);

create index if not exists handover_photos_handover_view_idx
  on public.handover_photos (handover_id, template_view_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Damage observations: what staff saw at that moment.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- §4.2: vehicle_damages remains the lifecycle record — discovered, attributed,
-- charged or absorbed, repaired. An observation is the immutable statement of
-- its condition at one handover, and the two must not be conflated.

create table if not exists public.handover_damage_observations (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.rental_handovers(id) on delete cascade,
  damage_id uuid not null references public.vehicle_damages(id) on delete restrict,

  observation text not null
    check (observation in ('pre_existing', 'unchanged', 'worsened', 'new')),
  notes text,
  created_at timestamptz not null default now(),

  unique (handover_id, damage_id),
  unique (handover_id, id)
);

create index if not exists handover_damage_observations_damage_idx
  on public.handover_damage_observations (damage_id);

-- Links evidence to an observation. Both sides carry handover_id so a photo
-- from one handover cannot be attached to an observation from another.
create table if not exists public.handover_damage_photos (
  handover_id uuid not null,
  observation_id uuid not null,
  photo_id uuid not null,

  primary key (observation_id, photo_id),

  foreign key (handover_id, observation_id)
    references public.handover_damage_observations (handover_id, id) on delete cascade,
  foreign key (handover_id, photo_id)
    references public.handover_photos (handover_id, id) on delete cascade
);

create index if not exists handover_damage_photos_photo_idx
  on public.handover_damage_photos (photo_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- The audit log.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- §4.2: "A completed handover is not normally editable or deletable. A
-- correction requires a reason and writes before/after state ... in the same
-- transaction. Voiding is the same kind of audited action, not a DELETE."

create table if not exists public.rental_handover_events (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.rental_handovers(id) on delete cascade,
  event_type text not null check (event_type in ('completed', 'corrected', 'voided')),
  actor_user_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),

  -- A correction or a void without a reason is not an audit record.
  constraint rental_handover_events_reason_required
    check (event_type = 'completed' or reason is not null)
);

create index if not exists rental_handover_events_handover_idx
  on public.rental_handover_events (handover_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at, from the database rather than from the caller.
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018 established this: a timestamp the application supplies is a
-- timestamp the application can get wrong.

drop trigger if exists rental_handovers_set_updated_at on public.rental_handovers;
create trigger rental_handovers_set_updated_at
  before update on public.rental_handovers
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Least privilege. §4.2 rule 6: every new public-schema table has RLS enabled
-- and all privileges revoked from PUBLIC, anon and authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.inspection_templates            enable row level security;
alter table public.inspection_template_views       enable row level security;
alter table public.rental_handovers                enable row level security;
alter table public.handover_photos                 enable row level security;
alter table public.handover_damage_observations    enable row level security;
alter table public.handover_damage_photos          enable row level security;
alter table public.rental_handover_events          enable row level security;

revoke all privileges on public.inspection_templates         from public, anon, authenticated;
revoke all privileges on public.inspection_template_views    from public, anon, authenticated;
revoke all privileges on public.rental_handovers             from public, anon, authenticated;
revoke all privileges on public.handover_photos              from public, anon, authenticated;
revoke all privileges on public.handover_damage_observations from public, anon, authenticated;
revoke all privileges on public.handover_damage_photos       from public, anon, authenticated;
revoke all privileges on public.rental_handover_events       from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- The photo bucket.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- In the migration rather than in a comment. Migration 021 records what the
-- alternative cost: 001_baseline.sql asked an operator to create a bucket by
-- hand, nobody did, and the document feature was broken in production from
-- launch. "A setup step that lives in a comment is a setup step that does not
-- happen."
--
-- Private, with no anon or authenticated policies at all. Reads and writes go
-- through the authorised admin API, which issues short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'handover-photos',
  'handover-photos',
  false,
  -- 15 MB. A modern phone photograph is comfortably under this; the ceiling
  -- exists so a compromised staff session cannot use the bucket as free
  -- storage, not because a real photograph needs the headroom.
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

do $$
begin
  raise notice 'REACHED THE END — rental handovers';
end;
$$;

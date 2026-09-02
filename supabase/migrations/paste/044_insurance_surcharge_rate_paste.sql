-- The young-driver insurance surcharge, as a rate row.
--
-- Requested by Tasos on 2 September 2026: €5 per day for every driver under 23.
-- docs/DRIVER-AGE-MARKET.md §4 records what the rest of the market charges for
-- the same thing — €8 to €30 a day, most commonly €10 to €20 — so this sits
-- deliberately at the gentle end of the range.
--
-- ─── Why this is a row and not a constant ───
--
-- The amount is an insurance cost, and insurance costs are renegotiated. Put it
-- in the code and changing it is a pull request, a review and a deployment;
-- put it here and the office changes it on the Rates screen the same afternoon
-- the broker's letter arrives. Every other per-day charge on this system —
-- the damage waiver, the seats, the additional driver — already works this way,
-- and the surcharge is not special enough to be the exception.
--
-- ─── What this migration deliberately does not do ───
--
-- It does not add a column, a constraint or a policy. `extras_config` has no
-- CHECK on `key`, is readable by the public role through `public_read_extras`
-- and writable by staff through the admin rates route, so a new row is the
-- whole change. The rule about *who* pays it lives in lib/rentalPolicy.ts,
-- because it is a policy about people rather than a fact about money, and it is
-- enforced in the quote route where the driver's age is already known.
--
-- The surcharge is deliberately NOT part of `ExtrasSelection`. It is derived
-- from the date of birth the customer supplied, never sent as a quantity — a
-- fee the payer can set to zero is not a fee. See lib/pricing.ts
-- `calcInsuranceSurchargeLine` for the reasoning in full.

insert into public.extras_config (key, label, daily_rate, enabled)
values ('insurance_surcharge', 'Insurance surcharge (drivers under 23)', 5.00, true)
-- Idempotent, and it refreshes the label and rate if this migration is replayed
-- after the row already exists. `enabled` is deliberately NOT overwritten on
-- conflict: if the office has switched the charge off, replaying a migration
-- must not switch it back on behind their backs.
on conflict (key) do update set
  label = excluded.label,
  daily_rate = excluded.daily_rate,
  updated_at = now();

do $$
begin
  raise notice 'REACHED THE END — insurance surcharge rate';
end;
$$;

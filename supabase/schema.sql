-- Anadyon Rentals — Supabase schema
-- Run this in the Supabase SQL editor

-- Vehicles
create table if not exists vehicles (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  category text not null check (category in ('car', 'motorbike', 'bike')),
  pricing_group text not null check (pricing_group in ('car_a', 'car_b', 'motorbike_a', 'motorbike_b', 'bike')),
  status text not null default 'available' check (status in ('available', 'maintenance', 'retired')),
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Customers
create table if not exists customers (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  phone text,
  nationality text,
  licence_number text,
  notes text,
  created_at timestamptz default now()
);

-- Reservations
create table if not exists reservations (
  id uuid default gen_random_uuid() primary key,
  vehicle_id uuid references vehicles(id) not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_nationality text,
  pickup_date date not null,
  pickup_time text not null default '09:00',
  return_date date not null,
  return_time text not null default '09:00',
  pickup_location text,
  dropoff_location text,
  rental_days int not null,
  daily_rate numeric(10,2) not null,
  vehicle_subtotal numeric(10,2) not null,
  -- extras
  gps boolean default false,
  baby_seat int default 0,
  child_seat int default 0,
  fdw boolean default false,
  additional_drivers int default 0,
  extras_subtotal numeric(10,2) default 0,
  -- totals
  total numeric(10,2) not null,
  deposit numeric(10,2) not null,
  balance_due numeric(10,2) not null,
  -- meta
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'active', 'returned', 'cancelled')),
  notes text,
  source text default 'admin' check (source in ('admin', 'website')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seasonal rates
create table if not exists rates (
  id uuid default gen_random_uuid() primary key,
  pricing_group text not null check (pricing_group in ('car_a', 'car_b', 'motorbike_a', 'motorbike_b', 'bike')),
  season_name text not null,
  season_months int[] not null,
  rate_1_2 numeric(10,2) not null,
  rate_3_6 numeric(10,2) not null,
  rate_7plus numeric(10,2) not null,
  updated_at timestamptz default now(),
  unique (pricing_group, season_name)
);

-- Extras configuration
create table if not exists extras_config (
  id uuid default gen_random_uuid() primary key,
  key text not null unique,
  label text not null,
  daily_rate numeric(10,2) not null,
  enabled boolean default true,
  updated_at timestamptz default now()
);

-- ─── Seed: Vehicles ───────────────────────────────────────────────────────────

insert into vehicles (name, category, pricing_group, sort_order) values
  -- Cars (Cat B)
  ('Hyundai i20 #1',   'car', 'car_b', 1),
  ('Hyundai i20 #2',   'car', 'car_b', 2),
  ('Hyundai i20 #3',   'car', 'car_b', 3),
  -- Cars (Cat A)
  ('Nissan Micra #1',  'car', 'car_a', 4),
  ('Nissan Micra #2',  'car', 'car_a', 5),
  -- Scooters Cat A (50cc)
  ('Kymco 50cc #1',    'motorbike', 'motorbike_a', 10),
  ('Kymco 50cc #2',    'motorbike', 'motorbike_a', 11),
  ('Kymco 50cc #3',    'motorbike', 'motorbike_a', 12),
  ('Kymco 50cc #4',    'motorbike', 'motorbike_a', 13),
  ('Kymco 50cc #5',    'motorbike', 'motorbike_a', 14),
  ('Kymco 50cc #6',    'motorbike', 'motorbike_a', 15),
  -- Scooters Cat B (125cc+)
  ('Kymco 125cc #1',   'motorbike', 'motorbike_b', 20),
  ('Kymco 125cc #2',   'motorbike', 'motorbike_b', 21),
  ('Kymco 125cc #3',   'motorbike', 'motorbike_b', 22),
  ('Kymco 125cc #4',   'motorbike', 'motorbike_b', 23),
  ('Piaggio Liberty 50',  'motorbike', 'motorbike_a', 24),
  ('Piaggio Liberty 150', 'motorbike', 'motorbike_b', 25),
  -- Bikes
  ('Cinzia Retro Women', 'bike', 'bike', 30),
  ('Cinzia Retro Men',   'bike', 'bike', 31),
  ('Scott Sportster 50', 'bike', 'bike', 32),
  ('Ideal Crossmo',      'bike', 'bike', 33),
  ('Kona Lanai',         'bike', 'bike', 34),
  ('KTM Manhattan XC',   'bike', 'bike', 35),
  ('Specialized Ariel',  'bike', 'bike', 36);

-- ─── Seed: Seasonal Rates ─────────────────────────────────────────────────────

insert into rates (pricing_group, season_name, season_months, rate_1_2, rate_3_6, rate_7plus) values
  -- Car Cat A
  ('car_a', 'May',        '{5}',                  27.00, 23.80, 20.00),
  ('car_a', 'June',       '{6}',                  28.00, 21.90, 19.00),
  ('car_a', 'July',       '{7}',                  37.00, 35.40, 33.50),
  ('car_a', 'August',     '{8}',                  52.00, 49.40, 45.60),
  ('car_a', 'September',  '{9}',                  32.00, 22.60, 19.00),
  ('car_a', 'Oct–Apr',    '{10,11,12,1,2,3,4}',   24.00, 21.30, 17.10),
  -- Car Cat B
  ('car_b', 'May',        '{5}',                  29.00, 25.80, 22.00),
  ('car_b', 'June',       '{6}',                  32.00, 29.30, 21.00),
  ('car_b', 'July',       '{7}',                  39.00, 37.00, 35.80),
  ('car_b', 'August',     '{8}',                  58.00, 54.60, 50.40),
  ('car_b', 'September',  '{9}',                  38.00, 26.00, 21.40),
  ('car_b', 'Oct–Apr',    '{10,11,12,1,2,3,4}',   32.00, 29.80, 18.00),
  -- Motorbike Cat A (50cc)
  ('motorbike_a', 'May',       '{5}',               11.00, 10.50,  9.50),
  ('motorbike_a', 'June',      '{6}',               12.00, 10.60,  9.50),
  ('motorbike_a', 'July',      '{7}',               20.00, 17.80, 17.40),
  ('motorbike_a', 'August',    '{8}',               25.00, 23.00, 22.00),
  ('motorbike_a', 'September', '{9}',               18.00, 17.00, 14.50),
  ('motorbike_a', 'Oct–Apr',   '{10,11,12,1,2,3,4}',12.00, 10.80,  9.50),
  -- Motorbike Cat B (100cc+)
  ('motorbike_b', 'May',       '{5}',               12.50, 12.00, 11.00),
  ('motorbike_b', 'June',      '{6}',               16.00, 14.40, 12.30),
  ('motorbike_b', 'July',      '{7}',               23.00, 22.70, 20.00),
  ('motorbike_b', 'August',    '{8}',               28.00, 26.00, 24.00),
  ('motorbike_b', 'September', '{9}',               18.50, 17.50, 15.00),
  ('motorbike_b', 'Oct–Apr',   '{10,11,12,1,2,3,4}',16.00, 14.40, 12.30),
  -- Bike (flat)
  ('bike', 'May',       '{5}',                9.00, 7.00, 7.00),
  ('bike', 'June',      '{6}',                9.00, 7.00, 7.00),
  ('bike', 'July',      '{7}',                9.00, 7.00, 7.00),
  ('bike', 'August',    '{8}',                9.00, 7.00, 7.00),
  ('bike', 'September', '{9}',                9.00, 7.00, 7.00),
  ('bike', 'Oct–Apr',   '{10,11,12,1,2,3,4}', 9.00, 7.00, 7.00);

-- ─── Seed: Extras ─────────────────────────────────────────────────────────────

insert into extras_config (key, label, daily_rate, enabled) values
  ('gps',                'GPS Navigation',           5.00, true),
  ('baby_seat',          'Baby Seat (0–9 months)',   3.00, true),
  ('child_seat',         'Child Seat (9m+)',         3.00, true),
  ('fdw',                'Full Damage Waiver (FDW)', 5.00, true),
  ('additional_drivers', 'Additional Driver',        2.50, true);

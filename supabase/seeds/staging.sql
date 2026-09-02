-- Synthetic staging fixtures only. Never replace this with a production dump.
-- IDs are deterministic so the script is safe to run more than once.

insert into public.rates
  (pricing_group, season_name, season_months, rate_1_2, rate_3_6, rate_7plus)
values
  ('car_a', 'Low',  array[1,2,3,4,10,11,12], 42, 36, 31),
  ('car_a', 'Mid',  array[5,6,9],              49, 43, 38),
  ('car_a', 'High', array[7,8],                58, 52, 46),
  ('car_b', 'Low',  array[1,2,3,4,10,11,12], 48, 42, 37),
  ('car_b', 'Mid',  array[5,6,9],              57, 50, 45),
  ('car_b', 'High', array[7,8],                68, 61, 55),
  ('car_c', 'Low',  array[1,2,3,4,10,11,12], 55, 49, 44),
  ('car_c', 'Mid',  array[5,6,9],              66, 59, 53),
  ('car_c', 'High', array[7,8],                79, 71, 64),
  ('motorbike_a', 'Low',  array[1,2,3,4,10,11,12], 24, 21, 18),
  ('motorbike_a', 'Mid',  array[5,6,9],              29, 26, 23),
  ('motorbike_a', 'High', array[7,8],                35, 31, 28),
  ('motorbike_b', 'Low',  array[1,2,3,4,10,11,12], 31, 28, 25),
  ('motorbike_b', 'Mid',  array[5,6,9],              38, 34, 30),
  ('motorbike_b', 'High', array[7,8],                45, 41, 36),
  ('bike', 'Low',  array[1,2,3,4,10,11,12], 10, 9, 8),
  ('bike', 'Mid',  array[5,6,9],              12, 11, 10),
  ('bike', 'High', array[7,8],                15, 13, 12)
on conflict (pricing_group, season_name) do update set
  season_months = excluded.season_months,
  rate_1_2 = excluded.rate_1_2,
  rate_3_6 = excluded.rate_3_6,
  rate_7plus = excluded.rate_7plus,
  updated_at = now();

insert into public.extras_config (key, label, daily_rate, enabled)
values
  ('fdw', 'Full damage waiver', 12, true),
  ('baby_seat', 'Baby seat', 4, true),
  ('child_seat', 'Child seat', 4, true),
  ('additional_drivers', 'Additional driver', 5, true),
  ('insurance_surcharge', 'Insurance surcharge (drivers under 23)', 5, true)
on conflict (key) do update set
  label = excluded.label,
  daily_rate = excluded.daily_rate,
  enabled = excluded.enabled,
  updated_at = now();

insert into public.vehicles
  (id, name, category, pricing_group, plate, make, status, sort_order, transmission, turnaround_minutes, odometer_km, vehicle_notes)
values
  ('10000000-0000-4000-8000-000000000001', 'STAGING Fiat Panda 01', 'car', 'car_a', 'ZZZ-1001', 'Fiat', 'available', 1, 'Manual', 120, 41001, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000002', 'STAGING Fiat Panda 02', 'car', 'car_a', 'ZZZ-1002', 'Fiat', 'available', 2, 'Manual', 120, 42002, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000003', 'STAGING Nissan Micra 03', 'car', 'car_a', 'ZZZ-1003', 'Nissan', 'available', 3, 'Manual', 120, 43003, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000004', 'STAGING Nissan Micra 04', 'car', 'car_a', 'ZZZ-1004', 'Nissan', 'available', 4, 'Manual', 120, 44004, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000005', 'STAGING Hyundai Getz 05', 'car', 'car_a', 'ZZZ-1005', 'Hyundai', 'available', 5, 'Manual', 120, 45005, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000006', 'STAGING Hyundai Getz 06', 'car', 'car_a', 'ZZZ-1006', 'Hyundai', 'available', 6, 'Manual', 120, 46006, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000007', 'STAGING Hyundai i10 07', 'car', 'car_a', 'ZZZ-1007', 'Hyundai', 'available', 7, 'Manual', 120, 47007, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000008', 'STAGING Hyundai i10 08', 'car', 'car_a', 'ZZZ-1008', 'Hyundai', 'available', 8, 'Manual', 120, 48008, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000009', 'STAGING Kia Picanto 09', 'car', 'car_a', 'ZZZ-1009', 'Kia', 'available', 9, 'Manual', 120, 49009, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000010', 'STAGING Kia Picanto 10', 'car', 'car_a', 'ZZZ-1010', 'Kia', 'available', 10, 'Manual', 120, 50010, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000011', 'STAGING Toyota Aygo 11', 'car', 'car_a', 'ZZZ-1011', 'Toyota', 'available', 11, 'Manual', 120, 51011, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000012', 'STAGING Toyota Aygo 12', 'car', 'car_a', 'ZZZ-1012', 'Toyota', 'maintenance', 12, 'Manual', 120, 52012, 'Blocked in maintenance for staging checks'),
  ('10000000-0000-4000-8000-000000000013', 'STAGING Hyundai i20 13', 'car', 'car_b', 'ZZZ-2013', 'Hyundai', 'available', 13, 'Manual', 120, 53013, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000014', 'STAGING Hyundai i20 14', 'car', 'car_b', 'ZZZ-2014', 'Hyundai', 'available', 14, 'Manual', 120, 54014, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000015', 'STAGING Hyundai i20 15', 'car', 'car_b', 'ZZZ-2015', 'Hyundai', 'available', 15, 'Manual', 120, 55015, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000016', 'STAGING Ford Fiesta 16', 'car', 'car_b', 'ZZZ-2016', 'Ford', 'available', 16, 'Manual', 120, 56016, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000017', 'STAGING Ford Fiesta 17', 'car', 'car_b', 'ZZZ-2017', 'Ford', 'available', 17, 'Manual', 120, 57017, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000018', 'STAGING Opel Corsa 18', 'car', 'car_b', 'ZZZ-2018', 'Opel', 'available', 18, 'Manual', 120, 58018, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000019', 'STAGING Peugeot 107 Auto 19', 'car', 'car_c', 'ZZZ-3019', 'Peugeot', 'available', 19, 'Automatic', 120, 59019, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000020', 'STAGING Peugeot 107 Auto 20', 'car', 'car_c', 'ZZZ-3020', 'Peugeot', 'available', 20, 'Automatic', 120, 60020, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000021', 'STAGING Toyota Yaris Auto 21', 'car', 'car_c', 'ZZZ-3021', 'Toyota', 'available', 21, 'Automatic', 120, 61021, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000022', 'STAGING Kymco 50 22', 'motorbike', 'motorbike_a', 'ZZZ-4022', 'Kymco', 'available', 22, 'Automatic', 60, 12022, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000023', 'STAGING Kymco 50 23', 'motorbike', 'motorbike_a', 'ZZZ-4023', 'Kymco', 'available', 23, 'Automatic', 60, 13023, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000024', 'STAGING Kymco 50 24', 'motorbike', 'motorbike_a', 'ZZZ-4024', 'Kymco', 'available', 24, 'Automatic', 60, 14024, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000025', 'STAGING Kymco 50 25', 'motorbike', 'motorbike_a', 'ZZZ-4025', 'Kymco', 'available', 25, 'Automatic', 60, 15025, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000026', 'STAGING Kymco 125 26', 'motorbike', 'motorbike_b', 'ZZZ-5026', 'Kymco', 'available', 26, 'Automatic', 60, 16026, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000027', 'STAGING Kymco 125 27', 'motorbike', 'motorbike_b', 'ZZZ-5027', 'Kymco', 'available', 27, 'Automatic', 60, 17027, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000028', 'STAGING City Bicycle 28', 'bike', 'bike', null, 'Synthetic', 'available', 28, null, 30, 8028, 'Synthetic staging fixture'),
  ('10000000-0000-4000-8000-000000000029', 'STAGING E-Bicycle 29', 'bike', 'bike', null, 'Synthetic', 'available', 29, null, 30, 9029, 'Synthetic staging fixture')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  pricing_group = excluded.pricing_group,
  plate = excluded.plate,
  make = excluded.make,
  status = excluded.status,
  sort_order = excluded.sort_order,
  transmission = excluded.transmission,
  turnaround_minutes = excluded.turnaround_minutes,
  odometer_km = excluded.odometer_km,
  vehicle_notes = excluded.vehicle_notes;

insert into public.customers
  (id, title, first_name, last_name, full_name, name, email, phone, nationality, dob, address, city, postal_code, country, passport_number, driving_licence_number, notes)
values
  ('20000000-0000-4000-8000-000000000001', 'Mr', 'Alex', 'Example', 'Alex Example', 'Alex Example', 'alex@example.invalid', '+300000000001', 'Test', '1990-01-15', '1 Synthetic Street', 'Testville', '00001', 'Greece', 'TEST-PASS-001', 'TEST-LIC-001', 'Synthetic staging fixture — not a real person'),
  ('20000000-0000-4000-8000-000000000002', 'Ms', 'Bella', 'Example', 'Bella Example', 'Bella Example', 'bella@example.invalid', '+300000000002', 'Test', '1985-05-20', '2 Synthetic Street', 'Testville', '00002', 'Greece', 'TEST-PASS-002', 'TEST-LIC-002', 'Synthetic staging fixture — not a real person'),
  ('20000000-0000-4000-8000-000000000003', 'Mx', 'Casey', 'Example', 'Casey Example', 'Casey Example', 'casey@example.invalid', '+300000000003', 'Test', '1995-09-10', '3 Synthetic Street', 'Testville', '00003', 'Greece', 'TEST-PASS-003', 'TEST-LIC-003', 'Synthetic staging fixture — not a real person'),
  ('20000000-0000-4000-8000-000000000004', 'Mr', 'Drew', 'Example', 'Drew Example', 'Drew Example', 'drew@example.invalid', '+300000000004', 'Test', '1978-03-05', '4 Synthetic Street', 'Testville', '00004', 'Greece', 'TEST-PASS-004', 'TEST-LIC-004', 'Synthetic staging fixture — not a real person'),
  ('20000000-0000-4000-8000-000000000005', 'Ms', 'Erin', 'Example', 'Erin Example', 'Erin Example', 'erin@example.invalid', '+300000000005', 'Test', '2001-11-25', '5 Synthetic Street', 'Testville', '00005', 'Greece', 'TEST-PASS-005', 'TEST-LIC-005', 'Synthetic staging fixture — not a real person')
on conflict (id) do update set
  title = excluded.title,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  full_name = excluded.full_name,
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  nationality = excluded.nationality,
  dob = excluded.dob,
  address = excluded.address,
  city = excluded.city,
  postal_code = excluded.postal_code,
  country = excluded.country,
  passport_number = excluded.passport_number,
  driving_licence_number = excluded.driving_licence_number,
  notes = excluded.notes,
  updated_at = now();

insert into public.reservations
  (id, vehicle_id, customer_id, customer_name, customer_first_name, customer_last_name, customer_email, customer_phone, pickup_date, pickup_time, return_date, return_time, pickup_location, dropoff_location, rental_days, daily_rate, vehicle_subtotal, extras_subtotal, total, deposit, balance_due, status, source, notes)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Alex Example', 'Alex', 'Example', 'alex@example.invalid', '+300000000001', current_date - 1, '09:00', current_date + 2, '09:00', 'Zakynthos Airport', 'Anadyon Office', 3, 40, 120, 0, 120, 36, 84, 'active', 'admin', 'Synthetic current rental'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Bella Example', 'Bella', 'Example', 'bella@example.invalid', '+300000000002', current_date + 4, '10:00', current_date + 8, '10:00', 'Zakynthos Port', 'Zakynthos Airport', 4, 45, 180, 16, 196, 58.80, 137.20, 'confirmed', 'website', 'Synthetic future booking'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000003', 'Casey Example', 'Casey', 'Example', 'casey@example.invalid', '+300000000003', current_date + 4, '09:00', current_date + 10, '09:00', 'Anadyon Office', 'Anadyon Office', 6, 50, 300, 0, 300, 90, 210, 'pending', 'website', 'Synthetic allocator overlap'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000019', '20000000-0000-4000-8000-000000000004', 'Drew Example', 'Drew', 'Example', 'drew@example.invalid', '+300000000004', current_date + 12, '12:30', current_date + 15, '13:00', 'Zakynthos Airport', 'Zakynthos Airport', 4, 70, 280, 0, 280, 84, 196, 'confirmed', 'admin', 'Synthetic automatic booking'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000022', '20000000-0000-4000-8000-000000000005', 'Erin Example', 'Erin', 'Example', 'erin@example.invalid', '+300000000005', current_date + 2, '08:00', current_date + 5, '08:00', 'Anadyon Office', 'Anadyon Office', 3, 28, 84, 0, 84, 25.20, 58.80, 'confirmed', 'website', 'Synthetic scooter booking'),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000028', '20000000-0000-4000-8000-000000000001', 'Alex Example', 'Alex', 'Example', 'alex@example.invalid', '+300000000001', current_date - 20, '09:00', current_date - 17, '09:00', 'Anadyon Office', 'Anadyon Office', 3, 10, 30, 0, 30, 9, 21, 'returned', 'admin', 'Synthetic completed bicycle rental')
on conflict (id) do update set
  vehicle_id = excluded.vehicle_id,
  customer_id = excluded.customer_id,
  customer_name = excluded.customer_name,
  pickup_date = excluded.pickup_date,
  pickup_time = excluded.pickup_time,
  return_date = excluded.return_date,
  return_time = excluded.return_time,
  rental_days = excluded.rental_days,
  daily_rate = excluded.daily_rate,
  vehicle_subtotal = excluded.vehicle_subtotal,
  extras_subtotal = excluded.extras_subtotal,
  total = excluded.total,
  deposit = excluded.deposit,
  balance_due = excluded.balance_due,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

insert into public.vehicle_damages
  (id, vehicle_id, reservation_id, reported_on, description, severity, repaired_on, notes)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', null, current_date - 2, 'Synthetic open scratch on rear bumper', 'minor', null, 'Synthetic staging fixture — intentionally open')
on conflict (id) do update set
  vehicle_id = excluded.vehicle_id,
  reservation_id = excluded.reservation_id,
  reported_on = excluded.reported_on,
  description = excluded.description,
  severity = excluded.severity,
  repaired_on = excluded.repaired_on,
  notes = excluded.notes;

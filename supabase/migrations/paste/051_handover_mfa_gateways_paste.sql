-- 051: Preserve the MFA gates verified in production and staging on 16 Nov 2026.
-- Bodies exported read-only from production; CREATE OR REPLACE preserves grants.

CREATE OR REPLACE FUNCTION public.correct_handover(p_handover_id uuid, p_reason text, p_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid;
  role   text;
begin
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'verified MFA is required' USING errcode = 'AN403';
  END IF;

  role := public.handover_actor_role();

  -- Correcting a completed record is an administrator's act, not a counter one.
  -- Staff can void and record a new handover, which leaves both rows and both
  -- reasons in the log; a correction rewrites the observation in place.
  if role <> 'admin' then
    raise exception 'correcting a completed handover requires an administrator'
      using errcode = 'AN403';
  end if;

  return public.correct_handover_impl(
    p_handover_id, caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_reason, p_changes
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalise_check_in(p_handover_id uuid, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid;
  role   text;
begin
  -- Read defensively: Supabase's auth.uid() raises rather than returning NULL
  -- when the claims setting is present but empty, and a custom setting reverts
  -- to empty rather than to unset once a transaction that set it ends. See
  -- OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.2.
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'verified MFA is required' USING errcode = 'AN403';
  END IF;

  role := public.handover_actor_role();

  if role is null or role not in ('admin', 'staff') then
    raise exception 'caller is not staff' using errcode = 'AN403';
  end if;

  return public.finalise_check_in_impl(
    p_handover_id,
    caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_occurred_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalise_check_out(p_handover_id uuid, p_occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid;
  role   text;
begin
  -- Read defensively. Supabase's auth.uid() applies ::uuid to a JSON extraction,
  -- so a claims setting that is present but empty raises `invalid input syntax
  -- for type json` rather than returning NULL — and a custom setting reverts to
  -- empty, not to unset, once a transaction that set it ends, which is reachable
  -- on a pooled connection. A gateway that means to say "not staff" must not say
  -- "internal error" instead. See OPEN-QUESTION-RPC-STAFF-IDENTITY.md §13.2.
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'verified MFA is required' USING errcode = 'AN403';
  END IF;

  role := public.handover_actor_role();

  if role is null or role not in ('admin', 'staff') then
    raise exception 'caller is not staff' using errcode = 'AN403';
  end if;

  return public.finalise_check_out_impl(
    p_handover_id,
    caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_occurred_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.void_handover(p_handover_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller uuid;
  role   text;
begin
  begin
    caller := auth.uid();
  exception when others then
    caller := null;
  end;

  if caller is null then
    raise exception 'no caller identity' using errcode = 'AN401';
  end if;

  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'verified MFA is required' USING errcode = 'AN403';
  END IF;

  role := public.handover_actor_role();

  -- Staff may void. Getting the wrong car onto a handover is a counter mistake
  -- and the fix has to be available at the counter; the reason and the replaced
  -- record are what make it safe.
  if role is null or role not in ('admin', 'staff') then
    raise exception 'caller is not staff' using errcode = 'AN403';
  end if;

  return public.void_handover_impl(
    p_handover_id, caller,
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.email)
       from auth.users u where u.id = caller),
    p_reason
  );
end;
$function$
;

revoke all on function public.correct_handover(uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.correct_handover(uuid, text, jsonb) to authenticated;

revoke all on function public.finalise_check_in(uuid, timestamptz) from public, anon, service_role;
grant execute on function public.finalise_check_in(uuid, timestamptz) to authenticated;

revoke all on function public.finalise_check_out(uuid, timestamptz) from public, anon, service_role;
grant execute on function public.finalise_check_out(uuid, timestamptz) to authenticated;

revoke all on function public.void_handover(uuid, text) from public, anon, service_role;
grant execute on function public.void_handover(uuid, text) to authenticated;


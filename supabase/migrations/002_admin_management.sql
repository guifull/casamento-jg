create or replace function public.admin_save_invitation(
  p_invitation_id uuid,
  p_display_name text,
  p_phone_hash text,
  p_phone_encrypted text,
  p_guests jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  item jsonb;
  item_id uuid;
  item_name text;
  item_type text;
  item_order integer;
begin
  if length(trim(coalesce(p_display_name, ''))) < 2
     or length(coalesce(p_phone_hash, '')) <> 64
     or coalesce(p_phone_encrypted, '') = ''
     or jsonb_typeof(p_guests) <> 'array'
     or jsonb_array_length(p_guests) < 1
     or jsonb_array_length(p_guests) > 20 then
    raise exception 'invalid invitation data';
  end if;

  if p_invitation_id is null then
    insert into public.invitations (display_name) values (trim(p_display_name)) returning id into target_id;
    insert into public.invitation_contacts (invitation_id, phone_hash, phone_encrypted, is_primary)
    values (target_id, p_phone_hash, p_phone_encrypted, true);
  else
    target_id := p_invitation_id;
    update public.invitations set display_name = trim(p_display_name), updated_at = now() where id = target_id;
    if not found then raise exception 'invitation not found'; end if;
    update public.invitation_contacts
      set phone_hash = p_phone_hash, phone_encrypted = p_phone_encrypted
      where invitation_id = target_id and is_primary;
    if not found then
      insert into public.invitation_contacts (invitation_id, phone_hash, phone_encrypted, is_primary)
      values (target_id, p_phone_hash, p_phone_encrypted, true);
    end if;
  end if;

  for item in select * from jsonb_array_elements(p_guests)
  loop
    item_id := nullif(item->>'id', '')::uuid;
    item_name := trim(coalesce(item->>'name', ''));
    item_type := coalesce(item->>'type', 'guest');
    item_order := coalesce((item->>'displayOrder')::integer, 0);
    if length(item_name) < 2 or item_type not in ('primary', 'guest', 'child') then
      raise exception 'invalid guest data';
    end if;
    if item_id is null then
      insert into public.guests (invitation_id, full_name, guest_type, display_order)
      values (target_id, item_name, item_type, item_order);
    else
      update public.guests set full_name = item_name, guest_type = item_type,
        display_order = item_order, active = true, updated_at = now()
      where id = item_id and invitation_id = target_id;
      if not found then raise exception 'guest not found'; end if;
    end if;
  end loop;
  if p_invitation_id is not null then
    update public.guests
      set active = false, updated_at = now()
      where invitation_id = target_id
        and active
        and id not in (
          select (entry->>'id')::uuid
          from jsonb_array_elements(p_guests) entry
          where coalesce(entry->>'id', '') <> ''
        );
  end if;
  return target_id;
end;
$$;

revoke all on function public.admin_save_invitation(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_save_invitation(uuid, text, text, text, jsonb) to service_role;

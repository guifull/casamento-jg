create extension if not exists pgcrypto;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invitation_contacts (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  phone_hash text not null unique check (length(phone_hash) = 64),
  phone_encrypted text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  full_name text not null,
  guest_type text not null default 'guest' check (guest_type in ('primary', 'guest', 'child')),
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index guests_invitation_id_idx on public.guests(invitation_id);

create table public.rsvp_responses (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  attending boolean not null,
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision_number integer not null default 1
);

create table public.rsvp_submissions (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  request_id uuid not null unique,
  submitted_at timestamptz not null default now(),
  source text not null default 'website'
);

create table public.rsvp_submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.rsvp_submissions(id) on delete cascade,
  guest_id uuid not null references public.guests(id),
  attending boolean not null,
  unique (submission_id, guest_id)
);

create table public.rsvp_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.invitations enable row level security;
alter table public.invitation_contacts enable row level security;
alter table public.guests enable row level security;
alter table public.rsvp_responses enable row level security;
alter table public.rsvp_submissions enable row level security;
alter table public.rsvp_submission_items enable row level security;
alter table public.rsvp_rate_limits enable row level security;

create or replace function public.consume_rsvp_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.rsvp_rate_limits%rowtype;
begin
  insert into public.rsvp_rate_limits (key_hash, window_started_at, attempts)
  values (p_key_hash, now(), 1)
  on conflict (key_hash) do update
  set window_started_at = case
        when public.rsvp_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then now()
        else public.rsvp_rate_limits.window_started_at
      end,
      attempts = case
        when public.rsvp_rate_limits.window_started_at < now() - make_interval(secs => p_window_seconds) then 1
        else public.rsvp_rate_limits.attempts + 1
      end,
      updated_at = now()
  returning * into current_row;
  return current_row.attempts <= p_limit;
end;
$$;

create or replace function public.submit_rsvp_response(
  p_invitation_id uuid,
  p_items jsonb,
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_uuid uuid;
  item jsonb;
  item_guest_id uuid;
  item_attending boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'invalid response items';
  end if;

  select id into submission_uuid from public.rsvp_submissions where request_id = p_request_id;
  if submission_uuid is not null then return; end if;

  insert into public.rsvp_submissions (invitation_id, request_id)
  values (p_invitation_id, p_request_id)
  returning id into submission_uuid;

  for item in select * from jsonb_array_elements(p_items)
  loop
    item_guest_id := (item->>'guest_id')::uuid;
    item_attending := (item->>'attending')::boolean;
    if not exists (
      select 1 from public.guests
      where id = item_guest_id and invitation_id = p_invitation_id and active
    ) then
      raise exception 'guest does not belong to invitation';
    end if;

    insert into public.rsvp_submission_items (submission_id, guest_id, attending)
    values (submission_uuid, item_guest_id, item_attending);

    insert into public.rsvp_responses (guest_id, attending)
    values (item_guest_id, item_attending)
    on conflict (guest_id) do update
    set attending = excluded.attending,
        updated_at = now(),
        revision_number = public.rsvp_responses.revision_number + 1;
  end loop;
end;
$$;

revoke all on function public.consume_rsvp_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.submit_rsvp_response(uuid, jsonb, uuid) from public, anon, authenticated;
grant usage on schema public to service_role;
grant select on public.invitations, public.invitation_contacts, public.guests, public.rsvp_responses to service_role;
grant execute on function public.consume_rsvp_rate_limit(text, integer, integer) to service_role;
grant execute on function public.submit_rsvp_response(uuid, jsonb, uuid) to service_role;

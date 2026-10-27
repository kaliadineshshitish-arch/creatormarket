-- 0004_profiles_trigger.sql
-- Auto-create a profile row whenever a new user signs up.
-- Without this the profiles table stays empty and creator names never show.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      split_part(new.email,'@',1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing users that have no profile yet
insert into public.profiles (id, full_name)
select u.id,
       coalesce(
         nullif(u.raw_user_meta_data->>'full_name',''),
         nullif(u.raw_user_meta_data->>'name',''),
         split_part(u.email,'@',1)
       )
from auth.users u
on conflict (id) do nothing;

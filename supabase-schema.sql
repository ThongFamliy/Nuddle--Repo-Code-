-- Nuddle+ — schema thật đã chạy trên project Supabase "ThongFamliy's Project".
-- Dùng tiền tố nuddle_ để không đụng bảng profiles / user_roles có sẵn của ứng dụng khác.
-- File này để sao lưu hoặc dựng lại trên project khác:
-- Supabase Dashboard → SQL Editor → New query → dán → Run.

-- --------------------------------------------------------- nuddle_profiles
create table if not exists public.nuddle_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text not null default 'av-a',
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.nuddle_profiles enable row level security;

-- ------------------------------------------------------------ nuddle_posts
create table if not exists public.nuddle_posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.nuddle_profiles(id) on delete cascade,
  community text not null default 'Nuddle+',
  body text not null default '' check (char_length(body) <= 2000),
  image_url text,
  created_at timestamptz not null default now()
);
alter table public.nuddle_posts enable row level security;

-- ------------------------------------------------------------ nuddle_likes
create table if not exists public.nuddle_likes (
  post_id bigint not null references public.nuddle_posts(id) on delete cascade,
  user_id uuid not null references public.nuddle_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.nuddle_likes enable row level security;

-- --------------------------------------------------------- nuddle_comments
create table if not exists public.nuddle_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.nuddle_posts(id) on delete cascade,
  author_id uuid not null references public.nuddle_profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.nuddle_comments enable row level security;

create index if not exists nuddle_posts_created_at_idx on public.nuddle_posts (created_at desc);
create index if not exists nuddle_likes_post_id_idx on public.nuddle_likes (post_id);
create index if not exists nuddle_comments_post_id_idx on public.nuddle_comments (post_id);

-- ---------------------------------------------------------------- policies
-- Ai cũng đọc được; chỉ ghi/sửa/xoá dữ liệu của chính mình.

drop policy if exists "nuddle_profiles_read" on public.nuddle_profiles;
create policy "nuddle_profiles_read" on public.nuddle_profiles for select using (true);
drop policy if exists "nuddle_profiles_insert_own" on public.nuddle_profiles;
create policy "nuddle_profiles_insert_own" on public.nuddle_profiles for insert with check (auth.uid() = id);
drop policy if exists "nuddle_profiles_update_own" on public.nuddle_profiles;
create policy "nuddle_profiles_update_own" on public.nuddle_profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "nuddle_posts_read" on public.nuddle_posts;
create policy "nuddle_posts_read" on public.nuddle_posts for select using (true);
drop policy if exists "nuddle_posts_insert_own" on public.nuddle_posts;
create policy "nuddle_posts_insert_own" on public.nuddle_posts for insert with check (auth.uid() = author_id);
drop policy if exists "nuddle_posts_delete_own" on public.nuddle_posts;
create policy "nuddle_posts_delete_own" on public.nuddle_posts for delete using (auth.uid() = author_id);

drop policy if exists "nuddle_likes_read" on public.nuddle_likes;
create policy "nuddle_likes_read" on public.nuddle_likes for select using (true);
drop policy if exists "nuddle_likes_insert_own" on public.nuddle_likes;
create policy "nuddle_likes_insert_own" on public.nuddle_likes for insert with check (auth.uid() = user_id);
drop policy if exists "nuddle_likes_delete_own" on public.nuddle_likes;
create policy "nuddle_likes_delete_own" on public.nuddle_likes for delete using (auth.uid() = user_id);

drop policy if exists "nuddle_comments_read" on public.nuddle_comments;
create policy "nuddle_comments_read" on public.nuddle_comments for select using (true);
drop policy if exists "nuddle_comments_insert_own" on public.nuddle_comments;
create policy "nuddle_comments_insert_own" on public.nuddle_comments for insert with check (auth.uid() = author_id);
drop policy if exists "nuddle_comments_delete_own" on public.nuddle_comments;
create policy "nuddle_comments_delete_own" on public.nuddle_comments for delete using (auth.uid() = author_id);

-- --------------------------------------------------------------- quyền API
grant select, insert, update, delete on public.nuddle_profiles to anon, authenticated;
grant select, insert, update, delete on public.nuddle_posts to anon, authenticated;
grant select, insert, update, delete on public.nuddle_likes to anon, authenticated;
grant select, insert, update, delete on public.nuddle_comments to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- ------------------------------------------------------- kho ảnh (Storage)
-- Bucket công khai để đọc ảnh, nhưng chỉ chủ tài khoản mới tải lên/xoá được,
-- và mỗi người chỉ ghi được trong thư mục mang id của chính mình.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nuddle-media', 'nuddle-media', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nuddle_media_read" on storage.objects;
create policy "nuddle_media_read" on storage.objects for select
  using (bucket_id = 'nuddle-media');

drop policy if exists "nuddle_media_insert_own" on storage.objects;
create policy "nuddle_media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'nuddle-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "nuddle_media_update_own" on storage.objects;
create policy "nuddle_media_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'nuddle-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "nuddle_media_delete_own" on storage.objects;
create policy "nuddle_media_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'nuddle-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------- Circles
-- Mỗi người có các vòng tròn riêng; chỉ chủ tài khoản đọc/ghi được.

create table if not exists public.nuddle_circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.nuddle_profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.nuddle_circle_members (
  circle_id uuid not null references public.nuddle_circles(id) on delete cascade,
  member_id uuid not null references public.nuddle_profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (circle_id, member_id)
);

alter table public.nuddle_circles enable row level security;
alter table public.nuddle_circle_members enable row level security;

drop policy if exists "nuddle_circles_owner_all" on public.nuddle_circles;
create policy "nuddle_circles_owner_all" on public.nuddle_circles
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "nuddle_circle_members_owner_all" on public.nuddle_circle_members;
create policy "nuddle_circle_members_owner_all" on public.nuddle_circle_members
  for all
  using (exists (select 1 from public.nuddle_circles c where c.id = nuddle_circle_members.circle_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.nuddle_circles c where c.id = nuddle_circle_members.circle_id and c.owner_id = auth.uid()));

grant select, insert, update, delete on public.nuddle_circles to anon, authenticated;
grant select, insert, update, delete on public.nuddle_circle_members to anon, authenticated;

-- =====================================================================
-- OKEY canlı xal vərəqi — başlanğıc miqrasiya (Faza 0)
-- Cədvəl + trigger + Realtime + RLS (header-based owner yoxlaması)
-- =====================================================================

-- ---------- games cədvəli ----------
create table if not exists public.games (
  id           uuid primary key default gen_random_uuid(),
  join_code    text not null unique,                                                                              -- 4 rəqəmli qoşulma kodu
  owner_token  text not null,                                                                                     -- oyunu yaradanın gizli tokeni (UUID, localStorage-də)
  player1      text not null,                                                                                     -- 1-ci oyunçunun adı
  player2      text not null,                                                                                     -- 2-ci oyunçunun adı
  scores       jsonb not null default '[[null,null],[null,null],[null,null],[null,null],[null,null]]'::jsonb,    -- 5 raund x 2 oyunçu
  status       text not null default 'active',                                                                    -- 'active' | 'finished'
  winner       text,                                                                                              -- oyunçu adı və ya 'tie'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint games_status_chk check (status in ('active', 'finished'))
);

-- ---------- indekslər ----------
create index if not exists games_join_code_idx  on public.games (join_code);
create index if not exists games_created_at_idx on public.games (created_at desc);
create index if not exists games_status_idx     on public.games (status);

-- ---------- updated_at avtomatik yenilənmə ----------
create or replace function public.set_games_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_games_updated_at on public.games;
create trigger trg_games_updated_at
  before update on public.games
  for each row
  execute function public.set_games_updated_at();

-- ---------- Realtime publication ----------
-- UPDATE / INSERT / DELETE eventləri Supabase Realtime kanalı vasitəsilə yayımlansın
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end$$;

-- UPDATE eventində bütün sətir yayımlansın (yalnız dəyişən sütunlar yox)
alter table public.games replica identity full;

-- ---------- RLS (Row-Level Security) ----------
alter table public.games enable row level security;

-- SELECT: hamıya açıqdır (qoşulma kodu ilə oyunu tapmaq üçün)
drop policy if exists "games_select_all" on public.games;
create policy "games_select_all" on public.games
  for select
  using (true);

-- INSERT: anon yeni oyun yarada bilər
drop policy if exists "games_insert_anon" on public.games;
create policy "games_insert_anon" on public.games
  for insert
  with check (true);

-- UPDATE: yalnız 'x-owner-token' header-i owner_token ilə uyğun gəldikdə
-- Təhlükəsizlik: header server-də yoxlanılır, browser-də bypass edilə bilməz
drop policy if exists "games_update_owner" on public.games;
create policy "games_update_owner" on public.games
  for update
  using (
    owner_token = current_setting('request.headers', true)::json->>'x-owner-token'
  )
  with check (
    owner_token = current_setting('request.headers', true)::json->>'x-owner-token'
  );

-- DELETE: yalnız owner-ə icazə
drop policy if exists "games_delete_owner" on public.games;
create policy "games_delete_owner" on public.games
  for delete
  using (
    owner_token = current_setting('request.headers', true)::json->>'x-owner-token'
  );

-- ---------- anon rol icazələri ----------
grant usage on schema public to anon;
grant select, insert, update, delete on public.games to anon;

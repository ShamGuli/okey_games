-- =====================================================================
-- Faza 8: Dinamik row sayı
-- visible_rows: 1-dən başlayır, "Yeni Əl" basıldıqca artır, max 5
-- =====================================================================

alter table public.games
  add column if not exists visible_rows int not null default 1;

-- Mövcud (köhnə format) oyunları 5 row visible-da təyin et
-- (bu migrasiyadan əvvəl yaradılmış oyunlar 5 row formatında idi)
update public.games
   set visible_rows = 5
 where visible_rows = 1
   and (
        (scores->0->>0) is not null or (scores->0->>1) is not null
     or (scores->1->>0) is not null or (scores->1->>1) is not null
     or (scores->2->>0) is not null or (scores->2->>1) is not null
     or (scores->3->>0) is not null or (scores->3->>1) is not null
     or (scores->4->>0) is not null or (scores->4->>1) is not null
   );

-- Validasiya: 1 <= visible_rows <= 5
alter table public.games
  drop constraint if exists games_visible_rows_chk;
alter table public.games
  add constraint games_visible_rows_chk
    check (visible_rows >= 1 and visible_rows <= 5);

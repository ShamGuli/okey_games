-- =====================================================================
-- Faza 9: Row lock
-- Hər row üçün lock state (boolean[5]). Lock olan row edit/sil olunmur.
-- =====================================================================

alter table public.games
  add column if not exists locked jsonb not null
    default '[false,false,false,false,false]'::jsonb;

-- Mövcud bitmiş oyunlarda bütün rowlar lock edilsin
-- (artıq oynanıb, dəyişdirmək olmaz)
update public.games
   set locked = '[true,true,true,true,true]'::jsonb
 where status = 'finished'
   and locked = '[false,false,false,false,false]'::jsonb;

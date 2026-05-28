-- =====================================================================
-- Faza 7: Xal edit izlənməsi
-- Hər xananın edit olunub-olmadığını saxlayan jsonb sütun
-- =====================================================================

alter table public.games
  add column if not exists edited jsonb not null
    default '[[false,false],[false,false],[false,false],[false,false],[false,false]]'::jsonb;

-- Mövcud sətirlərə default dəyəri zəmanət ver
update public.games
   set edited = '[[false,false],[false,false],[false,false],[false,false],[false,false]]'::jsonb
 where edited is null;

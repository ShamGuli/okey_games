# OKEY — Canlı Xal Vərəqi

İki oyunçu üçün 5 raundlu OKEY oyununun canlı (real-time) xal vərəqi.
Hesab tələb olunmur — kod paylaş, telefondan rahat xal yaz, rəqib canlı izləsin.

## Necə işləyir

1. **Yeni oyun:** Hər iki oyunçunun adını yaz, "Oyuna Başla" düyməsinə bas. 4 rəqəmli unikal kod yaranır.
2. **Kodu paylaş:** Rəqibə kodu de (və ya "Kopyala" düyməsi ilə kopyala-göndər).
3. **Qoşulma:** Rəqib "Oyuna Qoşul" sahəsinə kodu yazır, oyunu **canlı (read-only)** izləyir.
4. **Xal yazmaq:** Yalnız oyunu yaradan (`owner`) xalları yazır. Hər xana yazıldıqdan sonra **kilidlənir**.
5. **Sil:** Sətirdə xal varsa sağında **×** düyməsi çıxır — basanda o sətir tamamilə sıfırlanır.
6. **Qalib:** 5 raundun hər ikisi dolanda OKEY qaydası ilə qalib avtomatik elan olunur (**az xal qalibdir**).
7. **Keçmiş oyunlar:** `/history.html` səhifəsində bütün oyunlar (aktiv + bitmiş) tarix sırası ilə.

## Stack

- **Frontend:** Statik HTML + vanilla JavaScript (build addımı yoxdur)
- **Supabase JS:** CDN üzərindən (`@supabase/supabase-js@2`)
- **Backend:** Supabase Postgres + Realtime + RLS
- **Deploy:** Vercel (statik)

## Layihə strukturu

```
okey-games/
├── index.html              # ana səhifə (yeni oyun + qoşulma + oyun ekranı)
├── history.html            # keçmiş oyunlar
├── css/style.css           # bütün stillər
├── js/
│   ├── supabase.js         # Supabase client (anon + owner)
│   ├── app.js              # əsas oyun məntiqi
│   └── history.js          # history səhifəsi
├── supabase/
│   └── migrations/
│       └── 0001_init.sql   # cədvəl + trigger + RLS + realtime
├── vercel.json
└── .gitignore
```

## ⚠️ İlk Setup — TƏHLÜKƏSİZLİK

**Şamil, bu addımları ƏVVƏLCƏ etməlisən:**

1. Supabase Dashboard → Settings → API → **`service_role` key-i ROTATE et**
   (köhnə key çatda paylaşılmışdı — kompromis edilmiş sayılır)
2. Settings → Database → **Database password-u da dəyişdir** (Reset)
3. SQL Editor-a get → `supabase/migrations/0001_init.sql` faylını **tam** kopyala-yapışdır-işə sal
4. `js/supabase.js` faylında `SUPABASE_ANON_KEY = "REPLACE_WITH_ANON_KEY"` yerinə **anon (public)** key-i yapışdır
   (Settings → API → `anon` `public` — `service_role` yox!)
5. Vercel-də repo-nu bağla, deploy et

## Təhlükəsizlik modeli (necə işləyir)

- **Yalnız anon (public) key** frontend-də işlədilir — bu kodda görünməsi normaldır
- **`service_role` key** repo-ya / browser-ə ASLA girmir
- **Owner identifikasiyası:** oyun yaradılanda `crypto.randomUUID()` ilə `owner_token` yaranır və `localStorage`-də saxlanılır
- **RLS (Row-Level Security):**
  - `SELECT`: hamıya açıq (kod ilə oyunu tapmaq üçün)
  - `INSERT`: hamıya açıq (yeni oyun yarat)
  - `UPDATE` / `DELETE`: **yalnız `x-owner-token` HTTP header-i `owner_token` ilə uyğun gəldikdə**
- Header server tərəfdə yoxlanılır — client tərəfdən bypass mümkün deyil

## Lokal işə salma

Build yoxdur — sadəcə HTTP server qaldır:

```bash
# Python ilə
python -m http.server 3000

# və ya Node ilə
npx serve .
```

Sonra brauzer-də `http://localhost:3000` aç.

Konsolda `✅ Supabase OK · oyunlar sayı: N` görsən hər şey qaydasındadır.

## Faza tarixçəsi

- ✅ **Faza 0:** Supabase SQL miqrasiya (games cədvəli, RLS, realtime publication)
- ✅ **Faza 1:** Statik skelet + Supabase bağlantı testi
- ✅ **Faza 2:** Yeni oyun + 4 rəqəmli unikal kod + localStorage
- ✅ **Faza 3:** Xal cədvəli + owner redaktəsi + kilid + sıra silmə + qalib hesabı
- ✅ **Faza 4:** Kodla qoşulma + Realtime (canlı yenilənmə, reconnect)
- ✅ **Faza 5:** Keçmiş oyunlar səhifəsi + detal modal
- ✅ **Faza 6:** Vercel `cleanUrls`, mobile-first cilalama, README

## Test ssenarisi (2 cihaz)

1. Telefon A — yeni oyun yarat (ad1, ad2). 4 rəqəmli kod çıxır.
2. Telefon B — `/` aç, "Oyuna Qoşul" sahəsinə kodu yaz, qoşul.
3. Telefon A — istənilən raunda xal yaz. **Telefon B-də dərhal görünməlidir** (refresh-siz).
4. Telefon B — input yoxdur, oyun read-only-dir.
5. Telefon A — 10 xananı tam doldur. Yuxarıda 🏆 qalib qutusu hər iki cihazda görünür.
6. `/history.html` — oyun bitmiş statusda görünür.

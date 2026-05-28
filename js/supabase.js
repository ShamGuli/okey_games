// =====================================================================
// Supabase Client Setup
// Yalnız ANON (public) key — frontend üçün normaldır.
// service_role key ASLA koda və ya repo-ya girmir.
// =====================================================================

const SUPABASE_URL = "https://rrrzkjsbntfhxfrhaock.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJycnpranNibnRmaHhmcmhhb2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NzQ2MDAsImV4cCI6MjA5NTU1MDYwMH0.4gPcbeMfn4wNMA_9jdrR9b1OFjYLfC3JyyI7FynscWg";

// --- Anonim client (SELECT, INSERT, Realtime üçün) ---
const sbAnon = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
});

// --- Owner client (UPDATE, DELETE üçün — x-owner-token header ilə) ---
// Server-side RLS bu header-i owner_token ilə müqayisə edir.
// Bu təhlükəsiz variantdır: client tərəfindən bypass edilə bilməz.
function sbWithOwner(token) {
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { "x-owner-token": token }
    },
    realtime: { params: { eventsPerSecond: 10 } }
  });
}

// --- Bağlantı testi (bir dəfə, debug üçün) ---
(async () => {
  try {
    const { count, error } = await sbAnon
      .from("games")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("❌ Supabase XƏTA:", error.message);
    } else {
      console.log("✅ Supabase OK · oyunlar sayı:", count);
    }
  } catch (e) {
    console.error("❌ Supabase bağlantı uğursuz:", e.message);
  }
})();

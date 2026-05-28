// =====================================================================
// OKEY — Əsas oyun məntiqi
// Faza 2-4: oyun yaratma + xal cədvəli + qoşulma + canlı (Realtime)
// =====================================================================

// ----- State -----
let currentGame = null;        // hazırkı oyunun sətri
let isOwner = false;           // bu cihaz oyunun sahibi olub-olmadığını
let ownerToken = null;         // sahib token-i (varsa)
let sbClient = sbAnon;         // UPDATE-lər üçün istifadə olunan client
let realtimeChannel = null;    // hazırkı abunəlik

// ----- LocalStorage açarları -----
const LS_CURRENT_GAME = "okey_current_game_id";
const LS_OWNER_PREFIX = "okey_owner_"; // + gameId

// ----- DOM helper -----
const $ = (id) => document.getElementById(id);

// =====================================================================
// UTILITIES
// =====================================================================

function uuid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  // Köhnə brauzerlər üçün fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function emptyScores() {
  return [[null, null], [null, null], [null, null], [null, null], [null, null]];
}

function calcSum(scores, col) {
  return scores.reduce((s, row) => s + (Number(row[col]) || 0), 0);
}

function isComplete(scores) {
  return scores.every((row) => row[0] !== null && row[1] !== null);
}

// OKEY qaydası: AZ xal olan qalibdir
function calcWinner(scores, p1, p2) {
  const s1 = calcSum(scores, 0);
  const s2 = calcSum(scores, 1);
  if (s1 < s2) return p1;
  if (s2 < s1) return p2;
  return "tie";
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

async function generateUniqueJoinCode() {
  // 4 rəqəmli (1000-9999) unikal kod, collision yoxlaması ilə
  for (let i = 0; i < 25; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const { data, error } = await sbAnon
      .from("games")
      .select("id")
      .eq("join_code", code)
      .maybeSingle();
    if (!error && !data) return code;
  }
  throw new Error("Kod yaradıla bilmədi (collision). Yenidən cəhd et.");
}

// =====================================================================
// VIEW SWITCHING
// =====================================================================

function showHome() {
  $("home-view").style.display = "";
  $("game-view").style.display = "none";
  $("player1-input").value = "";
  $("player2-input").value = "";
  $("join-code-input").value = "";
  $("join-message").innerHTML = "";
  $("player1-input").classList.remove("error");
  $("player2-input").classList.remove("error");
  cleanupRealtime();
}

function showGame() {
  $("home-view").style.display = "none";
  $("game-view").style.display = "";
  renderGame();
}

// =====================================================================
// RENDER
// =====================================================================

function renderGame() {
  if (!currentGame) return;
  $("join-code-display").textContent = currentGame.join_code;
  $("player1-header").textContent = currentGame.player1;
  $("player2-header").textContent = currentGame.player2;
  renderScoreTable();
  renderWinner();
}

function renderScoreTable() {
  const tbody = $("score-tbody");
  tbody.innerHTML = "";

  const scores = currentGame.scores;

  for (let i = 0; i < 5; i++) {
    const tr = document.createElement("tr");
    const rowHasValue = scores[i][0] !== null || scores[i][1] !== null;

    // Raund nömrəsi
    const tdLabel = document.createElement("td");
    tdLabel.className = "round-label";
    tdLabel.textContent = (i + 1).toString();
    tr.appendChild(tdLabel);

    // Oyunçu xanaları
    for (let col = 0; col < 2; col++) {
      const td = document.createElement("td");
      const val = scores[i][col];

      if (val !== null) {
        // Doldurulmuş — kilidli mətn
        td.className = "score-cell";
        td.textContent = val;
      } else if (isOwner) {
        // Owner — input
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.pattern = "[0-9]*";
        input.autocomplete = "off";
        input.className = "score-input";
        input.maxLength = 4;
        input.dataset.round = i;
        input.dataset.col = col;
        input.addEventListener("input", onScoreInput);
        input.addEventListener("keydown", onScoreKeydown);
        input.addEventListener("blur", onScoreBlur);
        td.appendChild(input);
      } else {
        // Qoşulan — boş xanada tire göstər
        td.className = "score-cell empty";
        td.textContent = "—";
      }
      tr.appendChild(td);
    }

    // Sil düyməsi (yalnız owner + sətirdə xal varsa)
    const tdDel = document.createElement("td");
    tdDel.className = "delete-cell";
    if (isOwner && rowHasValue) {
      const btn = document.createElement("button");
      btn.className = "delete-row-btn";
      btn.title = `${i + 1}-ci əli sıfırla`;
      btn.innerHTML = "×";
      btn.addEventListener("click", () => deleteRow(i));
      tdDel.appendChild(btn);
    }
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  }

  $("sum1").textContent = calcSum(scores, 0);
  $("sum2").textContent = calcSum(scores, 1);
}

function renderWinner() {
  const container = $("winner-container");
  if (currentGame.status !== "finished") {
    container.innerHTML = "";
    return;
  }
  const w = currentGame.winner;
  const trophy = w === "tie" ? "🤝" : "🏆";
  const name = w === "tie" ? "Bərabərlik" : w;
  container.innerHTML = `
    <div class="winner-box">
      <div class="winner-trophy">${trophy}</div>
      <div class="winner-label">Qalib</div>
      <div class="winner-name">${escapeHTML(name)}</div>
    </div>
  `;
}

// =====================================================================
// SCORE INPUT HANDLERS
// =====================================================================

function onScoreInput(e) {
  // Yalnız rəqəm, max 4 simvol
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
}

function onScoreKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
  }
}

async function onScoreBlur(e) {
  const input = e.target;
  const raw = input.value.trim();
  if (!raw) return; // boş qalıbsa heç nə etmə

  const value = parseInt(raw, 10);
  if (isNaN(value) || value < 0) {
    input.value = "";
    return;
  }

  const round = Number(input.dataset.round);
  const col = Number(input.dataset.col);
  await updateScore(round, col, value);
}

async function updateScore(round, col, value) {
  if (!isOwner || !ownerToken) return;

  const newScores = currentGame.scores.map((r) => [...r]);
  newScores[round][col] = value;

  let newStatus = currentGame.status;
  let newWinner = currentGame.winner;

  if (isComplete(newScores)) {
    newStatus = "finished";
    newWinner = calcWinner(newScores, currentGame.player1, currentGame.player2);
  }

  const updates = { scores: newScores, status: newStatus, winner: newWinner };

  const { data, error } = await sbClient
    .from("games")
    .update(updates)
    .eq("id", currentGame.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Update xətası:", error);
    alert("Xal yazıla bilmədi: " + error.message);
    return;
  }

  if (data) currentGame = data;
  else Object.assign(currentGame, updates);

  renderGame();
}

async function deleteRow(round) {
  if (!isOwner || !ownerToken) return;
  if (!confirm(`${round + 1}-ci əli tam silmək istəyirsən?`)) return;

  const newScores = currentGame.scores.map((r) => [...r]);
  newScores[round] = [null, null];

  // Silmə həm də finished statusunu açmalıdır
  const updates = { scores: newScores, status: "active", winner: null };

  const { data, error } = await sbClient
    .from("games")
    .update(updates)
    .eq("id", currentGame.id)
    .select()
    .maybeSingle();

  if (error) {
    alert("Silinə bilmədi: " + error.message);
    return;
  }

  if (data) currentGame = data;
  else Object.assign(currentGame, updates);

  renderGame();
}

// =====================================================================
// REALTIME (canlı izləmə)
// =====================================================================

function setLiveStatus(isLive, text) {
  const ind = $("live-indicator");
  ind.classList.toggle("live", isLive);
  ind.querySelector("span").textContent = text;
}

function cleanupRealtime() {
  if (realtimeChannel) {
    sbAnon.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  setLiveStatus(false, "Bağlı deyil");
}

function subscribeRealtime(gameId) {
  cleanupRealtime();
  setLiveStatus(false, "Bağlanır...");

  realtimeChannel = sbAnon
    .channel(`game-${gameId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      (payload) => {
        currentGame = payload.new;
        renderGame();
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      () => {
        alert("Oyun silindi.");
        clearCurrentGame();
        showHome();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setLiveStatus(true, "Canlı");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setLiveStatus(false, "Yenidən bağlanır...");
        // 2 saniyə sonra yenidən
        setTimeout(() => {
          if (currentGame && currentGame.id === gameId) {
            subscribeRealtime(gameId);
          }
        }, 2000);
      } else if (status === "CLOSED") {
        setLiveStatus(false, "Bağlantı kəsildi");
      }
    });
}

// =====================================================================
// GAME FLOWS
// =====================================================================

function applyOwnerContext(game) {
  // Bu cihazda owner token varsa client-i token-li versiyaya keçir
  const localToken = localStorage.getItem(LS_OWNER_PREFIX + game.id);
  if (localToken && localToken === game.owner_token) {
    isOwner = true;
    ownerToken = localToken;
    sbClient = sbWithOwner(localToken);
  } else {
    isOwner = false;
    ownerToken = null;
    sbClient = sbAnon;
  }
}

async function startNewGame() {
  const p1 = $("player1-input").value.trim();
  const p2 = $("player2-input").value.trim();

  // Mütləq ad yoxlaması
  $("player1-input").classList.remove("error");
  $("player2-input").classList.remove("error");
  let valid = true;
  if (!p1) { $("player1-input").classList.add("error"); valid = false; }
  if (!p2) { $("player2-input").classList.add("error"); valid = false; }
  if (!valid) return;

  const btn = $("start-game-btn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Yaradılır...";

  try {
    const token = uuid();
    const joinCode = await generateUniqueJoinCode();

    const { data, error } = await sbAnon
      .from("games")
      .insert({
        join_code: joinCode,
        owner_token: token,
        player1: p1,
        player2: p2,
        scores: emptyScores()
      })
      .select()
      .single();

    if (error) throw error;

    // Lokal yadda saxla
    localStorage.setItem(LS_CURRENT_GAME, data.id);
    localStorage.setItem(LS_OWNER_PREFIX + data.id, token);

    currentGame = data;
    isOwner = true;
    ownerToken = token;
    sbClient = sbWithOwner(token);

    showGame();
    subscribeRealtime(data.id);
  } catch (e) {
    console.error(e);
    alert("Oyun yaradıla bilmədi: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function joinGame() {
  const code = $("join-code-input").value.trim();
  $("join-message").innerHTML = "";

  if (!/^\d{4}$/.test(code)) {
    $("join-message").innerHTML = '<div class="message error">4 rəqəmli kod yaz</div>';
    return;
  }

  const btn = $("join-game-btn");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Axtarılır...";

  try {
    const { data, error } = await sbAnon
      .from("games")
      .select("*")
      .eq("join_code", code)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      $("join-message").innerHTML = '<div class="message error">Bu kodla oyun yoxdur</div>';
      return;
    }

    localStorage.setItem(LS_CURRENT_GAME, data.id);
    currentGame = data;
    applyOwnerContext(data);

    showGame();
    subscribeRealtime(data.id);
  } catch (e) {
    $("join-message").innerHTML =
      '<div class="message error">Xəta: ' + escapeHTML(e.message) + "</div>";
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function restoreGame() {
  const gameId = localStorage.getItem(LS_CURRENT_GAME);
  if (!gameId) return false;

  try {
    const { data, error } = await sbAnon
      .from("games")
      .select("*")
      .eq("id", gameId)
      .maybeSingle();

    if (error || !data) {
      localStorage.removeItem(LS_CURRENT_GAME);
      return false;
    }

    currentGame = data;
    applyOwnerContext(data);

    showGame();
    subscribeRealtime(data.id);
    return true;
  } catch (e) {
    console.error("Bərpa xətası:", e);
    return false;
  }
}

function clearCurrentGame() {
  localStorage.removeItem(LS_CURRENT_GAME);
  // owner_token-i saxlayırıq ki, istifadəçi həmin oyuna sonra qayıdanda owner qalsın
  currentGame = null;
  ownerToken = null;
  isOwner = false;
  sbClient = sbAnon;
  cleanupRealtime();
}

function leaveCurrentGame() {
  if (!confirm("Diqqət! Yeni oyun başlasın?\n(Cari oyun history-də qalacaq)")) return;
  clearCurrentGame();
  showHome();
}

function copyJoinCode() {
  const code = currentGame?.join_code;
  if (!code) return;
  const btn = $("copy-code-btn");
  const restore = () => {
    btn.textContent = "Kopyala";
    btn.classList.remove("copied");
  };

  const ok = () => {
    btn.textContent = "Kopyalandı ✓";
    btn.classList.add("copied");
    setTimeout(restore, 1500);
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(ok).catch(() => {
      fallbackCopy(code, ok);
    });
  } else {
    fallbackCopy(code, ok);
  }
}

function fallbackCopy(text, onSuccess) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    onSuccess();
  } catch (e) {
    console.warn("Kopyalama uğursuz:", e);
  }
  document.body.removeChild(ta);
}

// =====================================================================
// INIT
// =====================================================================

function bindEvents() {
  $("start-game-btn").addEventListener("click", startNewGame);
  $("join-game-btn").addEventListener("click", joinGame);
  $("new-game-btn").addEventListener("click", leaveCurrentGame);
  $("copy-code-btn").addEventListener("click", copyJoinCode);

  // Join kod input — yalnız 4 rəqəm
  $("join-code-input").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
  });
  $("join-code-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      joinGame();
    }
  });

  // Ad sahələrinin error vəziyyətini təmizlə
  $("player1-input").addEventListener("input", () =>
    $("player1-input").classList.remove("error")
  );
  $("player2-input").addEventListener("input", () =>
    $("player2-input").classList.remove("error")
  );

  // Enter ad sahələrində oyun başlatsın
  [$("player1-input"), $("player2-input")].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        startNewGame();
      }
    });
  });
}

async function init() {
  bindEvents();
  const restored = await restoreGame();
  if (!restored) showHome();
}

init();

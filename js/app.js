// =====================================================================
// OKEY — Əsas oyun məntiqi
// Yalnız owner xal yazır (qoşulma UI yoxdur).
// Xanalar həmişə edit oluna bilər; edit edildikdə "düzəldildi" qeydi qalır.
// =====================================================================

// ----- State -----
let currentGame = null;
let isOwner = false;
let ownerToken = null;
let sbClient = sbAnon;
let realtimeChannel = null;

// ----- LocalStorage açarları -----
const LS_CURRENT_GAME = "okey_current_game_id";
const LS_OWNER_PREFIX = "okey_owner_";

const $ = (id) => document.getElementById(id);

// =====================================================================
// UTILITIES
// =====================================================================

function uuid() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function emptyScores() {
  return [[null, null], [null, null], [null, null], [null, null], [null, null]];
}
function emptyEdited() {
  return [[false, false], [false, false], [false, false], [false, false], [false, false]];
}

function calcSum(scores, col) {
  return scores.reduce((s, row) => s + (Number(row[col]) || 0), 0);
}
function isComplete(scores) {
  return scores.every((row) => row[0] !== null && row[1] !== null);
}

// OKEY qaydası: AZ xal qalibdir
function calcWinner(scores, p1, p2) {
  const s1 = calcSum(scores, 0);
  const s2 = calcSum(scores, 1);
  if (s1 < s2) return p1;
  if (s2 < s1) return p2;
  return "tie";
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Backend-də saxlanılır, UI-də görünmür (cədvəlin unique not null sütunu)
async function generateUniqueJoinCode() {
  for (let i = 0; i < 25; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const { data, error } = await sbAnon
      .from("games")
      .select("id")
      .eq("join_code", code)
      .maybeSingle();
    if (!error && !data) return code;
  }
  throw new Error("Kod yaradıla bilmədi. Yenidən cəhd et.");
}

// edited sahəsi köhnə oyunlarda olmaya bilər — təhlükəsiz oxu
function safeEdited(game) {
  if (Array.isArray(game?.edited) && game.edited.length === 5) return game.edited;
  return emptyEdited();
}

// =====================================================================
// VIEW SWITCHING
// =====================================================================

function showHome() {
  $("home-view").style.display = "";
  $("game-view").style.display = "none";
  $("player1-input").value = "";
  $("player2-input").value = "";
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
  $("player1-header").textContent = currentGame.player1;
  $("player2-header").textContent = currentGame.player2;
  renderScoreTable();
  renderWinner();
}

function renderScoreTable() {
  const tbody = $("score-tbody");
  tbody.innerHTML = "";

  const scores = currentGame.scores;
  const edited = safeEdited(currentGame);

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
      const wasEdited = edited[i][col] === true;

      if (isOwner) {
        // Owner — həmişə redaktə oluna bilər
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.pattern = "[0-9]*";
        input.autocomplete = "off";
        input.className = "score-input" + (wasEdited ? " edited" : "");
        input.maxLength = 4;
        input.dataset.round = i;
        input.dataset.col = col;
        if (val !== null) input.value = String(val);
        input.addEventListener("input", onScoreInput);
        input.addEventListener("keydown", onScoreKeydown);
        input.addEventListener("blur", onScoreBlur);
        td.appendChild(input);

        if (wasEdited) {
          const mark = document.createElement("span");
          mark.className = "edit-mark";
          mark.textContent = "✎ düzəldildi";
          td.appendChild(mark);
        }
      } else {
        // Read-only baxış
        if (val !== null) {
          td.className = "score-cell";
          const text = document.createElement("span");
          text.textContent = val;
          td.appendChild(text);
          if (wasEdited) {
            const mark = document.createElement("span");
            mark.className = "edit-mark";
            mark.textContent = "✎ düzəldildi";
            td.appendChild(mark);
          }
        } else {
          td.className = "score-cell empty";
          td.textContent = "—";
        }
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
  const round = Number(input.dataset.round);
  const col = Number(input.dataset.col);
  const currentValue = currentGame.scores[round][col];
  const raw = input.value.trim();

  // Boş → mövcud dəyəri qoru
  if (!raw) {
    if (currentValue !== null) input.value = String(currentValue);
    return;
  }

  const value = parseInt(raw, 10);
  if (isNaN(value) || value < 0) {
    input.value = currentValue !== null ? String(currentValue) : "";
    return;
  }

  // Dəyər dəyişməyibsə heç nə etmə
  if (value === currentValue) return;

  await updateScore(round, col, value, currentValue);
}

async function updateScore(round, col, value, oldValue) {
  if (!isOwner || !ownerToken) return;

  const newScores = currentGame.scores.map((r) => [...r]);
  newScores[round][col] = value;

  const newEdited = safeEdited(currentGame).map((r) => [...r]);
  // Yalnız boş olmayan xananın dəyişdirilməsi "edit" sayılır
  if (oldValue !== null && oldValue !== value) {
    newEdited[round][col] = true;
  }

  let newStatus = currentGame.status;
  let newWinner = currentGame.winner;
  if (isComplete(newScores)) {
    newStatus = "finished";
    newWinner = calcWinner(newScores, currentGame.player1, currentGame.player2);
  }

  const updates = {
    scores: newScores,
    edited: newEdited,
    status: newStatus,
    winner: newWinner
  };

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

  currentGame = data || Object.assign({}, currentGame, updates);
  renderGame();
}

async function deleteRow(round) {
  if (!isOwner || !ownerToken) return;
  if (!confirm(`${round + 1}-ci əli tam silmək istəyirsən?`)) return;

  const newScores = currentGame.scores.map((r) => [...r]);
  newScores[round] = [null, null];

  // Silinən sətirdə edit flag-ları da sıfırlansın
  const newEdited = safeEdited(currentGame).map((r) => [...r]);
  newEdited[round] = [false, false];

  const updates = {
    scores: newScores,
    edited: newEdited,
    status: "active",
    winner: null
  };

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

  currentGame = data || Object.assign({}, currentGame, updates);
  renderGame();
}

// =====================================================================
// REALTIME (eyni oyunu başqa cihazda davam etdirmək üçün)
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
    const joinCode = await generateUniqueJoinCode(); // backend tələbi, UI-də görünmür

    const { data, error } = await sbAnon
      .from("games")
      .insert({
        join_code: joinCode,
        owner_token: token,
        player1: p1,
        player2: p2,
        scores: emptyScores(),
        edited: emptyEdited()
      })
      .select()
      .single();

    if (error) throw error;

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

// =====================================================================
// INIT
// =====================================================================

function bindEvents() {
  $("start-game-btn").addEventListener("click", startNewGame);
  $("new-game-btn").addEventListener("click", leaveCurrentGame);

  $("player1-input").addEventListener("input", () =>
    $("player1-input").classList.remove("error")
  );
  $("player2-input").addEventListener("input", () =>
    $("player2-input").classList.remove("error")
  );

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

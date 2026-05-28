// =====================================================================
// OKEY — Əsas oyun məntiqi
// Yalnız owner xal yazır. Xanalar həmişə edit oluna bilər, edit
// edildikdə altında "✎ düzəldildi" qeydi qalır.
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
// UI HELPERS — toast, form-message, custom confirm
// =====================================================================

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// Button altında inline mesaj (qırmızı/yaşıl)
function showFormMessage(elementId, message, type, duration = 4000) {
  const el = $(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = `form-message show ${type}`;
  clearTimeout(el._timer);
  if (duration > 0) {
    el._timer = setTimeout(() => {
      el.className = "form-message";
    }, duration);
  }
}

function clearFormMessage(elementId) {
  const el = $(elementId);
  if (!el) return;
  clearTimeout(el._timer);
  el.className = "form-message";
  el.textContent = "";
}

// Toast bildiriş (yuxarıdan)
function toast(message, type = "info", duration = 2500) {
  const container = $("toast-container");
  if (!container) {
    console[type === "error" ? "error" : "log"](message);
    return;
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icons = { error: "⚠", success: "✓", info: "ℹ" };
  el.innerHTML =
    `<span class="toast-icon">${icons[type] || ""}</span>` +
    `<span class="toast-text">${escapeHTML(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("exit");
    setTimeout(() => el.remove(), 220);
  }, duration);
}

// Native confirm əvəzinə custom modal
function customConfirm(title, message, okText = "Davam et", cancelText = "Ləğv et") {
  return new Promise((resolve) => {
    const modal = $("confirm-modal");
    const titleEl = $("confirm-title");
    const msgEl = $("confirm-message");
    const okBtn = $("confirm-ok");
    const cancelBtn = $("confirm-cancel");

    if (!modal || !okBtn || !cancelBtn) {
      // Fallback — modal yoxdursa native istifadə et
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    const cleanup = () => {
      modal.style.display = "none";
      document.body.style.overflow = "";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOverlay = (e) => { if (e.target === modal) onCancel(); };
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onOk();
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    modal.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey);

    modal.style.display = "flex";
    document.body.style.overflow = "hidden";
    setTimeout(() => okBtn.focus(), 50);
  });
}

// =====================================================================
// UTILITIES
// =====================================================================

// Əvvəlki row-larda ilk boş xananı tap (yoxsa null)
function findFirstIncompleteCell(scores, beforeRound) {
  for (let r = 0; r < beforeRound; r++) {
    if (scores[r][0] === null) return { round: r, col: 0 };
    if (scores[r][1] === null) return { round: r, col: 1 };
  }
  return null;
}

// Müəyyən xanaya fokus + select
function focusCell(round, col) {
  const input = document.querySelector(
    `.score-input[data-round="${round}"][data-col="${col}"]`
  );
  if (!input) return;
  input.focus();
  try { input.select(); } catch (_) {}
}

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

// Backend üçün unikal join_code (UI-də görünmür, schema tələbi)
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

function safeEdited(game) {
  if (Array.isArray(game?.edited) && game.edited.length === 5) return game.edited;
  return emptyEdited();
}

// =====================================================================
// VIEW SWITCHING
// =====================================================================

function showHome() {
  const home = $("home-view");
  const game = $("game-view");
  if (home) home.style.display = "";
  if (game) game.style.display = "none";
  const p1 = $("player1-input");
  const p2 = $("player2-input");
  if (p1) { p1.value = ""; p1.classList.remove("error"); }
  if (p2) { p2.value = ""; p2.classList.remove("error"); }
  clearFormMessage("start-message");
  cleanupRealtime();
}

function showGame() {
  const home = $("home-view");
  const game = $("game-view");
  if (home) home.style.display = "none";
  if (game) game.style.display = "";
  renderGame();
}

// =====================================================================
// RENDER
// =====================================================================

function renderGame() {
  if (!currentGame) return;
  const p1Header = $("player1-header");
  const p2Header = $("player2-header");
  if (p1Header) p1Header.textContent = currentGame.player1;
  if (p2Header) p2Header.textContent = currentGame.player2;
  renderScoreTable();
  renderWinner();
}

function renderScoreTable() {
  const tbody = $("score-tbody");
  if (!tbody || !currentGame) return;
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
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.pattern = "[0-9]*";
        input.autocomplete = "off";
        input.className = "score-input"
          + (wasEdited ? " edited" : "")
          + (val === -101 ? " end" : "");
        input.maxLength = 4;
        input.placeholder = "—";
        input.dataset.round = i;
        input.dataset.col = col;
        if (val !== null) input.value = String(val);
        input.addEventListener("input", onScoreInput);
        input.addEventListener("keydown", onScoreKeydown);
        input.addEventListener("blur", onScoreBlur);
        td.appendChild(input);

        // "🏁 Bitdi" quick düyməsi → bu xanaya −101 yazır
        // (klavyatura mənfi qəbul etmir, ona görə manual yazmaq əvəzinə)
        if (val !== -101) {
          const quickBtn = document.createElement("button");
          quickBtn.type = "button";
          quickBtn.className = "quick-end-btn";
          quickBtn.textContent = "🏁 Bitdi";
          quickBtn.title = "Bu xanaya −101 yaz (OKEY qaydası — bitənə)";
          quickBtn.addEventListener("click", () => quickEnd(i, col));
          td.appendChild(quickBtn);
        }

        if (wasEdited) {
          const mark = document.createElement("span");
          mark.className = "edit-mark";
          mark.textContent = "✎ düzəldildi";
          td.appendChild(mark);
        }
      } else {
        if (val !== null) {
          td.className = "score-cell";
          const text = document.createElement("span");
          if (val === -101) {
            text.className = "end-badge";
            text.textContent = "🏁 −101";
          } else {
            text.textContent = val;
          }
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

  const sum1 = $("sum1");
  const sum2 = $("sum2");
  if (sum1) sum1.textContent = calcSum(scores, 0);
  if (sum2) sum2.textContent = calcSum(scores, 1);
}

function renderWinner() {
  const container = $("winner-container");
  if (!container) return;
  if (currentGame.status !== "finished") {
    container.innerHTML = "";
    return;
  }
  const w = currentGame.winner;
  const trophy = w === "tie" ? "🤝" : "🏆";
  const name = w === "tie" ? "Bərabərlik" : w;
  container.innerHTML =
    '<div class="winner-box">' +
    `<div class="winner-trophy">${trophy}</div>` +
    '<div class="winner-label">Qalib</div>' +
    `<div class="winner-name">${escapeHTML(name)}</div>` +
    "</div>";
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

  // Validation: əvvəlki row-lar tam dolu olmalıdır
  const incomplete = findFirstIncompleteCell(currentGame.scores, round);
  if (incomplete) {
    input.value = currentValue !== null ? String(currentValue) : "";
    const playerName = incomplete.col === 0
      ? currentGame.player1
      : currentGame.player2;
    toast(
      `${incomplete.round + 1}-ci əldə "${playerName}" xanası boşdur — əvvəl onu yaz`,
      "error",
      3500
    );
    requestAnimationFrame(() => focusCell(incomplete.round, incomplete.col));
    return;
  }

  await updateScore(round, col, value, currentValue);

  // Auto-focus: col 0 → col 1 (eyni row, hələ boşdursa) — klaviatura qalır
  // col 1 doldursa, render input-u mətnə çevirir, klaviatura təbii itir
  if (
    col === 0 &&
    currentGame.status !== "finished" &&
    currentGame.scores[round][1] === null
  ) {
    requestAnimationFrame(() => focusCell(round, 1));
  }
}

async function updateScore(round, col, value, oldValue) {
  if (!isOwner || !ownerToken) return;

  const newScores = currentGame.scores.map((r) => [...r]);
  newScores[round][col] = value;

  const newEdited = safeEdited(currentGame).map((r) => [...r]);
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
    toast("Xal yazıla bilmədi: " + error.message, "error", 4000);
    return;
  }

  currentGame = data || Object.assign({}, currentGame, updates);
  renderGame();

  if (newStatus === "finished" && currentGame.status === "finished") {
    toast(
      newWinner === "tie" ? "Bərabərlik 🤝" : `Qalib: ${newWinner} 🏆`,
      "success",
      3500
    );
  }
}

async function deleteRow(round) {
  if (!isOwner || !ownerToken) return;
  const ok = await customConfirm(
    "Əli sil",
    `${round + 1}-ci əldəki xallar tam silinəcək. Davam edək?`,
    "Sil",
    "Ləğv et"
  );
  if (!ok) return;

  const newScores = currentGame.scores.map((r) => [...r]);
  newScores[round] = [null, null];

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
    toast("Silinə bilmədi: " + error.message, "error", 4000);
    return;
  }

  currentGame = data || Object.assign({}, currentGame, updates);
  renderGame();
  toast(`${round + 1}-ci əl silindi`, "success");
}

// "🏁 Bitdi" düyməsi — xanaya −101 yazır (OKEY qaydası)
async function quickEnd(round, col) {
  if (!isOwner || !ownerToken) return;
  const currentValue = currentGame.scores[round][col];
  if (currentValue === -101) return;

  // Validation: əvvəlki row-lar tam dolu olmalıdır
  const incomplete = findFirstIncompleteCell(currentGame.scores, round);
  if (incomplete) {
    const playerName = incomplete.col === 0
      ? currentGame.player1
      : currentGame.player2;
    toast(
      `${incomplete.round + 1}-ci əldə "${playerName}" xanası boşdur — əvvəl onu yaz`,
      "error",
      3500
    );
    requestAnimationFrame(() => focusCell(incomplete.round, incomplete.col));
    return;
  }

  await updateScore(round, col, -101, currentValue);
}

// =====================================================================
// REALTIME
// =====================================================================

function setLiveStatus(isLive, text) {
  const ind = $("live-indicator");
  if (!ind) return;
  ind.classList.toggle("live", isLive);
  const span = ind.querySelector("span");
  if (span) span.textContent = text;
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
        toast("Oyun silindi", "error");
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
  const p1Input = $("player1-input");
  const p2Input = $("player2-input");
  if (!p1Input || !p2Input) return;

  const p1 = p1Input.value.trim();
  const p2 = p2Input.value.trim();

  p1Input.classList.remove("error");
  p2Input.classList.remove("error");
  clearFormMessage("start-message");

  if (!p1 || !p2) {
    if (!p1) p1Input.classList.add("error");
    if (!p2) p2Input.classList.add("error");
    showFormMessage("start-message", "Hər iki oyunçunun adını yaz", "error");
    return;
  }

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

    showFormMessage("start-message", "Oyun yaradıldı", "success", 1500);
    setTimeout(() => {
      showGame();
      subscribeRealtime(data.id);
      toast(`${p1} vs ${p2} — oyun başladı`, "success");
    }, 400);
  } catch (e) {
    console.error("startNewGame xətası:", e);
    showFormMessage(
      "start-message",
      e?.message || "Oyun yaradıla bilmədi",
      "error"
    );
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

async function leaveCurrentGame() {
  const ok = await customConfirm(
    "Yeni Oyun",
    "Cari oyun bitir və yenisi başlayır.\nKöhnə oyun history-də qalacaq.",
    "Yeni oyun",
    "Davam et"
  );
  if (!ok) return;
  clearCurrentGame();
  showHome();
}

// =====================================================================
// INIT
// =====================================================================

function bindEvents() {
  const startBtn = $("start-game-btn");
  const newBtn = $("new-game-btn");
  const p1 = $("player1-input");
  const p2 = $("player2-input");

  if (startBtn) startBtn.addEventListener("click", startNewGame);
  if (newBtn) newBtn.addEventListener("click", leaveCurrentGame);

  if (p1) {
    p1.addEventListener("input", () => {
      p1.classList.remove("error");
      clearFormMessage("start-message");
    });
    p1.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); startNewGame(); }
    });
  }
  if (p2) {
    p2.addEventListener("input", () => {
      p2.classList.remove("error");
      clearFormMessage("start-message");
    });
    p2.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); startNewGame(); }
    });
  }
}

async function init() {
  bindEvents();
  const restored = await restoreGame();
  if (!restored) showHome();
}

init();

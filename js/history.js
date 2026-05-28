// =====================================================================
// OKEY — Keçmiş oyunlar səhifəsi (Faza 5)
// =====================================================================

const $ = (id) => document.getElementById(id);

let allGames = []; // RAM-da saxlayırıq ki, detal modalı sürətli açılsın

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function calcSum(scores, col) {
  return scores.reduce((s, row) => s + (Number(row[col]) || 0), 0);
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =====================================================================
// LIST RENDER
// =====================================================================

function renderList(games) {
  const list = $("history-list");
  if (!games.length) {
    list.innerHTML = '<div class="empty">Hələ oyun yoxdur</div>';
    return;
  }

  list.innerHTML = games
    .map((g) => {
      const s1 = calcSum(g.scores, 0);
      const s2 = calcSum(g.scores, 1);
      const statusClass = g.status === "active" ? "active" : "finished";
      const statusText = g.status === "active" ? "Aktiv" : "Bitmiş";
      let winnerHTML = "";
      if (g.status === "finished") {
        const wText =
          g.winner === "tie"
            ? "🤝 Bərabərlik"
            : `🏆 ${escapeHTML(g.winner)}`;
        winnerHTML = `<div class="history-winner">${wText}</div>`;
      }
      return `
        <div class="history-card" data-id="${g.id}">
          <div class="history-meta">
            <span>${formatDate(g.created_at)}</span>
            <span>·</span>
            <span>Kod: <strong>${escapeHTML(g.join_code)}</strong></span>
            <span class="status-badge ${statusClass}">${statusText}</span>
          </div>
          <div class="history-players">${escapeHTML(g.player1)} vs ${escapeHTML(g.player2)}</div>
          <div class="history-scores">${s1} : ${s2}</div>
          ${winnerHTML}
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".history-card").forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
}

// =====================================================================
// DETAIL MODAL
// =====================================================================

function openDetail(id) {
  const g = allGames.find((x) => x.id === id);
  if (!g) return;

  $("detail-title").textContent = `${g.player1} vs ${g.player2}`;

  const s1 = calcSum(g.scores, 0);
  const s2 = calcSum(g.scores, 1);

  let rowsHTML = "";
  for (let i = 0; i < 5; i++) {
    const v1 = g.scores[i][0] !== null ? g.scores[i][0] : "—";
    const v2 = g.scores[i][1] !== null ? g.scores[i][1] : "—";
    const empty1 = g.scores[i][0] === null ? " empty" : "";
    const empty2 = g.scores[i][1] === null ? " empty" : "";
    rowsHTML += `
      <tr>
        <td class="round-label">${i + 1}</td>
        <td class="score-cell${empty1}">${v1}</td>
        <td class="score-cell${empty2}">${v2}</td>
      </tr>
    `;
  }

  let winnerHTML = "";
  if (g.status === "finished") {
    const trophy = g.winner === "tie" ? "🤝" : "🏆";
    const name = g.winner === "tie" ? "Bərabərlik" : escapeHTML(g.winner);
    winnerHTML = `
      <div class="winner-box">
        <div class="winner-trophy">${trophy}</div>
        <div class="winner-label">Qalib</div>
        <div class="winner-name">${name}</div>
      </div>
    `;
  }

  $("detail-content").innerHTML = `
    <div class="history-meta" style="margin-bottom: 16px;">
      <span>${formatDate(g.created_at)}</span>
      <span>·</span>
      <span>Kod: <strong>${escapeHTML(g.join_code)}</strong></span>
    </div>
    ${winnerHTML}
    <div class="score-table-wrap" style="margin-top: 12px;">
      <table class="score-table">
        <thead>
          <tr>
            <th class="round-label">Əl</th>
            <th>${escapeHTML(g.player1)}</th>
            <th>${escapeHTML(g.player2)}</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
        <tfoot>
          <tr class="sum-row">
            <td class="round-label">Σ</td>
            <td class="score-cell">${s1}</td>
            <td class="score-cell">${s2}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  $("detail-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeDetail() {
  $("detail-modal").style.display = "none";
  document.body.style.overflow = "";
}

// =====================================================================
// LOAD
// =====================================================================

async function loadHistory() {
  try {
    const { data, error } = await sbAnon
      .from("games")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    allGames = data || [];
    renderList(allGames);
  } catch (e) {
    $("history-list").innerHTML =
      `<div class="message error">Xəta: ${escapeHTML(e.message)}</div>`;
  }
}

// =====================================================================
// INIT
// =====================================================================

$("close-modal-btn").addEventListener("click", closeDetail);
$("detail-modal").addEventListener("click", (e) => {
  if (e.target.id === "detail-modal") closeDetail();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("detail-modal").style.display !== "none") {
    closeDetail();
  }
});

loadHistory();

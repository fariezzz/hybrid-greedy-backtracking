import { BASE_NODE, NODE_MAP, SVG_NS, VISUAL_NODES } from "./constants.js";
import { applyEmblem, applyTalentEffects, loadDataBundle, resolveDefaultEmblem } from "./data.js";
import { buildInitialState } from "./engine.js";
import { buildProblem } from "./problem.js";
import { solveBacktrackingPure } from "./solver/backtracking-pure.js";
import { solveGreedy } from "./solver/greedy.js";
import { solveHybrid } from "./solver/hybrid.js";
import { round1 } from "./utils.js";

const refs = {
  datasetStatus: document.getElementById("dataset-status"),
  form: document.getElementById("config-form"),
  heroSelect: document.getElementById("hero-select"),
  startBuff: document.getElementById("start-buff"),
  heroSummaryCard: document.getElementById("hero-summary-card"),
  selectedNodeCard: document.getElementById("selected-node-card"),
  resultSummary: document.getElementById("result-summary"),
  stepsBody: document.getElementById("steps-body"),
  nodesLayer: document.getElementById("nodes-layer"),
  routePathGroup: document.getElementById("route-path-group"),
  viewButtons: Array.from(document.querySelectorAll(".view-btn")),
};

const state = {
  data: null,
  selectedCampId: BASE_NODE,
  activeView: "hybrid",
  byAlgorithm: {
    greedy: null,
    backtracking: null,
    hybrid: null,
  },
  currentProblem: null,
};

export async function initApp() {
  attachEvents();
  renderNodes();
  selectCamp(BASE_NODE);
  refs.heroSelect.innerHTML = '<option value="">Memuat hero...</option>';
  try {
    state.data = await loadDataBundle();
    populateHeroes();
    renderHeroSummary();
    setStatus("Dataset berhasil dimuat.", true);
  } catch (error) {
    refs.heroSelect.innerHTML = '<option value="">Gagal memuat hero</option>';
    setStatus(`Gagal memuat dataset: ${error.message || String(error)}`, false);
  }
}

function attachEvents() {
  refs.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runAllAlgorithms();
  });

  refs.heroSelect.addEventListener("change", () => {
    renderHeroSummary();
    clearResults("Konfigurasi berubah. Klik Hitung Semua Algoritma.");
  });

  refs.startBuff.addEventListener("change", () => {
    clearResults("Konfigurasi berubah. Klik Hitung Semua Algoritma.");
  });

  refs.nodesLayer.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-camp-id]");
    if (!btn) {
      return;
    }
    selectCamp(btn.dataset.campId);
  });

  refs.viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeView = btn.dataset.view;
      renderActiveViewButtons();
      renderStepsTable();
      renderRoute();
    });
  });
}

function setStatus(text, ok) {
  refs.datasetStatus.textContent = text;
  refs.datasetStatus.className = ok
    ? "mb-4 rounded-xl border border-emerald-700 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-200"
    : "mb-4 rounded-xl border border-rose-700 bg-rose-900/20 px-4 py-3 text-sm text-rose-200";
}

function populateHeroes() {
  refs.heroSelect.innerHTML = "";
  for (const hero of state.data.heroes) {
    const option = document.createElement("option");
    option.value = hero.name;
    option.textContent = hero.name;
    refs.heroSelect.append(option);
  }
  refs.heroSelect.value = state.data.heroes[0]?.name || "";
}

function getSelectedHero() {
  return state.data.heroes.find((hero) => hero.name === refs.heroSelect.value) || null;
}

function renderHeroSummary() {
  const hero = getSelectedHero();
  if (!hero) {
    refs.heroSummaryCard.textContent = "Pilih hero untuk melihat atribut final.";
    return;
  }
  const emblem = resolveDefaultEmblem(hero, state.data.emblems);
  const stats = applyEmblem(hero, emblem);
  applyTalentEffects(stats, hero.talents);

  refs.heroSummaryCard.innerHTML = `
    <h3 class="mb-2 text-sm font-semibold text-slate-200">${hero.name}</h3>
    <div class="space-y-1 text-xs">
      <div>Emblem: <span class="text-slate-100">${emblem ? emblem.name : "-"}</span></div>
      <div>Talent: <span class="text-slate-100">${hero.talents.length ? hero.talents.join(", ") : "-"}</span></div>
      <div>Max HP: <span class="text-slate-100">${round1(stats.max_hp)}</span></div>
      <div>Physical Attack: <span class="text-slate-100">${round1(stats.physical_attack)}</span></div>
      <div>Move Speed: <span class="text-slate-100">${round1(stats.movement_speed)}</span></div>
      <div>Monster Bonus: <span class="text-slate-100">${(stats.monster_damage_bonus * 100).toFixed(1)}%</span></div>
    </div>
  `;
}

function runAllAlgorithms() {
  if (!state.data) {
    return;
  }

  try {
    const hero = getSelectedHero();
    if (!hero) {
      throw new Error("Hero tidak ditemukan");
    }
    const emblem = resolveDefaultEmblem(hero, state.data.emblems);
    const problem = buildProblem(state.data, hero, emblem);
    state.currentProblem = problem;

    const initial = buildInitialState(problem, refs.startBuff.value);

    state.byAlgorithm.greedy = solveGreedy(problem, initial);
    state.byAlgorithm.backtracking = solveBacktrackingPure(problem, initial);
    state.byAlgorithm.hybrid = solveHybrid(problem, initial);

    renderSummary();
    renderActiveViewButtons();
    renderStepsTable();
    renderRoute();
    renderSelectedNodeCard();
  } catch (error) {
    clearResults(`Gagal simulasi: ${error.message || String(error)}`);
  }
}

function renderSummary() {
  const order = ["greedy", "backtracking", "hybrid"];
  const lines = [];
  for (const key of order) {
    const result = state.byAlgorithm[key];
    if (!result) {
      continue;
    }
    lines.push(`
      <div class="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
        <div class="font-semibold text-slate-100">${result.method}</div>
        <div class="text-xs text-slate-300">Status: ${result.reached_target ? "Tercapai" : "Belum"}</div>
        <div class="text-xs text-slate-300">Waktu: ${Number.isFinite(result.total_time) ? `${result.total_time.toFixed(1)}s` : "-"}</div>
        <div class="text-xs text-slate-300">XP: ${Math.floor(result.total_xp)}</div>
        <div class="text-xs text-slate-300">State: ${result.expanded_states}</div>
        <div class="text-xs text-slate-300">Step: ${result.steps.length}</div>
      </div>
    `);
  }
  refs.resultSummary.innerHTML = lines.join("");
}

function renderActiveViewButtons() {
  refs.viewButtons.forEach((btn) => {
    if (btn.dataset.view === state.activeView) {
      btn.className = "view-btn rounded-lg border border-sky-400 bg-sky-500/20 px-2 py-1 text-xs text-sky-200";
    } else {
      btn.className = "view-btn rounded-lg border border-slate-600 px-2 py-1 text-xs";
    }
  });
}

function renderStepsTable() {
  refs.stepsBody.innerHTML = "";
  const result = state.byAlgorithm[state.activeView];
  if (!result || !result.steps.length) {
    refs.stepsBody.innerHTML = '<tr><td colspan="8" class="px-2 py-3 text-center text-slate-400">Tidak ada step.</td></tr>';
    return;
  }

  const fragment = document.createDocumentFragment();
  result.steps.forEach((step, idx) => {
    const row = document.createElement("tr");
    row.className = "border-b border-slate-800";
    row.innerHTML = `
      <td class="px-2 py-2">${idx + 1}</td>
      <td class="px-2 py-2">${step.from_node_id}</td>
      <td class="px-2 py-2">${step.camp_id}</td>
      <td class="px-2 py-2">${step.arrival_time.toFixed(1)}s</td>
      <td class="px-2 py-2">${step.wait_time.toFixed(1)}s</td>
      <td class="px-2 py-2">${step.clear_time.toFixed(1)}s</td>
      <td class="px-2 py-2">${step.finish_time.toFixed(1)}s</td>
      <td class="px-2 py-2">${Math.floor(step.total_xp)}</td>
    `;
    fragment.append(row);
  });
  refs.stepsBody.append(fragment);
}

function renderNodes() {
  refs.nodesLayer.innerHTML = "";
  for (const node of VISUAL_NODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-node";
    button.dataset.campId = node.campId;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.style.background = `linear-gradient(145deg, ${node.color}, #0f172a)`;
    button.textContent = node.short;
    button.title = node.campId;
    refs.nodesLayer.append(button);
  }
}

function renderRoute() {
  refs.routePathGroup.innerHTML = "";

  const result = state.byAlgorithm[state.activeView];
  if (!result || !result.steps.length) {
    refreshNodeHighlight();
    return;
  }

  const pathNodeIds = [result.startNode, ...result.steps.map((step) => step.camp_id)];
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < pathNodeIds.length - 1; i += 1) {
    const src = NODE_MAP.get(pathNodeIds[i]);
    const dst = NODE_MAP.get(pathNodeIds[i + 1]);
    if (!src || !dst) {
      continue;
    }

    const midX = (src.x + dst.x) / 2;
    const midY = (src.y + dst.y) / 2;
    const bend = i % 2 === 0 ? 1.8 : -1.8;
    const cx = midX + bend;
    const cy = midY - bend;

    const curve = document.createElementNS(SVG_NS, "path");
    curve.setAttribute("d", `M ${src.x} ${src.y} Q ${cx} ${cy} ${dst.x} ${dst.y}`);
    curve.setAttribute("class", "route-line");
    curve.setAttribute("marker-end", "url(#route-arrow)");
    fragment.append(curve);

    const badge = document.createElementNS(SVG_NS, "circle");
    badge.setAttribute("class", "route-step-badge");
    badge.setAttribute("cx", String(midX));
    badge.setAttribute("cy", String(midY));
    badge.setAttribute("r", "1.85");
    fragment.append(badge);

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "route-step-text");
    text.setAttribute("x", String(midX));
    text.setAttribute("y", String(midY + 0.1));
    text.textContent = String(i + 1);
    fragment.append(text);
  }

  refs.routePathGroup.append(fragment);
  refreshNodeHighlight();
}

function refreshNodeHighlight() {
  const result = state.byAlgorithm[state.activeView];
  const inRoute = new Set(result ? [result.startNode, ...result.steps.map((step) => step.camp_id)] : []);

  refs.nodesLayer.querySelectorAll(".map-node").forEach((btn) => {
    const campId = btn.dataset.campId;
    btn.classList.toggle("selected", campId === state.selectedCampId);
    btn.classList.toggle("in-route", inRoute.has(campId));
  });
}

function selectCamp(campId) {
  state.selectedCampId = campId;
  renderSelectedNodeCard();
  refreshNodeHighlight();
}

function renderSelectedNodeCard() {
  const node = NODE_MAP.get(state.selectedCampId);
  if (!node) {
    refs.selectedNodeCard.textContent = "Klik node di peta untuk lihat detail camp.";
    return;
  }

  const camp = state.currentProblem?.camps?.[node.campId] || null;
  refs.selectedNodeCard.innerHTML = `
    <h3 class="mb-2 text-sm font-semibold text-slate-100">${node.campId}</h3>
    <div class="space-y-1 text-xs text-slate-300">
      <div>Tipe: <span class="text-slate-100">${node.type}</span></div>
      <div>XP: <span class="text-slate-100">${camp ? camp.xp : "-"}</span></div>
      <div>HP: <span class="text-slate-100">${camp ? camp.hp : "-"}</span></div>
      <div>First Spawn: <span class="text-slate-100">${camp ? `${camp.first_spawn}s` : "-"}</span></div>
      <div>Respawn: <span class="text-slate-100">${camp ? `${camp.respawn}s` : "-"}</span></div>
    </div>
  `;
}

function clearResults(message) {
  state.byAlgorithm.greedy = null;
  state.byAlgorithm.backtracking = null;
  state.byAlgorithm.hybrid = null;
  refs.resultSummary.textContent = message;
  refs.stepsBody.innerHTML = "";
  refs.routePathGroup.innerHTML = "";
  refreshNodeHighlight();
}

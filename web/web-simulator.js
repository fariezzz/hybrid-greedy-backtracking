const INF = Number.POSITIVE_INFINITY;
const DEFAULT_TARGET_XP = 1000;
const DEFAULT_MAX_STEPS = 7;
const RETRIBUTION_COOLDOWN = 35.0;
const TURTLE_SPAWN_TIME = 120.0;
const BASE_NODE = "Base / Start";
const RED_BUFF_NODE = "Molten Fiend (Red Buff)";
const BLUE_BUFF_NODE = "Thunder Fenrir (Blue Buff)";
const SVG_NS = "http://www.w3.org/2000/svg";

const VISUAL_NODES = [
  { campId: BASE_NODE, short: "ST", x: 5, y: 95, color: "#0ea5e9", type: "start" },
  { campId: BLUE_BUFF_NODE, short: "TF", x: 26, y: 53, color: "#6366f1", type: "elite" },
  { campId: "Fire Beetle", short: "FB", x: 60, y: 85, color: "#22c55e", type: "common" },
  { campId: "Horned Lizard", short: "HL", x: 18, y: 43, color: "#16a34a", type: "common" },
  { campId: "Lithowanderer", short: "LW", x: 61, y: 63, color: "#38bdf8", type: "river" },
  { campId: RED_BUFF_NODE, short: "MF", x: 46, y: 83, color: "#ef4444", type: "elite" },
  { campId: "Lava Golem", short: "LG", x: 50, y: 75, color: "#84cc16", type: "common" },
  { campId: "Scavenger Crab", short: "SC", x: 19, y: 25, color: "#f59e0b", type: "river" },
  { campId: "Scavenger Crab 2", short: "SC2", x: 81, y: 78, color: "#f97316", type: "river" },
];

const NODE_MAP = new Map(VISUAL_NODES.map((n) => [n.campId, n]));

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

window.addEventListener("DOMContentLoaded", init);

async function init() {
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

async function loadDataBundle() {
  const [heroRows, emblemRows, monsterRows, distanceRows] = await Promise.all([
    fetchCsvRowsWithFallback("Hero.csv"),
    fetchCsvRowsWithFallback("Emblem.csv"),
    fetchCsvRowsWithFallback("Monster.csv"),
    fetchDistanceRowsWithFallback("Jarak.csv"),
  ]);

  const heroes = heroRows.map((row) => ({
    name: row.hero,
    emblem_type: row.emblem,
    talents: extractHeroTalents(row),
    max_hp: Number(row.max_hp) || 0,
    physical_attack: Number(row.physical_attack) || 0,
    movement_speed: Number(row.movement_speed) || 0,
    skill_priority: Number(row.skill_priority) || 1,
    skills: [mapHeroSkill(row, 1), mapHeroSkill(row, 2), mapHeroSkill(row, 3)],
  }));

  const emblems = emblemRows.map((row) => mapEmblemRow(row));

  const monstersByName = new Map();
  for (const row of monsterRows) {
    monstersByName.set(normalizeName(row.monster_name), {
      first_spawn: Number(row.first_spawn_s) || 0,
      respawn: Number(row.respawn_s) || 0,
      hp: Number(row.hp) || 0,
      xp: Number(row.exp_reward) || 0,
      creep_type: row.creep_type,
    });
  }

  const labels = distanceRows.header.slice(1);
  const distanceMatrix = {};
  for (const row of distanceRows.rows) {
    const from = row[0];
    distanceMatrix[from] = {};
    for (let index = 1; index < row.length; index += 1) {
      distanceMatrix[from][labels[index - 1]] = Number(row[index]);
    }
  }

  const campOrder = labels.filter((label) => label !== BASE_NODE);
  return { heroes, emblems, monstersByName, distanceMatrix, campOrder };
}

async function fetchCsvRows(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} (${response.status})`);
  }
  const text = await response.text();
  return parseCsvObjects(text);
}

async function fetchDistanceRows(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} (${response.status})`);
  }
  const text = await response.text();
  const rows = parseCsvRows(text);
  return {
    header: rows[0],
    rows: rows.slice(1),
  };
}

function buildDatasetCandidates(fileName) {
  return [
    `../datasets/${fileName}`,
    `./../datasets/${fileName}`,
    `/datasets/${fileName}`,
  ];
}

async function fetchTextWithFallback(fileName) {
  const paths = buildDatasetCandidates(fileName);
  const errors = [];

  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) {
        errors.push(`${path} (${response.status})`);
        continue;
      }
      return await response.text();
    } catch (error) {
      errors.push(`${path} (${error.message || String(error)})`);
    }
  }

  throw new Error(`${fileName} tidak bisa di-load. Coba jalankan via server lokal. Detail: ${errors.join(" | ")}`);
}

async function fetchCsvRowsWithFallback(fileName) {
  const text = await fetchTextWithFallback(fileName);
  return parseCsvObjects(text);
}

async function fetchDistanceRowsWithFallback(fileName) {
  const text = await fetchTextWithFallback(fileName);
  const rows = parseCsvRows(text);
  if (!rows.length) {
    throw new Error(`${fileName} kosong atau tidak valid`);
  }
  return {
    header: rows[0],
    rows: rows.slice(1),
  };
}

function parseCsvObjects(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return [];
  }
  const header = rows[0];
  return rows.slice(1).map((values) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = values[idx] ?? "";
    });
    return obj;
  });
}

function parseCsvRows(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return [];
  }
  return cleaned.split(/\r?\n/).map((line) => parseCsvLine(line));
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function mapHeroSkill(row, index) {
  const base_damage = Number(row[`dmg_skill_${index}`]) || 0;
  const scale_type_raw = String(row[`skill_${index}_scale_type`] || "").toLowerCase();
  const scale_type = ["total", "extra"].includes(scale_type_raw) ? scale_type_raw : "none";
  return {
    index,
    base_damage,
    scale_type,
    scale_percent: parsePercent(row[`skill_${index}_percentage`]),
    cooldown: Number(row[`skill_${index}_cd`]) || 0,
    total_hp_scale: index === 1 ? parsePercent(row.skill_1_total_hp_scale) : 0,
    damage_multiplier: index === 1 ? parsePercent(row.skill_1_multiplier_dmg ?? row.skill_1_bonus_creep_dmg) : 1,
    active: base_damage > 0 && (Number(row[`skill_${index}_cd`]) || 0) > 0,
  };
}

function mapEmblemRow(row) {
  const attrs = [];
  for (let i = 1; i <= 3; i += 1) {
    const name = row[`attr_${i}_name`];
    if (!name) {
      continue;
    }
    attrs.push({
      name,
      value: Number(row[`attr_${i}_value`]) || 0,
      unit: String(row[`attr_${i}_unit`] || "flat").toLowerCase(),
    });
  }
  return { id: row.emblem_id, name: row.emblem_name, attrs };
}

function extractHeroTalents(row) {
  return Object.keys(row)
    .filter((key) => /^talent_\d+$/i.test(key))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .map((key) => String(row[key] || "").trim())
    .filter(Boolean);
}

function normalizeName(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePercent(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  return Number(String(value).replace("%", "").trim()) / 100;
}

function parsePercentFromText(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) / 100 : null;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function levelFromXp(totalXp) {
  if (totalXp >= 1000) {
    return 4;
  }
  if (totalXp >= 650) {
    return 3;
  }
  if (totalXp >= 300) {
    return 2;
  }
  return 1;
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

function resolveDefaultEmblem(hero) {
  const heroType = normalizeName(hero.emblem_type);
  if (!heroType) {
    return state.data.emblems[0] || null;
  }
  return state.data.emblems.find((e) => normalizeName(e.name).includes(heroType)) || state.data.emblems[0] || null;
}

function applyEmblem(hero, emblem) {
  const stats = {
    max_hp: hero.max_hp,
    physical_attack: hero.physical_attack,
    movement_speed: hero.movement_speed,
    monster_damage_bonus: 0,
  };

  for (const attr of emblem.attrs) {
    const name = normalizeName(attr.name);
    const mul = attr.unit === "percent" ? attr.value / 100 : attr.value;

    if (name === "hp") {
      stats.max_hp = attr.unit === "percent" ? stats.max_hp * (1 + mul) : stats.max_hp + attr.value;
    } else if (name === "adaptive attack") {
      stats.physical_attack += attr.value;
    } else if (name === "adaptive penetration" || name === "magic penetration") {
      stats.physical_attack += attr.value * 1.25;
    } else if (name === "movement speed") {
      stats.movement_speed = attr.unit === "percent" ? stats.movement_speed * (1 + mul) : stats.movement_speed + attr.value;
    }
  }

  return stats;
}

function applyTalentEffects(stats, talents) {
  for (const talent of talents) {
    const name = normalizeName(talent);
    if (name === "thrill") {
      stats.physical_attack += 16;
    } else if (name === "vitality") {
      stats.max_hp += 225;
    } else if (name.includes("seasoned hunter")) {
      stats.monster_damage_bonus += parsePercentFromText(talent) || 0.075;
    }
  }
}

function renderHeroSummary() {
  const hero = getSelectedHero();
  if (!hero) {
    refs.heroSummaryCard.textContent = "Pilih hero untuk melihat atribut final.";
    return;
  }
  const emblem = resolveDefaultEmblem(hero);
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

function buildProblem(hero, emblem) {
  const hero_base_stats = {
    max_hp: hero.max_hp,
    physical_attack: hero.physical_attack,
    movement_speed: hero.movement_speed,
  };
  const hero_stats = applyEmblem(hero, emblem);
  applyTalentEffects(hero_stats, hero.talents);

  const camps = {};
  for (const campLabel of state.data.campOrder) {
    const monster = state.data.monstersByName.get(normalizeName(campLabel));
    if (!monster) {
      throw new Error(`Monster untuk node '${campLabel}' tidak ditemukan di Monster.csv`);
    }
    camps[campLabel] = {
      id: campLabel,
      name: campLabel,
      first_spawn: monster.first_spawn,
      respawn: monster.respawn,
      xp: monster.xp,
      max_kills: 1,
      hp: monster.hp,
      creep_type: monster.creep_type,
    };
  }

  return {
    hero,
    emblem,
    hero_base_stats,
    hero_stats,
    camps,
    camp_order: state.data.campOrder,
    travel_time: buildTravelTime(hero_stats.movement_speed),
    target_xp: DEFAULT_TARGET_XP,
    max_steps: DEFAULT_MAX_STEPS,
    time_limit: TURTLE_SPAWN_TIME,
    clear_time_cache: new Map(),
  };
}

function buildTravelTime(moveSpeed) {
  const activeNodes = [BASE_NODE, ...state.data.campOrder];
  const travel = {};

  for (const src of activeNodes) {
    travel[src] = {};
    for (const dst of state.data.campOrder) {
      travel[src][dst] = src === dst ? 0 : calcTravelSeconds(state.data.distanceMatrix[src]?.[dst], moveSpeed);
    }
  }
  return travel;
}

function calcTravelSeconds(distance, moveSpeed) {
  if (!Number.isFinite(distance)) {
    return INF;
  }
  return round1(Math.max(1.2, (distance * 5400) / moveSpeed));
}

function getUnlockedSkills(hero, level) {
  const available = hero.skills.filter((s) => s.active);
  if (!available.length) {
    return [];
  }

  const first = available.find((s) => s.index === hero.skill_priority) || available[0];
  const unlocked = [first];

  if (level >= 2) {
    const second = available.find((s) => s.index !== first.index);
    if (second) {
      unlocked.push(second);
    }
  }

  if (level >= 3 && normalizeName(hero.name) === "suyou") {
    const skill3 = available.find((s) => s.index === 3);
    if (skill3 && unlocked.every((s) => s.index !== 3)) {
      unlocked.push(skill3);
    }
  }

  return unlocked;
}

function applyMonsterDamageBonus(damage, heroStats) {
  return damage * (1 + heroStats.monster_damage_bonus);
}

function getSkillDamage(skill, heroStats, baseStats) {
  if (!skill.active) {
    return 0;
  }

  const totalScale = heroStats.physical_attack;
  const baseScale = baseStats.physical_attack;
  const extraScale = Math.max(0, totalScale - baseScale);

  let raw = skill.base_damage;
  if (skill.scale_type === "total") {
    raw += totalScale * skill.scale_percent;
  } else if (skill.scale_type === "extra") {
    raw += extraScale * skill.scale_percent;
  }
  raw += heroStats.max_hp * skill.total_hp_scale;
  raw *= skill.damage_multiplier;
  return Math.max(1.0, applyMonsterDamageBonus(raw, heroStats));
}

function getRetributionDamage(level) {
  if (level >= 3) {
    return 760;
  }
  if (level >= 2) {
    return 680;
  }
  return 600;
}

function estimateCampClearTime(problem, campId, currentXp, currentTime, retributionReadyAt) {
  const level = levelFromXp(currentXp);
  const delay = Math.max(0, retributionReadyAt - currentTime);
  const cacheKey = `${campId}|${level}|${Math.round(delay * 10)}`;
  if (problem.clear_time_cache.has(cacheKey)) {
    return problem.clear_time_cache.get(cacheKey);
  }

  const camp = problem.camps[campId];
  const heroStats = problem.hero_stats;
  const unlocked = getUnlockedSkills(problem.hero, level);

  let hpLeft = camp.hp;
  let time = currentTime;
  const nextReady = Object.fromEntries(unlocked.map((s) => [s.index, currentTime]));
  const basicDamage = Math.max(1.0, applyMonsterDamageBonus(heroStats.physical_attack, heroStats));
  let nextBasic = currentTime;
  let nextRetribution = retributionReadyAt;

  let guard = 0;
  while (hpLeft > 0 && time <= currentTime + 600) {
    guard += 1;
    if (guard > 10000) {
      break;
    }

    if (nextRetribution <= time + 1e-9) {
      hpLeft -= applyMonsterDamageBonus(getRetributionDamage(level), heroStats);
      nextRetribution = time + RETRIBUTION_COOLDOWN;
      continue;
    }

    const readySkills = unlocked.filter((s) => (nextReady[s.index] ?? INF) <= time + 1e-9);
    if (readySkills.length) {
      readySkills.sort((a, b) => getSkillDamage(b, heroStats, problem.hero_base_stats) - getSkillDamage(a, heroStats, problem.hero_base_stats));
      const chosen = readySkills[0];
      hpLeft -= getSkillDamage(chosen, heroStats, problem.hero_base_stats);
      nextReady[chosen.index] = time + Math.max(0.1, chosen.cooldown);
      continue;
    }

    if (nextBasic <= time + 1e-9) {
      hpLeft -= basicDamage;
      nextBasic = time + 1.0;
      continue;
    }

    const nextSkill = unlocked.length ? Math.min(...unlocked.map((s) => nextReady[s.index] ?? INF)) : INF;
    const nextTime = Math.min(nextBasic, nextSkill, nextRetribution);
    if (nextTime <= time || nextTime === INF) {
      break;
    }
    time = nextTime;
  }

  const result = {
    clear_time: round1(Math.max(time - currentTime, 0.1)),
    next_retribution_ready: nextRetribution,
  };
  problem.clear_time_cache.set(cacheKey, result);
  return result;
}

function isKillAllowed(campId, kills, camps) {
  const maxKills = camps[campId].max_kills;
  return maxKills === null || kills[campId] < maxKills;
}

function simulateStep(problem, state, campId) {
  const move = problem.travel_time[state.current_node]?.[campId] ?? INF;
  const arrival = state.current_time + move;
  const clearStart = Math.max(arrival, state.next_available[campId]);
  const combat = estimateCampClearTime(problem, campId, state.current_xp, clearStart, state.next_retribution_ready);
  const finish = clearStart + combat.clear_time;
  const gainedXp = problem.camps[campId].xp;

  return {
    from_node_id: state.current_node,
    camp_id: campId,
    depart_time: state.current_time,
    arrival_time: arrival,
    wait_time: clearStart - arrival,
    clear_start_time: clearStart,
    clear_time: combat.clear_time,
    finish_time: finish,
    gained_xp: gainedXp,
    total_xp: state.current_xp + gainedXp,
    level_before: levelFromXp(state.current_xp),
    level_after: levelFromXp(state.current_xp + gainedXp),
    next_retribution_ready: combat.next_retribution_ready,
  };
}

function buildCandidates(problem, state, enforceTimeLimit = true) {
  const candidates = [];
  for (const campId of problem.camp_order) {
    if (!isKillAllowed(campId, state.kills, problem.camps)) {
      continue;
    }
    const step = simulateStep(problem, state, campId);
    if (!enforceTimeLimit || step.finish_time <= problem.time_limit) {
      candidates.push(step);
    }
  }
  return candidates;
}

function updateCampAvailability(problem, kills, nextAvailable, step) {
  const campId = step.camp_id;
  kills[campId] += 1;
  const camp = problem.camps[campId];
  nextAvailable[campId] = camp.max_kills !== null && kills[campId] >= camp.max_kills ? INF : step.finish_time + camp.respawn;
}

function buildInitialState(problem, startBuff) {
  const kills = {};
  const nextAvailable = {};
  for (const campId of problem.camp_order) {
    kills[campId] = 0;
    nextAvailable[campId] = problem.camps[campId].first_spawn;
  }

  const state = {
    current_node: BASE_NODE,
    current_time: 0,
    current_xp: 0,
    next_retribution_ready: 0,
    kills,
    next_available: nextAvailable,
    steps: [],
  };

  const forced = startBuff === "red" ? RED_BUFF_NODE : BLUE_BUFF_NODE;
  if (problem.camps[forced]) {
    const firstStep = simulateStep(problem, state, forced);
    if (firstStep.finish_time <= problem.time_limit) {
      state.steps.push(firstStep);
      state.current_node = forced;
      state.current_time = firstStep.finish_time;
      state.current_xp = firstStep.total_xp;
      state.next_retribution_ready = firstStep.next_retribution_ready;
      updateCampAvailability(problem, state.kills, state.next_available, firstStep);
    }
  }

  return state;
}

function travelDuration(step) {
  return step.arrival_time - step.depart_time;
}

function hybridCandidateScore(step) {
  return step.gained_xp / Math.max(0.1, step.finish_time - step.depart_time);
}

function cloneState(initialState) {
  return {
    current_node: initialState.current_node,
    current_time: initialState.current_time,
    current_xp: initialState.current_xp,
    next_retribution_ready: initialState.next_retribution_ready,
    kills: { ...initialState.kills },
    next_available: { ...initialState.next_available },
    steps: [...initialState.steps],
  };
}

function solveGreedy(problem, initialState) {
  const stateLocal = cloneState(initialState);
  let blockedByTimeLimit = false;
  let nextFinishIfForced = null;

  while (stateLocal.current_xp < problem.target_xp && stateLocal.steps.length < problem.max_steps && stateLocal.current_time <= problem.time_limit) {
    const candidates = buildCandidates(problem, stateLocal);
    if (!candidates.length) {
      const overflow = buildCandidates(problem, stateLocal, false);
      if (overflow.length) {
        blockedByTimeLimit = true;
        nextFinishIfForced = Math.min(...overflow.map((s) => s.finish_time));
      }
      break;
    }

    candidates.sort((a, b) => travelDuration(a) - travelDuration(b) || b.gained_xp - a.gained_xp || a.finish_time - b.finish_time);
    const best = candidates[0];

    stateLocal.steps.push(best);
    stateLocal.current_node = best.camp_id;
    stateLocal.current_time = best.finish_time;
    stateLocal.current_xp = best.total_xp;
    stateLocal.next_retribution_ready = best.next_retribution_ready;
    updateCampAvailability(problem, stateLocal.kills, stateLocal.next_available, best);
  }

  return {
    method: "Greedy",
    reached_target: stateLocal.current_xp >= problem.target_xp,
    total_time: stateLocal.current_time,
    total_xp: stateLocal.current_xp,
    steps: stateLocal.steps,
    expanded_states: 0,
    blocked_by_time_limit: blockedByTimeLimit,
    next_finish_if_forced: nextFinishIfForced,
    startNode: initialState.current_node,
  };
}

function solveBacktrackingPure(problem, initialState) {
  const best = {
    method: "Backtracking (Pure/No Pruning)",
    reached_target: initialState.current_xp >= problem.target_xp,
    total_time: initialState.current_xp >= problem.target_xp ? initialState.current_time : INF,
    total_xp: initialState.current_xp,
    steps: [...initialState.steps],
    expanded_states: 0,
    blocked_by_time_limit: false,
    next_finish_if_forced: null,
    startNode: initialState.current_node,
  };
  let expandedStates = 0;

  function backtrack(node, now, xp, retri, kills, avail, path) {
    expandedStates += 1;

    if (xp >= problem.target_xp) {
      if (now < best.total_time) {
        best.reached_target = true;
        best.total_time = now;
        best.total_xp = xp;
        best.steps = [...path];
      }
      return;
    }

    if (path.length >= problem.max_steps || now > problem.time_limit) {
      return;
    }

    const stateRun = {
      current_node: node,
      current_time: now,
      current_xp: xp,
      next_retribution_ready: retri,
      kills,
      next_available: avail,
    };
    const candidates = buildCandidates(problem, stateRun);
    for (const step of candidates) {
      if (step.finish_time > problem.time_limit) {
        continue;
      }
      const nextKills = { ...kills };
      const nextAvail = { ...avail };
      updateCampAvailability(problem, nextKills, nextAvail, step);
      path.push(step);
      backtrack(step.camp_id, step.finish_time, step.total_xp, step.next_retribution_ready, nextKills, nextAvail, path);
      path.pop();
    }
  }

  if (initialState.current_xp < problem.target_xp) {
    backtrack(
      initialState.current_node,
      initialState.current_time,
      initialState.current_xp,
      initialState.next_retribution_ready,
      { ...initialState.kills },
      { ...initialState.next_available },
      [...initialState.steps],
    );
  }

  best.expanded_states = expandedStates;
  return best;
}

function solveBacktrackingPruned(problem, initialState, seedResult, methodLabel, useHybridOrdering = false) {
  const bestXpRate = Math.max(
    ...problem.camp_order.map((campId) => problem.camps[campId].xp / Math.max(0.1, estimateCampClearTime(problem, campId, problem.target_xp, 0, 0).clear_time))
  );

  const visitedBestTime = new Map();
  let expandedStates = 0;
  let blockedByTimeLimit = false;
  let nextFinishIfForced = null;

  let best = {
    method: methodLabel,
    reached_target: initialState.current_xp >= problem.target_xp,
    total_time: initialState.current_xp >= problem.target_xp ? initialState.current_time : INF,
    total_xp: initialState.current_xp,
    steps: [...initialState.steps],
    expanded_states: 0,
    startNode: initialState.current_node,
  };

  if (seedResult && seedResult.reached_target) {
    best = { ...seedResult, method: methodLabel, steps: [...seedResult.steps], startNode: initialState.current_node };
  }

  function maxPossibleExtraXp(kills, stepsLeft) {
    let total = 0;
    for (const campId of problem.camp_order) {
      const camp = problem.camps[campId];
      total += camp.xp * (camp.max_kills === null ? stepsLeft : Math.max(camp.max_kills - kills[campId], 0));
    }
    return total;
  }

  function optimisticLowerBound(node, now, xp, kills, avail, retri) {
    const needed = problem.target_xp - xp;
    if (needed <= 0) {
      return 0;
    }

    const fastestBound = needed / bestXpRate;
    const first = [];
    for (const campId of problem.camp_order) {
      if (!isKillAllowed(campId, kills, problem.camps)) {
        continue;
      }
      const travel = problem.travel_time[node]?.[campId] ?? INF;
      const start = Math.max(now + travel, avail[campId]);
      const clear = estimateCampClearTime(problem, campId, xp, start, retri).clear_time;
      first.push(start - now + clear);
    }
    return first.length ? Math.max(fastestBound, Math.min(...first)) : INF;
  }

  function buildStateKey(node, xp, kills, avail, retri) {
    const killsKey = problem.camp_order.map((campId) => kills[campId]).join(",");
    const availKey = problem.camp_order.map((campId) => (Number.isFinite(avail[campId]) ? String(Math.round(avail[campId] * 10)) : "-1")).join(",");
    return `${node}|${Math.floor(xp / 20)}|${killsKey}|${availKey}|${Number.isFinite(retri) ? Math.round(retri * 10) : -1}`;
  }

  function backtrack(node, now, xp, retri, kills, avail, path) {
    expandedStates += 1;

    if (xp >= problem.target_xp) {
      if (now < best.total_time) {
        best = {
          method: methodLabel,
          reached_target: true,
          total_time: now,
          total_xp: xp,
          steps: [...path],
          expanded_states: expandedStates,
          startNode: initialState.current_node,
        };
      }
      return;
    }

    if (path.length >= problem.max_steps || now >= best.total_time || now > problem.time_limit) {
      return;
    }

    const stepsLeft = problem.max_steps - path.length;
    if (xp + maxPossibleExtraXp(kills, stepsLeft) < problem.target_xp) {
      return;
    }

    if (now + optimisticLowerBound(node, now, xp, kills, avail, retri) >= best.total_time) {
      return;
    }

    const key = buildStateKey(node, xp, kills, avail, retri);
    const prev = visitedBestTime.get(key);
    if (prev !== undefined && prev <= now) {
      return;
    }
    visitedBestTime.set(key, now);

    const run = {
      current_node: node,
      current_time: now,
      current_xp: xp,
      next_retribution_ready: retri,
      kills,
      next_available: avail,
    };
    let candidates = buildCandidates(problem, run);

    if (!candidates.length) {
      const overflow = buildCandidates(problem, run, false);
      if (overflow.length) {
        blockedByTimeLimit = true;
        const overflowMin = Math.min(...overflow.map((s) => s.finish_time));
        if (nextFinishIfForced === null || overflowMin < nextFinishIfForced) {
          nextFinishIfForced = overflowMin;
        }
      }
      return;
    }

    if (useHybridOrdering) {
      candidates.sort((a, b) => hybridCandidateScore(b) - hybridCandidateScore(a) || travelDuration(a) - travelDuration(b) || b.gained_xp - a.gained_xp || a.finish_time - b.finish_time);
    } else {
      candidates.sort((a, b) => b.gained_xp - a.gained_xp || travelDuration(a) - travelDuration(b) || a.finish_time - b.finish_time);
    }

    for (const step of candidates) {
      if (step.finish_time >= best.total_time || step.finish_time > problem.time_limit) {
        continue;
      }
      const nextKills = { ...kills };
      const nextAvail = { ...avail };
      updateCampAvailability(problem, nextKills, nextAvail, step);
      path.push(step);
      backtrack(step.camp_id, step.finish_time, step.total_xp, step.next_retribution_ready, nextKills, nextAvail, path);
      path.pop();
    }
  }

  if (initialState.current_xp < problem.target_xp) {
    backtrack(
      initialState.current_node,
      initialState.current_time,
      initialState.current_xp,
      initialState.next_retribution_ready,
      { ...initialState.kills },
      { ...initialState.next_available },
      [...initialState.steps],
    );
  }

  best.expanded_states = expandedStates;
  best.blocked_by_time_limit = blockedByTimeLimit;
  if (best.next_finish_if_forced === undefined) {
    best.next_finish_if_forced = nextFinishIfForced;
  }
  return best;
}

function solveHybridGreedy(problem, initialState) {
  const stateLocal = cloneState(initialState);
  let blockedByTimeLimit = false;
  let nextFinishIfForced = null;

  while (stateLocal.current_xp < problem.target_xp && stateLocal.steps.length < problem.max_steps && stateLocal.current_time <= problem.time_limit) {
    const candidates = buildCandidates(problem, stateLocal);
    if (!candidates.length) {
      const overflow = buildCandidates(problem, stateLocal, false);
      if (overflow.length) {
        blockedByTimeLimit = true;
        nextFinishIfForced = Math.min(...overflow.map((s) => s.finish_time));
      }
      break;
    }

    candidates.sort((a, b) => hybridCandidateScore(b) - hybridCandidateScore(a) || travelDuration(a) - travelDuration(b) || b.gained_xp - a.gained_xp || a.finish_time - b.finish_time);
    const best = candidates[0];

    stateLocal.steps.push(best);
    stateLocal.current_node = best.camp_id;
    stateLocal.current_time = best.finish_time;
    stateLocal.current_xp = best.total_xp;
    stateLocal.next_retribution_ready = best.next_retribution_ready;
    updateCampAvailability(problem, stateLocal.kills, stateLocal.next_available, best);
  }

  return {
    method: "Hybrid Greedy-Backtracking",
    reached_target: stateLocal.current_xp >= problem.target_xp,
    total_time: stateLocal.current_time,
    total_xp: stateLocal.current_xp,
    steps: stateLocal.steps,
    expanded_states: 0,
    blocked_by_time_limit: blockedByTimeLimit,
    next_finish_if_forced: nextFinishIfForced,
    startNode: initialState.current_node,
  };
}

function solveHybrid(problem, initialState) {
  const greedyResult = solveHybridGreedy(problem, initialState);
  const backtrackingResult = solveBacktrackingPruned(
    problem,
    initialState,
    greedyResult.reached_target ? greedyResult : null,
    "Hybrid Greedy-Backtracking",
    true
  );

  if (backtrackingResult.reached_target) {
    return backtrackingResult;
  }

  let mergedOverflow = null;
  const go = greedyResult.next_finish_if_forced;
  const bo = backtrackingResult.next_finish_if_forced;
  if (go !== null && bo !== null) {
    mergedOverflow = Math.min(go, bo);
  } else if (go !== null) {
    mergedOverflow = go;
  } else if (bo !== null) {
    mergedOverflow = bo;
  }

  return {
    ...greedyResult,
    expanded_states: backtrackingResult.expanded_states,
    blocked_by_time_limit: Boolean(greedyResult.blocked_by_time_limit) || Boolean(backtrackingResult.blocked_by_time_limit),
    next_finish_if_forced: mergedOverflow,
  };
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
    const emblem = resolveDefaultEmblem(hero);
    const problem = buildProblem(hero, emblem);
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

  const pathNodeIds = [result.startNode, ...result.steps.map((s) => s.camp_id)];
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
  const inRoute = new Set(result ? [result.startNode, ...result.steps.map((s) => s.camp_id)] : []);

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

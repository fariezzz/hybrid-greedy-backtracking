const HEROES = [
  { name: "Ling", speed: 280 },
  { name: "Suyou", speed: 265 },
  { name: "Fanny", speed: 260 },
  { name: "Hayabusa", speed: 260 },
  { name: "Lancelot", speed: 260 },
  { name: "Karina", speed: 260 },
  { name: "Alucard", speed: 260 },
  { name: "Aamon", speed: 250 },
  { name: "Hanzo", speed: 255 },
  { name: "Roger", speed: 260 },
];

const NODE_LIST = [
  {
    id: "BASE",
    short: "ST",
    name: "Base / Start",
    type: "start",
    x: 5,
    y: 95,
    xp: 0,
    clearTime: 0,
    firstSpawn: 0,
    respawn: 0,
    maxKills: null,
    color: "#00bcd4",
  },
  {
    id: "THUNDER_FENRIR",
    short: "TF",
    name: "Thunder Fenrir (Blue Buff)",
    type: "elite",
    x: 26,
    y: 53,
    xp: 300,
    clearTime: 15,
    firstSpawn: 25,
    respawn: 90,
    maxKills: 1,
    color: "#5a78ff",
  },
  {
    id: "FIRE_BEETLE",
    short: "FB",
    name: "Fire Beetle",
    type: "common",
    x: 60,
    y: 85,
    xp: 220,
    clearTime: 11,
    firstSpawn: 39,
    respawn: 70,
    maxKills: 1,
    color: "#34d399",
  },
  {
    id: "HORNED_LIZARD",
    short: "HL",
    name: "Horned Lizard",
    type: "common",
    x: 18,
    y: 43,
    xp: 220,
    clearTime: 11,
    firstSpawn: 40,
    respawn: 70,
    maxKills: 1,
    color: "#22c55e",
  },
  {
    id: "LITHOWANDERER",
    short: "LW",
    name: "Lithowanderer",
    type: "river",
    x: 61,
    y: 63,
    xp: 180,
    clearTime: 8,
    firstSpawn: 48,
    respawn: 60,
    maxKills: 1,
    color: "#38bdf8",
  },
  {
    id: "MOLTEN_FIEND",
    short: "MF",
    name: "Molten Fiend (Red Buff)",
    type: "elite",
    x: 46,
    y: 83,
    xp: 300,
    clearTime: 15,
    firstSpawn: 25,
    respawn: 90,
    maxKills: 1,
    color: "#ff5f9d",
  },
  {
    id: "LAVA_GOLEM",
    short: "LG",
    name: "Lava Golem",
    type: "common",
    x: 50,
    y: 75,
    xp: 220,
    clearTime: 11,
    firstSpawn: 31,
    respawn: 70,
    maxKills: 1,
    color: "#84cc16",
  },
  {
    id: "SCAVENGER_CRAB_1",
    short: "SC",
    name: "Scavenger Crab",
    type: "river",
    x: 19,
    y: 25,
    xp: 170,
    clearTime: 9,
    firstSpawn: 42,
    respawn: 45,
    maxKills: 1,
    color: "#f59e0b",
  },
  {
    id: "SCAVENGER_CRAB_2",
    short: "SC",
    name: "Scavenger Crab",
    type: "river",
    x: 81,
    y: 78,
    xp: 170,
    clearTime: 9,
    firstSpawn: 42,
    respawn: 45,
    maxKills: 1,
    color: "#f59e0b",
  },
];

const NODE_MAP = new Map(NODE_LIST.map((node) => [node.id, node]));
const CAMP_NODES = NODE_LIST.filter((node) => node.id !== "BASE");
const SVG_NS = "http://www.w3.org/2000/svg";
const INF = Number.POSITIVE_INFINITY;

const state = {
  selectedNodeId: null,
  startNodeId: "BASE",
  inactiveNodeIds: new Set(),
  routeNodeIds: new Set(),
};

const refs = {
  form: document.getElementById("config-form"),
  algorithm: document.getElementById("algorithm"),
  heroSelect: document.getElementById("hero-select"),
  moveSpeed: document.getElementById("move-speed"),
  targetXp: document.getElementById("target-xp"),
  maxSteps: document.getElementById("max-steps"),
  resetBtn: document.getElementById("reset-btn"),
  nodesLayer: document.getElementById("nodes-layer"),
  routePathGroup: document.getElementById("route-path-group"),
  selectedNodeCard: document.getElementById("selected-node-card"),
  setStartBtn: document.getElementById("set-start-btn"),
  toggleNodeBtn: document.getElementById("toggle-node-btn"),
  resultSummary: document.getElementById("result-summary"),
  stepsBody: document.getElementById("steps-body"),
  startNodeLabel: document.getElementById("start-node-label"),
  activeCountLabel: document.getElementById("active-count-label"),
};

const nodeElements = new Map();
const DISTANCE_CACHE = buildDistanceCache();

init();

function init() {
  populateHeroes();
  renderMapNodes();
  attachEvents();
  selectNode("BASE");
  syncQuickStats();
}

function populateHeroes() {
  refs.heroSelect.innerHTML = "";
  for (const hero of HEROES) {
    const option = document.createElement("option");
    option.value = hero.name;
    option.textContent = `${hero.name} (${hero.speed})`;
    refs.heroSelect.append(option);
  }
  refs.heroSelect.value = "Fanny";
  refs.moveSpeed.value = String(getHeroSpeed(refs.heroSelect.value));
}

function renderMapNodes() {
  refs.nodesLayer.innerHTML = "";
  nodeElements.clear();

  for (const node of NODE_LIST) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-node";
    button.dataset.nodeId = node.id;
    button.title = node.name;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.style.background = nodeGradient(node.color);
    button.textContent = node.short;

    button.addEventListener("click", () => {
      selectNode(node.id);
    });

    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      selectNode(node.id);
      setStartNode(node.id);
    });

    refs.nodesLayer.append(button);
    nodeElements.set(node.id, button);
  }
}

function attachEvents() {
  refs.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSimulation();
  });

  refs.heroSelect.addEventListener("change", () => {
    refs.moveSpeed.value = String(getHeroSpeed(refs.heroSelect.value));
  });

  refs.resetBtn.addEventListener("click", () => {
    state.startNodeId = "BASE";
    state.inactiveNodeIds.clear();
    state.routeNodeIds.clear();
    clearRouteLayer();
    clearResult("Node berhasil direset ke kondisi awal.");
    selectNode("BASE");
    syncQuickStats();
    refreshNodeVisuals();
  });

  refs.setStartBtn.addEventListener("click", () => {
    if (state.selectedNodeId) {
      setStartNode(state.selectedNodeId);
    }
  });

  refs.toggleNodeBtn.addEventListener("click", () => {
    if (!state.selectedNodeId || state.selectedNodeId === "BASE") {
      return;
    }

    if (state.inactiveNodeIds.has(state.selectedNodeId)) {
      state.inactiveNodeIds.delete(state.selectedNodeId);
    } else {
      state.inactiveNodeIds.add(state.selectedNodeId);
      if (state.startNodeId === state.selectedNodeId) {
        state.startNodeId = "BASE";
      }
    }

    state.routeNodeIds.clear();
    clearRouteLayer();
    clearResult("Komposisi node berubah. Silakan hitung ulang.");
    syncQuickStats();
    renderSelectedNodeCard();
    refreshNodeVisuals();
  });
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  renderSelectedNodeCard();
  refreshNodeVisuals();
}

function setStartNode(nodeId) {
  state.startNodeId = nodeId;
  if (nodeId !== "BASE") {
    state.inactiveNodeIds.delete(nodeId);
  }

  state.routeNodeIds.clear();
  clearRouteLayer();
  clearResult("Start node diubah. Jalankan simulasi lagi.");
  syncQuickStats();
  renderSelectedNodeCard();
  refreshNodeVisuals();
}

function renderSelectedNodeCard() {
  const selectedNode = NODE_MAP.get(state.selectedNodeId);
  if (!selectedNode) {
    refs.selectedNodeCard.classList.add("empty");
    refs.selectedNodeCard.textContent = "Pilih node di peta untuk melihat detail.";
    refs.setStartBtn.disabled = true;
    refs.toggleNodeBtn.disabled = true;
    return;
  }

  refs.selectedNodeCard.classList.remove("empty");
  const isActive = selectedNode.id === "BASE" || !state.inactiveNodeIds.has(selectedNode.id);
  const statusClass = isActive ? "status-ok" : "status-bad";
  const statusLabel = isActive ? "Aktif" : "Nonaktif";
  const spawnLabel = selectedNode.id === "BASE" ? "-" : `${selectedNode.firstSpawn}s`;
  const respawnLabel = selectedNode.id === "BASE" ? "-" : `${selectedNode.respawn}s`;
  const xpLabel = selectedNode.id === "BASE" ? "-" : `${selectedNode.xp}`;
  const clearTimeLabel = selectedNode.id === "BASE" ? "-" : `${selectedNode.clearTime}s`;

  refs.selectedNodeCard.innerHTML = `
    <h3 class="node-title">${selectedNode.name}</h3>
    <div class="kv"><span class="k">ID</span><span>${selectedNode.id}</span></div>
    <div class="kv"><span class="k">Tipe</span><span>${selectedNode.type}</span></div>
    <div class="kv"><span class="k">Status</span><span class="${statusClass}">${statusLabel}</span></div>
    <div class="kv"><span class="k">XP</span><span>${xpLabel}</span></div>
    <div class="kv"><span class="k">Clear Time</span><span>${clearTimeLabel}</span></div>
    <div class="kv"><span class="k">First Spawn</span><span>${spawnLabel}</span></div>
    <div class="kv"><span class="k">Respawn</span><span>${respawnLabel}</span></div>
  `;

  refs.setStartBtn.disabled = false;
  refs.toggleNodeBtn.disabled = selectedNode.id === "BASE";
  refs.toggleNodeBtn.textContent = isActive ? "Nonaktifkan Node" : "Aktifkan Node";
}

function syncQuickStats() {
  const startNode = NODE_MAP.get(state.startNodeId);
  const activeCount = CAMP_NODES.filter((node) => !state.inactiveNodeIds.has(node.id)).length;

  refs.startNodeLabel.textContent = startNode ? startNode.name : "Base";
  refs.activeCountLabel.textContent = String(activeCount);
}

function refreshNodeVisuals() {
  for (const node of NODE_LIST) {
    const element = nodeElements.get(node.id);
    if (!element) {
      continue;
    }

    element.classList.toggle("selected", state.selectedNodeId === node.id);
    element.classList.toggle("start", state.startNodeId === node.id);
    element.classList.toggle("inactive", node.id !== "BASE" && state.inactiveNodeIds.has(node.id));
    element.classList.toggle("in-route", state.routeNodeIds.has(node.id));
  }
}

function runSimulation() {
  const targetXp = clampNumber(Number(refs.targetXp.value), 100, 3000, 1000);
  const maxSteps = clampNumber(Number(refs.maxSteps.value), 1, 14, 7);
  const moveSpeed = clampNumber(Number(refs.moveSpeed.value), 220, 320, 260);
  refs.targetXp.value = String(targetXp);
  refs.maxSteps.value = String(maxSteps);
  refs.moveSpeed.value = String(moveSpeed);

  const problem = buildProblem({
    targetXp,
    maxSteps,
    moveSpeed,
  });

  if (problem.campOrder.length === 0) {
    clearRouteLayer();
    state.routeNodeIds.clear();
    renderResult({
      method: humanMethod(refs.algorithm.value),
      reachedTarget: false,
      totalTime: INF,
      totalXp: 0,
      steps: [],
      expandedStates: 0,
      message: "Tidak ada node monster aktif untuk dihitung.",
      startNode: state.startNodeId,
    });
    refreshNodeVisuals();
    return;
  }

  let result;
  if (refs.algorithm.value === "greedy") {
    result = solveGreedy(problem);
  } else if (refs.algorithm.value === "backtracking") {
    result = solveBacktracking(problem, null, "Backtracking");
  } else {
    result = solveHybrid(problem);
  }

  renderRoute(result);
  renderResult(result);
  refreshNodeVisuals();
}

function buildProblem({ targetXp, maxSteps, moveSpeed }) {
  const camps = {};
  const campOrder = [];

  for (const node of CAMP_NODES) {
    if (state.inactiveNodeIds.has(node.id)) {
      continue;
    }

    camps[node.id] = {
      id: node.id,
      name: node.name,
      xp: node.xp,
      clearTime: node.clearTime,
      firstSpawn: node.firstSpawn,
      respawn: node.respawn,
      maxKills: node.maxKills,
    };
    campOrder.push(node.id);
  }

  const travelTime = buildTravelTime({
    moveSpeed,
    campOrder,
    startNode: state.startNodeId,
  });

  return {
    camps,
    campOrder,
    travelTime,
    startNode: state.startNodeId,
    targetXp,
    maxSteps,
    moveSpeed,
  };
}

function buildTravelTime({ moveSpeed, campOrder, startNode }) {
  const activeNodes = Array.from(new Set([startNode, ...campOrder]));
  const travel = {};

  for (const src of activeNodes) {
    travel[src] = {};
    for (const dst of campOrder) {
      if (src === dst) {
        travel[src][dst] = 0;
      } else {
        travel[src][dst] = calcTravelSeconds(src, dst, moveSpeed);
      }
    }
  }
  return travel;
}

function calcTravelSeconds(srcId, dstId, moveSpeed) {
  const distance = DISTANCE_CACHE[srcId]?.[dstId];
  if (!Number.isFinite(distance)) {
    return INF;
  }
  const seconds = Math.max(1.2, (distance * 5400) / moveSpeed);
  return round1(seconds);
}

function isKillAllowed(campId, kills, camps) {
  const maxKills = camps[campId].maxKills;
  return maxKills === null || kills[campId] < maxKills;
}

function simulateStep(problem, { currentNode, currentTime, currentXp, campId, nextAvailable }) {
  const camp = problem.camps[campId];
  const move = problem.travelTime[currentNode]?.[campId] ?? INF;
  const arrival = currentTime + move;
  const clearStart = Math.max(arrival, nextAvailable[campId]);
  const wait = clearStart - arrival;
  const finish = clearStart + camp.clearTime;
  const fromName = NODE_MAP.get(currentNode)?.name ?? currentNode;

  return {
    fromNodeId: currentNode,
    fromNodeName: fromName,
    campId,
    campName: camp.name,
    departTime: currentTime,
    arrivalTime: arrival,
    waitTime: wait,
    clearStartTime: clearStart,
    finishTime: finish,
    gainedXp: camp.xp,
    totalXp: currentXp + camp.xp,
  };
}

function scoreCandidate(step) {
  const deltaTime = step.finishTime - step.departTime;
  if (deltaTime <= 0) {
    return 0;
  }
  return step.gainedXp / deltaTime;
}

function solveGreedy(problem) {
  const kills = {};
  const nextAvailable = {};
  for (const campId of problem.campOrder) {
    kills[campId] = 0;
    nextAvailable[campId] = problem.camps[campId].firstSpawn;
  }

  let currentNode = problem.startNode;
  let currentTime = 0;
  let currentXp = 0;
  const steps = [];

  while (currentXp < problem.targetXp && steps.length < problem.maxSteps) {
    const candidates = [];

    for (const campId of problem.campOrder) {
      if (!isKillAllowed(campId, kills, problem.camps)) {
        continue;
      }
      const step = simulateStep(problem, {
        currentNode,
        currentTime,
        currentXp,
        campId,
        nextAvailable,
      });
      const score = scoreCandidate(step);
      candidates.push({ score, step });
    }

    if (candidates.length === 0) {
      break;
    }

    candidates.sort((a, b) => b.score - a.score || a.step.finishTime - b.step.finishTime);
    const best = candidates[0].step;
    steps.push(best);

    currentNode = best.campId;
    currentTime = best.finishTime;
    currentXp = best.totalXp;

    kills[best.campId] += 1;
    const camp = problem.camps[best.campId];
    if (camp.maxKills !== null && kills[best.campId] >= camp.maxKills) {
      nextAvailable[best.campId] = INF;
    } else {
      nextAvailable[best.campId] = best.finishTime + camp.respawn;
    }
  }

  return {
    method: "Greedy",
    reachedTarget: currentXp >= problem.targetXp,
    totalTime: currentTime,
    totalXp: currentXp,
    steps,
    expandedStates: 0,
    startNode: problem.startNode,
  };
}

function solveBacktracking(problem, seedResult, methodLabel) {
  const killsInit = {};
  const nextAvailableInit = {};
  for (const campId of problem.campOrder) {
    killsInit[campId] = 0;
    nextAvailableInit[campId] = problem.camps[campId].firstSpawn;
  }

  const bestXpRate = Math.max(
    ...problem.campOrder.map((campId) => problem.camps[campId].xp / problem.camps[campId].clearTime)
  );
  const visitedBestTime = new Map();
  let expandedStates = 0;

  let bestResult = {
    method: methodLabel,
    reachedTarget: false,
    totalTime: INF,
    totalXp: 0,
    steps: [],
    expandedStates: 0,
    startNode: problem.startNode,
  };

  if (seedResult?.reachedTarget) {
    bestResult = {
      ...seedResult,
      method: methodLabel,
      steps: [...seedResult.steps],
      startNode: problem.startNode,
    };
  }

  function maxPossibleExtraXp(kills, stepsLeft) {
    let possible = 0;
    for (const campId of problem.campOrder) {
      const camp = problem.camps[campId];
      if (camp.maxKills === null) {
        possible += camp.xp * stepsLeft;
      } else {
        const remaining = Math.max(camp.maxKills - kills[campId], 0);
        possible += camp.xp * remaining;
      }
    }
    return possible;
  }

  function optimisticLowerBound(currentNode, currentTime, currentXp, kills, nextAvailable) {
    const needed = problem.targetXp - currentXp;
    if (needed <= 0) {
      return 0;
    }

    const fastestXpBound = needed / bestXpRate;
    const firstActionCandidates = [];

    for (const campId of problem.campOrder) {
      if (!isKillAllowed(campId, kills, problem.camps)) {
        continue;
      }
      const camp = problem.camps[campId];
      const travel = problem.travelTime[currentNode]?.[campId] ?? INF;
      const arrival = currentTime + travel;
      const start = Math.max(arrival, nextAvailable[campId]);
      firstActionCandidates.push(start - currentTime + camp.clearTime);
    }

    if (firstActionCandidates.length === 0) {
      return INF;
    }

    return Math.max(fastestXpBound, Math.min(...firstActionCandidates));
  }

  function buildStateKey(currentNode, currentXp, kills, nextAvailable) {
    const killsKey = problem.campOrder.map((campId) => kills[campId]).join(",");
    const availabilityKey = problem.campOrder
      .map((campId) =>
        Number.isFinite(nextAvailable[campId]) ? String(Math.round(nextAvailable[campId] * 10)) : "-1"
      )
      .join(",");
    const xpBucket = Math.floor(currentXp / 20);
    return `${currentNode}|${xpBucket}|${killsKey}|${availabilityKey}`;
  }

  function backtrack(currentNode, currentTime, currentXp, kills, nextAvailable, path) {
    expandedStates += 1;

    if (currentXp >= problem.targetXp) {
      if (currentTime < bestResult.totalTime) {
        bestResult = {
          method: methodLabel,
          reachedTarget: true,
          totalTime: currentTime,
          totalXp: currentXp,
          steps: [...path],
          expandedStates,
          startNode: problem.startNode,
        };
      }
      return;
    }

    if (path.length >= problem.maxSteps) {
      return;
    }

    if (currentTime >= bestResult.totalTime) {
      return;
    }

    const stepsLeft = problem.maxSteps - path.length;
    if (currentXp + maxPossibleExtraXp(kills, stepsLeft) < problem.targetXp) {
      return;
    }

    const optimistic = optimisticLowerBound(currentNode, currentTime, currentXp, kills, nextAvailable);
    if (currentTime + optimistic >= bestResult.totalTime) {
      return;
    }

    const stateKey = buildStateKey(currentNode, currentXp, kills, nextAvailable);
    const previousBest = visitedBestTime.get(stateKey);
    if (previousBest !== undefined && previousBest <= currentTime) {
      return;
    }
    visitedBestTime.set(stateKey, currentTime);

    const candidates = [];
    for (const campId of problem.campOrder) {
      if (!isKillAllowed(campId, kills, problem.camps)) {
        continue;
      }
      const step = simulateStep(problem, {
        currentNode,
        currentTime,
        currentXp,
        campId,
        nextAvailable,
      });
      candidates.push({
        score: scoreCandidate(step),
        step,
      });
    }

    candidates.sort((a, b) => b.score - a.score || a.step.finishTime - b.step.finishTime);

    for (const { step } of candidates) {
      if (step.finishTime >= bestResult.totalTime) {
        continue;
      }

      const nextKills = { ...kills };
      const nextAvailableState = { ...nextAvailable };

      nextKills[step.campId] += 1;
      const camp = problem.camps[step.campId];
      if (camp.maxKills !== null && nextKills[step.campId] >= camp.maxKills) {
        nextAvailableState[step.campId] = INF;
      } else {
        nextAvailableState[step.campId] = step.finishTime + camp.respawn;
      }

      path.push(step);
      backtrack(step.campId, step.finishTime, step.totalXp, nextKills, nextAvailableState, path);
      path.pop();
    }
  }

  backtrack(problem.startNode, 0, 0, killsInit, nextAvailableInit, []);

  return {
    ...bestResult,
    expandedStates,
  };
}

function solveHybrid(problem) {
  const greedyResult = solveGreedy(problem);
  const backtrackingResult = solveBacktracking(
    problem,
    greedyResult.reachedTarget ? greedyResult : null,
    "Hybrid Greedy-Backtracking"
  );

  if (backtrackingResult.reachedTarget) {
    return backtrackingResult;
  }

  return {
    ...greedyResult,
    method: "Hybrid Greedy-Backtracking",
    expandedStates: backtrackingResult.expandedStates,
  };
}

function renderRoute(result) {
  clearRouteLayer();
  state.routeNodeIds.clear();

  if (!result.steps.length) {
    return;
  }

  const pathNodeIds = [result.startNode, ...result.steps.map((step) => step.campId)];
  for (const nodeId of pathNodeIds) {
    state.routeNodeIds.add(nodeId);
  }
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

    const stepText = document.createElementNS(SVG_NS, "text");
    stepText.setAttribute("class", "route-step-text");
    stepText.setAttribute("x", String(midX));
    stepText.setAttribute("y", String(midY + 0.1));
    stepText.textContent = String(i + 1);
    fragment.append(stepText);
  }
  refs.routePathGroup.append(fragment);
}

function clearRouteLayer() {
  refs.routePathGroup.innerHTML = "";
}

function renderResult(result) {
  refs.stepsBody.innerHTML = "";
  refs.resultSummary.classList.remove("empty");

  if (result.message) {
    refs.resultSummary.classList.add("empty");
    refs.resultSummary.textContent = result.message;
    return;
  }

  const statusClass = result.reachedTarget ? "status-ok" : "status-bad";
  const statusLabel = result.reachedTarget ? "Target XP Tercapai" : "Target XP Belum Tercapai";
  const totalTimeLabel = Number.isFinite(result.totalTime) ? `${result.totalTime.toFixed(1)}s` : "-";

  refs.resultSummary.innerHTML = `
    <div class="kv"><span class="k">Metode</span><span>${result.method}</span></div>
    <div class="kv"><span class="k">Status</span><span class="${statusClass}">${statusLabel}</span></div>
    <div class="kv"><span class="k">Total Waktu</span><span>${totalTimeLabel}</span></div>
    <div class="kv"><span class="k">Total XP</span><span>${result.totalXp}</span></div>
    <div class="kv"><span class="k">State Dieksplorasi</span><span>${result.expandedStates}</span></div>
    <div class="kv"><span class="k">Jumlah Step</span><span>${result.steps.length}</span></div>
  `;

  const rowsFragment = document.createDocumentFragment();
  result.steps.forEach((step, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${shortNode(step.fromNodeId)}</td>
      <td>${shortNode(step.campId)}</td>
      <td>${step.arrivalTime.toFixed(1)}s</td>
      <td>${step.waitTime.toFixed(1)}s</td>
      <td>${step.finishTime.toFixed(1)}s</td>
      <td>${step.totalXp}</td>
    `;
    rowsFragment.append(row);
  });
  refs.stepsBody.append(rowsFragment);
}

function clearResult(message) {
  refs.stepsBody.innerHTML = "";
  refs.resultSummary.classList.add("empty");
  refs.resultSummary.textContent = message || "Belum ada simulasi.";
}

function shortNode(nodeId) {
  return NODE_MAP.get(nodeId)?.short ?? nodeId;
}

function getHeroSpeed(heroName) {
  const hero = HEROES.find((item) => item.name === heroName);
  return hero ? hero.speed : 260;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function nodeGradient(hexColor) {
  return `linear-gradient(145deg, ${hexColor}, #0a1a30)`;
}

function round1(number) {
  return Math.round(number * 10) / 10;
}

function buildDistanceCache() {
  const cache = {};
  for (const src of NODE_LIST) {
    cache[src.id] = {};
    for (const dst of NODE_LIST) {
      if (src.id === dst.id) {
        cache[src.id][dst.id] = 0;
        continue;
      }
      const dx = (src.x - dst.x) / 100;
      const dy = (src.y - dst.y) / 100;
      cache[src.id][dst.id] = Math.hypot(dx, dy);
    }
  }
  return cache;
}

function humanMethod(methodValue) {
  if (methodValue === "greedy") {
    return "Greedy";
  }
  if (methodValue === "backtracking") {
    return "Backtracking";
  }
  return "Hybrid Greedy-Backtracking";
}

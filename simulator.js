#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const INF = Number.POSITIVE_INFINITY;
const DEFAULT_TARGET_XP = 1000;
const DEFAULT_MAX_STEPS = 7;
const RETRIBUTION_COOLDOWN = 35;
const BASE_NODE = "Base / Start";
const RED_BUFF_NODE = "Molten Fiend (Red Buff)";
const BLUE_BUFF_NODE = "Thunder Fenrir (Blue Buff)";

function round1(value) {
  return Math.round(value * 10) / 10;
}

function parsePercent(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  return Number(String(value).replace("%", "").trim()) / 100;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(content) {
  const cleaned = content.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return [];
  }

  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function readCsvRows(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parseCsv(content);
}

function normalizeName(text) {
  return String(text)
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function mapHeroSkill(row, skillIndex) {
  const baseDamage = Number(row[`dmg_skill_${skillIndex}`]) || 0;
  const scaleTypeRaw = String(row[`skill_${skillIndex}_scale_type`] || "").toLowerCase();
  const scaleType = ["total", "extra"].includes(scaleTypeRaw) ? scaleTypeRaw : "none";
  const scalePercent = parsePercent(row[`skill_${skillIndex}_percentage`]);
  const cooldown = Number(row[`skill_${skillIndex}_cd`]) || 0;
  const totalHpScale = skillIndex === 1 ? parsePercent(row.skill_1_total_hp_scale) : 0;
  const multiplierRaw = row.skill_1_multiplier_dmg ?? row.skill_1_bonus_creep_dmg;
  const damageMultiplier = skillIndex === 1 ? parsePercent(multiplierRaw) : 1;

  return {
    index: skillIndex,
    baseDamage,
    scaleType,
    scalePercent,
    cooldown,
    totalHpScale,
    damageMultiplier,
    active: baseDamage > 0 && cooldown > 0,
  };
}

function extractHeroTalents(row) {
  return Object.keys(row)
    .filter((key) => /^talent_\d+$/i.test(key))
    .sort((a, b) => Number(a.split("_")[1]) - Number(b.split("_")[1]))
    .map((key) => String(row[key] || "").trim())
    .filter(Boolean);
}

function parsePercentFromText(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) {
    return null;
  }
  return Number(match[1]) / 100;
}

function mapEmblemRow(row) {
  const attrs = [];
  for (let index = 1; index <= 3; index += 1) {
    const name = row[`attr_${index}_name`];
    if (!name) {
      continue;
    }
    attrs.push({
      name,
      value: Number(row[`attr_${index}_value`]) || 0,
      unit: String(row[`attr_${index}_unit`] || "flat").toLowerCase(),
    });
  }

  return {
    id: row.emblem_id,
    name: row.emblem_name,
    attrs,
  };
}

function loadDatasets() {
  const datasetsDir = path.join(__dirname, "datasets");
  const heroRows = readCsvRows(path.join(datasetsDir, "Hero.csv"));
  const emblemRows = readCsvRows(path.join(datasetsDir, "Emblem.csv"));
  const monsterRows = readCsvRows(path.join(datasetsDir, "Monster.csv"));

  const heroes = heroRows.map((row) => ({
    name: row.hero,
    emblemType: row.emblem,
    talents: extractHeroTalents(row),
    maxHp: Number(row.max_hp) || 0,
    physicalAttack: Number(row.physical_attack) || 0,
    movementSpeed: Number(row.movement_speed) || 0,
    skillPriority: Number(row.skill_priority) || 1,
    skills: [mapHeroSkill(row, 1), mapHeroSkill(row, 2), mapHeroSkill(row, 3)],
  }));

  const emblems = emblemRows.map(mapEmblemRow);

  const monstersByName = new Map();
  for (const row of monsterRows) {
    monstersByName.set(normalizeName(row.monster_name), {
      name: row.monster_name,
      creepType: row.creep_type,
      firstSpawn: Number(row.first_spawn_s) || 0,
      respawn: Number(row.respawn_s) || 0,
      hp: Number(row.hp) || 0,
      xp: Number(row.exp_reward) || 0,
    });
  }

  const jarakPath = path.join(datasetsDir, "Jarak.csv");
  const jarakRaw = fs.readFileSync(jarakPath, "utf8").replace(/^\uFEFF/, "").trim();
  const lines = jarakRaw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const labels = header.slice(1);

  const distanceMatrix = {};
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const from = values[0];
    distanceMatrix[from] = {};
    for (let index = 1; index < values.length; index += 1) {
      distanceMatrix[from][labels[index - 1]] = Number(values[index]);
    }
  }

  const campOrder = labels.filter((label) => label !== BASE_NODE);
  const camps = {};

  for (const campLabel of campOrder) {
    const monster = monstersByName.get(normalizeName(campLabel));
    if (!monster) {
      throw new Error(`Monster untuk node '${campLabel}' tidak ditemukan di Monster.csv`);
    }

    camps[campLabel] = {
      id: campLabel,
      name: campLabel,
      firstSpawn: monster.firstSpawn,
      respawn: monster.respawn,
      xp: monster.xp,
      maxKills: 1,
      hp: monster.hp,
      creepType: monster.creepType,
    };
  }

  return {
    heroes,
    emblems,
    camps,
    campOrder,
    distanceMatrix,
  };
}

function resolveDefaultEmblem(hero, emblems) {
  const heroType = normalizeName(hero.emblemType);
  if (!heroType) {
    return emblems[0] || null;
  }

  const found = emblems.find((emblem) => normalizeName(emblem.name).includes(heroType));
  return found || emblems[0] || null;
}

function findHeroByName(heroes, input) {
  const normalized = normalizeName(input);
  return heroes.find((hero) => normalizeName(hero.name) === normalized) || null;
}

function findEmblemByInput(emblems, input) {
  const normalized = normalizeName(input);
  return (
    emblems.find((emblem) => normalizeName(emblem.name) === normalized) ||
    emblems.find((emblem) => normalizeName(emblem.id) === normalized) ||
    emblems.find((emblem) => normalizeName(emblem.name).includes(normalized)) ||
    null
  );
}

function calcTravelSeconds(distance, moveSpeed) {
  if (!Number.isFinite(distance)) {
    return INF;
  }
  return round1(Math.max(1.2, (distance * 5400) / moveSpeed));
}

function buildTravelTime({ moveSpeed, campOrder, distanceMatrix }) {
  const activeNodes = [BASE_NODE, ...campOrder];
  const travel = {};

  for (const src of activeNodes) {
    travel[src] = {};
    for (const dst of campOrder) {
      if (src === dst) {
        travel[src][dst] = 0;
      } else {
        const distance = distanceMatrix[src]?.[dst];
        travel[src][dst] = calcTravelSeconds(distance, moveSpeed);
      }
    }
  }

  return travel;
}

function applyEmblem(hero, emblem) {
  const stats = {
    maxHp: hero.maxHp,
    physicalAttack: hero.physicalAttack,
    movementSpeed: hero.movementSpeed,
    monsterDamageBonus: 0,
  };

  for (const attr of emblem.attrs) {
    const name = normalizeName(attr.name);
    const multiplier = attr.unit === "percent" ? attr.value / 100 : attr.value;

    if (name === "hp") {
      if (attr.unit === "percent") {
        stats.maxHp *= 1 + multiplier;
      } else {
        stats.maxHp += attr.value;
      }
      continue;
    }

    if (name === "adaptive attack") {
      stats.physicalAttack += attr.value;
      continue;
    }

    if (name === "movement speed") {
      if (attr.unit === "percent") {
        stats.movementSpeed *= 1 + multiplier;
      } else {
        stats.movementSpeed += attr.value;
      }
      continue;
    }
  }
  return stats;
}

function addAdaptiveAttack(stats, value) {
  stats.physicalAttack += value;
}

function applyTalentEffects(stats, talents) {
  for (const talent of talents || []) {
    const normalized = normalizeName(talent);

    if (normalized === "thrill") {
      addAdaptiveAttack(stats, 16);
      continue;
    }

    if (normalized === "vitality") {
      stats.maxHp += 225;
      continue;
    }

    if (normalized.includes("seasoned hunter")) {
      const parsedPercent = parsePercentFromText(talent);
      stats.monsterDamageBonus += parsedPercent ?? 0.075;
    }
  }
}

function getUnlockedSkills(hero, level) {
  const availableSkills = hero.skills.filter((skill) => skill.active).map((skill) => skill.index);
  if (availableSkills.length === 0) {
    return [];
  }

  const firstPick = availableSkills.includes(hero.skillPriority)
    ? hero.skillPriority
    : availableSkills[0];

  const unlocked = [firstPick];

  if (level >= 2) {
    const second = availableSkills.find((skillIndex) => skillIndex !== firstPick);
    if (second) {
      unlocked.push(second);
    }
  }

  if (level >= 3 && normalizeName(hero.name) === "suyou") {
    const hasSkill3 = availableSkills.includes(3);
    if (hasSkill3 && !unlocked.includes(3)) {
      unlocked.push(3);
    }
  }

  return unlocked;
}

function applyMonsterDamageBonus(finalDamage, heroStats) {
  return finalDamage * (1 + heroStats.monsterDamageBonus);
}

function getSkillDamage(skill, heroStats, baseHeroStats) {
  if (!skill?.active) {
    return 0;
  }

  const totalScaleStat = heroStats.physicalAttack;
  const baseScaleStat = baseHeroStats.physicalAttack;
  const extraScaleStat = Math.max(0, totalScaleStat - baseScaleStat);

  let raw = skill.baseDamage;
  if (skill.scaleType === "total") {
    raw += totalScaleStat * skill.scalePercent;
  } else if (skill.scaleType === "extra") {
    raw += extraScaleStat * skill.scalePercent;
  }
  raw += heroStats.maxHp * skill.totalHpScale;
  raw *= skill.damageMultiplier;

  const finalDamage = applyMonsterDamageBonus(raw, heroStats);
  return Math.max(1, finalDamage);
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
  const retributionDelay = Math.max(0, retributionReadyAt - currentTime);
  const cacheKey = `${campId}|${level}|${Math.round(retributionDelay * 10)}`;
  const cached = problem.clearTimeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const camp = problem.camps[campId];
  const hero = problem.hero;
  const stats = problem.heroStats;
  const baseHeroStats = problem.heroBaseStats;

  const unlockedSkillIndexes = getUnlockedSkills(hero, level);
  const unlockedSkills = unlockedSkillIndexes
    .map((index) => hero.skills.find((skill) => skill.index === index))
    .filter(Boolean);

  let hpLeft = camp.hp;
  let time = currentTime;
  const nextReady = {};

  for (const skill of unlockedSkills) {
    nextReady[skill.index] = currentTime;
  }

  const attackInterval = 1;
  const basicDamage = Math.max(1, applyMonsterDamageBonus(stats.physicalAttack, stats));
  let nextBasicAttack = currentTime;
  let nextRetribution = retributionReadyAt;

  let guard = 0;
  while (hpLeft > 0 && time <= currentTime + 600) {
    guard += 1;
    if (guard > 10000) {
      break;
    }

    if (nextRetribution <= time + 1e-9) {
      const damage = applyMonsterDamageBonus(getRetributionDamage(level), stats);
      hpLeft -= damage;
      nextRetribution = time + RETRIBUTION_COOLDOWN;
      continue;
    }

    const readySkills = unlockedSkills.filter((skill) => (nextReady[skill.index] ?? INF) <= time + 1e-9);

    if (readySkills.length > 0) {
      readySkills.sort((a, b) => {
        const aDamage = getSkillDamage(a, stats, baseHeroStats);
        const bDamage = getSkillDamage(b, stats, baseHeroStats);
        return bDamage - aDamage;
      });

      const chosenSkill = readySkills[0];
      const damage = getSkillDamage(chosenSkill, stats, baseHeroStats);
      hpLeft -= damage;
      nextReady[chosenSkill.index] = time + Math.max(0.1, chosenSkill.cooldown);
      continue;
    }

    if (nextBasicAttack <= time + 1e-9) {
      hpLeft -= basicDamage;
      nextBasicAttack = time + attackInterval;
      continue;
    }

    const nextSkillTime = unlockedSkills.length
      ? Math.min(...unlockedSkills.map((skill) => nextReady[skill.index] ?? INF))
      : INF;

    const nextTime = Math.min(nextBasicAttack, nextSkillTime, nextRetribution);
    if (!Number.isFinite(nextTime) || nextTime <= time) {
      break;
    }
    time = nextTime;
  }

  const clearTime = round1(Math.max(time - currentTime, 0.1));
  const result = {
    clearTime,
    nextRetributionReady: nextRetribution,
  };
  problem.clearTimeCache.set(cacheKey, result);
  return result;
}

function isKillAllowed(campId, kills, camps) {
  const maxKills = camps[campId].maxKills;
  return maxKills === null || kills[campId] < maxKills;
}

function simulateStep(problem, {
  currentNode,
  currentTime,
  currentXp,
  campId,
  nextAvailable,
  nextRetributionReady,
}) {
  const camp = problem.camps[campId];
  const move = problem.travelTime[currentNode]?.[campId] ?? INF;
  const arrival = currentTime + move;
  const clearStart = Math.max(arrival, nextAvailable[campId]);
  const wait = clearStart - arrival;
  const combat = estimateCampClearTime(problem, campId, currentXp, clearStart, nextRetributionReady);
  const clearTime = combat.clearTime;
  const finish = clearStart + clearTime;

  return {
    fromNodeId: currentNode,
    campId,
    departTime: currentTime,
    arrivalTime: arrival,
    waitTime: wait,
    clearStartTime: clearStart,
    clearTime,
    finishTime: finish,
    gainedXp: camp.xp,
    totalXp: currentXp + camp.xp,
    levelBefore: levelFromXp(currentXp),
    levelAfter: levelFromXp(currentXp + camp.xp),
    nextRetributionReady: combat.nextRetributionReady,
  };
}

function buildCandidates(problem, { currentNode, currentTime, currentXp, kills, nextAvailable, nextRetributionReady }) {
  const candidates = [];

  for (const campId of problem.campOrder) {
    if (!isKillAllowed(campId, kills, problem.camps)) {
      continue;
    }

    candidates.push(
      simulateStep(problem, {
        currentNode,
        currentTime,
        currentXp,
        campId,
        nextAvailable,
        nextRetributionReady,
      })
    );
  }

  return candidates;
}

function updateCampAvailability(problem, kills, nextAvailable, step) {
  kills[step.campId] += 1;
  const camp = problem.camps[step.campId];
  if (camp.maxKills !== null && kills[step.campId] >= camp.maxKills) {
    nextAvailable[step.campId] = INF;
  } else {
    nextAvailable[step.campId] = step.finishTime + camp.respawn;
  }
}

function travelDuration(step) {
  return step.arrivalTime - step.departTime;
}

function hybridCandidateScore(step) {
  const travel = Math.max(0.1, travelDuration(step));
  return step.gainedXp / travel;
}

function buildInitialState(problem, startBuffOption) {
  const kills = {};
  const nextAvailable = {};
  for (const campId of problem.campOrder) {
    kills[campId] = 0;
    nextAvailable[campId] = problem.camps[campId].firstSpawn;
  }

  const initial = {
    currentNode: BASE_NODE,
    currentTime: 0,
    currentXp: 0,
    nextRetributionReady: 0,
    kills,
    nextAvailable,
    steps: [],
  };

  if (!startBuffOption || startBuffOption === "none") {
    return initial;
  }

  const forcedCamp = startBuffOption === "red" ? RED_BUFF_NODE : BLUE_BUFF_NODE;
  if (!problem.camps[forcedCamp]) {
    throw new Error(`Node buff awal tidak tersedia: ${forcedCamp}`);
  }

  const firstStep = simulateStep(problem, {
    currentNode: BASE_NODE,
    currentTime: 0,
    currentXp: 0,
    campId: forcedCamp,
    nextAvailable,
    nextRetributionReady: initial.nextRetributionReady,
  });

  initial.steps.push(firstStep);
  initial.currentNode = forcedCamp;
  initial.currentTime = firstStep.finishTime;
  initial.currentXp = firstStep.totalXp;
  initial.nextRetributionReady = firstStep.nextRetributionReady;
  updateCampAvailability(problem, initial.kills, initial.nextAvailable, firstStep);

  return initial;
}

function solveGreedy(problem, initialState, verbose = false) {
  const kills = { ...initialState.kills };
  const nextAvailable = { ...initialState.nextAvailable };

  let currentNode = initialState.currentNode;
  let currentTime = initialState.currentTime;
  let currentXp = initialState.currentXp;
  let nextRetributionReady = initialState.nextRetributionReady;
  const steps = [...initialState.steps];

  while (currentXp < problem.targetXp && steps.length < problem.maxSteps) {
    const candidates = buildCandidates(problem, {
      currentNode,
      currentTime,
      currentXp,
      kills,
      nextAvailable,
      nextRetributionReady,
    });

    if (candidates.length === 0) {
      break;
    }

    if (verbose && steps.length < problem.maxSteps) {
      console.log(`\n[Step ${steps.length + 1}] Dari ${currentNode}:`);
      for (const cand of candidates) {
        const travelDur = travelDuration(cand);
        console.log(
          `  -> ${cand.campId.padEnd(28)} | Jarak: ${travelDur.toFixed(1)}s | EXP: ${cand.gainedXp} | Clear: ${cand.clearTime.toFixed(1)}s`
        );
      }
    }

    candidates.sort(
      (a, b) => travelDuration(a) - travelDuration(b) || b.gainedXp - a.gainedXp || a.finishTime - b.finishTime
    );
    const best = candidates[0];

    if (verbose) {
      console.log(`  [Pilih] ${best.campId} (terdekat, travel ${travelDuration(best).toFixed(1)}s)`);
    }
    steps.push(best);

    currentNode = best.campId;
    currentTime = best.finishTime;
    currentXp = best.totalXp;
    nextRetributionReady = best.nextRetributionReady;
    updateCampAvailability(problem, kills, nextAvailable, best);
  }

  return {
    method: "Greedy",
    reachedTarget: currentXp >= problem.targetXp,
    totalTime: currentTime,
    totalXp: currentXp,
    steps,
    expandedStates: 0,
  };
}

function solveBacktracking(problem, initialState, seedResult, methodLabel, verbose = false) {
  const bestXpRate = Math.max(
    ...problem.campOrder.map((campId) => {
      const clear = Math.max(0.1, estimateCampClearTime(problem, campId, problem.targetXp, 0, 0).clearTime);
      return problem.camps[campId].xp / clear;
    })
  );

  const visitedBestTime = new Map();
  let expandedStates = 0;

  let bestResult = {
    method: methodLabel,
    reachedTarget: initialState.currentXp >= problem.targetXp,
    totalTime: initialState.currentXp >= problem.targetXp ? initialState.currentTime : INF,
    totalXp: initialState.currentXp,
    steps: [...initialState.steps],
    expandedStates: 0,
  };

  if (seedResult?.reachedTarget) {
    bestResult = {
      ...seedResult,
      method: methodLabel,
      steps: [...seedResult.steps],
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

  function optimisticLowerBound(currentNode, currentTime, currentXp, kills, nextAvailable, nextRetributionReady) {
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

      const travel = problem.travelTime[currentNode]?.[campId] ?? INF;
      const arrival = currentTime + travel;
      const start = Math.max(arrival, nextAvailable[campId]);
      const clear = estimateCampClearTime(problem, campId, currentXp, start, nextRetributionReady).clearTime;
      firstActionCandidates.push(start - currentTime + clear);
    }

    if (firstActionCandidates.length === 0) {
      return INF;
    }

    return Math.max(fastestXpBound, Math.min(...firstActionCandidates));
  }

  function buildStateKey(currentNode, currentXp, kills, nextAvailable, nextRetributionReady) {
    const killsKey = problem.campOrder.map((campId) => kills[campId]).join(",");
    const availabilityKey = problem.campOrder
      .map((campId) =>
        Number.isFinite(nextAvailable[campId]) ? String(Math.round(nextAvailable[campId] * 10)) : "-1"
      )
      .join(",");
    const xpBucket = Math.floor(currentXp / 20);
    const retributionKey = Number.isFinite(nextRetributionReady)
      ? String(Math.round(nextRetributionReady * 10))
      : "-1";
    return `${currentNode}|${xpBucket}|${killsKey}|${availabilityKey}|${retributionKey}`;
  }

  function backtrack(currentNode, currentTime, currentXp, nextRetributionReady, kills, nextAvailable, path) {
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

    const optimistic = optimisticLowerBound(
      currentNode,
      currentTime,
      currentXp,
      kills,
      nextAvailable,
      nextRetributionReady
    );
    if (currentTime + optimistic >= bestResult.totalTime) {
      return;
    }

    const stateKey = buildStateKey(currentNode, currentXp, kills, nextAvailable, nextRetributionReady);
    const previousBest = visitedBestTime.get(stateKey);
    if (previousBest !== undefined && previousBest <= currentTime) {
      return;
    }
    visitedBestTime.set(stateKey, currentTime);

    const candidates = buildCandidates(problem, {
      currentNode,
      currentTime,
      currentXp,
      kills,
      nextAvailable,
      nextRetributionReady,
    });

    if (verbose && initialState.currentXp < problem.targetXp) {
      console.log(`\n[Backtrack Greedy Step] Dari ${initialState.currentNode}:`);
      for (const cand of candidates) {
        const travelDur = travelDuration(cand);
        console.log(
          `  -> ${cand.campId.padEnd(28)} | EXP: ${cand.gainedXp} | Jarak: ${travelDur.toFixed(1)}s | Clear: ${cand.clearTime.toFixed(1)}s`
        );
      }
    }

    if (methodLabel.includes("Hybrid")) {
      candidates.sort(
        (a, b) =>
          hybridCandidateScore(b) - hybridCandidateScore(a) ||
          travelDuration(a) - travelDuration(b) ||
          b.gainedXp - a.gainedXp ||
          a.finishTime - b.finishTime
      );
      if (verbose && candidates.length > 0 && initialState.currentXp < problem.targetXp) {
        const score = hybridCandidateScore(candidates[0]);
        console.log(`  [Greedy Pick] ${candidates[0].campId} (score ${score.toFixed(2)})`);
      }
    } else {
      candidates.sort(
        (a, b) =>
          b.gainedXp - a.gainedXp ||
          travelDuration(a) - travelDuration(b) ||
          a.finishTime - b.finishTime
      );
      if (verbose && candidates.length > 0 && initialState.currentXp < problem.targetXp) {
        console.log(`  [Greedy Pick] ${candidates[0].campId} (EXP ${candidates[0].gainedXp})`);
      }
    }

    for (const step of candidates) {
      if (step.finishTime >= bestResult.totalTime) {
        continue;
      }

      const nextKills = { ...kills };
      const nextAvail = { ...nextAvailable };
      updateCampAvailability(problem, nextKills, nextAvail, step);

      path.push(step);
      backtrack(
        step.campId,
        step.finishTime,
        step.totalXp,
        step.nextRetributionReady,
        nextKills,
        nextAvail,
        path
      );
      path.pop();
    }
  }

  if (initialState.currentXp < problem.targetXp) {
    backtrack(
      initialState.currentNode,
      initialState.currentTime,
      initialState.currentXp,
      initialState.nextRetributionReady,
      { ...initialState.kills },
      { ...initialState.nextAvailable },
      [...initialState.steps]
    );
  }

  return {
    ...bestResult,
    expandedStates,
  };
}

function solveHybridGreedy(problem, initialState, verbose = false) {
  const kills = { ...initialState.kills };
  const nextAvailable = { ...initialState.nextAvailable };

  let currentNode = initialState.currentNode;
  let currentTime = initialState.currentTime;
  let currentXp = initialState.currentXp;
  let nextRetributionReady = initialState.nextRetributionReady;
  const steps = [...initialState.steps];

  while (currentXp < problem.targetXp && steps.length < problem.maxSteps) {
    const candidates = buildCandidates(problem, {
      currentNode,
      currentTime,
      currentXp,
      kills,
      nextAvailable,
      nextRetributionReady,
    });

    if (candidates.length === 0) {
      break;
    }

    if (verbose && steps.length < problem.maxSteps) {
      console.log(`\n[Step ${steps.length + 1}] Dari ${currentNode}:`);
      for (const cand of candidates) {
        const travelDur = travelDuration(cand);
        const score = hybridCandidateScore(cand);
        console.log(
          `  -> ${cand.campId.padEnd(28)} | EXP/Travel: ${score.toFixed(2)} | EXP: ${cand.gainedXp} | Jarak: ${travelDur.toFixed(1)}s | Clear: ${cand.clearTime.toFixed(1)}s`
        );
      }
    }

    candidates.sort(
      (a, b) =>
        hybridCandidateScore(b) - hybridCandidateScore(a) ||
        travelDuration(a) - travelDuration(b) ||
        b.gainedXp - a.gainedXp ||
        a.finishTime - b.finishTime
    );

    const best = candidates[0];

    if (verbose) {
      const score = hybridCandidateScore(best);
      console.log(`  [Pilih] ${best.campId} (score ${score.toFixed(2)})`);
    }
    steps.push(best);

    currentNode = best.campId;
    currentTime = best.finishTime;
    currentXp = best.totalXp;
    nextRetributionReady = best.nextRetributionReady;
    updateCampAvailability(problem, kills, nextAvailable, best);
  }

  return {
    method: "Hybrid Greedy-Backtracking",
    reachedTarget: currentXp >= problem.targetXp,
    totalTime: currentTime,
    totalXp: currentXp,
    steps,
    expandedStates: 0,
  };
}

function solveHybrid(problem, initialState, verbose = false) {
  const greedyResult = solveHybridGreedy(problem, initialState, verbose);
  const backtrackingResult = solveBacktracking(
    problem,
    initialState,
    greedyResult.reachedTarget ? greedyResult : null,
    "Hybrid Greedy-Backtracking",
    verbose
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

function buildProblem({ hero, emblem, camps, campOrder, distanceMatrix, targetXp, maxSteps }) {
  const heroBaseStats = {
    maxHp: hero.maxHp,
    physicalAttack: hero.physicalAttack,
    movementSpeed: hero.movementSpeed,
  };
  const heroStats = applyEmblem(hero, emblem);
  applyTalentEffects(heroStats, hero.talents);
  const travelTime = buildTravelTime({
    moveSpeed: heroStats.movementSpeed,
    campOrder,
    distanceMatrix,
  });

  return {
    hero,
    emblem,
    heroBaseStats,
    heroStats,
    camps,
    campOrder,
    travelTime,
    targetXp,
    maxSteps,
    clearTimeCache: new Map(),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function normalizeAlgorithm(input) {
  const value = normalizeName(input);
  if (["greedy", "g"].includes(value)) {
    return "greedy";
  }
  if (["backtracking", "bt", "b"].includes(value)) {
    return "backtracking";
  }
  if (["hybrid", "h", "greedy backtracking", "hybrid greedy backtracking"].includes(value)) {
    return "hybrid";
  }
  return null;
}

function normalizeStartBuff(input) {
  const value = normalizeName(input);
  if (["red", "merah", "r"].includes(value)) {
    return "red";
  }
  if (["blue", "biru", "b"].includes(value)) {
    return "blue";
  }
  if (["none", "bebas", "auto", "n", ""].includes(value)) {
    return "none";
  }
  return null;
}

function algorithmLabel(value) {
  if (value === "greedy") {
    return "Greedy";
  }
  if (value === "backtracking") {
    return "Backtracking";
  }
  return "Hybrid Greedy-Backtracking";
}

function startBuffLabel(value) {
  if (value === "red") {
    return "Merah dulu";
  }
  if (value === "blue") {
    return "Biru dulu";
  }
  return "Bebas (tidak dipaksa)";
}

function askQuestion(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

async function collectInputs(dataset, args) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let algorithm = normalizeAlgorithm(args.algorithm);
    while (!algorithm) {
      const answer = await askQuestion(rl, "Pilih algoritma [greedy/backtracking/hybrid]: ");
      algorithm = normalizeAlgorithm(answer);
      if (!algorithm) {
        console.log("Input algoritma tidak valid.");
      }
    }

    let hero = findHeroByName(dataset.heroes, args.hero);
    while (!hero) {
      const heroNames = dataset.heroes.map((item) => item.name).join(", ");
      const answer = await askQuestion(rl, `Pilih hero [${heroNames}]: `);
      hero = findHeroByName(dataset.heroes, answer);
      if (!hero) {
        console.log("Hero tidak ditemukan di Hero.csv");
      }
    }

    const suggestedEmblem = resolveDefaultEmblem(hero, dataset.emblems);
    let emblem = findEmblemByInput(dataset.emblems, args.emblem || "");
    while (!emblem) {
      const list = dataset.emblems.map((item) => item.name).join(", ");
      const answer = await askQuestion(
        rl,
        `Pilih emblem [${list}] (Enter = ${suggestedEmblem?.name || "-"}): `
      );

      if (!answer.trim() && suggestedEmblem) {
        emblem = suggestedEmblem;
      } else {
        emblem = findEmblemByInput(dataset.emblems, answer);
      }

      if (!emblem) {
        console.log("Emblem tidak ditemukan di Emblem.csv");
      }
    }

    let startBuff = normalizeStartBuff(args["start-buff"]);
    while (!startBuff) {
      const answer = await askQuestion(rl, "Start buff [merah/biru/bebas]: ");
      startBuff = normalizeStartBuff(answer);
      if (!startBuff) {
        console.log("Input start buff tidak valid.");
      }
    }

    return {
      algorithm,
      hero,
      emblem,
      startBuff,
    };
  } finally {
    rl.close();
  }
}

function formatStepRow(step, index) {
  return [
    String(index + 1).padStart(2, " "),
    step.fromNodeId.padEnd(28, " "),
    step.campId.padEnd(28, " "),
    `Lv${step.levelBefore}->${step.levelAfter}`.padStart(9, " "),
    `${step.arrivalTime.toFixed(1)}s`.padStart(8, " "),
    `${step.waitTime.toFixed(1)}s`.padStart(8, " "),
    `${step.clearTime.toFixed(1)}s`.padStart(8, " "),
    `${step.finishTime.toFixed(1)}s`.padStart(8, " "),
    String(step.totalXp).padStart(6, " "),
  ].join(" | ");
}

function formatPercentFromFraction(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function printResult(config, result) {
  console.log("\n=== Jungling Route Simulation ===");
  console.log(`Algoritma    : ${config.algorithmLabel}`);
  console.log(`Hero         : ${config.heroName}`);
  console.log(`Emblem       : ${config.emblemName}`);
  console.log(`Move Speed   : ${round1(config.moveSpeed)}`);
  console.log(`Start Buff   : ${config.startBuffLabel}`);
  console.log(`Target XP    : ${config.targetXp}`);
  console.log(`Maks Step    : ${config.maxSteps}`);

  console.log("\n--- Atribut Final Hero (Base + Emblem + Talent) ---");
  console.log(`Max HP               : ${round1(config.finalStats.maxHp)}`);
  console.log(`Physical Attack      : ${round1(config.finalStats.physicalAttack)}`);
  console.log(`Movement Speed       : ${round1(config.finalStats.movementSpeed)}`);
  console.log(`Monster Damage Bonus : ${formatPercentFromFraction(config.finalStats.monsterDamageBonus)}`);

  console.log("\n--- Ringkasan ---");
  console.log(`Status       : ${result.reachedTarget ? "Target XP Tercapai" : "Target XP Belum Tercapai"}`);
  console.log(`Total Waktu  : ${Number.isFinite(result.totalTime) ? `${result.totalTime.toFixed(1)}s` : "-"}`);
  console.log(`Total XP     : ${result.totalXp}`);
  console.log(`Level Akhir  : ${levelFromXp(result.totalXp)}`);
  console.log(`State Explore: ${result.expandedStates}`);
  console.log(`Jumlah Step  : ${result.steps.length}`);

  if (!result.steps.length) {
    console.log("\nTidak ada step yang bisa dijalankan.");
    return;
  }

  console.log("\n--- Detail Step ---");
  console.log(
    "No | Dari                         | Ke                           |   Level   |  Tiba   |  Tunggu |  Clear  | Selesai | XP"
  );
  console.log(
    "---+------------------------------+------------------------------+-----------+---------+---------+---------+---------+------"
  );

  result.steps.forEach((step, index) => {
    console.log(formatStepRow(step, index));
  });
}

async function main() {
  try {
    const dataset = loadDatasets();
    const args = parseArgs(process.argv);

    if (args.help) {
      console.log("Pemakaian:");
      console.log(
        "  node cli-simulator.js --algorithm <greedy|backtracking|hybrid> --hero <Nama Hero> --emblem <Nama Emblem/ID> --start-buff <red|blue|none> [--target-xp 1000] [--max-steps 7]"
      );
      console.log("Contoh:");
      console.log(
        '  node cli-simulator.js --algorithm hybrid --hero "Suyou" --emblem "Custom Assassin Emblem" --start-buff blue'
      );
      return;
    }

    const input = await collectInputs(dataset, args);

    const targetXp = Number.isFinite(Number(args["target-xp"]))
      ? Number(args["target-xp"])
      : DEFAULT_TARGET_XP;

    const maxSteps = Number.isFinite(Number(args["max-steps"]))
      ? Number(args["max-steps"])
      : DEFAULT_MAX_STEPS;

    const problem = buildProblem({
      hero: input.hero,
      emblem: input.emblem,
      camps: dataset.camps,
      campOrder: dataset.campOrder,
      distanceMatrix: dataset.distanceMatrix,
      targetXp,
      maxSteps,
    });

    const initialState = buildInitialState(problem, input.startBuff);

    const verbose = !!args.verbose || !!args["debug"];

    let result;
    if (input.algorithm === "greedy") {
      result = solveGreedy(problem, initialState, verbose);
    } else if (input.algorithm === "backtracking") {
      result = solveBacktracking(problem, initialState, null, "Backtracking", verbose);
    } else {
      result = solveHybrid(problem, initialState, verbose);
    }

    printResult(
      {
        algorithmLabel: algorithmLabel(input.algorithm),
        heroName: input.hero.name,
        emblemName: input.emblem.name,
        moveSpeed: problem.heroStats.movementSpeed,
        finalStats: problem.heroStats,
        startBuffLabel: startBuffLabel(input.startBuff),
        targetXp,
        maxSteps,
      },
      result
    );
  } catch (error) {
    console.error("Terjadi error:", error.message);
    process.exitCode = 1;
  }
}

main();
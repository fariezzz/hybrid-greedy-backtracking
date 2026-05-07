import { BASE_NODE, BLUE_BUFF_NODE, INF, RED_BUFF_NODE, RETRIBUTION_COOLDOWN } from "./constants.js";
import { levelFromXp, normalizeName, round1 } from "./utils.js";

export function applyMonsterDamageBonus(damage, heroStats) {
  return damage * (1 + heroStats.monster_damage_bonus);
}

export function getUnlockedSkills(hero, level) {
  const available = hero.skills.filter((skill) => skill.active);
  if (!available.length) {
    return [];
  }

  const first = available.find((skill) => skill.index === hero.skill_priority) || available[0];
  const unlocked = [first];

  if (level >= 2) {
    const second = available.find((skill) => skill.index !== first.index);
    if (second) {
      unlocked.push(second);
    }
  }

  if (level >= 3 && normalizeName(hero.name) === "suyou") {
    const skill3 = available.find((skill) => skill.index === 3);
    if (skill3 && unlocked.every((skill) => skill.index !== 3)) {
      unlocked.push(skill3);
    }
  }

  return unlocked;
}

export function getSkillDamage(skill, heroStats, baseStats) {
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

export function getRetributionDamage(level) {
  if (level >= 3) {
    return 760;
  }
  if (level >= 2) {
    return 680;
  }
  return 600;
}

export function estimateCampClearTime(problem, campId, currentXp, currentTime, retributionReadyAt) {
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
  const nextReady = Object.fromEntries(unlocked.map((skill) => [skill.index, currentTime]));
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

    const readySkills = unlocked.filter((skill) => (nextReady[skill.index] ?? INF) <= time + 1e-9);
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

    const nextSkill = unlocked.length ? Math.min(...unlocked.map((skill) => nextReady[skill.index] ?? INF)) : INF;
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

export function isKillAllowed(campId, kills, camps) {
  const maxKills = camps[campId].max_kills;
  return maxKills === null || kills[campId] < maxKills;
}

export function simulateStep(problem, state, campId) {
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

export function buildCandidates(problem, state, enforceTimeLimit = true) {
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

export function updateCampAvailability(problem, kills, nextAvailable, step) {
  const campId = step.camp_id;
  kills[campId] += 1;
  const camp = problem.camps[campId];
  nextAvailable[campId] = camp.max_kills !== null && kills[campId] >= camp.max_kills ? INF : step.finish_time + camp.respawn;
}

export function buildInitialState(problem, startBuff) {
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

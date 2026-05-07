import { BASE_NODE, DEFAULT_MAX_STEPS, DEFAULT_TARGET_XP, TURTLE_SPAWN_TIME } from "./constants.js";
import { applyEmblem, applyTalentEffects } from "./data.js";
import { calcTravelSeconds, normalizeName } from "./utils.js";

export function buildProblem(dataset, hero, emblem) {
  const hero_base_stats = {
    max_hp: hero.max_hp,
    physical_attack: hero.physical_attack,
    movement_speed: hero.movement_speed,
  };
  const hero_stats = applyEmblem(hero, emblem);
  applyTalentEffects(hero_stats, hero.talents);

  const camps = {};
  for (const campLabel of dataset.campOrder) {
    const monster = dataset.monstersByName.get(normalizeName(campLabel));
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
    camp_order: dataset.campOrder,
    travel_time: buildTravelTime(hero_stats.movement_speed, dataset.campOrder, dataset.distanceMatrix),
    target_xp: DEFAULT_TARGET_XP,
    max_steps: DEFAULT_MAX_STEPS,
    time_limit: TURTLE_SPAWN_TIME,
    clear_time_cache: new Map(),
  };
}

function buildTravelTime(moveSpeed, campOrder, distanceMatrix) {
  const activeNodes = [BASE_NODE, ...campOrder];
  const travel = {};

  for (const src of activeNodes) {
    travel[src] = {};
    for (const dst of campOrder) {
      travel[src][dst] = src === dst ? 0 : calcTravelSeconds(distanceMatrix[src]?.[dst], moveSpeed);
    }
  }
  return travel;
}

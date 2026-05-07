import { BASE_NODE } from "./constants.js";
import { parseCsvObjects, parseCsvRows } from "./csv.js";
import { normalizeName, parsePercent, parsePercentFromText } from "./utils.js";

export async function loadDataBundle() {
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

export function resolveDefaultEmblem(hero, emblems) {
  const heroType = normalizeName(hero.emblem_type);
  if (!heroType) {
    return emblems[0] || null;
  }
  return emblems.find((emblem) => normalizeName(emblem.name).includes(heroType)) || emblems[0] || null;
}

export function applyEmblem(hero, emblem) {
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

export function applyTalentEffects(stats, talents) {
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

function buildDatasetCandidates(fileName) {
  return [`../datasets/${fileName}`, `./../datasets/${fileName}`, `/datasets/${fileName}`];
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

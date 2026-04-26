from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from src.constants import BASE_NODE, PENETRATION_TO_ADAPTIVE_ATTACK, TURTLE_SPAWN_TIME
from src.types import Emblem, Hero, Problem, Skill
from src.utils import calc_travel_seconds, normalize_name, parse_percent, parse_percent_from_text


def map_hero_skill(row: dict[str, str], skill_index: int) -> Skill:
    base_damage = float(row.get(f"dmg_skill_{skill_index}") or 0)
    scale_type = str(row.get(f"skill_{skill_index}_scale_type") or "").lower()
    if scale_type not in {"total", "extra"}:
        scale_type = "none"

    scale_percent = parse_percent(row.get(f"skill_{skill_index}_percentage"))
    cooldown = float(row.get(f"skill_{skill_index}_cd") or 0)
    total_hp_scale = parse_percent(row.get("skill_1_total_hp_scale")) if skill_index == 1 else 0.0
    multiplier_raw = row.get("skill_1_multiplier_dmg") or row.get("skill_1_bonus_creep_dmg")
    damage_multiplier = parse_percent(multiplier_raw) if skill_index == 1 else 1.0

    return Skill(
        index=skill_index,
        base_damage=base_damage,
        scale_type=scale_type,
        scale_percent=scale_percent,
        cooldown=cooldown,
        total_hp_scale=total_hp_scale,
        damage_multiplier=damage_multiplier,
        active=base_damage > 0 and cooldown > 0,
    )


def extract_hero_talents(row: dict[str, str]) -> list[str]:
    keys = sorted((k for k in row if k.lower().startswith("talent_")), key=lambda x: int(x.split("_")[1]))
    return [str(row.get(k, "")).strip() for k in keys if str(row.get(k, "")).strip()]


def map_emblem_row(row: dict[str, str]) -> Emblem:
    attrs = []
    for idx in range(1, 4):
        name = row.get(f"attr_{idx}_name")
        if not name:
            continue
        attrs.append(
            {
                "name": name,
                "value": float(row.get(f"attr_{idx}_value") or 0),
                "unit": str(row.get(f"attr_{idx}_unit") or "flat").lower(),
            }
        )
    return Emblem(id=row.get("emblem_id", ""), name=row.get("emblem_name", ""), attrs=attrs)


def read_csv_rows(file_path: Path) -> list[dict[str, str]]:
    with file_path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def load_datasets(base_dir: Path) -> dict[str, Any]:
    datasets_dir = base_dir / "datasets"
    hero_rows = read_csv_rows(datasets_dir / "Hero.csv")
    emblem_rows = read_csv_rows(datasets_dir / "Emblem.csv")
    monster_rows = read_csv_rows(datasets_dir / "Monster.csv")

    heroes = [
        Hero(
            name=row.get("hero", ""),
            emblem_type=row.get("emblem", ""),
            talents=extract_hero_talents(row),
            max_hp=float(row.get("max_hp") or 0),
            physical_attack=float(row.get("physical_attack") or 0),
            movement_speed=float(row.get("movement_speed") or 0),
            skill_priority=int(float(row.get("skill_priority") or 1)),
            skills=[map_hero_skill(row, 1), map_hero_skill(row, 2), map_hero_skill(row, 3)],
        )
        for row in hero_rows
    ]

    emblems = [map_emblem_row(row) for row in emblem_rows]

    monsters_by_name = {
        normalize_name(row.get("monster_name")): {
            "name": row.get("monster_name", ""),
            "creep_type": row.get("creep_type", ""),
            "first_spawn": float(row.get("first_spawn_s") or 0),
            "respawn": float(row.get("respawn_s") or 0),
            "hp": float(row.get("hp") or 0),
            "xp": float(row.get("exp_reward") or 0),
        }
        for row in monster_rows
    }

    with (datasets_dir / "Jarak.csv").open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    labels = rows[0][1:]
    distance_matrix: dict[str, dict[str, float]] = {}
    for values in rows[1:]:
        from_node = values[0]
        distance_matrix[from_node] = {labels[i - 1]: float(values[i] or 0) for i in range(1, len(values))}

    camp_order = [label for label in labels if label != BASE_NODE]
    camps: dict[str, dict[str, Any]] = {}
    for camp_label in camp_order:
        monster = monsters_by_name.get(normalize_name(camp_label))
        if not monster:
            raise ValueError(f"Monster untuk node '{camp_label}' tidak ditemukan di Monster.csv")
        camps[camp_label] = {
            "id": camp_label,
            "name": camp_label,
            "first_spawn": monster["first_spawn"],
            "respawn": monster["respawn"],
            "xp": monster["xp"],
            "max_kills": 1,
            "hp": monster["hp"],
            "creep_type": monster["creep_type"],
        }

    return {
        "heroes": heroes,
        "emblems": emblems,
        "camps": camps,
        "camp_order": camp_order,
        "distance_matrix": distance_matrix,
    }


def resolve_default_emblem(hero: Hero, emblems: list[Emblem]) -> Emblem | None:
    hero_type = normalize_name(hero.emblem_type)
    if not hero_type:
        return emblems[0] if emblems else None
    return next((e for e in emblems if hero_type in normalize_name(e.name)), emblems[0] if emblems else None)


def find_hero_by_name(heroes: list[Hero], text: str) -> Hero | None:
    target = normalize_name(text)
    return next((h for h in heroes if normalize_name(h.name) == target), None)


def find_emblem_by_input(emblems: list[Emblem], text: str) -> Emblem | None:
    target = normalize_name(text)
    if not target:
        return None
    return (
        next((e for e in emblems if normalize_name(e.name) == target), None)
        or next((e for e in emblems if normalize_name(e.id) == target), None)
        or next((e for e in emblems if target in normalize_name(e.name)), None)
    )


def apply_emblem(hero: Hero, emblem: Emblem) -> dict[str, float]:
    stats = {
        "max_hp": hero.max_hp,
        "physical_attack": hero.physical_attack,
        "movement_speed": hero.movement_speed,
        "monster_damage_bonus": 0.0,
    }
    for attr in emblem.attrs:
        name = normalize_name(attr["name"])
        value = float(attr["value"])
        unit = attr["unit"]
        mul = value / 100.0 if unit == "percent" else value

        if name == "hp":
            stats["max_hp"] = stats["max_hp"] * (1 + mul) if unit == "percent" else stats["max_hp"] + value
        elif name == "adaptive attack":
            stats["physical_attack"] += value
        elif name in {"adaptive penetration", "magic penetration"}:
            stats["physical_attack"] += value * PENETRATION_TO_ADAPTIVE_ATTACK
        elif name == "movement speed":
            stats["movement_speed"] = stats["movement_speed"] * (1 + mul) if unit == "percent" else stats["movement_speed"] + value
    return stats


def apply_talent_effects(stats: dict[str, float], talents: list[str]) -> None:
    for talent in talents:
        normalized = normalize_name(talent)
        if normalized == "thrill":
            stats["physical_attack"] += 16
        elif normalized == "vitality":
            stats["max_hp"] += 225
        elif "seasoned hunter" in normalized:
            stats["monster_damage_bonus"] += parse_percent_from_text(talent) or 0.075


def build_travel_time(move_speed: float, camp_order: list[str], distance_matrix: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    active_nodes = [BASE_NODE, *camp_order]
    travel: dict[str, dict[str, float]] = {}
    for src in active_nodes:
        travel[src] = {}
        for dst in camp_order:
            travel[src][dst] = 0.0 if src == dst else calc_travel_seconds(distance_matrix.get(src, {}).get(dst, float("inf")), move_speed)
    return travel


def build_problem(dataset: dict[str, Any], hero: Hero, emblem: Emblem, target_xp: int, max_steps: int) -> Problem:
    base_stats = {
        "max_hp": hero.max_hp,
        "physical_attack": hero.physical_attack,
        "movement_speed": hero.movement_speed,
    }
    hero_stats = apply_emblem(hero, emblem)
    apply_talent_effects(hero_stats, hero.talents)
    return Problem(
        hero=hero,
        emblem=emblem,
        hero_base_stats=base_stats,
        hero_stats=hero_stats,
        camps=dataset["camps"],
        camp_order=dataset["camp_order"],
        travel_time=build_travel_time(hero_stats["movement_speed"], dataset["camp_order"], dataset["distance_matrix"]),
        target_xp=target_xp,
        max_steps=max_steps,
        time_limit=TURTLE_SPAWN_TIME,
    )

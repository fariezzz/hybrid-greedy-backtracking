from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Skill:
    index: int
    base_damage: float
    scale_type: str
    scale_percent: float
    cooldown: float
    total_hp_scale: float
    damage_multiplier: float
    active: bool


@dataclass
class Hero:
    name: str
    emblem_type: str
    talents: list[str]
    max_hp: float
    physical_attack: float
    movement_speed: float
    skill_priority: int
    skills: list[Skill]


@dataclass
class Emblem:
    id: str
    name: str
    attrs: list[dict[str, Any]]


@dataclass
class Problem:
    hero: Hero
    emblem: Emblem
    hero_base_stats: dict[str, float]
    hero_stats: dict[str, float]
    camps: dict[str, dict[str, Any]]
    camp_order: list[str]
    travel_time: dict[str, dict[str, float]]
    target_xp: int
    max_steps: int
    time_limit: float
    clear_time_cache: dict[str, dict[str, float]] = field(default_factory=dict)

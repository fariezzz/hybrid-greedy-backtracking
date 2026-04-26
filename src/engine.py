from __future__ import annotations

from typing import Any

from src.constants import BASE_NODE, BLUE_BUFF_NODE, INF, RED_BUFF_NODE, RETRIBUTION_COOLDOWN
from src.types import Hero, Problem, Skill
from src.utils import level_from_xp, round1


def apply_monster_damage_bonus(final_damage: float, hero_stats: dict[str, float]) -> float:
    return final_damage * (1 + hero_stats["monster_damage_bonus"])


def get_unlocked_skills(hero: Hero, level: int) -> list[Skill]:
    available = [s for s in hero.skills if s.active]
    if not available:
        return []

    first = next((s for s in available if s.index == hero.skill_priority), available[0])
    unlocked = [first]

    if level >= 2:
        second = next((s for s in available if s.index != first.index), None)
        if second:
            unlocked.append(second)

    if level >= 3 and hero.name.strip().lower() == "suyou":
        skill3 = next((s for s in available if s.index == 3), None)
        if skill3 and all(s.index != 3 for s in unlocked):
            unlocked.append(skill3)

    return unlocked


def get_skill_damage(skill: Skill, hero_stats: dict[str, float], base_stats: dict[str, float]) -> float:
    if not skill.active:
        return 0.0

    total_scale = hero_stats["physical_attack"]
    base_scale = base_stats["physical_attack"]
    extra_scale = max(0.0, total_scale - base_scale)

    raw = skill.base_damage
    if skill.scale_type == "total":
        raw += total_scale * skill.scale_percent
    elif skill.scale_type == "extra":
        raw += extra_scale * skill.scale_percent

    raw += hero_stats["max_hp"] * skill.total_hp_scale
    raw *= skill.damage_multiplier
    return max(1.0, apply_monster_damage_bonus(raw, hero_stats))


def get_retribution_damage(level: int) -> float:
    return 760.0 if level >= 3 else 680.0 if level >= 2 else 600.0


def estimate_camp_clear_time(problem: Problem, camp_id: str, current_xp: float, current_time: float, retribution_ready_at: float) -> dict[str, float]:
    level = level_from_xp(current_xp)
    delay = max(0.0, retribution_ready_at - current_time)
    cache_key = f"{camp_id}|{level}|{round(delay * 10)}"
    if cache_key in problem.clear_time_cache:
        return problem.clear_time_cache[cache_key]

    camp = problem.camps[camp_id]
    hero_stats = problem.hero_stats
    unlocked = get_unlocked_skills(problem.hero, level)

    hp_left = camp["hp"]
    time = current_time
    next_ready = {s.index: current_time for s in unlocked}
    basic_damage = max(1.0, apply_monster_damage_bonus(hero_stats["physical_attack"], hero_stats))
    next_basic = current_time
    next_retri = retribution_ready_at

    guard = 0
    while hp_left > 0 and time <= current_time + 600:
        guard += 1
        if guard > 10000:
            break

        if next_retri <= time + 1e-9:
            hp_left -= apply_monster_damage_bonus(get_retribution_damage(level), hero_stats)
            next_retri = time + RETRIBUTION_COOLDOWN
            continue

        ready_skills = [s for s in unlocked if next_ready.get(s.index, INF) <= time + 1e-9]
        if ready_skills:
            ready_skills.sort(key=lambda s: get_skill_damage(s, hero_stats, problem.hero_base_stats), reverse=True)
            chosen = ready_skills[0]
            hp_left -= get_skill_damage(chosen, hero_stats, problem.hero_base_stats)
            next_ready[chosen.index] = time + max(0.1, chosen.cooldown)
            continue

        if next_basic <= time + 1e-9:
            hp_left -= basic_damage
            next_basic = time + 1.0
            continue

        next_skill = min((next_ready.get(s.index, INF) for s in unlocked), default=INF)
        next_time = min(next_basic, next_skill, next_retri)
        if next_time <= time or next_time == INF:
            break
        time = next_time

    result = {"clear_time": round1(max(time - current_time, 0.1)), "next_retribution_ready": next_retri}
    problem.clear_time_cache[cache_key] = result
    return result


def is_kill_allowed(camp_id: str, kills: dict[str, int], camps: dict[str, dict[str, Any]]) -> bool:
    max_kills = camps[camp_id]["max_kills"]
    return max_kills is None or kills[camp_id] < max_kills


def simulate_step(problem: Problem, state: dict[str, Any], camp_id: str) -> dict[str, Any]:
    current_node = state["current_node"]
    current_time = state["current_time"]
    current_xp = state["current_xp"]
    next_available = state["next_available"]

    move = problem.travel_time.get(current_node, {}).get(camp_id, INF)
    arrival = current_time + move
    clear_start = max(arrival, next_available[camp_id])
    combat = estimate_camp_clear_time(problem, camp_id, current_xp, clear_start, state["next_retribution_ready"])
    clear_time = combat["clear_time"]
    finish = clear_start + clear_time

    return {
        "from_node_id": current_node,
        "camp_id": camp_id,
        "depart_time": current_time,
        "arrival_time": arrival,
        "wait_time": clear_start - arrival,
        "clear_start_time": clear_start,
        "clear_time": clear_time,
        "finish_time": finish,
        "gained_xp": problem.camps[camp_id]["xp"],
        "total_xp": current_xp + problem.camps[camp_id]["xp"],
        "level_before": level_from_xp(current_xp),
        "level_after": level_from_xp(current_xp + problem.camps[camp_id]["xp"]),
        "next_retribution_ready": combat["next_retribution_ready"],
    }


def build_candidates(problem: Problem, state: dict[str, Any], enforce_time_limit: bool = True) -> list[dict[str, Any]]:
    candidates = []
    for camp_id in problem.camp_order:
        if not is_kill_allowed(camp_id, state["kills"], problem.camps):
            continue
        step = simulate_step(problem, state, camp_id)
        if not enforce_time_limit or step["finish_time"] <= problem.time_limit:
            candidates.append(step)
    return candidates


def update_camp_availability(problem: Problem, kills: dict[str, int], next_available: dict[str, float], step: dict[str, Any]) -> None:
    camp_id = step["camp_id"]
    kills[camp_id] += 1
    camp = problem.camps[camp_id]
    next_available[camp_id] = INF if camp["max_kills"] is not None and kills[camp_id] >= camp["max_kills"] else step["finish_time"] + camp["respawn"]


def build_initial_state(problem: Problem, start_buff_option: str) -> dict[str, Any]:
    kills = {camp_id: 0 for camp_id in problem.camp_order}
    next_available = {camp_id: problem.camps[camp_id]["first_spawn"] for camp_id in problem.camp_order}
    state = {
        "current_node": BASE_NODE,
        "current_time": 0.0,
        "current_xp": 0.0,
        "next_retribution_ready": 0.0,
        "kills": kills,
        "next_available": next_available,
        "steps": [],
    }

    if start_buff_option not in {"red", "blue"}:
        return state

    forced = RED_BUFF_NODE if start_buff_option == "red" else BLUE_BUFF_NODE
    if forced not in problem.camps:
        raise ValueError(f"Node buff awal tidak tersedia: {forced}")

    first_step = simulate_step(problem, state, forced)
    if first_step["finish_time"] > problem.time_limit:
        return state
    state["steps"].append(first_step)
    state["current_node"] = forced
    state["current_time"] = first_step["finish_time"]
    state["current_xp"] = first_step["total_xp"]
    state["next_retribution_ready"] = first_step["next_retribution_ready"]
    update_camp_availability(problem, state["kills"], state["next_available"], first_step)
    return state

#!/usr/bin/env python3

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from src.constants import DEFAULT_MAX_STEPS, DEFAULT_TARGET_XP
from src.data import (
    build_problem,
    find_hero_by_name,
    load_datasets,
    resolve_default_emblem,
)
from src.engine import build_initial_state
from src.solver.backtracking import solve_backtracking
from src.solver.greedy import solve_greedy
from src.solver.hybrid import solve_hybrid
from src.utils import level_from_xp, normalize_name, round1


def normalize_algorithm(value: str | None) -> str | None:
    x = normalize_name(value)
    if x in {"greedy", "g"}:
        return "greedy"
    if x in {"backtracking", "bt", "b"}:
        return "backtracking"
    if x in {"hybrid", "h", "greedy backtracking", "hybrid greedy backtracking"}:
        return "hybrid"
    return None


def normalize_start_buff(value: str | None) -> str | None:
    x = normalize_name(value)
    if x in {"red", "merah", "r"}:
        return "red"
    if x in {"blue", "biru", "b"}:
        return "blue"
    return None


def algorithm_label(value: str) -> str:
    return "Greedy" if value == "greedy" else "Backtracking" if value == "backtracking" else "Hybrid Greedy-Backtracking"


def start_buff_label(value: str) -> str:
    return "Merah dulu" if value == "red" else "Biru dulu"


def prompt_int(label: str, default_value: int) -> int:
    while True:
        answer = input(f"{label} (Enter = {default_value}): ").strip()
        if not answer:
            return default_value
        try:
            value = int(answer)
            if value > 0:
                return value
            print("Input harus bilangan bulat positif.")
        except ValueError:
            print("Input angka tidak valid.")


def collect_inputs(dataset: dict[str, Any]):
    algorithm = None
    while not algorithm:
        algorithm = normalize_algorithm(input("Pilih algoritma [greedy/backtracking/hybrid]: "))
        if not algorithm:
            print("Input algoritma tidak valid.")

    hero = None
    while not hero:
        hero_names = ", ".join(h.name for h in dataset["heroes"])
        hero = find_hero_by_name(dataset["heroes"], input(f"Pilih hero [{hero_names}]: "))
        if not hero:
            print("Hero tidak ditemukan di Hero.csv")

    default_emblem = resolve_default_emblem(hero, dataset["emblems"])
    if not default_emblem:
        raise ValueError("Emblem default tidak ditemukan berdasarkan kolom emblem di Hero.csv")
    emblem = default_emblem
    print(f"Emblem otomatis: {emblem.name}")

    start_buff = None
    while not start_buff:
        start_buff = normalize_start_buff(input("Start buff [merah/biru]: "))
        if not start_buff:
            print("Input start buff tidak valid.")

    target_xp = DEFAULT_TARGET_XP
    max_steps = DEFAULT_MAX_STEPS

    return algorithm, hero, emblem, start_buff, target_xp, max_steps


def format_step_row(step: dict[str, Any], index: int) -> str:
    return " | ".join(
        [
            f"{index + 1:>2}",
            f"{step['from_node_id']:<28}",
            f"{step['camp_id']:<28}",
            f"Lv{step['level_before']}->{step['level_after']}".rjust(9),
            f"{step['arrival_time']:.1f}s".rjust(8),
            f"{step['wait_time']:.1f}s".rjust(8),
            f"{step['clear_time']:.1f}s".rjust(8),
            f"{step['finish_time']:.1f}s".rjust(8),
            f"{int(step['total_xp']):>6}",
        ]
    )


def print_result(config: dict[str, Any], result: dict[str, Any]) -> None:
    talents_text = ", ".join(config["talents"]) if config["talents"] else "-"
    print("\n=== Jungling Route Simulation ===")
    print(f"Algoritma    : {config['algorithm_label']}")
    print(f"Hero         : {config['hero_name']}")
    print(f"Talent       : {talents_text}")
    print(f"Emblem       : {config['emblem_name']}")
    print(f"Move Speed   : {round1(config['move_speed'])}")
    print(f"Start Buff   : {config['start_buff_label']}")
    print(f"Target XP    : {config['target_xp']}")
    print(f"Maks Step    : {config['max_steps']}")

    print("\n--- Atribut Final Hero (Base + Emblem + Talent) ---")
    print(f"Max HP               : {round1(config['final_stats']['max_hp'])}")
    print(f"Physical Attack      : {round1(config['final_stats']['physical_attack'])}")
    print(f"Movement Speed       : {round1(config['final_stats']['movement_speed'])}")
    print(f"Monster Damage Bonus : {config['final_stats']['monster_damage_bonus'] * 100:.1f}%")

    print("\n--- Ringkasan ---")
    total_time = result["total_time"]
    time_limit = config["time_limit"]
    total_time_text = f"{total_time:.1f}s" if math.isfinite(total_time) else "-"
    if result.get("blocked_by_time_limit") and not result["reached_target"]:
        turtle_indicator = "TERBATAS TURTLE"
    elif not math.isfinite(total_time):
        turtle_indicator = "TIDAK VALID"
    elif total_time > time_limit:
        turtle_indicator = "MELEBIHI BATAS"
    elif total_time >= time_limit - 5:
        turtle_indicator = "MEPET BATAS"
    else:
        turtle_indicator = "AMAN"
    print(f"Status       : {'Target XP Tercapai' if result['reached_target'] else 'Target XP Belum Tercapai'}")
    print(f"Status Turtle: {turtle_indicator}")
    if not result["reached_target"] and result.get("blocked_by_time_limit") and result.get("next_finish_if_forced") is not None:
        print(f"Next Step Min: {result['next_finish_if_forced']:.1f}s (melewati batas)")
    print(f"Batas Turtle : {config['time_limit']:.1f}s")
    print(f"Total Waktu  : {total_time_text}")
    print(f"Total XP     : {int(result['total_xp'])}")
    print(f"Level Akhir  : {level_from_xp(result['total_xp'])}")
    print(f"State Explore: {result['expanded_states']}")
    print(f"Jumlah Step  : {len(result['steps'])}")

    if not result["steps"]:
        print("\nTidak ada step yang bisa dijalankan.")
        return

    print("\n--- Detail Step ---")
    print("No | Dari                         | Ke                           |   Level   |  Tiba   |  Tunggu |  Clear  | Selesai | XP")
    print("---+------------------------------+------------------------------+-----------+---------+---------+---------+---------+------")
    for i, step in enumerate(result["steps"]):
        print(format_step_row(step, i))


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    dataset = load_datasets(base_dir)
    algorithm, hero, emblem, start_buff, target_xp, max_steps = collect_inputs(dataset)

    problem = build_problem(dataset, hero, emblem, target_xp, max_steps)
    initial_state = build_initial_state(problem, start_buff)
    verbose = False

    if algorithm == "greedy":
        result = solve_greedy(problem, initial_state, verbose)
    elif algorithm == "backtracking":
        result = solve_backtracking(problem, initial_state, None, "Backtracking", verbose)
    else:
        result = solve_hybrid(problem, initial_state, verbose)

    print_result(
        {
            "algorithm_label": algorithm_label(algorithm),
            "hero_name": hero.name,
            "talents": hero.talents,
            "emblem_name": emblem.name,
            "move_speed": problem.hero_stats["movement_speed"],
            "final_stats": problem.hero_stats,
            "start_buff_label": start_buff_label(start_buff),
            "target_xp": target_xp,
            "max_steps": max_steps,
            "time_limit": problem.time_limit,
        },
        result,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Terjadi error: {error}")
        raise SystemExit(1)

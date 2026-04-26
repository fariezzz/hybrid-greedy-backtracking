from __future__ import annotations

from copy import deepcopy

from src.engine import build_candidates, update_camp_availability
from src.types import Problem
from src.utils import travel_duration


def solve_greedy(problem: Problem, initial_state: dict, verbose: bool = False) -> dict:
    state = {
        "current_node": initial_state["current_node"],
        "current_time": initial_state["current_time"],
        "current_xp": initial_state["current_xp"],
        "next_retribution_ready": initial_state["next_retribution_ready"],
        "kills": deepcopy(initial_state["kills"]),
        "next_available": deepcopy(initial_state["next_available"]),
        "steps": list(initial_state["steps"]),
    }
    blocked_by_time_limit = False
    next_finish_if_forced = None

    while state["current_xp"] < problem.target_xp and len(state["steps"]) < problem.max_steps and state["current_time"] <= problem.time_limit:
        candidates = build_candidates(problem, state)
        if not candidates:
            overflow_candidates = build_candidates(problem, state, enforce_time_limit=False)
            if overflow_candidates:
                blocked_by_time_limit = True
                next_finish_if_forced = min(step["finish_time"] for step in overflow_candidates)
            break

        if verbose:
            print(f"\n[Step {len(state['steps']) + 1}] Dari {state['current_node']}:")
            for cand in candidates:
                print(
                    f"  -> {cand['camp_id']:<28} | Jarak: {travel_duration(cand):.1f}s | "
                    f"EXP: {int(cand['gained_xp'])} | Clear: {cand['clear_time']:.1f}s"
                )

        candidates.sort(key=lambda s: (travel_duration(s), -s["gained_xp"], s["finish_time"]))
        best = candidates[0]

        if verbose:
            print(f"  [Pilih] {best['camp_id']} (terdekat, travel {travel_duration(best):.1f}s)")

        state["steps"].append(best)
        state["current_node"] = best["camp_id"]
        state["current_time"] = best["finish_time"]
        state["current_xp"] = best["total_xp"]
        state["next_retribution_ready"] = best["next_retribution_ready"]
        update_camp_availability(problem, state["kills"], state["next_available"], best)

    return {
        "method": "Greedy",
        "reached_target": state["current_xp"] >= problem.target_xp,
        "total_time": state["current_time"],
        "total_xp": state["current_xp"],
        "steps": state["steps"],
        "expanded_states": 0,
        "blocked_by_time_limit": blocked_by_time_limit,
        "next_finish_if_forced": next_finish_if_forced,
    }

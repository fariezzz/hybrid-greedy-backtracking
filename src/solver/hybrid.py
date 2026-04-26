from __future__ import annotations

from copy import deepcopy

from src.engine import build_candidates, update_camp_availability
from src.solver.backtracking import solve_backtracking
from src.types import Problem
from src.utils import hybrid_candidate_score, travel_duration


def solve_hybrid_greedy(problem: Problem, initial_state: dict, verbose: bool = False) -> dict:
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
                    f"  -> {cand['camp_id']:<28} | EXP/Travel: {hybrid_candidate_score(cand):.2f} | "
                    f"EXP: {int(cand['gained_xp'])} | Jarak: {travel_duration(cand):.1f}s | Clear: {cand['clear_time']:.1f}s"
                )

        candidates.sort(key=lambda s: (-hybrid_candidate_score(s), travel_duration(s), -s["gained_xp"], s["finish_time"]))
        best = candidates[0]

        if verbose:
            print(f"  [Pilih] {best['camp_id']} (score {hybrid_candidate_score(best):.2f})")

        state["steps"].append(best)
        state["current_node"] = best["camp_id"]
        state["current_time"] = best["finish_time"]
        state["current_xp"] = best["total_xp"]
        state["next_retribution_ready"] = best["next_retribution_ready"]
        update_camp_availability(problem, state["kills"], state["next_available"], best)

    return {
        "method": "Hybrid Greedy-Backtracking",
        "reached_target": state["current_xp"] >= problem.target_xp,
        "total_time": state["current_time"],
        "total_xp": state["current_xp"],
        "steps": state["steps"],
        "expanded_states": 0,
        "blocked_by_time_limit": blocked_by_time_limit,
        "next_finish_if_forced": next_finish_if_forced,
    }


def solve_hybrid(problem: Problem, initial_state: dict, verbose: bool = False) -> dict:
    greedy_result = solve_hybrid_greedy(problem, initial_state, verbose)
    backtracking_result = solve_backtracking(
        problem,
        initial_state,
        greedy_result if greedy_result["reached_target"] else None,
        "Hybrid Greedy-Backtracking",
        verbose,
        use_hybrid_ordering=False,
    )
    if backtracking_result["reached_target"]:
        return backtracking_result

    greedy_overflow = greedy_result.get("next_finish_if_forced")
    backtracking_overflow = backtracking_result.get("next_finish_if_forced")
    merged_overflow = None
    if greedy_overflow is not None and backtracking_overflow is not None:
        merged_overflow = min(greedy_overflow, backtracking_overflow)
    elif greedy_overflow is not None:
        merged_overflow = greedy_overflow
    elif backtracking_overflow is not None:
        merged_overflow = backtracking_overflow

    return {
        **greedy_result,
        "expanded_states": backtracking_result["expanded_states"],
        "blocked_by_time_limit": bool(greedy_result.get("blocked_by_time_limit")) or bool(backtracking_result.get("blocked_by_time_limit")),
        "next_finish_if_forced": merged_overflow,
    }

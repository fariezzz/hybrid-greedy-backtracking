from __future__ import annotations

import math
from copy import deepcopy

from src.constants import INF
from src.engine import build_candidates, estimate_camp_clear_time, is_kill_allowed, update_camp_availability
from src.types import Problem
from src.utils import travel_duration


def solve_backtracking_pure(
    problem: Problem,
    initial_state: dict,
    verbose: bool = False,
) -> dict:
    """
    Backtracking MURNI tanpa pruning (no optimistic lower bound, no state memoization).
    Hanya cek: target reached, max steps, time limit.
    """
    expanded_states = 0
    best = {
        "method": "Backtracking (Pure/No Pruning)",
        "reached_target": initial_state["current_xp"] >= problem.target_xp,
        "total_time": initial_state["current_time"] if initial_state["current_xp"] >= problem.target_xp else INF,
        "total_xp": initial_state["current_xp"],
        "steps": list(initial_state["steps"]),
        "expanded_states": 0,
    }

    def backtrack(node: str, now: float, xp: float, retri: float, kills: dict[str, int], avail: dict[str, float], path: list[dict]) -> None:
        nonlocal expanded_states, best
        expanded_states += 1

        # Check: Sudah mencapai target XP
        if xp >= problem.target_xp:
            if now < best["total_time"]:
                best = {
                    "method": "Backtracking (Pure/No Pruning)",
                    "reached_target": True,
                    "total_time": now,
                    "total_xp": xp,
                    "steps": list(path),
                    "expanded_states": expanded_states,
                }
            return

        # Check: Sudah melewati max steps atau time limit
        if len(path) >= problem.max_steps or now > problem.time_limit:
            return

        # Build candidates
        state = {
            "current_node": node,
            "current_time": now,
            "current_xp": xp,
            "next_retribution_ready": retri,
            "kills": kills,
            "next_available": avail,
        }
        candidates = build_candidates(problem, state)
        if not candidates:
            return

        # Recursively explore all candidates
        for step in candidates:
            if step["finish_time"] > problem.time_limit:
                continue
            next_kills = deepcopy(kills)
            next_avail = deepcopy(avail)
            update_camp_availability(problem, next_kills, next_avail, step)
            path.append(step)
            backtrack(step["camp_id"], step["finish_time"], step["total_xp"], step["next_retribution_ready"], next_kills, next_avail, path)
            path.pop()

    if initial_state["current_xp"] < problem.target_xp:
        backtrack(
            initial_state["current_node"],
            initial_state["current_time"],
            initial_state["current_xp"],
            initial_state["next_retribution_ready"],
            deepcopy(initial_state["kills"]),
            deepcopy(initial_state["next_available"]),
            list(initial_state["steps"]),
        )

    best["expanded_states"] = expanded_states
    best["blocked_by_time_limit"] = False
    best["next_finish_if_forced"] = None
    return best

from __future__ import annotations

import math
from copy import deepcopy

from src.constants import INF
from src.engine import build_candidates, estimate_camp_clear_time, is_kill_allowed, update_camp_availability
from src.types import Problem
from src.utils import hybrid_candidate_score, travel_duration


def solve_backtracking(
    problem: Problem,
    initial_state: dict,
    seed_result: dict | None,
    method_label: str,
    verbose: bool = False,
    use_hybrid_ordering: bool = False,
    max_branching: int | None = None,
    max_expanded_states: int | None = None,
) -> dict:
    best_xp_rate = max(
        problem.camps[c]["xp"] / max(0.1, estimate_camp_clear_time(problem, c, problem.target_xp, 0, 0)["clear_time"])
        for c in problem.camp_order
    )
    visited_best_time: dict[str, float] = {}
    expanded_states = 0
    blocked_by_time_limit = False
    next_finish_if_forced = None

    best = {
        "method": method_label,
        "reached_target": initial_state["current_xp"] >= problem.target_xp,
        "total_time": initial_state["current_time"] if initial_state["current_xp"] >= problem.target_xp else INF,
        "total_xp": initial_state["current_xp"],
        "steps": list(initial_state["steps"]),
        "expanded_states": 0,
    }

    if seed_result and seed_result.get("reached_target"):
        best = {**seed_result, "method": method_label, "steps": list(seed_result["steps"])}

    def max_possible_extra_xp(kills: dict[str, int], steps_left: int) -> float:
        total = 0.0
        for camp_id in problem.camp_order:
            camp = problem.camps[camp_id]
            total += camp["xp"] * (steps_left if camp["max_kills"] is None else max(camp["max_kills"] - kills[camp_id], 0))
        return total

    def optimistic_lower_bound(node: str, now: float, xp: float, kills: dict[str, int], avail: dict[str, float], retri: float) -> float:
        needed = problem.target_xp - xp
        if needed <= 0:
            return 0.0
        fastest_bound = needed / best_xp_rate
        first = []
        for camp_id in problem.camp_order:
            if not is_kill_allowed(camp_id, kills, problem.camps):
                continue
            travel = problem.travel_time.get(node, {}).get(camp_id, INF)
            start = max(now + travel, avail[camp_id])
            clear = estimate_camp_clear_time(problem, camp_id, xp, start, retri)["clear_time"]
            first.append(start - now + clear)
        return INF if not first else max(fastest_bound, min(first))

    def build_state_key(node: str, xp: float, kills: dict[str, int], avail: dict[str, float], retri: float) -> str:
        kills_key = ",".join(str(kills[c]) for c in problem.camp_order)
        avail_key = ",".join(str(round(avail[c] * 10)) if math.isfinite(avail[c]) else "-1" for c in problem.camp_order)
        return f"{node}|{int(xp // 20)}|{kills_key}|{avail_key}|{round(retri * 10) if math.isfinite(retri) else -1}"

    def backtrack(node: str, now: float, xp: float, retri: float, kills: dict[str, int], avail: dict[str, float], path: list[dict]) -> None:
        nonlocal expanded_states, best, blocked_by_time_limit, next_finish_if_forced
        if max_expanded_states is not None and expanded_states >= max_expanded_states:
            return
        expanded_states += 1

        if xp >= problem.target_xp:
            if now < best["total_time"]:
                best = {
                    "method": method_label,
                    "reached_target": True,
                    "total_time": now,
                    "total_xp": xp,
                    "steps": list(path),
                    "expanded_states": expanded_states,
                }
            return

        if len(path) >= problem.max_steps or now >= best["total_time"] or now > problem.time_limit:
            return

        steps_left = problem.max_steps - len(path)
        if xp + max_possible_extra_xp(kills, steps_left) < problem.target_xp:
            return

        if now + optimistic_lower_bound(node, now, xp, kills, avail, retri) >= best["total_time"]:
            return

        key = build_state_key(node, xp, kills, avail, retri)
        prev = visited_best_time.get(key)
        if prev is not None and prev <= now:
            return
        visited_best_time[key] = now

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
            overflow_candidates = build_candidates(problem, state, enforce_time_limit=False)
            if overflow_candidates:
                blocked_by_time_limit = True
                candidate_overflow = min(step["finish_time"] for step in overflow_candidates)
                if next_finish_if_forced is None or candidate_overflow < next_finish_if_forced:
                    next_finish_if_forced = candidate_overflow
            return

        if verbose and initial_state["current_xp"] < problem.target_xp:
            print(f"\n[Backtrack Greedy Step] Dari {initial_state['current_node']}:")
            for cand in candidates:
                print(
                    f"  -> {cand['camp_id']:<28} | EXP: {int(cand['gained_xp'])} | "
                    f"Jarak: {travel_duration(cand):.1f}s | Clear: {cand['clear_time']:.1f}s"
                )

        if use_hybrid_ordering:
            candidates.sort(key=lambda s: (-hybrid_candidate_score(s), travel_duration(s), -s["gained_xp"], s["finish_time"]))
            if verbose and candidates and initial_state["current_xp"] < problem.target_xp:
                print(f"  [Greedy Pick] {candidates[0]['camp_id']} (score {hybrid_candidate_score(candidates[0]):.2f})")
        else:
            candidates.sort(key=lambda s: (-s["gained_xp"], travel_duration(s), s["finish_time"]))
            if verbose and candidates and initial_state["current_xp"] < problem.target_xp:
                print(f"  [Greedy Pick] {candidates[0]['camp_id']} (EXP {int(candidates[0]['gained_xp'])})")

        if max_branching is not None and max_branching > 0:
            candidates = candidates[:max_branching]

        for step in candidates:
            if step["finish_time"] >= best["total_time"] or step["finish_time"] > problem.time_limit:
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
    best["blocked_by_time_limit"] = bool(best.get("blocked_by_time_limit")) or blocked_by_time_limit
    if best.get("next_finish_if_forced") is None:
        best["next_finish_if_forced"] = next_finish_if_forced
    return best

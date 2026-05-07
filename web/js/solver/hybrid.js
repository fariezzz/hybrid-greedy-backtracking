import { buildCandidates, updateCampAvailability } from "../engine.js";
import { hybridCandidateScore, travelDuration } from "../utils.js";
import { solveBacktrackingPruned } from "./backtracking.js";
import { cloneState } from "./state.js";

function solveHybridGreedy(problem, initialState) {
  const stateLocal = cloneState(initialState);
  let blockedByTimeLimit = false;
  let nextFinishIfForced = null;

  while (stateLocal.current_xp < problem.target_xp && stateLocal.steps.length < problem.max_steps && stateLocal.current_time <= problem.time_limit) {
    const candidates = buildCandidates(problem, stateLocal);
    if (!candidates.length) {
      const overflow = buildCandidates(problem, stateLocal, false);
      if (overflow.length) {
        blockedByTimeLimit = true;
        nextFinishIfForced = Math.min(...overflow.map((step) => step.finish_time));
      }
      break;
    }

    candidates.sort((a, b) => hybridCandidateScore(b) - hybridCandidateScore(a) || travelDuration(a) - travelDuration(b) || b.gained_xp - a.gained_xp || a.finish_time - b.finish_time);
    const best = candidates[0];

    stateLocal.steps.push(best);
    stateLocal.current_node = best.camp_id;
    stateLocal.current_time = best.finish_time;
    stateLocal.current_xp = best.total_xp;
    stateLocal.next_retribution_ready = best.next_retribution_ready;
    updateCampAvailability(problem, stateLocal.kills, stateLocal.next_available, best);
  }

  return {
    method: "Hybrid Greedy-Backtracking",
    reached_target: stateLocal.current_xp >= problem.target_xp,
    total_time: stateLocal.current_time,
    total_xp: stateLocal.current_xp,
    steps: stateLocal.steps,
    expanded_states: 0,
    blocked_by_time_limit: blockedByTimeLimit,
    next_finish_if_forced: nextFinishIfForced,
    startNode: initialState.current_node,
  };
}

export function solveHybrid(problem, initialState) {
  const greedyResult = solveHybridGreedy(problem, initialState);
  const backtrackingResult = solveBacktrackingPruned(
    problem,
    initialState,
    greedyResult.reached_target ? greedyResult : null,
    "Hybrid Greedy-Backtracking",
    true,
  );

  if (backtrackingResult.reached_target) {
    return backtrackingResult;
  }

  let mergedOverflow = null;
  const greedyOverflow = greedyResult.next_finish_if_forced;
  const backtrackingOverflow = backtrackingResult.next_finish_if_forced;
  if (greedyOverflow !== null && backtrackingOverflow !== null) {
    mergedOverflow = Math.min(greedyOverflow, backtrackingOverflow);
  } else if (greedyOverflow !== null) {
    mergedOverflow = greedyOverflow;
  } else if (backtrackingOverflow !== null) {
    mergedOverflow = backtrackingOverflow;
  }

  return {
    ...greedyResult,
    expanded_states: backtrackingResult.expanded_states,
    blocked_by_time_limit: Boolean(greedyResult.blocked_by_time_limit) || Boolean(backtrackingResult.blocked_by_time_limit),
    next_finish_if_forced: mergedOverflow,
  };
}

import { INF } from "../constants.js";
import { buildCandidates, updateCampAvailability } from "../engine.js";

export function solveBacktrackingPure(problem, initialState) {
  const best = {
    method: "Backtracking (Pure/No Pruning)",
    reached_target: initialState.current_xp >= problem.target_xp,
    total_time: initialState.current_xp >= problem.target_xp ? initialState.current_time : INF,
    total_xp: initialState.current_xp,
    steps: [...initialState.steps],
    expanded_states: 0,
    blocked_by_time_limit: false,
    next_finish_if_forced: null,
    startNode: initialState.current_node,
  };
  let expandedStates = 0;

  function backtrack(node, now, xp, retri, kills, avail, path) {
    expandedStates += 1;

    if (xp >= problem.target_xp) {
      if (now < best.total_time) {
        best.reached_target = true;
        best.total_time = now;
        best.total_xp = xp;
        best.steps = [...path];
      }
      return;
    }

    if (path.length >= problem.max_steps || now > problem.time_limit) {
      return;
    }

    const stateRun = {
      current_node: node,
      current_time: now,
      current_xp: xp,
      next_retribution_ready: retri,
      kills,
      next_available: avail,
    };
    const candidates = buildCandidates(problem, stateRun);
    for (const step of candidates) {
      if (step.finish_time > problem.time_limit) {
        continue;
      }
      const nextKills = { ...kills };
      const nextAvail = { ...avail };
      updateCampAvailability(problem, nextKills, nextAvail, step);
      path.push(step);
      backtrack(step.camp_id, step.finish_time, step.total_xp, step.next_retribution_ready, nextKills, nextAvail, path);
      path.pop();
    }
  }

  if (initialState.current_xp < problem.target_xp) {
    backtrack(
      initialState.current_node,
      initialState.current_time,
      initialState.current_xp,
      initialState.next_retribution_ready,
      { ...initialState.kills },
      { ...initialState.next_available },
      [...initialState.steps],
    );
  }

  best.expanded_states = expandedStates;
  return best;
}

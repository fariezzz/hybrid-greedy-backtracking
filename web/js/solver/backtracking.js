import { INF } from "../constants.js";
import { buildCandidates, estimateCampClearTime, isKillAllowed, updateCampAvailability } from "../engine.js";
import { hybridCandidateScore, travelDuration } from "../utils.js";

export function solveBacktrackingPruned(problem, initialState, seedResult, methodLabel, useHybridOrdering = false) {
  const bestXpRate = Math.max(
    ...problem.camp_order.map((campId) => problem.camps[campId].xp / Math.max(0.1, estimateCampClearTime(problem, campId, problem.target_xp, 0, 0).clear_time))
  );

  const visitedBestTime = new Map();
  let expandedStates = 0;
  let blockedByTimeLimit = false;
  let nextFinishIfForced = null;

  let best = {
    method: methodLabel,
    reached_target: initialState.current_xp >= problem.target_xp,
    total_time: initialState.current_xp >= problem.target_xp ? initialState.current_time : INF,
    total_xp: initialState.current_xp,
    steps: [...initialState.steps],
    expanded_states: 0,
    startNode: initialState.current_node,
  };

  if (seedResult && seedResult.reached_target) {
    best = { ...seedResult, method: methodLabel, steps: [...seedResult.steps], startNode: initialState.current_node };
  }

  function maxPossibleExtraXp(kills, stepsLeft) {
    let total = 0;
    for (const campId of problem.camp_order) {
      const camp = problem.camps[campId];
      total += camp.xp * (camp.max_kills === null ? stepsLeft : Math.max(camp.max_kills - kills[campId], 0));
    }
    return total;
  }

  function optimisticLowerBound(node, now, xp, kills, avail, retri) {
    const needed = problem.target_xp - xp;
    if (needed <= 0) {
      return 0;
    }

    const fastestBound = needed / bestXpRate;
    const first = [];
    for (const campId of problem.camp_order) {
      if (!isKillAllowed(campId, kills, problem.camps)) {
        continue;
      }
      const travel = problem.travel_time[node]?.[campId] ?? INF;
      const start = Math.max(now + travel, avail[campId]);
      const clear = estimateCampClearTime(problem, campId, xp, start, retri).clear_time;
      first.push(start - now + clear);
    }
    return first.length ? Math.max(fastestBound, Math.min(...first)) : INF;
  }

  function buildStateKey(node, xp, kills, avail, retri) {
    const killsKey = problem.camp_order.map((campId) => kills[campId]).join(",");
    const availKey = problem.camp_order.map((campId) => (Number.isFinite(avail[campId]) ? String(Math.round(avail[campId] * 10)) : "-1")).join(",");
    return `${node}|${Math.floor(xp / 20)}|${killsKey}|${availKey}|${Number.isFinite(retri) ? Math.round(retri * 10) : -1}`;
  }

  function backtrack(node, now, xp, retri, kills, avail, path) {
    expandedStates += 1;

    if (xp >= problem.target_xp) {
      if (now < best.total_time) {
        best = {
          method: methodLabel,
          reached_target: true,
          total_time: now,
          total_xp: xp,
          steps: [...path],
          expanded_states: expandedStates,
          startNode: initialState.current_node,
        };
      }
      return;
    }

    if (path.length >= problem.max_steps || now >= best.total_time || now > problem.time_limit) {
      return;
    }

    const stepsLeft = problem.max_steps - path.length;
    if (xp + maxPossibleExtraXp(kills, stepsLeft) < problem.target_xp) {
      return;
    }

    if (now + optimisticLowerBound(node, now, xp, kills, avail, retri) >= best.total_time) {
      return;
    }

    const key = buildStateKey(node, xp, kills, avail, retri);
    const prev = visitedBestTime.get(key);
    if (prev !== undefined && prev <= now) {
      return;
    }
    visitedBestTime.set(key, now);

    const run = {
      current_node: node,
      current_time: now,
      current_xp: xp,
      next_retribution_ready: retri,
      kills,
      next_available: avail,
    };
    let candidates = buildCandidates(problem, run);

    if (!candidates.length) {
      const overflow = buildCandidates(problem, run, false);
      if (overflow.length) {
        blockedByTimeLimit = true;
        const overflowMin = Math.min(...overflow.map((step) => step.finish_time));
        if (nextFinishIfForced === null || overflowMin < nextFinishIfForced) {
          nextFinishIfForced = overflowMin;
        }
      }
      return;
    }

    if (useHybridOrdering) {
      candidates.sort((a, b) => hybridCandidateScore(b) - hybridCandidateScore(a) || travelDuration(a) - travelDuration(b) || b.gained_xp - a.gained_xp || a.finish_time - b.finish_time);
    } else {
      candidates.sort((a, b) => b.gained_xp - a.gained_xp || travelDuration(a) - travelDuration(b) || a.finish_time - b.finish_time);
    }

    for (const step of candidates) {
      if (step.finish_time >= best.total_time || step.finish_time > problem.time_limit) {
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
  best.blocked_by_time_limit = blockedByTimeLimit;
  if (best.next_finish_if_forced === undefined) {
    best.next_finish_if_forced = nextFinishIfForced;
  }
  return best;
}

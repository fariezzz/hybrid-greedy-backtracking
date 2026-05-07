export function cloneState(initialState) {
  return {
    current_node: initialState.current_node,
    current_time: initialState.current_time,
    current_xp: initialState.current_xp,
    next_retribution_ready: initialState.next_retribution_ready,
    kills: { ...initialState.kills },
    next_available: { ...initialState.next_available },
    steps: [...initialState.steps],
  };
}

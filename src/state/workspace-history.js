const HISTORY_LIMIT = 40;

export function createHistory(state = null) {
  return { state, history: [], future: [] };
}

export function changeHistory(previous, updater) {
  const state = structuredClone(previous.state);
  updater(state);
  return {
    state,
    history: [...previous.history.slice(-(HISTORY_LIMIT - 1)), previous.state],
    future: [],
  };
}

export function undoHistory(previous) {
  if (!previous.history.length) return previous;
  return {
    state: previous.history.at(-1),
    history: previous.history.slice(0, -1),
    future: [previous.state, ...previous.future],
  };
}

export function redoHistory(previous) {
  if (!previous.future.length) return previous;
  return {
    state: previous.future[0],
    history: [...previous.history, previous.state],
    future: previous.future.slice(1),
  };
}

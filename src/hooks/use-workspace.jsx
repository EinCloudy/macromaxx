import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { createSaveQueue } from '../state/save-queue.js';
import {
  createHistory,
  changeHistory,
  undoHistory,
  redoHistory,
} from '../state/workspace-history.js';

export function useWorkspace(notify) {
  const [snapshot, setSnapshot] = useState(() => createHistory());
  const [saveState, setSaveState] = useState('Saved');
  const current = useRef(snapshot);
  const [saves] = useState(() =>
    createSaveQueue({
      save: (next) => api.save(next),
      onStatus: setSaveState,
      onError: (error) => notify(error.message, true),
    }),
  );

  const publish = useCallback((next) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  const replace = useCallback(
    (next) => {
      saves.cancel();
      publish(createHistory(next));
      setSaveState('Saved');
    },
    [publish, saves],
  );

  const change = useCallback(
    (updater) => {
      const next = changeHistory(current.current, updater);
      publish(next);
      saves.schedule(next.state);
    },
    [publish, saves],
  );

  const undo = useCallback(() => {
    const previous = current.current;
    const next = undoHistory(previous);
    if (next === previous) return;
    publish(next);
    saves.schedule(next.state);
  }, [publish, saves]);

  const redo = useCallback(() => {
    const previous = current.current;
    const next = redoHistory(previous);
    if (next === previous) return;
    publish(next);
    saves.schedule(next.state);
  }, [publish, saves]);

  const flush = useCallback(async () => {
    if (current.current.state) await saves.flush(current.current.state);
  }, [saves]);

  useEffect(() => () => saves.cancel(), [saves]);
  useEffect(() => {
    const listener = (event) => {
      const editing =
        event.target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [undo, redo]);

  return {
    state: snapshot.state,
    replace,
    change,
    undo,
    redo,
    flush,
    saveState,
    canUndo: !!snapshot.history.length,
    canRedo: !!snapshot.future.length,
  };
}

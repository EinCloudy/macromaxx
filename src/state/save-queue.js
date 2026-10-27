// All writes, including explicit flushes, share one queue so an older save
// can never finish after a newer one and overwrite it.
export function createSaveQueue({ save, onStatus, onError, delay = 250 }) {
  let queue = Promise.resolve();
  let timer;
  let revision = 0;

  function enqueue(state, version) {
    const pending = queue.catch(() => {}).then(() => save(state));
    queue = pending;
    pending.then(
      () => {
        if (version === revision) onStatus('Saved');
      },
      (error) => {
        if (version === revision) onStatus('Save failed');
        onError(error);
      },
    );
    return pending;
  }

  return {
    schedule(state) {
      const version = ++revision;
      clearTimeout(timer);
      onStatus('Saving …');
      timer = setTimeout(() => enqueue(state, version), delay);
    },
    flush(state) {
      clearTimeout(timer);
      onStatus('Saving …');
      return enqueue(state, ++revision);
    },
    cancel() {
      clearTimeout(timer);
      revision++;
    },
  };
}

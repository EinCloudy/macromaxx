import { useCallback, useEffect, useRef, useState } from 'react';

export function useNotifications() {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);
  const notify = useCallback((message, error = false) => {
    setToast({
      message: String(message).replace(/^Error invoking remote method '[^']+': Error: /, ''),
      error,
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const perform = useCallback(
    async (fn, success) => {
      try {
        const result = await fn();
        if (success) notify(success);
        return result;
      } catch (error) {
        notify(error.message, true);
        return null;
      }
    },
    [notify],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, dismiss, notify, perform };
}

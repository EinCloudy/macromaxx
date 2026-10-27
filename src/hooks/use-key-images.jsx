import { useEffect, useMemo } from 'react';
import { collectVisuals } from '../../shared/visuals.js';
import { renderKey } from '../renderKeys.js';
import { api } from '../api.js';

export function useKeyImages(state, status, notify) {
  const visuals = state ? collectVisuals(state, status.obs, status) : [];
  const identity = JSON.stringify(visuals.map((entry) => entry.signature));
  // Status updates may be frequent; render only when the artwork changes.
  const imageBank = useMemo(() => visuals, [identity]);
  useEffect(() => {
    if (!imageBank.length) return;
    let cancelled = false;
    (async () => {
      try {
        // Warm every folder, including the Back key, before it is opened.
        const images = await Promise.all(
          imageBank.map(async ({ key, active, signature }) => ({
            signature,
            image: await renderKey(key, active),
          })),
        );
        if (!cancelled) await api.images(images);
      } catch (error) {
        if (!cancelled) notify('Key images: ' + error.message, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageBank, notify]);
}

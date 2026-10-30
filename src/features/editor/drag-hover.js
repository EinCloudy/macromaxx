export const DRAG_HOVER_DELAY = 700;

// Keep the timer stable across repeated dragover events, and open at most once
// until the pointer leaves the target (or the displayed folder changes).
export function createDragHover() {
  let target = null;
  let timer = null;

  function cancel() {
    clearTimeout(timer);
    timer = null;
    target = null;
  }

  return {
    cancel,
    hover(nextTarget, open) {
      if (target === nextTarget) return;
      cancel();
      target = nextTarget;
      timer = setTimeout(() => {
        timer = null;
        open();
      }, DRAG_HOVER_DELAY);
    },
  };
}

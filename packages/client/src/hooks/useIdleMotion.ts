import { useSyncExternalStore } from 'react';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const preference = window.matchMedia(reducedMotionQuery);
  preference.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    preference.removeEventListener('change', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

function idleMotionAllowed() {
  return !document.hidden && !window.matchMedia(reducedMotionQuery).matches;
}

export function useIdleMotion() {
  return useSyncExternalStore(subscribe, idleMotionAllowed, () => false);
}

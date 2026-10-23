import { today } from "../domain/book.ts";

/** Event registrations return their cleanup; timer handles are opaque to the store. */
export interface CurrentDateEnvironment<Timer = number> {
  now(): Date;
  setTimeout(callback: () => void, delayMs: number): Timer;
  clearTimeout(timer: Timer): void;
  isVisible(): boolean;
  onFocus(listener: () => void): () => void;
  onVisibilityChange(listener: () => void): () => void;
}

export interface CurrentDateStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): string;
  getServerSnapshot(): string;
}

/** No DOM access: one midnight timer and pair of listeners per subscribed store. */
export function createCurrentDateStore<Timer>(
  environment: CurrentDateEnvironment<Timer>,
): CurrentDateStore {
  let snapshot = today(environment.now());
  const listeners = new Set<() => void>();
  let cancelTimer: (() => void) | undefined;
  let stopFocus: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = undefined;
  }

  function refresh() {
    clearTimer();
    if (!listeners.size) return;
    const now = environment.now();
    const next = today(now);
    if (environment.isVisible()) {
      const midnight = new Date(now);
      // Recalculate local midnight each time: DST days are not always 24 hours.
      midnight.setHours(24, 0, 0, 0);
      const timer = environment.setTimeout(
        refresh,
        midnight.getTime() - now.getTime(),
      );
      cancelTimer = () => environment.clearTimeout(timer);
    }
    if (next !== snapshot) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    }
  }

  const getSnapshot = () => snapshot;
  return {
    getSnapshot,
    getServerSnapshot: getSnapshot,
    subscribe(listener) {
      // Each subscription owns its cleanup even if callback identity is reused.
      const subscription = () => listener();
      listeners.add(subscription);
      if (listeners.size === 1) {
        stopFocus = environment.onFocus(refresh);
        stopVisibility = environment.onVisibilityChange(refresh);
      }
      refresh();
      return () => {
        if (!listeners.delete(subscription) || listeners.size) return;
        clearTimer();
        stopFocus?.();
        stopVisibility?.();
        stopFocus = undefined;
        stopVisibility = undefined;
      };
    },
  };
}

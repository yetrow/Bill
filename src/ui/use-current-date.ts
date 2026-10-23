import { useSyncExternalStore } from "react";
import {
  createCurrentDateStore,
  type CurrentDateStore,
} from "./current-date.ts";

let browserStore: CurrentDateStore | undefined;
const noop = () => {};
const subscribeInactive = () => noop;

function getBrowserStore(): CurrentDateStore {
  // Importing this module does not read browser globals or allocate resources.
  // Event registration and scheduling start only when React subscribes.
  return (browserStore ??= createCurrentDateStore({
    now: () => new Date(),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (timer) => globalThis.clearTimeout(timer),
    isVisible: () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
    onFocus(listener) {
      if (typeof window === "undefined") return noop;
      window.addEventListener("focus", listener);
      return () => window.removeEventListener("focus", listener);
    },
    onVisibilityChange(listener) {
      if (typeof document === "undefined") return noop;
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  }));
}

/** Inactive pages retain mounted state without owning a date subscription. */
export function useCurrentDate(active = true): string {
  const store = getBrowserStore();
  return useSyncExternalStore(
    active ? store.subscribe : subscribeInactive,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

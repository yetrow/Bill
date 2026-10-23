import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { today } from "../src/domain/book.ts";
import {
  createCurrentDateStore,
  type CurrentDateEnvironment,
} from "../src/ui/current-date.ts";
import { useCurrentDate } from "../src/ui/use-current-date.ts";

/** Controlled local clock and event sources: no DOM or real timers required. */
function environment(
  initial = "2024-02-29T23:59:59.500",
  initiallyVisible = true,
) {
  let clock = new Date(initial);
  let visible = initiallyVisible;
  let nextId = 0;
  const timers = new Map<number, { callback: () => void; due: number }>();
  const focusListeners = new Set<() => void>();
  const visibilityListeners = new Set<() => void>();
  const api: CurrentDateEnvironment<number> = {
    now: () => new Date(clock),
    isVisible: () => visible,
    setTimeout(callback, delayMs) {
      assert.ok(delayMs > 0, "no timer spin at midnight");
      const id = nextId++;
      timers.set(id, { callback, due: clock.getTime() + delayMs });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    onFocus(listener) {
      focusListeners.add(listener);
      return () => {
        focusListeners.delete(listener);
      };
    },
    onVisibilityChange(listener) {
      visibilityListeners.add(listener);
      return () => {
        visibilityListeners.delete(listener);
      };
    },
  };
  return {
    api,
    timers,
    focusListeners,
    visibilityListeners,
    setTime(value: string) {
      clock = new Date(value);
    },
    focus() {
      [...focusListeners].forEach((listener) => listener());
    },
    visibility(value: boolean) {
      visible = value;
      [...visibilityListeners].forEach((listener) => listener());
    },
    fireNext() {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      assert.ok(next, "a scheduled timer exists");
      timers.delete(next[0]);
      clock = new Date(Math.max(clock.getTime(), next[1].due));
      next[1].callback();
    },
  };
}

test("creation and snapshot reads are lazy; first subscriber schedules local midnight", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  assert.equal(store.getSnapshot(), "2024-02-29");
  assert.equal(store.getServerSnapshot(), "2024-02-29");
  assert.equal(env.timers.size, 0);
  assert.equal(env.focusListeners.size, 0);
  assert.equal(env.visibilityListeners.size, 0);
  const stop = store.subscribe(() => {});
  assert.equal(env.timers.size, 1);
  assert.equal(
    [...env.timers.values()][0].due,
    new Date("2024-03-01T00:00:00").getTime(),
  );
  assert.equal(env.focusListeners.size, 1);
  assert.equal(env.visibilityListeners.size, 1);
  stop();
});

test("midnight updates the snapshot once and schedules the following local midnight", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  const seen: string[] = [];
  const stop = store.subscribe(() => seen.push(store.getSnapshot()));
  env.fireNext();
  assert.equal(store.getSnapshot(), "2024-03-01");
  assert.deepEqual(seen, ["2024-03-01"]);
  assert.equal(env.timers.size, 1);
  assert.equal(
    [...env.timers.values()][0].due,
    new Date("2024-03-02T00:00:00").getTime(),
  );
  env.fireNext();
  assert.deepEqual(seen, ["2024-03-01", "2024-03-02"]);
  stop();
});

test("same-day focus and visibility keep the snapshot stable without notifications", () => {
  const env = environment("2024-02-29T12:00:00");
  const store = createCurrentDateStore(env.api);
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  const snapshot = store.getSnapshot();
  env.setTime("2024-02-29T15:00:00");
  env.focus();
  env.focus();
  env.visibility(false);
  env.visibility(true);
  assert.equal(store.getSnapshot(), snapshot);
  assert.equal(notifications, 0);
  assert.equal(env.timers.size, 1);
  stop();
});

test("hidden documents clear scheduling and resume immediately after several missed midnights", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  const seen: string[] = [];
  const stop = store.subscribe(() => seen.push(store.getSnapshot()));
  env.visibility(false);
  assert.equal(env.timers.size, 0, "also clears a zero-valued timer handle");
  env.setTime("2024-03-03T10:00:00");
  env.focus();
  assert.equal(env.timers.size, 0, "hidden focus cannot restart scheduling");
  env.visibility(true);
  assert.equal(store.getSnapshot(), "2024-03-03");
  assert.deepEqual(seen, ["2024-03-03"]);
  assert.equal(env.timers.size, 1);
  stop();
});

test("subscribing while hidden waits for visibility before scheduling", () => {
  const env = environment("2024-02-29T12:00:00", false);
  const store = createCurrentDateStore(env.api);
  const stop = store.subscribe(() => {});
  assert.equal(env.timers.size, 0);
  env.setTime("2024-03-01T12:00:00");
  env.visibility(true);
  assert.equal(store.getSnapshot(), "2024-03-01");
  assert.equal(env.timers.size, 1);
  stop();
});

test("two subscribers share one schedule; only last unsubscribe removes all resources", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  let first = 0,
    second = 0;
  const stopFirst = store.subscribe(() => first++);
  const stopSecond = store.subscribe(() => second++);
  assert.equal(env.timers.size, 1);
  assert.equal(env.focusListeners.size, 1);
  assert.equal(env.visibilityListeners.size, 1);
  env.fireNext();
  assert.equal(first, 1);
  assert.equal(second, 1);
  stopFirst();
  stopFirst();
  assert.equal(env.timers.size, 1);
  env.fireNext();
  assert.equal(first, 1);
  assert.equal(second, 2);
  stopSecond();
  assert.equal(env.timers.size, 0);
  assert.equal(env.focusListeners.size, 0);
  assert.equal(env.visibilityListeners.size, 0);
});

test("resubscription refreshes immediately after a fully inactive period", () => {
  const env = environment("2024-02-29T12:00:00");
  const store = createCurrentDateStore(env.api);
  store.subscribe(() => {})();
  env.setTime("2024-03-02T12:00:00");
  let notifications = 0;
  const stop = store.subscribe(() => notifications++);
  assert.equal(store.getSnapshot(), "2024-03-02");
  assert.equal(notifications, 1);
  assert.equal(env.timers.size, 1);
  stop();
});

test("first subscription refreshes even if the store was created on a previous date", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  env.setTime("2024-03-01T09:00:00");
  const stop = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), "2024-03-01");
  stop();
});

test("a reactivated page refreshes immediately while another subscriber remains active", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  let notifications = 0;
  const stopFirst = store.subscribe(() => notifications++);
  // Simulate the browser delaying its midnight timer during suspension.
  env.setTime("2024-03-02T09:00:00");
  const stopReactivated = store.subscribe(() => {});
  assert.equal(store.getSnapshot(), "2024-03-02");
  assert.equal(notifications, 1);
  assert.equal(env.timers.size, 1);
  stopFirst();
  stopReactivated();
});

test("focus catches clock changes and delayed timers without duplicate day notifications", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  const seen: string[] = [];
  const stop = store.subscribe(() => seen.push(store.getSnapshot()));
  env.setTime("2024-03-04T10:00:00");
  env.focus();
  env.focus();
  assert.deepEqual(seen, ["2024-03-04"]);
  env.setTime("2024-03-02T09:00:00");
  env.focus();
  assert.deepEqual(seen, ["2024-03-04", "2024-03-02"]);
  env.setTime("2024-03-06T09:00:00");
  env.fireNext();
  assert.equal(store.getSnapshot(), "2024-03-06");
  assert.equal(env.timers.size, 1);
  stop();
});

test("the same callback may subscribe twice with independent cleanup", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  let notifications = 0;
  const listener = () => notifications++;
  const stopFirst = store.subscribe(listener);
  const stopSecond = store.subscribe(listener);
  stopFirst();
  env.fireNext();
  assert.equal(notifications, 1);
  assert.equal(env.timers.size, 1);
  stopSecond();
  assert.equal(env.timers.size, 0);
});

test("unsubscribe during notification cannot recreate an orphan timer", () => {
  const env = environment();
  const store = createCurrentDateStore(env.api);
  const stop = store.subscribe(() => stop());
  env.fireNext();
  assert.equal(env.timers.size, 0);
  assert.equal(env.focusListeners.size, 0);
  assert.equal(env.visibilityListeners.size, 0);
});

test("hook import and server rendering work without window or document for either active state", () => {
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.document, "undefined");
  function DateText({ active = true }: { active?: boolean }) {
    return createElement("time", null, useCurrentDate(active));
  }
  assert.equal(
    renderToString(createElement(DateText)),
    `<time>${today()}</time>`,
  );
  assert.equal(
    renderToString(createElement(DateText, { active: false })),
    `<time>${today()}</time>`,
  );
});

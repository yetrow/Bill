import { test } from "node:test";
import assert from "node:assert/strict";
import * as rules from "../src/domain/book.ts";

const tx = (date: string, amountMinor: number, kind = "expense") => ({
  id: `${date}-${amountMinor}-${kind}`,
  date,
  amountMinor,
  kind,
  accountId: "cash",
  categoryId: "food",
  note: "",
  createdAt: 1,
});

test("daily expenses sum cents, exclude income/transfers and other months, fill gaps", () => {
  assert.equal(
    typeof rules.dailyExpenses,
    "function",
    "daily expense series exists",
  );
  const b = rules.emptyBook();
  b.transactions = [
    tx("2024-02-01", 10),
    tx("2024-02-01", 20),
    tx("2024-02-29", 987),
    tx("2024-01-31", 888),
    tx("2024-03-01", 999),
    tx("2024-02-01", 500, "income"),
    tx("2024-02-01", 600, "transfer"),
  ] as typeof b.transactions;
  const points = rules.dailyExpenses(b, "2024-02", "2026-10-15");
  assert.equal(points.length, 29);
  assert.deepEqual(points[0], { date: "2024-02-01", amountMinor: 30 });
  assert.deepEqual(points[1], { date: "2024-02-02", amountMinor: 0 });
  assert.deepEqual(points.at(-1), { date: "2024-02-29", amountMinor: 987 });
  assert.equal(
    points.reduce((sum, p) => sum + (p.amountMinor ?? 0), 0),
    1017,
  );
});

test("future days are unplotted rather than false zero spending", () => {
  const b = rules.emptyBook();
  b.transactions = [tx("2026-10-16", 999)] as typeof b.transactions;
  const points = rules.dailyExpenses(b, "2026-10", "2026-10-15");
  assert.equal(points.length, 31);
  assert.equal(points[14].amountMinor, 0);
  assert.equal(points[15].amountMinor, null);
  assert.equal(points[30].amountMinor, null);
  assert.ok(
    rules
      .dailyExpenses(b, "2026-11", "2026-10-15")
      .every((p) => p.amountMinor === null),
  );
});

test("calendar lengths and expense changes remain accurate", () => {
  const b = rules.emptyBook();
  for (const [month, length] of [
    ["2023-02", 28],
    ["2024-04", 30],
    ["2024-12", 31],
  ] as const)
    assert.equal(rules.dailyExpenses(b, month, "2026-10-15").length, length);
  b.transactions = [tx("2024-04-30", 1234)] as typeof b.transactions;
  assert.equal(
    rules.dailyExpenses(b, "2024-04", "2026-10-15")[29].amountMinor,
    1234,
  );
  b.transactions[0].amountMinor = 567;
  assert.equal(
    rules.dailyExpenses(b, "2024-04", "2026-10-15")[29].amountMinor,
    567,
  );
  b.transactions = [];
  assert.equal(
    rules.dailyExpenses(b, "2024-04", "2026-10-15")[29].amountMinor,
    0,
  );
});

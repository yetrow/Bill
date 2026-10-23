import test from "node:test";
import assert from "node:assert/strict";
import { emptyBook, type Book, type Transaction } from "../src/domain/book.ts";
import {
  periodRange,
  movePeriod,
  homeOverview,
  ledgerTransactions,
  insightOverview,
} from "../src/ui/view-models.ts";

function transaction(
  id: string,
  patch: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    kind: "expense",
    amountMinor: 101,
    accountId: "cash",
    categoryId: "food",
    date: "2024-02-29",
    note: "",
    createdAt: 1,
    ...patch,
  };
}

function fixture(): Book {
  const book = emptyBook();
  book.categories.find((c) => c.id === "transport")!.color =
    book.categories.find((c) => c.id === "food")!.color;
  book.categories.find((c) => c.id === "transport")!.archived = true;
  book.budgets = [{ month: "2024-02", amountMinor: 1000 }];
  book.transactions = [
    transaction("old", { date: "2024-02-01", amountMinor: 100 }),
    transaction("first-tie", { amountMinor: 50, createdAt: 2 }),
    transaction("income", {
      kind: "income",
      categoryId: "salary",
      amountMinor: 900,
      createdAt: 4,
    }),
    transaction("second-tie", { amountMinor: 50, createdAt: 2 }),
    transaction("transfer", {
      kind: "transfer",
      categoryId: null,
      toAccountId: "bank",
      amountMinor: 9999,
      createdAt: 3,
    }),
    transaction("transport", { categoryId: "transport", amountMinor: 300 }),
    transaction("outside", { date: "2024-03-01", amountMinor: 777 }),
  ];
  return book;
}

function deepFreeze(value: object) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") deepFreeze(child);
  });
  Object.freeze(value);
}

test("period ranges include leap day, Monday through Sunday, and existing labels", () => {
  assert.deepEqual(periodRange("2024-02-16", "month"), {
    from: "2024-02-01",
    to: "2024-02-29",
    label: "2024 年 2 月",
  });
  assert.deepEqual(periodRange("2024-03-03", "week"), {
    from: "2024-02-26",
    to: "2024-03-03",
    label: "2024-02-26 至 2024-03-03",
  });
  assert.deepEqual(periodRange("2024-02-29", "day"), {
    from: "2024-02-29",
    to: "2024-02-29",
    label: "2024-02-29",
  });
  assert.deepEqual(periodRange("2024-02-29", "year"), {
    from: "2024-01-01",
    to: "2024-12-31",
    label: "2024 年",
  });
  assert.equal(periodRange("2024-01-01", "week").to, "2024-01-07");
  assert.equal(periodRange("2023-02-16", "month").to, "2023-02-28");
});

test("moving months and years normalizes first, with calendar day/week arithmetic", () => {
  for (const [date, period, step, expected] of [
    ["2024-01-31", "month", 1, "2024-02-01"],
    ["2024-02-29", "year", 1, "2025-01-01"],
    ["2024-01-31", "month", -1, "2023-12-01"],
    ["2024-02-29", "year", -1, "2023-01-01"],
    ["2024-03-03", "week", -1, "2024-02-25"],
    ["2024-02-29", "day", 1, "2024-03-01"],
    ["2024-12-31", "day", 1, "2025-01-01"],
    ["2024-01-31", "month", 2, "2024-03-01"],
    ["2024-02-29", "month", 0, "2024-02-01"],
  ] as const)
    assert.equal(movePeriod(date, period, step), expected);
});

test("home overview keeps integer fen and excludes income and transfers from spending", () => {
  assert.deepEqual(homeOverview(fixture(), "2024-02-29"), {
    todaySpentMinor: 400,
    month: "2024-02",
    budget: {
      amountMinor: 1000,
      spentMinor: 500,
      remainingMinor: 500,
      daysLeft: 1,
      dailyMinor: 500,
    },
  });
  const empty = homeOverview(emptyBook(), "2024-02-29");
  assert.equal(empty.todaySpentMinor, 0);
  assert.equal(
    empty.budget.amountMinor,
    0,
    "unset budget keeps the domain sentinel",
  );
});

test("ledger filters inclusive bounds and kind/category without hiding transfers by default", () => {
  const book = fixture();
  assert.deepEqual(
    ledgerTransactions(book, {
      from: "2024-02-01",
      to: "2024-02-29",
      kind: "expense",
      categoryId: "food",
    }).map((t) => t.id),
    ["first-tie", "second-tie", "old"],
  );
  assert.deepEqual(
    ledgerTransactions(book, { kind: "income" }).map((t) => t.id),
    ["income"],
  );
  assert.equal(
    ledgerTransactions(book, { categoryId: null }).length,
    7,
    "null clears category selection",
  );
  assert.equal(ledgerTransactions(book, {}).length, 7);
  assert.equal(ledgerTransactions(book, { categoryId: "missing" }).length, 0);
  assert.equal(ledgerTransactions(book, { from: "2025-01-01" }).length, 0);
  assert.deepEqual(
    ledgerTransactions(book, { to: "2024-02-01" }).map((t) => t.id),
    ["old"],
  );
});

test("insight totals and shares reuse category accounting and stable distinct display colors", () => {
  const book = fixture();
  const result = insightOverview(book, "2024-02-16", "month", "expense");
  assert.deepEqual(result.range, {
    from: "2024-02-01",
    to: "2024-02-29",
    label: "2024 年 2 月",
  });
  assert.equal(result.total, 500);
  assert.deepEqual(
    result.rows.map((r) => [r.id, r.amountMinor, r.percent]),
    [
      ["transport", 300, 60],
      ["food", 200, 40],
    ],
  );
  assert.notEqual(result.colors.get("food"), result.colors.get("transport"));
  assert.equal(result.rows[0].color, result.colors.get("transport"));
  assert.equal(
    result.rows[0].archived,
    true,
    "historical archived categories remain visible",
  );
  const day = insightOverview(book, "2024-02-29", "day", "expense");
  assert.equal(
    day.rows.find((r) => r.id === "transport")!.color,
    result.rows[0].color,
  );
  const income = insightOverview(book, "2024-02-29", "month", "income");
  assert.equal(income.total, 900);
  assert.deepEqual(
    income.rows.map((r) => [r.id, r.percent]),
    [["salary", 100]],
  );
  const empty = insightOverview(book, "2025-02-01", "month", "expense");
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.rows, []);
});

test("all book queries work on deeply frozen input and ledger sorting is stable", () => {
  const book = fixture();
  const before = structuredClone(book);
  deepFreeze(book);
  assert.deepEqual(
    ledgerTransactions(book, {}).map((t) => t.id),
    [
      "outside",
      "income",
      "transfer",
      "first-tie",
      "second-tie",
      "transport",
      "old",
    ],
  );
  assert.equal(homeOverview(book, "2024-02-29").budget.spentMinor, 500);
  assert.equal(
    insightOverview(book, "2024-02-29", "month", "expense").total,
    500,
  );
  assert.deepEqual(book, before);
});

import {
  budgetSummary,
  categoryTotals,
  today,
  type Book,
  type Transaction,
} from "../domain/book.ts";
import { categoryColors } from "./category-colors.ts";

export type Period = "day" | "week" | "month" | "year";

/** Calendar boundaries use local noon, avoiding UTC date shifts and DST gaps. */
export function periodRange(date: string, period: Period) {
  const start = new Date(`${date}T12:00:00`);
  const end = new Date(start);
  if (period === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  }
  const from = today(start);
  const to = today(end);
  const label =
    period === "year"
      ? `${start.getFullYear()} 年`
      : period === "month"
        ? `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`
        : from === to
          ? from
          : `${from} 至 ${to}`;
  return { from, to, label };
}

export function movePeriod(date: string, period: Period, step: number): string {
  const cursor = new Date(`${date}T12:00:00`);
  if (period === "year") {
    cursor.setMonth(0, 1);
    cursor.setFullYear(cursor.getFullYear() + step);
  } else if (period === "month") {
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + step);
  } else {
    cursor.setDate(cursor.getDate() + step * (period === "week" ? 7 : 1));
  }
  return today(cursor);
}

export function homeOverview(book: Book, asOf: string) {
  return {
    todaySpentMinor: book.transactions.reduce(
      (sum, transaction) =>
        sum +
        (transaction.kind === "expense" && transaction.date === asOf
          ? transaction.amountMinor
          : 0),
      0,
    ),
    month: asOf.slice(0, 7),
    budget: budgetSummary(book, asOf),
  };
}

export interface LedgerQuery {
  from?: string;
  to?: string;
  kind?: "expense" | "income";
  /** null (or omitted) means all categories, matching a cleared UI selection. */
  categoryId?: string | null;
}

export function ledgerTransactions(
  book: Book,
  query: LedgerQuery,
): Transaction[] {
  return book.transactions
    .filter(
      (transaction) =>
        (query.from === undefined || transaction.date >= query.from) &&
        (query.to === undefined || transaction.date <= query.to) &&
        (query.kind === undefined || transaction.kind === query.kind) &&
        (query.categoryId == null ||
          transaction.categoryId === query.categoryId),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

export function insightOverview(
  book: Book,
  date: string,
  period: Period,
  kind: "expense" | "income",
) {
  const range = periodRange(date, period);
  const colors = categoryColors(book.categories);
  const rows = categoryTotals(book, range.from, range.to, kind).map((row) => ({
    ...row,
    color: colors.get(row.id)!,
  }));
  return {
    range,
    colors,
    rows,
    total: rows.reduce((sum, row) => sum + row.amountMinor, 0),
  };
}

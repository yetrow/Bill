/** Platform-free bookkeeping rules. All persisted money is integer CNY fen. */
export type Kind = "expense" | "income" | "transfer";
export interface Account {
  id: string;
  name: string;
  openingMinor: number;
  archived: boolean;
}
export interface Category {
  id: string;
  name: string;
  kind: "expense" | "income";
  color: string;
  archived: boolean;
}
export interface Transaction {
  id: string;
  kind: Kind;
  amountMinor: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId: string | null;
  date: string;
  note: string;
  createdAt: number;
}
export interface Budget {
  month: string;
  amountMinor: number;
}
export interface Book {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}
export type Command =
  | { type: "transaction.save"; transaction: Transaction }
  | { type: "transaction.delete"; id: string }
  | { type: "account.add"; account: Account }
  | { type: "account.archive"; id: string }
  | { type: "category.save"; category: Category }
  | { type: "budget.set"; month: string; amountMinor: number | null };
export const MAX_MINOR = 999_999_999;
export const COLORS = [
  "#d87962",
  "#65967a",
  "#6c98b7",
  "#ad86b3",
  "#c09a54",
  "#bf708a",
  "#609e9b",
  "#8f91ac",
];
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDate(s: unknown): s is string {
  if (
    typeof s !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    s < "1900-01-01" ||
    s > "9999-12-31"
  )
    return false;
  const d = new Date(`${s}T12:00:00`);
  return Number.isFinite(d.getTime()) && today(d) === s;
}
export function parseMoney(value: string, signed = false): number {
  if (
    !(signed ? /^-?\d{1,7}(\.\d{1,2})?$/ : /^\d{1,7}(\.\d{1,2})?$/).test(
      value.trim(),
    )
  )
    throw new Error("请输入最多两位小数的金额");
  const [a, b = ""] = value.trim().replace("-", "").split(".");
  const n =
    (Number(a) * 100 + Number(b.padEnd(2, "0"))) *
    (value.trim().startsWith("-") ? -1 : 1);
  if (Math.abs(n) > MAX_MINOR || (!signed && n <= 0))
    throw new Error("金额应大于 0 且不超过 9,999,999.99");
  return n;
}
export function formatMoney(n: number) {
  return (n / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
/** Full calendar month; future dates have no observed spending value yet. */
export function dailyExpenses(book: Book, month: string, asOf = today()) {
  const days = new Date(`${month}-01T12:00:00`);
  days.setMonth(days.getMonth() + 1, 0);
  const totals = new Map<string, number>();
  for (const t of book.transactions) {
    if (t.kind === "expense" && t.date.startsWith(`${month}-`))
      totals.set(t.date, (totals.get(t.date) ?? 0) + t.amountMinor);
  }
  return Array.from({ length: days.getDate() }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, amountMinor: date > asOf ? null : (totals.get(date) ?? 0) };
  });
}
export function emptyBook(): Book {
  return {
    accounts: [
      { id: "cash", name: "日常账户", openingMinor: 0, archived: false },
    ],
    categories: [
      ...["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "人情", "其他"].map(
        (name, i) => ({
          id: [
            "food",
            "transport",
            "shopping",
            "home",
            "fun",
            "health",
            "gifts",
            "other",
          ][i],
          name,
          kind: "expense" as const,
          color: COLORS[i],
          archived: false,
        }),
      ),
      {
        id: "salary",
        name: "工资",
        kind: "income",
        color: "#65967a",
        archived: false,
      },
      {
        id: "other-income",
        name: "其他收入",
        kind: "income",
        color: "#6c98b7",
        archived: false,
      },
    ],
    transactions: [],
    budgets: [],
  };
}
function fail(message: string): never {
  throw new Error(message);
}
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail("数据结构不正确");
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 100): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail("名称或编号无效");
  return v;
}
function minor(v: unknown, signed = false): number {
  if (
    typeof v !== "number" ||
    !Number.isSafeInteger(v) ||
    Math.abs(v) > MAX_MINOR ||
    (!signed && v <= 0)
  )
    fail("金额必须为有效整数分");
  return v;
}
function flag(v: unknown): boolean {
  if (typeof v !== "boolean") fail("归档标记无效");
  return v;
}
function array(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.length > 100000)
    fail("数据列表无效或超过 100000 条");
  return v;
}
function unique<T>(items: T[], key: (v: T) => string) {
  const ids = items.map(key);
  if (new Set(ids).size !== ids.length) fail("存在重复编号或名称");
}
export function validateBook(raw: unknown): Book {
  const b = object(raw);
  const accounts = array(b.accounts).map((x) => {
    const a = object(x);
    return {
      id: text(a.id, 160),
      name: text(a.name),
      openingMinor: minor(a.openingMinor, true),
      archived: flag(a.archived),
    };
  });
  if (!accounts.length || !accounts.some((a) => !a.archived))
    fail("至少保留一个可用账户");
  unique(accounts, (a) => a.id);
  unique(accounts, (a) => a.name);
  const categories = array(b.categories).map((x) => {
    const c = object(x);
    if (c.kind !== "expense" && c.kind !== "income") fail("分类类型无效");
    if (typeof c.color !== "string" || !/^#[0-9a-f]{6}$/i.test(c.color))
      fail("分类颜色无效");
    return {
      id: text(c.id, 160),
      name: text(c.name),
      kind: c.kind as "expense" | "income",
      color: c.color,
      archived: flag(c.archived),
    };
  });
  unique(categories, (c) => c.id);
  unique(categories, (c) => `${c.kind}:${c.name}`);
  const transactions = array(b.transactions).map((x) => {
    const t = object(x);
    if (!["expense", "income", "transfer"].includes(String(t.kind)))
      fail("交易类型无效");
    if (!validDate(t.date)) fail("交易日期无效");
    const accountId = text(t.accountId, 160);
    if (!accounts.some((a) => a.id === accountId)) fail("交易引用的账户不存在");
    const kind = t.kind as Kind;
    let categoryId: string | null = null,
      toAccountId: string | null = null;
    if (kind === "transfer") {
      toAccountId = text(t.toAccountId, 160);
      if (
        accountId === toAccountId ||
        !accounts.some((a) => a.id === toAccountId)
      )
        fail("转出与转入账户须存在且不同");
      if (t.categoryId !== null) fail("转账不能关联收支分类");
    } else {
      categoryId = text(t.categoryId, 160);
      if (!categories.some((c) => c.id === categoryId && c.kind === kind))
        fail("交易分类不存在或类型不符");
      if (t.toAccountId != null) fail("收支交易不能有转入账户");
    }
    if (typeof t.note !== "string" || t.note.length > 2000)
      fail("备注不得超过 2000 字");
    if (
      typeof t.createdAt !== "number" ||
      !Number.isSafeInteger(t.createdAt) ||
      t.createdAt < 0
    )
      fail("创建时间无效");
    return {
      id: text(t.id, 160),
      kind,
      amountMinor: minor(t.amountMinor),
      accountId,
      toAccountId,
      categoryId,
      date: t.date,
      note: t.note,
      createdAt: t.createdAt,
    };
  });
  unique(transactions, (t) => t.id);
  const budgets = array(b.budgets).map((x) => {
    const v = object(x);
    if (typeof v.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month))
      fail("预算月份无效");
    return { month: v.month, amountMinor: minor(v.amountMinor) };
  });
  unique(budgets, (b) => b.month);
  return { accounts, categories, transactions, budgets };
}
export function applyCommand(book: Book, command: Command): Book {
  let next: Book = structuredClone(book);
  switch (command.type) {
    case "transaction.save": {
      const t = command.transaction,
        old = book.transactions.find((x) => x.id === t.id);
      if (t.date > today()) fail("不能记录未来日期");
      for (const id of [t.accountId, t.toAccountId])
        if (
          id &&
          book.accounts.find((a) => a.id === id)?.archived &&
          id !== old?.accountId &&
          id !== old?.toAccountId
        )
          fail("账户已归档");
      if (
        t.categoryId &&
        book.categories.find((c) => c.id === t.categoryId)?.archived &&
        t.categoryId !== old?.categoryId
      )
        fail("分类已归档");
      const item = old ? { ...t, createdAt: old.createdAt } : t;
      next.transactions = old
        ? next.transactions.map((x) => (x.id === t.id ? item : x))
        : [...next.transactions, item];
      break;
    }
    case "transaction.delete":
      if (!next.transactions.some((t) => t.id === command.id))
        fail("交易不存在");
      next.transactions = next.transactions.filter((t) => t.id !== command.id);
      break;
    case "account.add":
      next.accounts.push(command.account);
      break;
    case "account.archive":
      if (!next.accounts.some((a) => a.id === command.id)) fail("账户不存在");
      next.accounts = next.accounts.map((a) =>
        a.id === command.id ? { ...a, archived: !a.archived } : a,
      );
      break;
    case "category.save":
      next.categories = next.categories.some(
        (c) => c.id === command.category.id,
      )
        ? next.categories.map((c) =>
            c.id === command.category.id ? command.category : c,
          )
        : [...next.categories, command.category];
      break;
    case "budget.set":
      next.budgets = next.budgets.filter((b) => b.month !== command.month);
      if (command.amountMinor !== null)
        next.budgets.push({
          month: command.month,
          amountMinor: command.amountMinor,
        });
      else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(command.month))
        fail("预算月份无效");
      break;
    default:
      fail("不支持的操作");
  }
  next = validateBook(next);
  return next;
}
export function balances(book: Book): Record<string, number> {
  const sums: Record<string, number> = Object.fromEntries(
    book.accounts.map((a) => [a.id, a.openingMinor]),
  );
  for (const t of book.transactions) {
    sums[t.accountId] += t.kind === "income" ? t.amountMinor : -t.amountMinor;
    if (t.kind === "transfer") sums[t.toAccountId!] += t.amountMinor;
  }
  return sums;
}
export function budgetSummary(book: Book, date = today()) {
  if (!validDate(date)) fail("日期无效");
  const month = date.slice(0, 7),
    amountMinor = book.budgets.find((b) => b.month === month)?.amountMinor ?? 0;
  const spentMinor = book.transactions
    .filter((t) => t.kind === "expense" && t.date.startsWith(month))
    .reduce((n, t) => n + t.amountMinor, 0);
  const [y, m, d] = date.split("-").map(Number),
    daysLeft = new Date(y, m, 0).getDate() - d + 1,
    remainingMinor = amountMinor - spentMinor;
  return {
    amountMinor,
    spentMinor,
    remainingMinor,
    daysLeft,
    dailyMinor: Math.floor(Math.max(0, remainingMinor) / daysLeft),
  };
}
export function categoryTotals(
  book: Book,
  start: string,
  end: string,
  kind: "expense" | "income" = "expense",
) {
  const sums = new Map<string, number>();
  for (const t of book.transactions)
    if (t.kind === kind && t.date >= start && t.date <= end)
      sums.set(t.categoryId!, (sums.get(t.categoryId!) ?? 0) + t.amountMinor);
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  return [...sums]
    .map(([id, amountMinor]) => ({
      ...book.categories.find((c) => c.id === id)!,
      amountMinor,
      percent: total ? (amountMinor / total) * 100 : 0,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}

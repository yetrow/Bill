import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { categoryTotals, formatMoney, today } from "../domain/book";
import { useBook } from "./context";
import { TransactionList } from "./TransactionList";
import { LabelledDonut } from "./LabelledDonut";
import { categoryColors } from "./category-colors";
import { SpendingTrend } from "./SpendingTrend";
export function Insights() {
  const { book } = useBook();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
      "month",
    ),
    [date, setDate] = useState(today()),
    [kind, setKind] = useState<"expense" | "income">("expense");
  const cursor = new Date(`${date}T12:00:00`),
    start = new Date(cursor),
    end = new Date(cursor);
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
  const colors = categoryColors(book.categories);
  const from = today(start),
    to = today(end),
    rows = categoryTotals(book, from, to, kind).map((r) => ({
      ...r,
      color: colors.get(r.id)!,
    })),
    total = rows.reduce((sum, c) => sum + c.amountMinor, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const filtered = book.transactions
    .filter(
      (t) =>
        t.date >= from &&
        t.date <= to &&
        t.kind === kind &&
        (!selected || t.categoryId === selected),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  function move(step: number) {
    const d = new Date(cursor);
    if (period === "year") {
      d.setMonth(0, 1);
      d.setFullYear(d.getFullYear() + step);
    } else if (period === "month") {
      d.setDate(1);
      d.setMonth(d.getMonth() + step);
    } else d.setDate(d.getDate() + step * (period === "week" ? 7 : 1));
    setDate(today(d));
    setSelected(null);
  }
  return (
    <div className="content">
      <header className="page-header">
        <div>
          <h1>统计</h1>
        </div>
      </header>
      <div className="segmented period-tabs">
        {(["day", "week", "month", "year"] as const).map((p) => (
          <button
            key={p}
            className={period === p ? "selected" : ""}
            onClick={() => {
              setPeriod(p);
              setSelected(null);
            }}
          >
            {{ day: "日", week: "周", month: "月", year: "年" }[p]}
          </button>
        ))}
      </div>
      <div className="date-navigation">
        <button aria-label="上一期" onClick={() => move(-1)}>
          <ChevronLeft />
        </button>
        <div>
          <strong>
            {period === "year"
              ? `${start.getFullYear()} 年`
              : period === "month"
                ? `${start.getFullYear()} 年 ${start.getMonth() + 1} 月`
                : from === to
                  ? from
                  : `${from} 至 ${to}`}
          </strong>
          <button
            onClick={() => {
              setDate(today());
              setSelected(null);
            }}
          >
            回到本期
          </button>
        </div>
        <button aria-label="下一期" onClick={() => move(1)}>
          <ChevronRight />
        </button>
      </div>
      {period === "month" && kind === "expense" && (
        <SpendingTrend
          key={from.slice(0, 7)}
          book={book}
          month={from.slice(0, 7)}
        />
      )}
      <section className="card insight-card">
        <div className="mini-tabs">
          <button
            className={kind === "expense" ? "active" : ""}
            onClick={() => {
              setKind("expense");
              setSelected(null);
            }}
          >
            支出占比
          </button>
          <button
            className={kind === "income" ? "active" : ""}
            onClick={() => {
              setKind("income");
              setSelected(null);
            }}
          >
            收入占比
          </button>
        </div>
        {rows.length ? (
          <>
            <LabelledDonut
              rows={rows}
              total={total}
              kind={kind}
              selected={selected}
              onSelect={(id) => {
                setSelected(selected === id ? null : id);
                setLedgerOpen(true);
              }}
            />
            <p className="hint center">点击分类筛选流水 · 再次点击显示全部</p>
          </>
        ) : (
          <div className="empty">
            <strong>这一期还没有{kind === "expense" ? "支出" : "收入"}</strong>
            <p>记下一笔，就能看见占比。</p>
          </div>
        )}
      </section>
      {rows.length > 0 && (
        <section className="category-ranking" aria-label="分类金额柱状图">
          {rows.map((r) => (
            <div key={r.id} className="rank-row">
              <div>
                <i style={{ background: r.color }} />
                <span>{r.name}</span>
                <strong>¥{formatMoney(r.amountMinor)}</strong>
              </div>
              <div className="progress">
                <i style={{ width: `${r.percent}%`, background: r.color }} />
              </div>
            </div>
          ))}
        </section>
      )}
      <details
        className="insight-ledger"
        open={ledgerOpen}
        onToggle={(e) => setLedgerOpen(e.currentTarget.open)}
      >
        <summary className="section-heading">
          <h2>
            {selected
              ? book.categories.find((c) => c.id === selected)?.name
              : "本期"}
            流水
          </h2>
          <span>
            {filtered.length} 笔 · {ledgerOpen ? "收起" : "展开"}
          </span>
        </summary>
        <TransactionList transactions={filtered} />
      </details>
    </div>
  );
}

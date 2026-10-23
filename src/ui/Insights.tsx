import { memo, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Book } from "../domain/book";
import { useBook } from "./context";
import { useCurrentDate } from "./use-current-date";
import {
  insightOverview,
  ledgerTransactions,
  movePeriod,
  type Period,
} from "./view-models";
import { TransactionList } from "./TransactionList";
import { SpendingTrend } from "./SpendingTrend";
import { CategoryBreakdown } from "./insights/CategoryBreakdown";
export function Insights({ active }: { active: boolean }) {
  const { book } = useBook();
  const asOf = useCurrentDate(active);
  return <InsightsContent book={book} asOf={asOf} active={active} />;
}
// Keep filters and selected trend points mounted, but defer hidden-page queries.
const InsightsContent = memo(
  function InsightsContent({
    book,
    asOf,
    active,
  }: {
    book: Book;
    asOf: string;
    active: boolean;
  }) {
    const [period, setPeriod] = useState<Period>("month");
    const [pinnedDate, setPinnedDate] = useState<string | null>(null);
    const [kind, setKind] = useState<"expense" | "income">("expense");
    const date = pinnedDate ?? asOf;
    const { range, rows, total } = useMemo(
      () => insightOverview(book, date, period, kind),
      [book, date, period, kind],
    );
    const { from, to } = range;
    // Key the selection to its range so midnight rollover also clears category filters.
    const selectionKey = from + to + kind;
    const [selection, setSelection] = useState<{
      key: string;
      id: string | null;
    }>({ key: selectionKey, id: null });
    const selected = selection.key === selectionKey ? selection.id : null;
    function setSelected(id: string | null) {
      setSelection({ key: selectionKey, id });
    }
    const [ledgerOpen, setLedgerOpen] = useState(false);
    const filtered = useMemo(
      () => ledgerTransactions(book, { from, to, kind, categoryId: selected }),
      [book, from, to, kind, selected],
    );
    function move(step: number) {
      setPinnedDate(movePeriod(date, period, step));
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
            <strong>{range.label}</strong>
            <button
              onClick={() => {
                setPinnedDate(null);
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
        <div className="insights-grid">
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
            <CategoryBreakdown
              rows={rows}
              total={total}
              kind={kind}
              selected={selected}
              onSelect={(id) => {
                setSelected(selected === id ? null : id);
                setLedgerOpen(true);
              }}
              active={active}
            />
          </section>
          {period === "month" && kind === "expense" && (
            <SpendingTrend
              key={from.slice(0, 7)}
              book={book}
              month={from.slice(0, 7)}
              asOf={asOf}
            />
          )}
        </div>
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
  },
  (previous, next) => !previous.active && !next.active,
);

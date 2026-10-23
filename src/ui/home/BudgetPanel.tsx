import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { budgetSummary, formatMoney, parseMoney } from "../../domain/book";
import { useBook } from "../context";
export function BudgetPanel({ asOf }: { asOf: string }) {
  const { book, busy, dispatch } = useBook();
  const month = asOf.slice(0, 7);
  const budget = useMemo(() => budgetSummary(book, asOf), [book, asOf]);
  const [editingMonth, setEditingMonth] = useState<string | null>(null),
    [input, setInput] = useState(""),
    [error, setError] = useState("");
  const historicalDraft = editingMonth !== null && editingMonth !== month;
  const heading = historicalDraft
    ? `${editingMonth.slice(0, 4)} 年 ${Number(editingMonth.slice(5))} 月预算`
    : `${Number(month.slice(5))} 月预算`;
  async function saveBudget() {
    if (editingMonth === null) return;
    setError("");
    try {
      if (
        await dispatch({
          type: "budget.set",
          month: editingMonth,
          amountMinor: input.trim() ? parseMoney(input) : null,
        })
      )
        setEditingMonth(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section
      className="budget card"
      aria-label={historicalDraft ? heading : "本月预算"}
    >
      <div className="section-heading">
        <h2>{heading}</h2>
        <button
          aria-label="修改预算"
          onClick={() => {
            if (editingMonth !== null) {
              setEditingMonth(null);
              return;
            }
            setInput(
              budget.amountMinor ? String(budget.amountMinor / 100) : "",
            );
            setEditingMonth(month);
          }}
        >
          <Pencil size={15} />
          {budget.amountMinor ? "调整" : "设置预算"}
        </button>
      </div>
      {editingMonth !== null ? (
        <form
          className="budget-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveBudget();
          }}
        >
          <input
            aria-label="每月预算"
            inputMode="decimal"
            placeholder="输入预算，留空取消"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="primary" disabled={busy}>
            保存预算
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : budget.amountMinor ? (
        <>
          <div className="budget-values">
            <span>
              {budget.remainingMinor < 0 ? "已超支" : "本月剩余"}{" "}
              <strong
                data-testid="budget-remaining"
                className={budget.remainingMinor < 0 ? "negative" : ""}
              >
                ¥{formatMoney(Math.abs(budget.remainingMinor))}
              </strong>
            </span>
            <span>预算 ¥{formatMoney(budget.amountMinor)}</span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="预算使用进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(
              100,
              Math.round((budget.spentMinor / budget.amountMinor) * 100),
            )}
          >
            <i
              className={budget.remainingMinor < 0 ? "over" : ""}
              style={{
                width: `${Math.min(100, (budget.spentMinor / budget.amountMinor) * 100)}%`,
              }}
            />
          </div>
          <p className="hint">
            剩余 {budget.daysLeft} 天 · 每天可花 ¥
            {formatMoney(budget.dailyMinor)}
          </p>
        </>
      ) : (
        <p className="hint">未设置预算</p>
      )}
    </section>
  );
}

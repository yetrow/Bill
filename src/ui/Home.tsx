import { useState } from "react";
import { ShieldCheck, Pencil } from "lucide-react";
import { budgetSummary, formatMoney, parseMoney, today } from "../domain/book";
import { useBook } from "./context";
import { TransactionForm } from "./TransactionForm";
import { TransactionList } from "./TransactionList";
export function Home() {
  const { book, busy, dispatch } = useBook(),
    now = today(),
    month = now.slice(0, 7),
    budget = budgetSummary(book, now);
  const [editing, setEditing] = useState(false),
    [input, setInput] = useState(""),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("today"),
    [date, setDate] = useState(now);
  const todaySpent = book.transactions
    .filter((t) => t.date === now && t.kind === "expense")
    .reduce((sum, t) => sum + t.amountMinor, 0);
  const shown = book.transactions
    .filter(
      (t) => filter === "all" || t.date === (filter === "today" ? now : date),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  async function saveBudget() {
    setError("");
    try {
      if (
        await dispatch({
          type: "budget.set",
          month,
          amountMinor: input.trim() ? parseMoney(input) : null,
        })
      )
        setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="content home-content">
      <header className="page-header">
        <div className="wordmark">
          Bill<span>·</span>
        </div>
        <div className="offline-badge">
          <ShieldCheck size={13} />
          仅存本机
        </div>
      </header>
      <div className="greeting">
        <p>
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
      </div>
      <section className="summary-card">
        <div>
          <span>今日支出</span>
          <p className="hero-money">
            <small>¥</small>
            {formatMoney(todaySpent)}
          </p>
        </div>
        <div className="summary-bottom">
          <span>本月累计支出</span>
          <strong>¥{formatMoney(budget.spentMinor)}</strong>
        </div>
      </section>
      <section className="budget card" aria-label="本月预算">
        <div className="section-heading">
          <h2>{Number(month.slice(5))} 月预算</h2>
          <button
            aria-label="修改预算"
            onClick={() => {
              setInput(
                budget.amountMinor ? String(budget.amountMinor / 100) : "",
              );
              setEditing((v) => !v);
            }}
          >
            <Pencil size={15} />
            {budget.amountMinor ? "调整" : "设置预算"}
          </button>
        </div>
        {editing ? (
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
      <div className="section-heading entry-heading">
        <h2>记下这一笔</h2>
      </div>
      <TransactionForm />
      <section className="ledger-section">
        <div className="section-heading">
          <h2>
            账单流水 <span className="count">{shown.length}</span>
          </h2>
          <div className="mini-tabs">
            <button
              className={filter === "today" ? "active" : ""}
              onClick={() => setFilter("today")}
            >
              今天
            </button>
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              全部
            </button>
          </div>
        </div>
        <label className="date-filter">
          指定日期
          <input
            aria-label="流水日期"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFilter("date");
            }}
          />
        </label>
        <TransactionList transactions={shown} />
      </section>
    </div>
  );
}

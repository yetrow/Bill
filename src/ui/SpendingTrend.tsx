import { useEffect, useState } from "react";
import { dailyExpenses, formatMoney, today, type Book } from "../domain/book";

export function SpendingTrend({ book, month }: { book: Book; month: string }) {
  const [asOf, setAsOf] = useState(today);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    }
    function refresh() {
      setAsOf(today());
      schedule();
    }
    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const points = dailyExpenses(book, month, asOf);
  const observed = points.filter((p) => p.amountMinor !== null);
  const [selected, setSelected] = useState(() =>
    observed.length ? observed.length - 1 : null,
  );
  const chosen = selected === null ? null : points[selected];
  const max = Math.max(100, ...observed.map((p) => p.amountMinor!));
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const ceiling = Math.ceil(max / magnitude) * magnitude;
  const width = points.length * 48;
  const x = (i: number) => 24 + i * 48;
  const y = (amount: number) => 188 - (amount / ceiling) * 168;
  const line = observed.map((p, i) => `${x(i)},${y(p.amountMinor!)}`).join(" ");
  const axisLabel = (value: number) =>
    value >= 100000000
      ? `${Number((value / 100000000).toFixed(1))}百万`
      : value >= 1000000
        ? `${Number((value / 1000000).toFixed(1))}万`
        : String(Number((value / 100).toFixed(2)));

  return (
    <section className="card trend-card" aria-label="月内每日支出">
      <div className="section-heading">
        <h2>每日消费</h2>
        <span>左右滑动 · 点选日期</span>
      </div>
      <p className="trend-selection" role="status" aria-live="polite">
        {chosen && chosen.amountMinor !== null ? (
          <>
            <span>
              {Number(month.slice(5))}月{Number(chosen.date.slice(8))}日
            </span>
            <strong>¥{formatMoney(chosen.amountMinor)}</strong>
            <small>{chosen.date === asOf ? "今天" : "当日支出"}</small>
          </>
        ) : (
          <span>未来日期暂无消费趋势</span>
        )}
      </p>
      <div className="trend-layout">
        <svg className="trend-axis" width="62" height="224" aria-hidden="true">
          <text x="0" y="10" className="trend-unit">
            元
          </text>
          {[1, 0.5, 0].map((ratio) => (
            <text
              key={ratio}
              x="56"
              y={y(ceiling * ratio) + 4}
              textAnchor="end"
            >
              {axisLabel(ceiling * ratio)}
            </text>
          ))}
        </svg>
        <div
          className="trend-scroll"
          role="region"
          aria-label="每日消费趋势，可左右滑动"
          tabIndex={0}
        >
          <div className="trend-canvas" style={{ width }}>
            <svg width={width} height="224" aria-hidden="true">
              {[1, 0.5, 0].map((ratio) => (
                <line
                  key={ratio}
                  className="trend-grid"
                  x1="0"
                  x2={width}
                  y1={y(ceiling * ratio)}
                  y2={y(ceiling * ratio)}
                />
              ))}
              {observed.length > 0 && (
                <>
                  <polygon
                    className="trend-area"
                    points={`${x(0)},188 ${line} ${x(observed.length - 1)},188`}
                  />
                  <polyline className="trend-line" points={line} />
                </>
              )}
              {points.map((p, i) => (
                <text
                  key={p.date}
                  className={`trend-date ${p.amountMinor === null ? "future" : ""}`}
                  x={x(i)}
                  y="216"
                  textAnchor="middle"
                >
                  {i + 1}
                </text>
              ))}
            </svg>
            {points.map((p, i) =>
              p.amountMinor === null ? null : (
                <button
                  key={p.date}
                  type="button"
                  className={`trend-point ${selected === i ? "selected" : ""}`}
                  style={{ left: x(i) - 22 }}
                  aria-label={`${p.date} 支出 ¥${formatMoney(p.amountMinor)}`}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                  onFocus={() => setSelected(i)}
                >
                  <i style={{ top: y(p.amountMinor) - 4 }} />
                </button>
              ),
            )}
          </div>
        </div>
      </div>
      {observed.length > 0 && observed.every((p) => p.amountMinor === 0) && (
        <p className="hint">本月暂无支出记录</p>
      )}
    </section>
  );
}

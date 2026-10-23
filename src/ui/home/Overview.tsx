import { memo } from "react";
import { formatMoney } from "../../domain/book";
export const Overview = memo(function Overview({
  todaySpentMinor,
  spentMinor,
}: {
  todaySpentMinor: number;
  spentMinor: number;
}) {
  return (
    <section className="summary-card">
      <div>
        <span>今日支出</span>
        <p className="hero-money">
          <small>¥</small>
          {formatMoney(todaySpentMinor)}
        </p>
      </div>
      <div className="summary-bottom">
        <span>本月累计支出</span>
        <strong>¥{formatMoney(spentMinor)}</strong>
      </div>
    </section>
  );
});

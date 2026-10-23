import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";
import { useBook } from "./context";
import { TransactionForm } from "./TransactionForm";
import { homeOverview } from "./view-models";
import { useCurrentDate } from "./use-current-date";
import { Overview } from "./home/Overview";
import { BudgetPanel } from "./home/BudgetPanel";
import { LedgerPanel } from "./home/LedgerPanel";
export function Home({ active }: { active: boolean }) {
  const { book } = useBook();
  const asOf = useCurrentDate(active);
  const overview = useMemo(() => homeOverview(book, asOf), [book, asOf]);
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
          {new Date(asOf + "T12:00:00").toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </p>
      </div>
      <div className="home-overview">
        <Overview
          todaySpentMinor={overview.todaySpentMinor}
          spentMinor={overview.budget.spentMinor}
        />
        <BudgetPanel asOf={asOf} />
      </div>
      <div className="home-workspace">
        <section className="entry-panel">
          <div className="section-heading entry-heading">
            <h2>记下这一笔</h2>
          </div>
          <TransactionForm asOf={asOf} />
        </section>
        <LedgerPanel asOf={asOf} />
      </div>
    </div>
  );
}

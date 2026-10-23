import { useMemo, useState } from "react";
import { useBook } from "../context";
import { ledgerTransactions } from "../view-models";
import { TransactionList } from "../TransactionList";
export function LedgerPanel({ asOf }: { asOf: string }) {
  const { book } = useBook();
  const [filter, setFilter] = useState("today"),
    [date, setDate] = useState(asOf);
  const shown = useMemo(
    () =>
      ledgerTransactions(
        book,
        filter === "all"
          ? {}
          : {
              from: filter === "today" ? asOf : date,
              to: filter === "today" ? asOf : date,
            },
      ),
    [book, filter, date, asOf],
  );
  return (
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
  );
}

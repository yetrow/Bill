import { memo } from "react";
import { formatMoney } from "../../domain/book";
import type { insightOverview } from "../view-models";
import { LabelledDonut } from "../LabelledDonut";
export const CategoryBreakdown = memo(function CategoryBreakdown({
  rows,
  total,
  kind,
  selected,
  onSelect,
  active,
}: {
  rows: ReturnType<typeof insightOverview>["rows"];
  total: number;
  kind: "expense" | "income";
  selected: string | null;
  onSelect: (id: string) => void;
  active: boolean;
}) {
  return (
    <>
      <LabelledDonut
        rows={rows}
        total={total}
        kind={kind}
        selected={selected}
        onSelect={onSelect}
        active={active}
      />
      {rows.length ? (
        <>
          <p className="hint center">点击分类筛选流水 · 再次点击显示全部</p>
          <div className="category-amount-bars" aria-label="分类金额与占比">
            {rows.map((row) => (
              <button
                type="button"
                key={row.id}
                className="category-amount-bar"
                aria-label={`${row.name} ¥${formatMoney(row.amountMinor)} ${row.percent.toFixed(1)}%`}
                aria-pressed={selected === row.id}
                onClick={() => onSelect(row.id)}
              >
                <span>{row.name}</span>
                <strong>¥{formatMoney(row.amountMinor)}</strong>
                <span>{row.percent.toFixed(1)}%</span>
                <span className="category-bar-track" aria-hidden="true">
                  <i
                    className="category-bar-fill"
                    style={{
                      width: row.percent + "%",
                      background: row.color,
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">
          <strong>这一期还没有{kind === "expense" ? "支出" : "收入"}</strong>
          <p>记下一笔，就能看见占比。</p>
        </div>
      )}
    </>
  );
});

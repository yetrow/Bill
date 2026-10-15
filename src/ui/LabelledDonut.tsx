import { useEffect, useId, useRef, useState } from "react";
import { formatMoney } from "../domain/book";
import { donutLayout } from "./chart-layout";

interface Row {
  id: string;
  name: string;
  color: string;
  percent: number;
}
export function LabelledDonut({
  rows,
  total,
  kind,
  selected,
  onSelect,
}: {
  rows: Row[];
  total: number;
  kind: "expense" | "income";
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const descriptionId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(309);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const { height, cx, cy, radius, labelWidth, labels } = donutLayout(
    rows,
    width,
  );
  const segments = rows.map((row, i) => ({
    ...row,
    offset: rows.slice(0, i).reduce((sum, r) => sum + r.percent, 0),
  }));
  const money = `¥${formatMoney(total)}`;
  return (
    <div className="donut-wrap" ref={ref}>
      <svg
        className="donut"
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="图表分类及百分比"
        aria-describedby={descriptionId}
      >
        <desc id={descriptionId}>
          本期{kind === "expense" ? "支出" : "收入"} {money}，{rows.length}{" "}
          个分类
        </desc>
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--surface-alt)"
          strokeWidth="18"
        />
        {segments.map((s) => (
          <circle
            key={s.id}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={selected === s.id ? 22 : 18}
            pathLength="100"
            strokeDasharray={`${s.percent} ${100 - s.percent}`}
            strokeDashoffset={-s.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          >
            <title>
              {s.name} {s.percent.toFixed(1)}%
            </title>
          </circle>
        ))}
        <g className="donut-center-text" textAnchor="middle" aria-hidden="true">
          <text x={cx} y={cy - 20}>
            本期{kind === "expense" ? "支出" : "收入"}
          </text>
          <text
            x={cx}
            y={cy + 5}
            className="donut-total"
            style={{
              fontSize: Math.min(
                18,
                (2 * (radius - 15)) / (money.length * 0.58),
              ),
            }}
          >
            {money}
          </text>
          <text x={cx} y={cy + 25}>
            {rows.length} 个分类
          </text>
        </g>
        {labels.map((label) => {
          const row = rows.find((r) => r.id === label.id)!;
          const right = label.side === "right";
          const endX = right ? width - labelWidth - 3 : labelWidth + 3;
          const textX = right ? width - 4 : 4;
          const midY = label.y + label.height / 2;
          const textY =
            label.y + (label.height - (label.lines.length + 1) * 16) / 2 + 13;
          return (
            <g
              key={label.id}
              className={`donut-label ${selected === label.id ? "active" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={selected === label.id}
              aria-label={`${label.name} ${label.percent.toFixed(1)}%`}
              onClick={() => onSelect(label.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(label.id);
                }
              }}
            >
              <polyline
                points={`${label.anchorX},${label.anchorY} ${label.outerX},${label.outerY} ${label.elbowX},${label.outerY} ${label.elbowX},${midY} ${endX},${midY}`}
                fill="none"
                stroke={row.color}
                strokeWidth={selected === label.id ? 2 : 1.3}
              />
              <circle
                cx={label.anchorX}
                cy={label.anchorY}
                r="2.3"
                fill={row.color}
              />
              <rect
                x={right ? width - labelWidth : 0}
                y={label.y}
                width={labelWidth}
                height={label.height}
                rx="6"
                className="donut-label-hit"
              />
              <text x={textX} y={textY} textAnchor={right ? "end" : "start"}>
                {label.lines.map((line, i) => (
                  <tspan key={i} x={textX} dy={i ? 16 : 0}>
                    {line}
                  </tspan>
                ))}
                <tspan x={textX} dy="16" className="donut-percent">
                  {label.percent.toFixed(1)}%
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

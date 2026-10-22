"use client";
import { useId, useState } from "react";

type Row = {
  id: string;
  name: string;
  count: number;
  description?: string | null;
};
export function CategoryRadar({ rows, total }: { rows: Row[]; total: number }) {
  const gradient = useId().replaceAll(":", "");
  const [selected, setSelected] = useState<string | null>(null);
  const maximum = Math.max(
    4,
    Math.ceil(Math.max(...rows.map((r) => r.count), 0) / 4) * 4,
  );
  const point = (index: number, radius: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / rows.length;
    return {
      x: 340 + Math.cos(angle) * radius,
      y: 285 + Math.sin(angle) * radius,
    };
  };
  const polygon = (radius: number) =>
    rows
      .map((_, i) => {
        const p = point(i, radius);
        return `${p.x},${p.y}`;
      })
      .join(" ");
  const shape = rows
    .map((row, i) => {
      const p = point(i, (180 * row.count) / maximum);
      return `${p.x},${p.y}`;
    })
    .join(" ");
  return (
    <div className="category-radar-layout">
      <div className="category-radar-plot">
        {rows.length >= 3 ? (
          <>
            <svg
              viewBox="0 0 680 560"
              role="img"
              aria-label={`Category balance. Shared scale: zero to ${maximum} tasks per category. ${rows.map((r) => `${r.name}: ${r.count}`).join("; ")}`}
            >
              <defs>
                <radialGradient id={gradient}>
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#b5e3e1" />
                </radialGradient>
              </defs>
              <polygon
                points={polygon(180)}
                fill={`url(#${gradient})`}
                stroke="#517d7a"
                strokeWidth="1.5"
              />
              {[1, 2, 3].map((step) => (
                <polygon
                  key={step}
                  points={polygon((180 * step) / 4)}
                  fill="none"
                  stroke="#86b7b3"
                  strokeWidth="0.8"
                />
              ))}
              {rows.map((row, i) => {
                const end = point(i, 180);
                return (
                  <line
                    key={row.id}
                    x1="340"
                    y1="285"
                    x2={end.x}
                    y2={end.y}
                    stroke="#86b7b3"
                    strokeWidth="0.8"
                  />
                );
              })}
              <polygon
                points={shape}
                fill="#5b8c75"
                fillOpacity="0.4"
                stroke="#35674f"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {[1, 2, 3, 4].map((step) => (
                <text
                  key={step}
                  x="348"
                  y={285 - (180 * step) / 4 + 4}
                  className="radar-scale"
                >
                  {(maximum * step) / 4}
                </text>
              ))}
              {rows.map((row, i) => {
                const p = point(i, (180 * row.count) / maximum),
                  label = point(i, 218);
                const anchor =
                  label.x < 330 ? "end" : label.x > 350 ? "start" : "middle";
                const words = row.name.split(/\s+/);
                const lines: string[] = [];
                for (const word of words) {
                  if (
                    !lines.length ||
                    (lines[lines.length - 1] + " " + word).length > 18
                  )
                    lines.push(word);
                  else lines[lines.length - 1] += " " + word;
                }
                return (
                  <g
                    key={row.id}
                    data-tooltip={`${row.name}: ${row.count} tasks (${total ? Math.round((row.count / total) * 100) : 0}%)${row.description ? ` · Goal: ${row.description}` : ""}`}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={selected === row.id ? 7 : 4}
                      fill="#35674f"
                      stroke="white"
                      strokeWidth="1.5"
                    />
                    <text
                      x={label.x}
                      y={label.y - (Math.min(lines.length, 3) - 1) * 7}
                      textAnchor={anchor}
                      className="radar-label"
                      fontWeight={selected === row.id ? 700 : 500}
                    >
                      {lines.slice(0, 3).map((line, n) => (
                        <tspan key={n} x={label.x} dy={n === 0 ? 0 : 15}>
                          {line.length > 20 ? line.slice(0, 18) + "…" : line}
                          {n === 2 && lines.length > 3 ? "…" : ""}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="muted small">
              0–{maximum} tasks per axis · scale adjusts to this period
            </p>
            {total === 0 && (
              <p className="muted small">No tasks recorded in this period.</p>
            )}
          </>
        ) : (
          <p className="empty">
            A radar chart needs at least three categories. Counts are shown
            alongside.
          </p>
        )}
      </div>
      <div className="radar-values" aria-label="Category counts">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={"radar-value " + (selected === row.id ? "selected" : "")}
            aria-pressed={selected === row.id}
            onClick={() => setSelected(selected === row.id ? null : row.id)}
            data-tooltip={
              row.description
                ? `Goal: ${row.description}`
                : `${row.name}: ${row.count} tasks`
            }
          >
            <span>{row.name}</span>
            <strong>
              {row.count}
              <small>
                {total ? Math.round((row.count / total) * 100) : 0}%
              </small>
            </strong>
            {row.description && (
              <span className="radar-goal">{row.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

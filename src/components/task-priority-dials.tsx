"use client";
import { useState, type PointerEvent } from "react";

export function TaskPriorityDials({
  urgency = 5,
  importance = 5,
  readOnly = false,
}: {
  urgency?: number;
  importance?: number;
  readOnly?: boolean;
}) {
  const [values, setValues] = useState({ urgency, importance });
  function update(name: "urgency" | "importance", value: number) {
    setValues((previous) => ({
      ...previous,
      [name]: Math.max(0, Math.min(10, value)),
    }));
  }
  function point(
    name: "urgency" | "importance",
    event: PointerEvent<HTMLDivElement>,
  ) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const angle =
      (Math.atan2(
        event.clientY - bounds.top - bounds.height / 2,
        event.clientX - bounds.left - bounds.width / 2,
      ) *
        180) /
      Math.PI;
    const sweep = (angle - 135 + 360) % 360;
    update(name, sweep > 270 ? (sweep < 315 ? 10 : 0) : Math.round(sweep / 27));
  }
  if (readOnly)
    return (
      <div className="task-priority-dials task-priority-readonly">
        {(["urgency", "importance"] as const).map((name) => {
          const value = name === "urgency" ? urgency : importance;
          return (
            <div
              key={name}
              className="task-dial task-dial-static"
              role="img"
              aria-label={`${name === "urgency" ? "Urgency" : "Importance"}: ${value} out of 10`}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  pathLength="100"
                  strokeDasharray="75 25"
                  transform="rotate(135 24 24)"
                  className="dial-track"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  pathLength="100"
                  strokeDasharray={`${value * 7.5} 100`}
                  transform="rotate(135 24 24)"
                  className="dial-value"
                />
              </svg>
              <span aria-hidden="true">{value}</span>
            </div>
          );
        })}
      </div>
    );
  return (
    <div className="task-priority-dials">
      {(["urgency", "importance"] as const).map((name) => (
        <div className="task-dial-field" key={name}>
          <span>{name === "urgency" ? "Urgency" : "Importance"}</span>
          <div
            className="task-dial"
            role="slider"
            tabIndex={0}
            aria-label={name === "urgency" ? "Urgency" : "Importance"}
            aria-valuemin={0}
            aria-valuemax={10}
            aria-valuenow={values[name]}
            aria-valuetext={`${values[name]} out of 10`}
            title="Drag to adjust · arrow keys change by 1"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.focus();
              event.currentTarget.setPointerCapture(event.pointerId);
              point(name, event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                point(name, event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              const delta = {
                ArrowUp: 1,
                ArrowRight: 1,
                ArrowDown: -1,
                ArrowLeft: -1,
                PageUp: 2,
                PageDown: -2,
              }[event.key];
              if (
                delta !== undefined ||
                event.key === "Home" ||
                event.key === "End"
              ) {
                event.preventDefault();
                update(
                  name,
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 10
                      : values[name] + delta!,
                );
              }
            }}
          >
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle
                cx="24"
                cy="24"
                r="20"
                pathLength="100"
                strokeDasharray="75 25"
                transform="rotate(135 24 24)"
                className="dial-track"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                pathLength="100"
                strokeDasharray={`${values[name] * 7.5} 100`}
                transform="rotate(135 24 24)"
                className="dial-value"
              />
            </svg>
            <span aria-hidden="true">{values[name]}</span>
          </div>
          <input type="hidden" name={name} value={values[name]} />
        </div>
      ))}
    </div>
  );
}

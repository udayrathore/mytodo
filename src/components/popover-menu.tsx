"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function PopoverMenu({
  label,
  icon,
  text,
  children,
  className = "",
}: {
  label: string;
  icon: ReactNode;
  text?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details ref={ref} className={`app-popover ${className}`}>
      <summary aria-label={label} title={label}>
        {icon}
        {text && <span>{text}</span>}
      </summary>
      <div
        className="app-popover-panel"
        onClick={(event) => {
          if (
            (event.target as Element).closest("button[data-close-menu]") &&
            ref.current
          )
            ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

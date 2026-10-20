"use client";
import { useEffect, useState } from "react";

/** One delayed tooltip layer, including icons rendered in drawers and menus. */
export function IconTooltips() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    let anchor: Element | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let originalTitle: string | null = null;
    let originalDescription: string | null = null;
    const clear = () => {
      clearTimeout(timer);
      if (anchor) {
        if (originalTitle !== null) anchor.setAttribute("title", originalTitle);
        if (originalDescription === null)
          anchor.removeAttribute("aria-describedby");
        else anchor.setAttribute("aria-describedby", originalDescription);
      }
      anchor = null;
      setTip(null);
    };
    const find = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null;
      const explicit = target.closest("[data-tooltip]");
      if (explicit) return explicit;
      const control = target.closest(
        "button, a, summary, .task-check, [title]",
      );
      if (
        control &&
        (control.querySelector("svg") || control.matches(".task-check"))
      )
        return control;
      return target.closest("svg.lucide");
    };
    const enter = (event: Event) => {
      const next = find(event.target);
      if (next === anchor) return;
      clear();
      if (!next) return;
      anchor = next;
      originalTitle = next.getAttribute("title");
      originalDescription = next.getAttribute("aria-describedby");
      const icon = next.matches("svg") ? next : next.querySelector("svg");
      const iconName = [...(icon?.classList || [])]
        .find((c) => c.startsWith("lucide-") && c !== "lucide-icon")
        ?.replace("lucide-", "")
        .replaceAll("-", " ");
      const text =
        next.getAttribute("data-tooltip") ||
        next.getAttribute("aria-label") ||
        originalTitle ||
        next.textContent?.trim() ||
        iconName ||
        "Icon";
      if (originalTitle !== null) next.removeAttribute("title");
      timer = setTimeout(() => {
        if (!next.isConnected) return clear();
        const rect = next.getBoundingClientRect();
        next.setAttribute(
          "aria-describedby",
          [originalDescription, "icon-tooltip"].filter(Boolean).join(" "),
        );
        setTip({
          text,
          x: Math.max(
            148,
            Math.min(window.innerWidth - 148, rect.left + rect.width / 2),
          ),
          y: Math.max(8, Math.min(window.innerHeight - 80, rect.bottom + 8)),
        });
      }, 3000);
    };
    const leave = (event: Event) => {
      const next = find((event as MouseEvent).relatedTarget);
      if (next !== anchor) clear();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    document.addEventListener("pointerover", enter);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusin", enter);
    document.addEventListener("focusout", leave);
    document.addEventListener("pointerdown", clear);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      clear();
      document.removeEventListener("pointerover", enter);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusin", enter);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("pointerdown", clear);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  }, []);
  return tip ? (
    <div
      id="icon-tooltip"
      role="tooltip"
      className="icon-tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  ) : null;
}

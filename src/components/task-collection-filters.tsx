"use client";
import { useState } from "react";
import { Funnel, X } from "lucide-react";
import { PopoverMenu } from "./popover-menu";
import { CollectionAvatar } from "./collection-settings";
import type { Workspace } from "@/lib/workspace";
export function TaskCollectionFilters({
  data,
  scope,
  onScope,
}: {
  data: Workspace;
  scope: { category: string; entity: string; tag: string };
  onScope: (kind: string, id: string) => void;
}) {
  const [sections, setSections] = useState<Record<string, boolean>>({});
  function counts(kind: string, id: string) {
    const count = data.sidebarCounts?.find(
      (c) => c.kind === kind && c.id === id,
    );
    return (
      <span
        className="sidebar-counts"
        aria-label={`${count?.pending ?? 0} pending, ${count?.upcoming ?? 0} upcoming`}
        data-tooltip="Pending: today, overdue or unscheduled. Upcoming: future dates. Each repeat occurrence counts separately."
      >
        <span>{data.sidebarCounts ? (count?.pending ?? 0) : "—"}</span>
        <span>{data.sidebarCounts ? (count?.upcoming ?? 0) : "—"}</span>
      </span>
    );
  }
  function scopeButton(
    kind: "category" | "entity" | "tag",
    id: string,
    name: string,
  ) {
    return (
      <button
        data-close-menu
        key={id}
        className={scope[kind] === id ? "active" : ""}
        onClick={() => onScope(kind, id)}
      >
        <span className="sidebar-item-name">
          {kind !== "tag" && (
            <CollectionAvatar
              item={(kind === "category"
                ? data.categories
                : data.entities
              ).find((i) => i.id === id)!}
              project={kind === "entity"}
            />
          )}
          {name}
        </span>
        {counts(kind, id)}
      </button>
    );
  }
  function section(
    title: string,
    kind: "category" | "entity" | "tag",
    items: { id: string; name: string }[],
  ) {
    const hasUpcoming = (id: string) =>
      (data.sidebarCounts?.find((c) => c.kind === kind && c.id === id)
        ?.upcoming || 0) > 0;
    const upcoming = items.filter((i) => hasUpcoming(i.id));
    const quiet = items.filter((i) => !hasUpcoming(i.id));
    const expanded =
      sections[title] ??
      (upcoming.length > 0 || items.some((i) => scope[kind] === i.id));
    return (
      <details open={expanded}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            setSections((old) => ({ ...old, [title]: !expanded }));
          }}
        >
          {title}
        </summary>
        {upcoming.map((i) => scopeButton(kind, i.id, i.name))}
        {quiet.length > 0 &&
          (upcoming.length ? (
            <details>
              <summary>No upcoming tasks ({quiet.length})</summary>
              {quiet.map((i) => scopeButton(kind, i.id, i.name))}
            </details>
          ) : (
            quiet.map((i) => scopeButton(kind, i.id, i.name))
          ))}
      </details>
    );
  }
  return (
    <div className="collection-filter-toolbar">
      {(scope.category || scope.entity || scope.tag) && (
        <button
          className="active-filter-chip"
          onClick={() => onScope("category", "")}
        >
          {scope.category
            ? data.categories.find((c) => c.id === scope.category)?.name
            : scope.entity
              ? data.entities.find((e) => e.id === scope.entity)?.name
              : data.tags.find((t) => t.id === scope.tag)?.name}
          <X size={13} />
          <span className="sr-only">Clear filter</span>
        </button>
      )}
      <PopoverMenu
        label="Filter tasks"
        icon={<Funnel size={19} />}
        className="task-filter-menu"
      >
        <div className="filter-panel-heading">
          <strong>Filter tasks</strong>
          {(scope.category || scope.entity || scope.tag) && (
            <button
              data-close-menu
              className="text-button"
              onClick={() => onScope("category", "")}
            >
              Clear filter
            </button>
          )}
          <button
            type="button"
            data-close-menu
            className="icon-button"
            aria-label="Close filters"
          >
            <X size={16} />
          </button>
        </div>
        <div
          className="task-sidebar"
          role="group"
          aria-label="Task collections"
        >
          {section(
            "Projects",
            "entity",
            data.entities.filter(
              (e) => e.type === "PROJECT" && e.isActive && !e.archivedAt,
            ),
          )}
          {section(
            "Categories",
            "category",
            data.categories
              .filter((c) => c.isActive && !c.archivedAt)
              .map((c) => ({
                ...c,
                name: (c.parentId ? "↳ " : "") + c.name,
              })),
          )}
          {section(
            "Entities",
            "entity",
            data.entities.filter(
              (e) => e.type !== "PROJECT" && e.isActive && !e.archivedAt,
            ),
          )}
          {section("Tags", "tag", data.tags)}
        </div>
      </PopoverMenu>
    </div>
  );
}

"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export type SectionNavigationItem<Key extends string> = {
  key: Key;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  title?: string;
};

export default function SectionNavigation<Key extends string>({
  label,
  items,
  value,
  onChange,
  accent = "#6f32d2",
}: {
  label: string;
  items: SectionNavigationItem<Key>[];
  value: Key;
  onChange: (value: Key) => void;
  accent?: string;
}) {
  return (
    <nav className="xb-section-navigation" aria-label={label}>
      <div className="xb-module-list">
        {items.map(({ key, label: itemLabel, icon: Icon, disabled, title }) => {
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              title={title}
              aria-current={active ? "page" : undefined}
              className={`xb-module-chip${active ? " is-active" : ""}`}
              style={{ "--xb-module-color": accent } as CSSProperties}
              onClick={() => onChange(key)}
            >
              <Icon size={19} strokeWidth={2.25} aria-hidden="true" />
              <strong>{itemLabel}</strong>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

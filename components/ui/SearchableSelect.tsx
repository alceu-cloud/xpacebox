"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

export type SearchableOption = { value: string; label: string };

type SharedProps = {
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputStyle?: CSSProperties;
  ariaLabel?: string;
};

type SearchableSelectProps = SharedProps & {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  searchableFrom?: number;
};

type SearchableFilterProps = SharedProps & {
  value: string;
  onChange: (value: string) => void;
};

const visibleRows = 5;

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "SELECIONE",
  disabled = false,
  autoFocus = false,
  inputStyle,
  ariaLabel,
  name,
  searchableFrom = 11,
}: SearchableSelectProps) {
  const selectedOption = options.find((option) => option.value === value);
  const [query, setQuery] = useState(selectedOption?.label || "");

  useEffect(() => {
    setQuery(selectedOption?.label || "");
  }, [selectedOption?.label]);

  if (options.length < searchableFrom) {
    return (
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} autoFocus={autoFocus} style={inputStyle} aria-label={ariaLabel} name={name}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  return (
    <SearchInput
      value={query}
      onValueChange={setQuery}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputStyle={inputStyle}
      ariaLabel={ariaLabel}
      name={name}
      onOptionSelect={(option) => {
        onChange(option.value);
        setQuery(option.label);
      }}
      onClose={() => setQuery(selectedOption?.label || "")}
      onFocus={() => {
        if (selectedOption && query === selectedOption.label) setQuery("");
      }}
      onClear={() => {
        onChange("");
        setQuery("");
      }}
    />
  );
}

export function SearchableFilter({
  value,
  onChange,
  options,
  placeholder = "BUSCAR",
  disabled = false,
  autoFocus = false,
  inputStyle,
  ariaLabel,
}: SearchableFilterProps) {
  return (
    <SearchInput
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      inputStyle={inputStyle}
      ariaLabel={ariaLabel}
      onOptionSelect={(option) => onChange(option.label)}
      onClose={() => undefined}
      onFocus={() => undefined}
      onClear={() => onChange("")}
    />
  );
}

function SearchInput({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  autoFocus,
  inputStyle,
  ariaLabel,
  name,
  onOptionSelect,
  onClose,
  onFocus,
  onClear,
}: SharedProps & {
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  onOptionSelect: (option: SearchableOption) => void;
  onClose: () => void;
  onFocus: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedValue = normalize(value);
  const matches = useMemo(
    () => options.filter((option) => !normalizedValue || normalize(option.label).includes(normalizedValue)),
    [normalizedValue, options]
  );
  const generatedId = useId();
  const listId = `searchable-select-${generatedId.replace(/[^a-z0-9_-]/gi, "-")}`;

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedValue, open]);

  function close() {
    setOpen(false);
    onClose();
  }

  function selectOption(option: SearchableOption) {
    onOptionSelect(option);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
      } else {
        setActiveIndex((current) => Math.min(current + 1, Math.max(matches.length - 1, 0)));
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && matches[activeIndex]) {
      event.preventDefault();
      selectOption(matches[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  return (
    <div style={rootStyle}>
      <input
        type="search"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          onFocus();
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(close, 120)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-activedescendant={open && matches[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        style={{ ...searchInputStyle, ...inputStyle }}
      />
      {value ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClear} style={clearButtonStyle} aria-label="LIMPAR SELECAO"><X size={15} aria-hidden="true" /></button> : null}
      <ChevronDown size={17} aria-hidden="true" style={{ ...chevronStyle, right: value ? 38 : 14 }} />
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
        <div id={listId} role="listbox" style={menuStyle} aria-label={ariaLabel || placeholder}>
          {matches.length ? matches.map((option, index) => (
            <button
              type="button"
              role="option"
              id={`${listId}-${index}`}
              key={option.value}
              aria-selected={activeIndex === index}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
              style={{ ...optionStyle, ...(activeIndex === index ? optionActiveStyle : {}) }}
            >
              {option.label}
            </button>
          )) : <div style={emptyStyle}>NENHUM RESULTADO ENCONTRADO.</div>}
        </div>
      ) : null}
    </div>
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("pt-BR");
}

const rootStyle: CSSProperties = { position: "relative", width: "100%" };
const searchInputStyle: CSSProperties = { width: "100%", paddingRight: 64 };
const clearButtonStyle: CSSProperties = { position: "absolute", zIndex: 2, top: "50%", right: 34, transform: "translateY(-50%)", display: "grid", placeItems: "center", width: 26, height: 26, padding: 0, border: 0, borderRadius: "50%", background: "transparent", color: "#667085", cursor: "pointer" };
const chevronStyle: CSSProperties = { position: "absolute", top: "50%", transform: "translateY(-50%)", color: "#667085", pointerEvents: "none" };
const menuStyle: CSSProperties = { position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, width: "100%", maxHeight: visibleRows * 42 + 12, overflowY: "auto", padding: 6, border: "1px solid var(--xb-line)", borderRadius: "var(--xb-radius-field)", background: "var(--xb-surface)", boxShadow: "0 14px 30px rgba(39,36,67,.16)" };
const optionStyle: CSSProperties = { display: "flex", alignItems: "center", width: "100%", minHeight: 42, padding: "9px 12px", border: 0, borderRadius: 9, background: "transparent", color: "var(--xb-ink)", textAlign: "left", font: "inherit", fontSize: 13, fontWeight: 700, lineHeight: 1.25, cursor: "pointer" };
const optionActiveStyle: CSSProperties = { background: "var(--xb-accent-soft)", color: "var(--xb-accent-strong)" };
const emptyStyle: CSSProperties = { padding: "13px 12px", color: "var(--xb-quiet)", fontSize: 12, fontWeight: 700 };

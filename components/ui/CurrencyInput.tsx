"use client";

import { useEffect, useState, type InputHTMLAttributes } from "react";

type CurrencyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode"> & {
  value: number | string | null | undefined;
  onValueChange: (value: number | null) => void;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function CurrencyInput({ value, onValueChange, onFocus, onBlur, readOnly, ...props }: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => displayValue(value));

  useEffect(() => {
    if (!focused) setDraft(displayValue(value));
  }, [focused, value]);

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft}
      readOnly={readOnly}
      onFocus={(event) => {
        if (!readOnly) {
          setFocused(true);
          const parsed = parseCurrency(value);
          setDraft(parsed === null ? "" : parsed.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 2 }));
        }
        onFocus?.(event);
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        onValueChange(parseCurrency(nextDraft));
      }}
      onBlur={(event) => {
        setFocused(false);
        const parsed = parseCurrency(draft);
        setDraft(parsed === null ? "" : currencyFormatter.format(parsed));
        onBlur?.(event);
      }}
    />
  );
}

function displayValue(value: CurrencyInputProps["value"]) {
  const parsed = parseCurrency(value);
  return parsed === null ? "" : currencyFormatter.format(parsed);
}

function parseCurrency(value: CurrencyInputProps["value"]) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : null;

  let normalized = value.replace(/R\$/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!normalized) return null;
  if (normalized.includes(",")) normalized = normalized.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

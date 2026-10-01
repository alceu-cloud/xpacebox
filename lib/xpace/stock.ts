export type StockCategory = { id: string; description: string; active: boolean };
export type StockUnit = StockCategory & { abbreviation: string };
export type StockProduct = {
  id: string; description: string; costPriceCents: number | null; salePriceCents: number;
  categoryId: string; unitId: string; categoryName: string; unitName: string; unitAbbreviation: string;
  controlsStock: boolean; minimumStock: number; stockQuantity: number; code: string;
  codeMode: "EXTERNAL" | "INTERNAL"; imageUrl: string; active: boolean;
  hasVariants?: boolean; parentProductId?: string | null; sizeLabel?: string | null;
  sizeEnabled?: boolean; variants?: StockProduct[];
};
export const STOCK_SIZES = ["PP", "P", "M", "G", "GG", "XG"] as const;
export type StockOverview = { success: true; canManage: boolean; products: StockProduct[]; total: number; categories: StockCategory[]; units: StockUnit[]; alertConfigured: boolean };
export type StockMovement = { id: string; direction: "ENTRADA" | "SAIDA"; quantity: number; stock_before: number; stock_after: number; note: string; actor_name: string; created_at: string; low_stock_crossed: boolean; alert_message_id: string | null; alertStatus?: string; deliveredAt?: string | null };
export type MoveStockResult = { success: true; movementId: string; stockQuantity: number; lowStock: boolean; lowStockCrossed: boolean; alertQueued: boolean; replayed: boolean };

export function stockQuantity(value: unknown, allowZero = false) {
  // Quantities are decimals, not money. Reject silent rounding and empty input.
  if (typeof value !== "number" && typeof value !== "string") throw new Error("INFORME UMA QUANTIDADE VÁLIDA.");
  if (typeof value === "string" && !/^\d+(?:[.,]\d{1,3})?$/.test(value.trim())) throw new Error("USE UMA QUANTIDADE COM ATÉ 3 CASAS DECIMAIS.");
  const quantity = Number(typeof value === "string" ? value.trim().replace(",", ".") : value);
  if (!Number.isFinite(quantity) || quantity < (allowZero ? 0 : .001) || quantity > 1_000_000 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > .000001) throw new Error("QUANTIDADE INVÁLIDA. USE ATÉ 3 CASAS DECIMAIS.");
  return quantity;
}
export function stockCode(value: unknown) {
  if (typeof value !== "string") throw new Error("INFORME O CÓDIGO DO PRODUTO.");
  const code = value.trim();
  // Keep leading zeros. Codes are identifiers, never numbers or arbitrary URLs.
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(code)) throw new Error("CÓDIGO INVÁLIDO. USE LETRAS, NÚMEROS, PONTO, HÍFEN OU SUBLINHADO.");
  return code;
}
export function stockMoney(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2_000_000_000) throw new Error("INFORME UM PREÇO VÁLIDO.");
  return value;
}
export function quantityLabel(value: number) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value); }
export function priceLabel(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

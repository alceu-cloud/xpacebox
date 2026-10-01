export type StockReportRow = {
  id: string; productId: string; product: string; code: string; unit: string;
  direction: "ENTRADA" | "SAIDA"; quantity: number; before: number; after: number;
  actorId: string | null; actor: string; at: string; note: string;
};
export type StockReport = { success: true; items: StockReportRow[]; total: number; page: number; pages: number };

export function stockReportFilters(params: URLSearchParams) {
  function day(key: string) {
    const value = params.get(key) ?? "";
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 2020) throw new Error("INFORME UM PERÍODO VÁLIDO, A PARTIR DE 2020.");
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("DATA INVÁLIDA.");
    return value;
  }
  const from = day("from"), to = day("to");
  if (from > to) throw new Error("A DATA INICIAL DEVE SER ANTERIOR À FINAL.");
  const direction = params.get("direction") || "ALL";
  if (!["ALL", "ENTRADA", "SAIDA"].includes(direction)) throw new Error("TIPO DE MOVIMENTAÇÃO INVÁLIDO.");
  const rawPage = params.get("page") ?? "1";
  if (!/^[1-9]\d{0,5}$/.test(rawPage)) throw new Error("PÁGINA INVÁLIDA.");
  const product = (params.get("product") ?? "").trim(), actor = (params.get("actor") ?? "").trim();
  if (product.length > 100 || actor.length > 100) throw new Error("BUSCA MUITO LONGA. USE ATÉ 100 CARACTERES.");
  // São Paulo has UTC−03 throughout these modern operational dates. End is exclusive,
  // so a movement at 23:59:59 local time is included even though its UTC day differs.
  const until = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86_400_000).toISOString();
  return { from, to, since: `${from}T00:00:00-03:00`, until, direction, product, actor, page: Number(rawPage) };
}

export function stockReportSearch(value: string) { return `%${value.replace(/[\\%_]/g, char => `\\${char}`)}%`; }

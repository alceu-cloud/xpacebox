import "server-only";
import { AccessError } from "@/lib/server/company-access";
import { NextResponse } from "next/server";

export class StockError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function stockManager(role: string) { return ["platform_owner", "company_manager"].includes(role); }
export function requireStockManager(role: string) { if (!stockManager(role)) throw new AccessError("APENAS ADMINISTRADORES E GERENTES PODEM ALTERAR O CATÁLOGO.", 403); }
export function stockId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new StockError("IDENTIFICADOR INVÁLIDO.");
  return value;
}
export function stockDescription(value: unknown, max = 160) {
  if (typeof value !== "string") throw new StockError("INFORME A DESCRIÇÃO.");
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > max) throw new StockError(`INFORME UMA DESCRIÇÃO DE ATÉ ${max} CARACTERES.`);
  return text;
}
export function stockError(error: unknown) {
  if (error instanceof StockError || error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? "";
  const known: Record<string, [number, string]> = {
    STOCK_SIZE_INVALID: [400, "CONFIRA A GRADE DE TAMANHOS. EDITE AS VARIAÇÕES PELO CADASTRO PRINCIPAL."],
    STOCK_SIZE_HAS_BALANCE: [409, "NÃO É POSSÍVEL REMOVER UM TAMANHO COM SALDO. PRESERVE A GRADE OU MOVIMENTE AS PEÇAS PRIMEIRO."],
    STOCK_SIZE_QUANTITY_INVALID: [400, "PARA ROUPAS, INFORME UMA QUANTIDADE INTEIRA DE PEÇAS."],
    STOCK_NOT_FOUND: [404, "PRODUTO NÃO ENCONTRADO OU ARQUIVADO."], STOCK_NOT_CONTROLLED: [409, "ESTE PRODUTO NÃO CONTROLA ESTOQUE."],
    STOCK_INSUFFICIENT: [409, "SALDO INSUFICIENTE. NÃO FOI FEITA NENHUMA BAIXA."], STOCK_REQUEST_CONFLICT: [409, "ESTA TENTATIVA JÁ FOI USADA EM OUTRA MOVIMENTAÇÃO. RECARREGUE O PRODUTO."],
    STOCK_ACCESS_DENIED: [403, "SEM PERMISSÃO PARA MOVIMENTAR ESTE ESTOQUE."], STOCK_QUANTITY_INVALID: [400, "QUANTIDADE INVÁLIDA."],
  };
  for (const [key, [status, text]] of Object.entries(known)) if (message.includes(key)) return NextResponse.json({ success: false, message: text }, { status });
  if (code === "23505") return NextResponse.json({ success: false, message: "JÁ EXISTE UM CADASTRO COM ESTA DESCRIÇÃO, SIGLA OU CÓDIGO." }, { status: 409 });
  if (code === "23503") return NextResponse.json({ success: false, message: "ESTE CADASTRO ESTÁ EM USO OU NÃO PERTENCE À XPACE. CONFIRA CATEGORIA E UNIDADE." }, { status: 409 });
  if (code === "23514") return NextResponse.json({ success: false, message: "CONFIRA OS DADOS. PARA DESATIVAR O CONTROLE DE ESTOQUE, O SALDO DEVE SER ZERO." }, { status: 400 });
  if (code === "PGRST116") return NextResponse.json({ success: false, message: "CADASTRO NÃO ENCONTRADO. ATUALIZE A LISTA E TENTE NOVAMENTE." }, { status: 404 });
  // Do not log payloads, phones, credentials or message contents.
  console.error("XPACE STOCK ERROR", { code: code ?? "UNKNOWN" });
  return NextResponse.json({ success: false, message: "NÃO FOI POSSÍVEL CONFIRMAR A OPERAÇÃO. VERIFIQUE SUA CONEXÃO E CONFIRA O CADASTRO OU HISTÓRICO ANTES DE UMA NOVA TENTATIVA." }, { status: 500 });
}

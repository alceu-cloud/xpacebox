"use client";
import { ArrowDownToLine, ArrowUpFromLine, Package, CheckCircle2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { stockApi, StockApiError } from "@/lib/xpace/stock-api";
import { stockQuantity, quantityLabel, type StockProduct, type MoveStockResult } from "@/lib/xpace/stock";

export default function StockMovementPanel({ product, onDone, onCancel, onLockChange }: { product: StockProduct; onDone: (result: MoveStockResult) => void; onCancel: () => void; onLockChange?: (locked: boolean) => void }) {
  const [direction, setDirection] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<MoveStockResult | null>(null);
  const pending = useRef<{ requestId: string; direction: "ENTRADA" | "SAIDA"; quantity: number; note: string } | null>(null);
  const lock = useRef(false);
  useEffect(() => { onLockChange?.(busy); return () => onLockChange?.(false); }, [busy, onLockChange]);
  async function submit() {
    if (lock.current || result) return;
    try {
      const amount = stockQuantity(quantity);
      if (product.sizeLabel && !Number.isInteger(amount)) throw new Error("PARA ROUPAS, INFORME UMA QUANTIDADE INTEIRA DE PEÇAS.");
      pending.current ??= { requestId: crypto.randomUUID(), direction, quantity: amount, note: note.trim() };
      lock.current = true; setBusy(true); setError("");
      const response = await stockApi<MoveStockResult>("", { action: "MOVE", productId: product.id, ...pending.current });
      setUncertain(false); setResult(response);
      // Keep low-stock warning visible until acknowledged; don't hide it with the product list.
      if (!response.lowStock) onDone(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível lançar.");
      if (cause instanceof StockApiError && cause.status >= 400 && cause.status < 500) { pending.current = null; setUncertain(false); }
      else if (pending.current) setUncertain(true);
    }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="xs-movement" data-no-pull-refresh data-unsaved-form>
    <header>{product.imageUrl ? <img src={product.imageUrl} alt={product.description} /> : <span className="xs-product-placeholder"><Package size={34} /></span>}<div><span>{product.categoryName}</span><h2>{product.description}</h2><p>EM ESTOQUE: <strong>{quantityLabel(result?.stockQuantity ?? product.stockQuantity)} {product.unitAbbreviation}</strong></p></div></header>
    {!product.controlsStock ? <><p className="xs-error">Este produto não controla estoque. Um gerente pode ativar essa opção no cadastro.</p><button className="xs-secondary" type="button" onClick={onCancel}>SELECIONAR OUTRO PRODUTO</button></> : result ? <>
      <div className="xs-low-alert" role="alert"><TriangleAlert size={25} /><div><strong>ESTOQUE ABAIXO DO MÍNIMO</strong><p>Saldo: {quantityLabel(result.stockQuantity)} {product.unitAbbreviation} · Mínimo: {quantityLabel(product.minimumStock)}.</p><p>{result.lowStockCrossed ? result.alertQueued ? "AVISO PARA ALCEU NA FILA DO WHATSAPP. Acompanhe a entrega em Notificações do Integrador." : "Não foi possível programar o WhatsApp: confira o destinatário e o Integrador. A movimentação foi registrada." : "Este produto já estava abaixo do mínimo. Não foi criado outro aviso."}</p></div></div>
      <p className="xs-success"><CheckCircle2 size={18} /> {result.replayed ? "MOVIMENTAÇÃO JÁ REGISTRADA; SEM DUPLICAÇÃO." : "MOVIMENTAÇÃO REGISTRADA."}</p><button type="button" className="xs-primary" onClick={() => onDone(result)}>ENTENDI · PRÓXIMO PRODUTO</button>
    </> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="xs-direction"><button type="button" disabled={busy || uncertain} className={direction === "ENTRADA" ? "is-active" : ""} onClick={() => setDirection("ENTRADA")}><ArrowDownToLine size={20} /> ENTRADA</button><button type="button" disabled={busy || uncertain} className={direction === "SAIDA" ? "is-active" : ""} onClick={() => setDirection("SAIDA")}><ArrowUpFromLine size={20} /> BAIXA</button></div>
      <label>QUANTIDADE ({product.unitAbbreviation})<input aria-label="Quantidade para movimentar" inputMode="decimal" value={quantity} disabled={busy || uncertain} onChange={event => setQuantity(event.target.value)} required /></label>
      <label>OBSERVAÇÃO / MOTIVO (OPCIONAL)<textarea maxLength={500} value={note} disabled={busy || uncertain} onChange={event => setNote(event.target.value)} placeholder="Ex.: reposição, venda no balcão, consumo interno..." /></label>
      <small>O responsável pela entrada ou baixa é registrado automaticamente pelo usuário conectado. Use seu próprio acesso. Baixa manual só movimenta o estoque; não gera cobrança nem receita.</small>
      {error ? <p className="xs-error" role="alert">{error}{uncertain ? " Tente a mesma operação novamente: a chave de lançamento impede duplicação. Para corrigir dados, volte e confira o histórico antes." : ""}</p> : null}
      <footer><button type="button" className="xs-secondary" onClick={onCancel} disabled={busy}>VOLTAR</button><button type="submit" className="xs-primary" disabled={busy}>{busy ? "REGISTRANDO..." : uncertain ? "CONFERIR / TENTAR A MESMA OPERAÇÃO" : `CONFIRMAR ${direction === "ENTRADA" ? "ENTRADA" : "BAIXA"}`}</button></footer>
    </form>}
  </section>;
}

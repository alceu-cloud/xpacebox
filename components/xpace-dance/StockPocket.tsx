"use client";
import { useEffect, useRef, useState } from "react";
import StockScanner from "@/components/xpace-dance/StockScanner";
import StockMovementPanel from "@/components/xpace-dance/StockMovementPanel";
import "./stock.css";
import { stockApi } from "@/lib/xpace/stock-api";
import { stockCode, type StockOverview, type StockProduct, type MoveStockResult } from "@/lib/xpace/stock";

export default function StockPocket({ onLockChange }: { onLockChange?: (locked: boolean) => void } = {}) {
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(() => () => { ++sequence.current; }, []);
  async function lookup(value: string) {
    const seq = ++sequence.current; setLoading(true); setError(""); setNotice("");
    try {
      const code = stockCode(value);
      const data = await stockApi<StockOverview>(`?code=${encodeURIComponent(code)}`);
      if (seq !== sequence.current) return;
      if (!data.products.length) throw new Error("Produto não encontrado. Confira o código ou peça para cadastrá-lo no Estoque.");
      setProduct(data.products[0]);
    } catch (cause) { if (seq === sequence.current) setError(cause instanceof Error ? cause.message : "Não foi possível localizar o produto."); }
    finally { if (seq === sequence.current) setLoading(false); }
  }
  function done(result: MoveStockResult) { setProduct(null); setNotice(result.replayed ? "MOVIMENTAÇÃO CONFERIDA; NÃO FOI DUPLICADA. PODE LER O PRÓXIMO PRODUTO." : "PRODUTO LANÇADO / BAIXADO COM SUCESSO. PODE LER O PRÓXIMO CÓDIGO."); }
  return <section className="xs-pocket" data-no-pull-refresh><h2>ESTOQUE</h2><p>Leia o produto, escolha entrada ou baixa e confirme a quantidade.</p>{notice ? <p className="xs-success" role="status">{notice}</p> : null}{error ? <p className="xs-error" role="alert">{error}</p> : null}{loading ? <p role="status">BUSCANDO PRODUTO...</p> : product ? <StockMovementPanel key={product.id} product={product} onDone={done} onLockChange={onLockChange} onCancel={() => { ++sequence.current; setProduct(null); }} /> : <StockScanner onRead={code => void lookup(code)} />}</section>;
}

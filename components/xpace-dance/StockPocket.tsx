"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Package, Search } from "lucide-react";
import StockMovementPanel from "@/components/xpace-dance/StockSizeMovementPanel";
import "./stock.css";
import { stockApi } from "@/lib/xpace/stock-api";
import { quantityLabel, type StockOverview, type StockProduct, type MoveStockResult } from "@/lib/xpace/stock";

export default function StockPocket({ onLockChange }: { onLockChange?: (locked: boolean) => void } = {}) {
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [data, setData] = useState<StockOverview | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const selectionSequence = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current; setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ q: search, page: String(page) });
      const result = await stockApi<StockOverview>(`?${query}`);
      if (seq === sequence.current) setData(result);
    } catch (cause) { if (seq === sequence.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os produtos."); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [search, page]);
  useEffect(() => {
    if (product) return;
    const timer = window.setTimeout(() => void refresh(), 200);
    return () => { window.clearTimeout(timer); ++sequence.current; };
  }, [refresh, product]);
  useEffect(() => () => { ++selectionSequence.current; }, []);
  async function selectProduct(item: StockProduct) {
    const seq = ++selectionSequence.current; setSelecting(true); setError(""); setNotice("");
    try {
      const result = await stockApi<StockOverview>(`?code=${encodeURIComponent(item.code)}`);
      if (seq !== selectionSequence.current) return;
      const current = result.products.find(candidate => candidate.id === item.id && candidate.active);
      if (!current) throw new Error("Este produto não está mais disponível. Atualize a lista e selecione novamente.");
      setProduct(current);
    } catch (cause) { if (seq === selectionSequence.current) setError(cause instanceof Error ? cause.message : "Não foi possível selecionar o produto."); }
    finally { if (seq === selectionSequence.current) setSelecting(false); }
  }
  function done(result: MoveStockResult) { setLoading(true); setProduct(null); setNotice(result.replayed ? "MOVIMENTAÇÃO CONFERIDA; NÃO FOI DUPLICADA. PODE SELECIONAR O PRÓXIMO PRODUTO." : "PRODUTO LANÇADO / BAIXADO COM SUCESSO. PODE SELECIONAR O PRÓXIMO PRODUTO."); }
  return <section className="xs-pocket" data-no-pull-refresh>
    <h2>ESTOQUE</h2><p>Selecione o produto, escolha entrada ou baixa e confirme a quantidade.</p>
    {notice ? <p className="xs-success" role="status">{notice}</p> : null}
    {error ? <p className="xs-error" role="alert">{error}</p> : null}
    {product ? <StockMovementPanel key={product.id} product={product} onDone={done} onLockChange={onLockChange} onCancel={() => { setLoading(true); setProduct(null); }} /> : <>
      <label className="xs-search xs-pocket-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Pesquisar produtos" placeholder="Pesquisar produto pelo nome" value={search} disabled={selecting} onChange={event => { setLoading(true); setSearch(event.target.value); setPage(0); }} /></label>
      {selecting ? <p role="status">BUSCANDO PRODUTO...</p> : null}
      {loading ? <p role="status">CARREGANDO PRODUTOS...</p> : error ? <button type="button" className="xs-secondary" disabled={selecting} onClick={() => void refresh()}>ATUALIZAR LISTA</button> : <>
        <div className="xs-pocket-products" role="group" aria-label="Selecionar produto">
          {data?.products.map(item => <button type="button" key={item.id} className="xs-pocket-product" aria-label={`Selecionar ${item.description}`} disabled={selecting} onClick={() => void selectProduct(item)}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="xs-product-placeholder"><Package size={24} aria-hidden="true" /></span>}
            <span className="xs-pocket-product-info"><strong>{item.description}</strong><small>{item.categoryName}</small><span>{item.hasVariants ? "ESCOLHER TAMANHO" : item.controlsStock ? `EM ESTOQUE: ${quantityLabel(item.stockQuantity)} ${item.unitAbbreviation}` : "SEM CONTROLE DE ESTOQUE"}</span></span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>)}
        </div>
        {!data?.products.length ? <p className="xs-empty">{search.trim() ? "NENHUM PRODUTO ENCONTRADO. TENTE OUTRO NOME." : "NENHUM PRODUTO ATIVO CADASTRADO."}</p> : null}
        {(data?.total ?? 0) > 100 || page > 0 ? <nav className="xs-pagination" aria-label="Páginas de produtos">
          <span>PÁGINA {page + 1}</span>
          <button type="button" aria-label="Página anterior" disabled={!page || selecting} onClick={() => { setLoading(true); setPage(page - 1); }}><ChevronLeft size={18} /></button>
          <button type="button" aria-label="Próxima página" disabled={selecting || (page + 1) * 100 >= (data?.total ?? 0)} onClick={() => { setLoading(true); setPage(page + 1); }}><ChevronRight size={18} /></button>
        </nav> : null}
      </>}
    </>}
  </section>;
}

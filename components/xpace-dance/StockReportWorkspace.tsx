"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { quantityLabel } from "@/lib/xpace/stock";
import type { StockReport } from "@/lib/xpace/stock-report";

export default function StockReportWorkspace({ from, to }: { from: string; to: string }) {
  const [direction, setDirection] = useState("ALL"), [product, setProduct] = useState(""), [actor, setActor] = useState("");
  const [filters, setFilters] = useState({ direction: "ALL", product: "", actor: "", page: 1 });
  const [data, setData] = useState<StockReport | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { setFilters(current => ({ ...current, page: 1 })); }, [from, to]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setData(null);
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
        const params = new URLSearchParams({ from, to, ...filters, page: String(filters.page) });
        const response = await fetch(`/api/xpace/estoque/relatorio?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Não foi possível carregar as movimentações.");
        if (!controller.signal.aborted) setData(result);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Falha na consulta."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [from, to, filters, revision]);
  return <section className="xdd-panel xpr-panel xsr-workspace">
    <header><div><h2>Entradas e baixas do estoque</h2><p>Responsável registrado pelo usuário conectado, no momento do lançamento. Datas e horários de Brasília. Inclui produtos arquivados.</p></div></header>
    <form className="xcv-filters" onSubmit={event => { event.preventDefault(); setFilters({ direction, product: product.trim(), actor: actor.trim(), page: 1 }); }}>
      <label>MOVIMENTAÇÃO<select value={direction} onChange={event => setDirection(event.target.value)}><option value="ALL">Todas</option><option value="ENTRADA">Entradas</option><option value="SAIDA">Baixas</option></select></label>
      <label>PRODUTO<input type="search" maxLength={100} value={product} onChange={event => setProduct(event.target.value)} placeholder="Nome do produto" /></label>
      <label>RESPONSÁVEL<input type="search" maxLength={100} value={actor} onChange={event => setActor(event.target.value)} placeholder="Nome de quem lançou" /></label>
      <button type="submit" className="xdd-refresh">FILTRAR</button><button type="button" className="xdd-refresh" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Atualizar estoque</button>
    </form>
    <p className="xpr-explanation">Use DE e ATÉ acima e clique em APLICAR para mudar o período. Conta compartilhada identifica a conta, não a pessoa: cada funcionário deve usar seu próprio acesso. Baixa não comprova venda nem gera receita.</p>
    <p role="status" className="xpr-context">{loading ? "Consultando movimentações..." : data ? `${data.total} movimentações encontradas · ${data.items.length} nesta página.` : ""}</p>
    {error ? <p className="xdd-alert" role="alert">{error}</p> : null}
    {data ? <><div className="xpr-table-scroll" tabIndex={0} aria-label="Movimentações de estoque, tabela rolável horizontalmente"><table className="xpr-table"><thead><tr>{["Data / hora", "Produto", "Movimentação", "Quantidade", "Saldo antes → depois", "Responsável", "Observação"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
      {data.items.map(row => <tr key={row.id}><td>{new Date(row.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><th scope="row">{row.product}<small>{row.code}</small></th><td><span className={`xpr-tag ${row.direction === "ENTRADA" ? "is-green" : "is-red"}`}>{row.direction === "ENTRADA" ? "Entrada" : "Baixa"}</span></td><td>{quantityLabel(row.quantity)} {row.unit}</td><td>{quantityLabel(row.before)} → {quantityLabel(row.after)} {row.unit}</td><td>{row.actor}</td><td>{row.note || "—"}</td></tr>)}
      {!data.items.length ? <tr><td colSpan={7}>Nenhuma movimentação encontrada para estes filtros.</td></tr> : null}
    </tbody></table></div><div className="xpr-pagination"><button type="button" disabled={loading || data.page <= 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}>Anterior</button><span>Página {data.page} de {data.pages}</span><button type="button" disabled={loading || data.page >= data.pages} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Próxima</button></div></> : null}
  </section>;
}

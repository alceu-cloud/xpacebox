"use client";

import { Camera, ChevronLeft, ChevronRight, History, Package, Pencil, Plus, Printer, QrCode, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { stockApi, uploadStockImage } from "@/lib/xpace/stock-api";
import { priceLabel, quantityLabel, type StockOverview, type StockProduct, type StockMovement, type StockCategory, type StockUnit } from "@/lib/xpace/stock";
import StockMovementPanel from "@/components/xpace-dance/StockMovementPanel";
import StockPocket from "@/components/xpace-dance/StockPocket";
import "./stock.css";

type Tab = "PRODUCTS" | "CATEGORIES" | "UNITS" | "SHEET";

export default function StockWorkspace() {
  const [tab, setTab] = useState<Tab>("PRODUCTS");
  const [data, setData] = useState<StockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [productForm, setProductForm] = useState<StockProduct | "NEW" | null>(null);
  const [lookupForm, setLookupForm] = useState<{ unit: boolean; value?: StockCategory | StockUnit } | null>(null);
  const [moving, setMoving] = useState<StockProduct | null>(null);
  const [scanning, setScanning] = useState(false);
  const [movementLocked, setMovementLocked] = useState(false);
  const [history, setHistory] = useState<{ product: StockProduct; rows: StockMovement[] } | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++sequence.current; setLoading(true);
    try {
      const query = new URLSearchParams({ q: search, page: String(page), ...(category ? { category } : {}), ...(archived ? { archived: "1" } : {}) });
      const result = await stockApi<StockOverview>(`?${query}`);
      if (seq === sequence.current) { setData(result); setNotice(""); }
    } catch (cause) { if (seq === sequence.current) setNotice(cause instanceof Error ? cause.message : "Não foi possível carregar."); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [search, category, archived, page]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 200); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => { const pull = (event: Event) => (event as CustomEvent<{ tasks: Promise<unknown>[] }>).detail.tasks.push(refresh()); window.addEventListener("xpace:refresh", pull); return () => { ++sequence.current; window.removeEventListener("xpace:refresh", pull); }; }, [refresh]);
  async function action(body: object) {
    try { await stockApi("", body); await refresh(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Não foi possível alterar."); }
  }
  async function openHistory(product: StockProduct) {
    try { const result = await stockApi<{ movements: StockMovement[] }>(`?history=${product.id}`); setHistory({ product, rows: result.movements }); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Não foi possível consultar o histórico."); }
  }
  const lookups = tab === "UNITS" ? data?.units ?? [] : data?.categories ?? [];
  return <section className="xs-workspace">
    <header className="xs-heading"><div><span>XPACE · CONTROLE DE PRODUTOS</span><h1>ESTOQUE.</h1><p>Do cadastro ao balcão, cada movimentação no lugar certo.</p></div><button type="button" className="xs-secondary" onClick={() => setScanning(true)}><Camera size={18} /> LER / MOVIMENTAR</button></header>
    <nav className="xs-tabs" aria-label="Seções de estoque">{([["PRODUCTS", "Produtos"], ["CATEGORIES", "Categorias"], ["UNITS", "Unidades"], ["SHEET", "Folha de códigos"]] as const).map(([key, label]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{key === "SHEET" ? <QrCode size={16} /> : null}{label}</button>)}</nav>
    {notice ? <p className="xs-error" role="alert">{notice}</p> : null}
    {!data?.alertConfigured && data ? <p className="xs-hint">O alerta visual está disponível. O destinatário de WhatsApp ainda precisa ser configurado pelo administrador no servidor.</p> : null}
    {tab === "SHEET" ? <StockCodeSheet /> : <>
      <div className="xs-toolbar"><div><h2>{tab === "PRODUCTS" ? "PRODUTOS" : tab === "CATEGORIES" ? "CATEGORIAS" : "UNIDADES DE MEDIDA"}</h2>{tab === "PRODUCTS" ? <label className="xs-search"><Search size={17} /><input type="search" aria-label="Pesquisar produtos" placeholder="Pesquisar produto" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label> : null}</div>
      {data?.canManage ? <button type="button" className="xs-primary" onClick={() => tab === "PRODUCTS" ? setProductForm("NEW") : setLookupForm({ unit: tab === "UNITS" })}><Plus size={18} /> {tab === "PRODUCTS" ? "PRODUTO" : tab === "CATEGORIES" ? "CATEGORIA" : "UNIDADE"}</button> : null}</div>
      {tab === "PRODUCTS" ? <>
        <div className="xs-filters"><select aria-label="Filtrar categoria" value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}><option value="">TODAS AS CATEGORIAS</option>{data?.categories.map(item => <option key={item.id} value={item.id}>{item.description}</option>)}</select><label><input type="checkbox" checked={archived} onChange={event => { setArchived(event.target.checked); setPage(0); }} /> INCLUIR ARQUIVADOS</label></div>
        {loading ? <p role="status">CARREGANDO PRODUTOS...</p> : <div className="xs-table-scroll"><table className="xs-table"><thead><tr><th>PRODUTO</th><th>EM ESTOQUE</th><th>PREÇO DE VENDA</th><th>CATEGORIA</th><th>UNIDADE</th><th><span className="xs-sr-only">AÇÕES</span></th></tr></thead><tbody>{data?.products.map(product => <tr key={product.id} className={!product.active ? "is-archived" : ""}><td><div className="xs-product-cell">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span className="xs-product-placeholder"><Package size={22} /></span>}<div><strong>{product.description}</strong><small>{product.code}</small>{!product.active ? <small>ARQUIVADO</small> : null}</div></div></td><td><strong className={product.controlsStock && product.stockQuantity < product.minimumStock ? "xs-low" : ""}>{product.controlsStock ? quantityLabel(product.stockQuantity) : "SEM CONTROLE"}</strong>{product.controlsStock && product.stockQuantity < product.minimumStock ? <small className="xs-low">MÍNIMO: {quantityLabel(product.minimumStock)}</small> : null}</td><td>{priceLabel(product.salePriceCents)}</td><td>{product.categoryName}</td><td>{product.unitAbbreviation}</td><td><div className="xs-row-actions"><button type="button" aria-label={`Histórico de ${product.description}`} title="Histórico" onClick={() => void openHistory(product)}><History size={17} /></button>{product.controlsStock && product.active ? <button type="button" className="xs-secondary" onClick={() => setMoving(product)}>ENTRADA / BAIXA</button> : null}{data.canManage ? <><button type="button" aria-label={`Editar ${product.description}`} title="Editar" onClick={() => setProductForm(product)}><Pencil size={17} /></button><button type="button" className="xs-quiet" onClick={() => { if (window.confirm(`${product.active ? "Arquivar" : "Reativar"} ${product.description}? O histórico será preservado.`)) void action({ action: "SET_ACTIVE", entity: "PRODUCT", id: product.id, active: !product.active }); }}>{product.active ? "ARQUIVAR" : "REATIVAR"}</button></> : null}</div></td></tr>)}</tbody></table>{!data?.products.length ? <p className="xs-empty">NENHUM PRODUTO NESTA BUSCA. CADASTRE O PRIMEIRO PRODUTO.</p> : null}</div>}
        <nav className="xs-pagination" aria-label="Páginas de produtos"><span>{data?.total ?? 0} PRODUTOS · PÁGINA {page + 1}</span><button type="button" aria-label="Página anterior" disabled={!page || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><button type="button" aria-label="Próxima página" disabled={loading || (page + 1) * 100 >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></nav>
      </> : loading ? <p role="status">CARREGANDO CADASTROS...</p> : <div className="xs-table-scroll"><table className="xs-table"><thead><tr><th>DESCRIÇÃO</th>{tab === "UNITS" ? <th>SIGLA</th> : null}<th><span className="xs-sr-only">AÇÕES</span></th></tr></thead><tbody>{lookups.map(item => <tr key={item.id}><td>{item.description}</td>{tab === "UNITS" ? <td>{(item as StockUnit).abbreviation}</td> : null}<td>{data?.canManage ? <div className="xs-row-actions"><button type="button" aria-label={`Editar ${item.description}`} onClick={() => setLookupForm({ unit: tab === "UNITS", value: item })}><Pencil size={18} /></button><button type="button" aria-label={`Excluir ${item.description}`} onClick={() => { if (window.confirm(`Excluir ${item.description}? Só é permitido se não estiver em nenhum produto.`)) void action({ action: "DELETE_LOOKUP", entity: tab === "UNITS" ? "UNIT" : "CATEGORY", id: item.id }); }}><Trash2 size={18} /></button></div> : null}</td></tr>)}</tbody></table></div>}
    </>}
    {productForm && data ? <ProductModal product={productForm === "NEW" ? null : productForm} categories={data.categories} units={data.units} onClose={() => setProductForm(null)} onSaved={() => { setProductForm(null); void refresh(); }} /> : null}
    {lookupForm ? <LookupModal unit={lookupForm.unit} value={lookupForm.value} onClose={() => setLookupForm(null)} onSaved={() => { setLookupForm(null); void refresh(); }} /> : null}
    {moving ? <StockDialog title="MOVIMENTAR PRODUTO" locked={movementLocked} onClose={() => setMoving(null)}><StockMovementPanel product={moving} onLockChange={setMovementLocked} onCancel={() => setMoving(null)} onDone={() => { setMoving(null); void refresh(); }} /></StockDialog> : null}
    {scanning ? <StockDialog title="LEITOR DE ESTOQUE" locked={movementLocked} onClose={() => { setScanning(false); void refresh(); }}><StockPocket onLockChange={setMovementLocked} /></StockDialog> : null}
    {history ? <StockDialog title={`HISTÓRICO · ${history.product.description}`} onClose={() => setHistory(null)}><div className="xs-history">{history.rows.map(row => <article key={row.id}><strong>{row.direction === "ENTRADA" ? "+" : "−"}{quantityLabel(row.quantity)} {history.product.unitAbbreviation} · {row.direction === "ENTRADA" ? "ENTRADA" : "BAIXA"}</strong><span>{quantityLabel(row.stock_before)} → {quantityLabel(row.stock_after)} · {row.actor_name}</span><small>{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</small>{row.note ? <p>{row.note}</p> : null}{row.low_stock_crossed ? <p>ESTOQUE BAIXO · {row.deliveredAt ? "WHATSAPP ENTREGUE" : row.alertStatus ? `WHATSAPP: ${{ QUEUED: "NA FILA", SENDING: "ENVIANDO", SENT: "ACEITO, SEM RECIBO DE ENTREGA", FAILED: "FALHOU", UNKNOWN: "VERIFICAR", CANCELLED: "CANCELADO" }[row.alertStatus] ?? row.alertStatus}` : "AVISO NÃO PROGRAMADO"}</p> : null}</article>)}{!history.rows.length ? <p>NENHUMA MOVIMENTAÇÃO. O ESTOQUE COMEÇA EM ZERO; DÊ ENTRADA PARA LANÇAR O SALDO INICIAL.</p> : <small>ÚLTIMAS 100 MOVIMENTAÇÕES.</small>}</div></StockDialog> : null}
  </section>;
}

export function StockDialog({ title, children, onClose, locked = false }: { title: string; children: ReactNode; onClose: () => void; locked?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="xs-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }} data-no-pull-refresh><header><h2>{title}</h2><button type="button" aria-label="Fechar" disabled={locked} onClick={onClose}><X size={21} /></button></header>{children}</dialog>;
}

function LookupModal({ unit, value, onClose, onSaved }: { unit: boolean; value?: StockCategory | StockUnit; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState(value?.description ?? "");
  const [abbreviation, setAbbreviation] = useState((value as StockUnit)?.abbreviation ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  async function save(event: FormEvent) { event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(""); try { await stockApi("", { action: unit ? "SAVE_UNIT" : "SAVE_CATEGORY", id: value?.id, description, abbreviation }); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); } finally { lock.current = false; setBusy(false); } }
  return <StockDialog title={`${value ? "EDITAR" : "NOVA"} ${unit ? "UNIDADE DE MEDIDA" : "CATEGORIA"}`} onClose={onClose} locked={busy}><form className="xs-form" onSubmit={event => void save(event)}><label>DESCRIÇÃO *<input autoFocus required maxLength={80} value={description} onChange={event => setDescription(event.target.value)} /></label>{unit ? <label>SIGLA *<input required maxLength={8} value={abbreviation} onChange={event => setAbbreviation(event.target.value)} /></label> : null}{error ? <p className="xs-error" role="alert">{error}</p> : null}<footer><button type="button" className="xs-secondary" disabled={busy} onClick={onClose}>CANCELAR</button><button type="submit" className="xs-primary" disabled={busy}>{busy ? "SALVANDO..." : "SALVAR"}</button></footer></form></StockDialog>;
}

function ProductModal({ product, categories, units, onClose, onSaved }: { product: StockProduct | null; categories: StockCategory[]; units: StockUnit[]; onClose: () => void; onSaved: () => void }) {
  const [id, setId] = useState(product?.id ?? "");
  const [draft, setDraft] = useState({ description: product?.description ?? "", cost: ((product?.costPriceCents ?? 0) / 100).toFixed(2), sale: ((product?.salePriceCents ?? 0) / 100).toFixed(2), unitId: product?.unitId ?? units.find(unit => unit.abbreviation === "UN")?.id ?? "", categoryId: product?.categoryId ?? "", controlsStock: product?.controlsStock ?? true, minimum: String(product?.minimumStock ?? 0), codeMode: product?.codeMode ?? "EXTERNAL", code: product?.codeMode === "EXTERNAL" ? product.code : "" });
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState(product?.imageUrl ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => { if (!image) return; const url = URL.createObjectURL(image); setPreview(url); return () => URL.revokeObjectURL(url); }, [image]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const value = await stockApi<{ id: string }>("", { action: "SAVE_PRODUCT", product: { id: id || undefined, description: draft.description, costPriceCents: Math.round(Number(draft.cost.replace(",", ".")) * 100), salePriceCents: Math.round(Number(draft.sale.replace(",", ".")) * 100), categoryId: draft.categoryId, unitId: draft.unitId, controlsStock: draft.controlsStock, minimumStock: draft.minimum, codeMode: draft.codeMode, code: draft.code } });
      setId(value.id); // Preserve created ID if the image upload fails; retry updates, never duplicates.
      if (image) await uploadStockImage(value.id, image);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao salvar."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <StockDialog title={product ? "EDITAR PRODUTO" : "NOVO PRODUTO"} onClose={onClose} locked={busy}><form className="xs-form" onSubmit={event => void save(event)}>
    <label>DESCRIÇÃO *<input autoFocus required maxLength={160} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Ex.: Camiseta XPACE preta · M" /></label>
    <div className="xs-form-grid"><label>PREÇO DE CUSTO (R$) *<input type="number" inputMode="decimal" min="0" step="0.01" required value={draft.cost} onChange={event => setDraft({ ...draft, cost: event.target.value })} /></label><label>PREÇO DE VENDA (R$) *<input type="number" inputMode="decimal" min="0" step="0.01" required value={draft.sale} onChange={event => setDraft({ ...draft, sale: event.target.value })} /></label><label>UNIDADE DE MEDIDA *<select value={draft.unitId} onChange={event => setDraft({ ...draft, unitId: event.target.value })} required><option value="">SELECIONE</option>{units.filter(unit => unit.active || unit.id === draft.unitId).map(unit => <option key={unit.id} value={unit.id}>{unit.description} ({unit.abbreviation})</option>)}</select></label><label>CATEGORIA *<select value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })} required><option value="">SELECIONE</option>{categories.filter(cat => cat.active || cat.id === draft.categoryId).map(cat => <option key={cat.id} value={cat.id}>{cat.description}</option>)}</select></label></div>
    <label className="xs-checkbox"><input type="checkbox" checked={draft.controlsStock} onChange={event => setDraft({ ...draft, controlsStock: event.target.checked })} /> CONTROLAR ESTOQUE DESTE PRODUTO</label>
    {draft.controlsStock ? <label>ESTOQUE MÍNIMO<input required inputMode="decimal" value={draft.minimum} onChange={event => setDraft({ ...draft, minimum: event.target.value })} /><small>Ex.: mínimo 5 → o aviso aparece quando o saldo cai para menos de 5. O saldo inicial é lançado por Entrada.</small></label> : null}
    <label>CÓDIGO DO PRODUTO<select value={draft.codeMode} onChange={event => setDraft({ ...draft, codeMode: event.target.value as "EXTERNAL" | "INTERNAL" })}><option value="EXTERNAL">JÁ TEM CÓDIGO DE BARRAS / QR</option><option value="INTERNAL">NÃO TEM · GERAR QR PARA A FOLHA</option></select></label>
    {draft.codeMode === "EXTERNAL" ? <label>CÓDIGO DA EMBALAGEM *<input required maxLength={100} autoCapitalize="off" value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} /><small>Copie todos os dígitos, incluindo os zeros do início.</small></label> : <p className="xs-hint">Um código exclusivo será gerado ao salvar. Depois, selecione este produto na Folha de códigos.</p>}
    <label className="xs-image-input">FOTO DO PRODUTO {preview ? <img src={preview} alt="Prévia do produto" /> : null}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setImage(event.target.files?.[0] ?? null)} /><small>JPG, PNG OU WEBP · ATÉ 3 MB.</small></label>
    <p className="xs-hint">Cada tamanho, cor ou embalagem diferente deve ter um cadastro e código próprio.</p>
    {error ? <p className="xs-error" role="alert">{error}</p> : null}<footer><button type="button" className="xs-secondary" disabled={busy} onClick={onClose}>CANCELAR</button><button type="submit" className="xs-primary" disabled={busy}>{busy ? "SALVANDO..." : "SALVAR PRODUTO"}</button></footer>
  </form></StockDialog>;
}

function StockCodeSheet() {
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await stockApi<StockOverview>("?sheet=1");
        if (!active) return;
        setProducts(result.products); setSelected(new Set(result.products.map(product => product.id)));
        if (result.total > result.products.length) setError("Mais de 1000 produtos: esta folha mostra os primeiros 1000.");
        const QRCode = await import("qrcode");
        const entries = await Promise.all(result.products.map(async product => [product.id, await QRCode.toDataURL(product.code, { width: 200, margin: 4, errorCorrectionLevel: "M" })] as const));
        if (active) setCodes(Object.fromEntries(entries));
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível gerar os códigos."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);
  const visible = useMemo(() => products.filter(product => selected.has(product.id)), [products, selected]);
  async function print() { await document.fonts.ready; await Promise.all([...document.querySelectorAll<HTMLImageElement>(".xs-sheet img")].map(image => image.decode().catch(() => undefined))); window.print(); }
  return <section className="xs-sheet"><div className="xs-sheet-tools"><div><h2>FOLHA DE CÓDIGOS</h2><p>Foto e QR dos produtos sem código próprio. Impressão compacta em A4: use escala 100% e desative os cabeçalhos do navegador.</p></div><button type="button" className="xs-primary" disabled={loading || !visible.length} onClick={() => void print()}><Printer size={18} /> IMPRIMIR / SALVAR PDF</button></div>
    {error ? <p className="xs-error" role="alert">{error}</p> : null}{loading ? <p role="status">GERANDO QR CODES...</p> : <><div className="xs-sheet-selection">{products.map(product => <label key={product.id}><input type="checkbox" checked={selected.has(product.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(product.id); else next.delete(product.id); return next; })} />{product.description}</label>)}</div><header className="xs-print-title"><img src="/brands/xpace-logo.png" alt="XPACE" /><div><h2>PRODUTOS · LEITURA RÁPIDA</h2><p>Abra Estoque no app e escaneie o QR para entrada ou baixa.</p></div></header><div className="xs-code-grid">{visible.map(product => <article key={product.id}>{product.imageUrl ? <img className="xs-sheet-photo" src={product.imageUrl} alt={product.description} /> : <div className="xs-sheet-photo xs-product-placeholder"><Package size={40} /></div>}<h3>{product.description}</h3><span>{priceLabel(product.salePriceCents)} · {product.unitAbbreviation}</span>{codes[product.id] ? <img className="xs-sheet-qr" src={codes[product.id]} alt={`QR de ${product.description}`} /> : null}<small>{product.code}</small></article>)}</div>{!products.length ? <p className="xs-empty">CADASTRE UM PRODUTO COM “NÃO TEM · GERAR QR” PARA MONTAR A FOLHA.</p> : null}</>}
  </section>;
}

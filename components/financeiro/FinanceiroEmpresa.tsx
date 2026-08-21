"use client";

import { useEffect, useMemo, useState } from "react";

import { createQuote, loadQuotes } from "@/lib/orcamentos";
import { loadClients } from "@/lib/clientes";
import type { EngineeringFormula, ProductFicha, SpecificMaterial } from "@/types/gerenciador";
import type { ClientRecord } from "@/types/clientes";
import type { QuoteDraft, QuoteItem, QuoteRecord } from "@/types/orcamentos";

const companies = [
  { name: "DAWOS", slug: "dawos" },
  { name: "CARCAT", slug: "carcat" },
  { name: "GTA", slug: "gta" },
];

const today = new Date().toISOString().slice(0, 10);

function emptyItem(): QuoteItem {
  return { itemNumber: 1, ftNumber: "", description: "", length: 0, width: 0, height: 0, area: 0, quality: "", boxType: "", material: "", quantity: 1, unitPrice: 0, ipiPercent: 0, ipiValue: 0, total: 0 };
}

export default function FinanceiroEmpresa({
  companySlug,
  productFichas,
  materials,
  engineeringFormulas,
}: {
  companySlug: string;
  productFichas: ProductFicha[];
  materials: SpecificMaterial[];
  engineeringFormulas: EngineeringFormula[];
}) {
  const [kind, setKind] = useState<"DIRECT" | "ENGINEERING">("DIRECT");
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedFichaId, setSelectedFichaId] = useState("");
  const [form, setForm] = useState({ clientName: "", buyerName: "", phone: "", email: "", cnpj: "", address: "", company: "DAWOS", recipient: "CLIENT" as "CLIENT" | "REPRESENTATIVE", representative: "", paymentTerms: "", freight: "", deliveryDate: "", validUntil: "", observations: "" });

  useEffect(() => {
    loadClients(companySlug).then(setClients).catch(() => setClients([]));
    refreshQuotes("DIRECT");
  }, [companySlug]);

  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const clientFichas = useMemo(() => productFichas.filter((ficha) => ficha.clientId === selectedClientId), [productFichas, selectedClientId]);
  const selectedFicha = productFichas.find((ficha) => ficha.id === selectedFichaId);

  async function refreshQuotes(nextKind = kind, nextSearch = search) {
    try {
      setMessage("");
      setQuotes(await loadQuotes(companySlug, nextKind, nextSearch));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL CARREGAR OS ORCAMENTOS.");
    }
  }

  function changeKind(nextKind: "DIRECT" | "ENGINEERING") {
    setKind(nextKind);
    setSearch("");
    setShowForm(false);
    setMessage("");
    void refreshQuotes(nextKind, "");
  }

  function startCreate() {
    setShowForm(true);
    setItems([emptyItem()]);
    setSelectedClientId("");
    setSelectedFichaId("");
    setForm({ clientName: "", buyerName: "", phone: "", email: "", cnpj: "", address: "", company: "DAWOS", recipient: "CLIENT", representative: "", paymentTerms: "", freight: "", deliveryDate: "", validUntil: "", observations: "" });
  }

  function updateForm(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function updateItem(index: number, key: keyof QuoteItem, value: string) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: ["length", "width", "height", "area", "quantity", "unitPrice", "ipiPercent"].includes(key) ? Number(value.replace(",", ".")) || 0 : value } : item));
  }

  function selectClient(id: string) {
    setSelectedClientId(id);
    setSelectedFichaId("");
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    updateForm("clientName", client.tradeName || client.legalName);
    updateForm("buyerName", client.buyerName);
    updateForm("phone", client.phone || client.whatsapp);
    updateForm("email", client.purchaseEmail || client.invoiceEmail);
    updateForm("cnpj", client.cnpj);
    updateForm("address", [client.street, client.streetNumber, client.district, client.city, client.state, client.postalCode].filter(Boolean).join(", "));
    updateForm("paymentTerms", client.paymentTerms);
    updateForm("freight", client.freightTerms);
    updateForm("company", client.sellerCompanyName || "DAWOS");
    updateForm("representative", client.representativeName);
  }

  function selectFicha(id: string) {
    setSelectedFichaId(id);
    const ficha = productFichas.find((item) => item.id === id);
    if (!ficha) return;
    const material = materials.find((item) => item.id === ficha.materialId);
    const formula = engineeringFormulas.find((item) => item.id === ficha.engineeringId);
    setItems([{ ...emptyItem(), ftNumber: ficha.ftNumber, description: ficha.reference, length: ficha.length, width: ficha.width, height: ficha.height, quality: ficha.supplierQuality, boxType: formula?.description || "", material: material?.code || "", unitPrice: ficha.price, snapshot: { revision: ficha.revision, company: ficha.company, engineeringId: ficha.engineeringId } }]);
    updateForm("company", ficha.company);
  }

  async function saveQuote() {
    if (!form.clientName.trim() || !items.some((item) => item.description.trim())) {
      setMessage("PREENCHA O CLIENTE E A DESCRICAO DE PELO MENOS UM ITEM.");
      return;
    }
    try {
      const quote = await createQuote(companySlug, {
        kind,
        recipient: form.recipient,
        sellerCompanyName: form.company,
        sellerCompanySlug: form.company.toLowerCase(),
        clientId: selectedClientId || undefined,
        clientName: form.clientName,
        clientCnpj: form.cnpj,
        buyerName: form.buyerName,
        phone: form.phone,
        email: form.email,
        address: form.address,
        representativeName: form.representative,
        issueDate: today,
        deliveryDate: form.deliveryDate,
        validUntil: form.validUntil,
        paymentTerms: form.paymentTerms,
        freight: form.freight,
        observations: form.observations,
        items: items.filter((item) => item.description.trim()).map((item, index) => ({ ...item, itemNumber: index + 1 })),
      });
      setShowForm(false);
      setMessage(`ORCAMENTO ${quote.quoteNumber} GERADO COM SUCESSO.`);
      await refreshQuotes();
      printQuote(quote);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL GERAR O ORCAMENTO.");
    }
  }

  return (
    <section style={shellStyle}>
      <div style={modeTabsStyle}>
        <button type="button" onClick={() => changeKind("DIRECT")} style={{ ...modeTabStyle, ...(kind === "DIRECT" ? activeModeTabStyle : {}) }}>ORCAMENTO DIRETO</button>
        <button type="button" onClick={() => changeKind("ENGINEERING")} style={{ ...modeTabStyle, ...(kind === "ENGINEERING" ? activeModeTabStyle : {}) }}>ORCAMENTO ENGENHARIA</button>
      </div>

      <section style={panelStyle}>
        <div style={panelHeaderStyle}>
          <div><span style={eyebrowStyle}>{kind === "DIRECT" ? "CONSULTA POR NUMERO" : "CONSULTA POR CLIENTE"}</span><h2 style={titleStyle}>{kind === "DIRECT" ? "ORCAMENTOS DIRETOS" : "ORCAMENTOS DE ENGENHARIA"}</h2><p style={descriptionStyle}>{kind === "DIRECT" ? "BUSQUE ORCAMENTOS CRIADOS MANUALMENTE." : "BUSQUE ORCAMENTOS VINCULADOS A CLIENTES E FICHAS TECNICAS."}</p></div>
          <button type="button" onClick={startCreate} style={primaryButtonStyle}>+ NOVO ORCAMENTO</button>
        </div>
        <div style={searchRowStyle}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={kind === "DIRECT" ? "OD-000001" : "NOME OU CNPJ DO CLIENTE"} style={inputStyle} /><button type="button" onClick={() => refreshQuotes()} style={secondaryButtonStyle}>PESQUISAR</button></div>
        {message && <div style={messageStyle}>{message}</div>}
      </section>

      {showForm && <QuoteForm kind={kind} form={form} items={items} clients={clients} clientFichas={clientFichas} selectedClientId={selectedClientId} selectedFichaId={selectedFichaId} selectedClient={selectedClient} selectedFicha={selectedFicha} updateForm={updateForm} updateItem={updateItem} selectClient={selectClient} selectFicha={selectFicha} addItem={() => setItems((current) => [...current, { ...emptyItem(), itemNumber: current.length + 1 }])} removeItem={(index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} onCancel={() => setShowForm(false)} onSave={saveQuote} />}

      <section style={panelStyle}><div style={listHeadingStyle}><h2 style={sectionTitleStyle}>ORCAMENTOS SALVOS</h2><span style={countStyle}>{quotes.length} REGISTRO(S)</span></div>{quotes.length === 0 ? <div style={emptyStyle}>NENHUM ORCAMENTO ENCONTRADO.</div> : <div style={quoteListStyle}>{quotes.map((quote) => <article key={quote.id} style={quoteRowStyle}><div><strong style={quoteNumberStyle}>{quote.quoteNumber}</strong><span style={quoteClientStyle}>{quote.clientName}</span><small style={quoteMetaStyle}>{quote.issueDate} · {quote.items.length} ITEM(NS) · {formatCurrency(quote.grandTotal)}</small></div><button type="button" onClick={() => printQuote(quote)} style={pdfButtonStyle}>GERAR PDF</button></article>)}</div>}</section>
    </section>
  );
}

function QuoteForm({ kind, form, items, clients, clientFichas, selectedClientId, selectedFichaId, selectedClient, selectedFicha, updateForm, updateItem, selectClient, selectFicha, addItem, removeItem, onCancel, onSave }: any) {
  return <section style={formPanelStyle}><div style={formHeaderStyle}><div><span style={eyebrowStyle}>{kind === "DIRECT" ? "ORCAMENTO DIRETO" : "ORCAMENTO DE ENGENHARIA"}</span><h2 style={titleStyle}>MONTAR ORCAMENTO</h2></div><button type="button" onClick={onCancel} style={closeButtonStyle}>FECHAR</button></div>
    {kind === "ENGINEERING" ? <div style={lookupGridStyle}><label style={labelStyle}>CLIENTE<select value={selectedClientId} onChange={(event) => selectClient(event.target.value)} style={inputStyle}><option value="">SELECIONE O CLIENTE</option>{clients.map((client: ClientRecord) => <option key={client.id} value={client.id}>{client.tradeName || client.legalName} · {client.cnpj}</option>)}</select></label><label style={labelStyle}>FICHA TECNICA<select value={selectedFichaId} onChange={(event) => selectFicha(event.target.value)} style={inputStyle}><option value="">SELECIONE O PRODUTO</option>{clientFichas.map((ficha: ProductFicha) => <option key={ficha.id} value={ficha.id}>{ficha.ftNumber} · {ficha.reference}</option>)}</select></label></div> : <div style={noticeStyle}>NO ORCAMENTO DIRETO, OS DADOS DO CLIENTE E DO ITEM SAO PREENCHIDOS MANUALMENTE.</div>}
    <div style={formGridStyle}><Field label="NOME DO CLIENTE" value={form.clientName} onChange={(value: string) => updateForm("clientName", value)} /><Field label="COMPRADOR" value={form.buyerName} onChange={(value: string) => updateForm("buyerName", value)} /><Field label="TELEFONE" value={form.phone} onChange={(value: string) => updateForm("phone", value)} /><Field label="E-MAIL" value={form.email} onChange={(value: string) => updateForm("email", value)} lower /><Field label="CNPJ" value={form.cnpj} onChange={(value: string) => updateForm("cnpj", value)} /><Field label="EMPRESA VENDEDORA" value={form.company} onChange={(value: string) => updateForm("company", value)} /><Field label="REPRESENTANTE" value={form.representative} onChange={(value: string) => updateForm("representative", value)} /><Field label="CONDICAO DE PAGAMENTO" value={form.paymentTerms} onChange={(value: string) => updateForm("paymentTerms", value)} /><Field label="FRETE" value={form.freight} onChange={(value: string) => updateForm("freight", value)} /><Field label="DATA DE ENTREGA" value={form.deliveryDate} onChange={(value: string) => updateForm("deliveryDate", value)} type="date" /><Field label="VALIDADE DO ORCAMENTO" value={form.validUntil} onChange={(value: string) => updateForm("validUntil", value)} type="date" /><Field label="DESTINATARIO" value={form.recipient === "CLIENT" ? "CLIENTE" : "REPRESENTANTE"} onChange={(value: string) => updateForm("recipient", value === "CLIENTE" ? "CLIENT" : "REPRESENTATIVE")} selectOptions={["CLIENTE", "REPRESENTANTE"]} /><label style={{ ...labelStyle, gridColumn: "1 / -1" }}>ENDERECO<input value={form.address} onChange={(event) => updateForm("address", event.target.value)} style={inputStyle} /></label><label style={{ ...labelStyle, gridColumn: "1 / -1" }}>OBSERVACOES<textarea value={form.observations} onChange={(event) => updateForm("observations", event.target.value)} style={{ ...inputStyle, minHeight: 84, resize: "vertical" }} /></label></div>
    <div style={itemsHeadingStyle}><h3 style={sectionTitleStyle}>ITENS DO ORCAMENTO</h3>{kind === "DIRECT" && <button type="button" onClick={addItem} style={secondaryButtonStyle}>+ ADICIONAR ITEM</button>}</div>{items.map((item: QuoteItem, index: number) => <div key={index} style={itemCardStyle}><div style={itemCardHeaderStyle}><strong>ITEM {index + 1}</strong>{items.length > 1 && <button type="button" onClick={() => removeItem(index)} style={removeButtonStyle}>REMOVER</button>}</div><div style={itemGridStyle}><Field label="FICHA TECNICA" value={item.ftNumber} onChange={(value: string) => updateItem(index, "ftNumber", value)} /><Field label="DESCRICAO" value={item.description} onChange={(value: string) => updateItem(index, "description", value)} /><Field label="TIPO DE CAIXA" value={item.boxType} onChange={(value: string) => updateItem(index, "boxType", value)} /><Field label="MATERIAL" value={item.material} onChange={(value: string) => updateItem(index, "material", value)} /><Field label="COMPRIMENTO (MM)" value={String(item.length || "")} onChange={(value: string) => updateItem(index, "length", value)} type="number" /><Field label="LARGURA (MM)" value={String(item.width || "")} onChange={(value: string) => updateItem(index, "width", value)} type="number" /><Field label="ALTURA (MM)" value={String(item.height || "")} onChange={(value: string) => updateItem(index, "height", value)} type="number" /><Field label="AREA (M2)" value={String(item.area || "")} onChange={(value: string) => updateItem(index, "area", value)} type="number" /><Field label="QUALIDADE" value={item.quality} onChange={(value: string) => updateItem(index, "quality", value)} /><Field label="QUANTIDADE" value={String(item.quantity || "")} onChange={(value: string) => updateItem(index, "quantity", value)} type="number" /><Field label="VALOR UNITARIO" value={String(item.unitPrice || "")} onChange={(value: string) => updateItem(index, "unitPrice", value)} type="number" /><Field label="IPI (%)" value={String(item.ipiPercent || "")} onChange={(value: string) => updateItem(index, "ipiPercent", value)} type="number" /></div></div>)}
    <div style={formActionsStyle}><button type="button" onClick={onCancel} style={cancelButtonStyle}>CANCELAR</button><button type="button" onClick={onSave} style={primaryButtonStyle}>GERAR ORCAMENTO E PDF</button></div>
  </section>;
}

function Field({ label, value, onChange, type = "text", lower = false, selectOptions }: { label: string; value: string; onChange: (value: string) => void; type?: string; lower?: boolean; selectOptions?: string[] }) {
  return <label style={labelStyle}>{label}{selectOptions ? <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>{selectOptions.map((option) => <option key={option}>{option}</option>)}</select> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={{ ...inputStyle, textTransform: lower ? "none" : "uppercase" }} />}</label>;
}

function formatCurrency(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function printQuote(quote: QuoteRecord) {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char] ?? char));
  const rows = quote.items.map((item) => `<tr><td>${item.itemNumber}</td><td>${escape(item.ftNumber)}</td><td>${escape(item.description)}</td><td>${escape(item.boxType)}</td><td>${item.length} x ${item.width} x ${item.height} MM</td><td>${item.quantity}</td><td>${formatCurrency(item.unitPrice)}</td><td>${item.ipiPercent.toLocaleString("pt-BR")} %</td><td>${formatCurrency(item.total)}</td></tr>`).join("");
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>${escape(quote.quoteNumber)}</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#141827;margin:0}header{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #e63dae;padding:0 0 18px;margin-bottom:22px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:54px;height:54px}.brand strong{font-size:24px;letter-spacing:3px}.brand span{display:block;color:#6f32d2;font-weight:800;letter-spacing:3px}.meta{text-align:right;font-size:12px;color:#667085;line-height:1.7}.badge{display:inline-block;background:#fce7f3;color:#d60078;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:800;letter-spacing:1px}.block{border:1px solid #f2a5d0;border-radius:12px;padding:15px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-size:12px}.grid strong{display:block;color:#667085;font-size:10px;letter-spacing:1px;margin-bottom:3px}h1{font-size:25px;margin:8px 0}h2{font-size:14px;color:#d60078;letter-spacing:1px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#fce7f3;color:#d60078;text-align:left;padding:9px}td{padding:9px;border-bottom:1px solid #f3d7e7}tfoot td{font-weight:800;text-align:right}.totals{display:flex;justify-content:flex-end;gap:30px;font-size:13px}.total{font-size:18px;color:#009c4b;font-weight:900}footer{margin-top:25px;color:#667085;font-size:11px;white-space:pre-wrap}@media print{button{display:none}}</style></head><body><header><div class="brand"><img src="${location.origin}/logo-xpacebox.png"><div><strong>XPACE</strong><span>BOX</span></div></div><div class="meta"><span class="badge">${escape(quote.kind === "DIRECT" ? "ORCAMENTO DIRETO" : "ORCAMENTO ENGENHARIA")}</span><br><b>${escape(quote.sellerCompanyName)}</b><br>ORCAMENTO ${escape(quote.quoteNumber)} · EMISSAO ${escape(quote.issueDate)}<br>REPRESENTANTE: ${escape(quote.representativeName)}</div></header><section class="block"><h2>DADOS DO CLIENTE</h2><div class="grid"><div><strong>CLIENTE</strong>${escape(quote.clientName)}</div><div><strong>COMPRADOR</strong>${escape(quote.buyerName)}</div><div><strong>CNPJ</strong>${escape(quote.clientCnpj)}</div><div><strong>TELEFONE</strong>${escape(quote.phone)}</div><div><strong>E-MAIL</strong>${escape(quote.email)}</div><div><strong>ENDERECO</strong>${escape(quote.address)}</div></div></section><section class="block"><h2>ITENS DO ORCAMENTO</h2><table><thead><tr><th>#</th><th>FT</th><th>DESCRICAO</th><th>TIPO</th><th>MEDIDAS</th><th>QTD.</th><th>UNITARIO</th><th>IPI</th><th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table></section><section class="block"><div class="grid"><div><strong>CONDICAO DE PAGAMENTO</strong>${escape(quote.paymentTerms)}</div><div><strong>FRETE</strong>${escape(quote.freight)}</div><div><strong>ENTREGA</strong>${escape(quote.deliveryDate)}</div><div><strong>VALIDADE</strong>${escape(quote.validUntil)}</div></div><div class="totals"><span>PRODUTOS: ${formatCurrency(quote.productTotal)}</span><span>IPI: ${formatCurrency(quote.ipiTotal)}</span><span class="total">TOTAL: ${formatCurrency(quote.grandTotal)}</span></div></section><footer><b>OBSERVACOES</b>\n${escape(quote.observations)}</footer><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

const shellStyle = { display: "grid", gap: 22 };
const modeTabsStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, padding: 8, borderRadius: 999, background: "#eef2f7", border: "1px solid rgba(52,64,84,.12)" };
const modeTabStyle = { minHeight: 62, border: "none", borderRadius: 999, background: "transparent", color: "#667085", fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: "pointer" };
const activeModeTabStyle = { color: "#fff", background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)", boxShadow: "0 12px 24px rgba(111,50,210,.24)" };
const panelStyle = { border: "1px solid rgba(255,0,135,.22)", borderRadius: 18, padding: 28, background: "linear-gradient(135deg,rgba(255,0,135,.025),rgba(255,255,255,.9))" };
const panelHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 };
const formPanelStyle = { ...panelStyle, background: "linear-gradient(135deg,rgba(0,180,90,.06),rgba(255,255,255,.96))", borderColor: "rgba(0,156,75,.30)" };
const formHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 };
const eyebrowStyle = { color: "#6f32d2", fontSize: 12, fontWeight: 900, letterSpacing: 3 };
const titleStyle = { margin: "8px 0 0", color: "#141827", fontSize: 27, fontWeight: 900 };
const sectionTitleStyle = { margin: 0, color: "#141827", fontSize: 20, fontWeight: 900 };
const descriptionStyle = { margin: "8px 0 0", color: "#667085", fontSize: 14, fontWeight: 800 };
const primaryButtonStyle = { minHeight: 48, padding: "0 20px", border: "none", borderRadius: 12, color: "#fff", background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 10px 22px rgba(230,61,174,.22)" };
const secondaryButtonStyle = { minHeight: 46, padding: "0 18px", border: "1px solid rgba(111,50,210,.28)", borderRadius: 11, color: "#6f32d2", background: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer" };
const closeButtonStyle = { ...secondaryButtonStyle, color: "#d60078" };
const searchRowStyle = { display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 22 };
const inputStyle = { width: "100%", minHeight: 46, padding: "0 14px", border: "1px solid rgba(52,64,84,.20)", borderRadius: 10, background: "#fff", color: "#141827", fontSize: 14, fontWeight: 800, outline: "none" };
const messageStyle = { marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "rgba(255,189,0,.10)", color: "#9a5b00", fontSize: 13, fontWeight: 900 };
const listHeadingStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 };
const countStyle = { color: "#6f32d2", fontSize: 13, fontWeight: 900 };
const emptyStyle = { padding: 30, textAlign: "center" as const, color: "#667085", fontSize: 15, fontWeight: 800 };
const quoteListStyle = { display: "grid", gap: 10 };
const quoteRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, padding: "18px 20px", border: "1px solid rgba(230,61,174,.18)", borderRadius: 12, background: "rgba(255,255,255,.82)" };
const quoteNumberStyle = { display: "block", color: "#6f32d2", fontSize: 18, fontWeight: 900 };
const quoteClientStyle = { display: "block", marginTop: 4, color: "#141827", fontSize: 16, fontWeight: 900 };
const quoteMetaStyle = { display: "block", marginTop: 5, color: "#667085", fontSize: 12, fontWeight: 800 };
const pdfButtonStyle = { ...primaryButtonStyle, background: "linear-gradient(135deg,#ff8a00,#ff3b25)" };
const lookupGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginBottom: 18 };
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 };
const itemGridStyle = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 };
const labelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 11, fontWeight: 900, letterSpacing: 1 };
const noticeStyle = { marginBottom: 18, padding: "12px 14px", borderRadius: 10, background: "rgba(111,50,210,.06)", color: "#667085", fontSize: 12, fontWeight: 800 };
const itemsHeadingStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "28px 0 14px" };
const itemCardStyle = { padding: 18, border: "1px solid rgba(230,61,174,.20)", borderRadius: 14, background: "rgba(255,255,255,.76)", marginBottom: 12 };
const itemCardHeaderStyle = { display: "flex", justifyContent: "space-between", marginBottom: 14, color: "#d60078", fontSize: 13, fontWeight: 900 };
const removeButtonStyle = { border: "none", background: "transparent", color: "#ff3b25", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const formActionsStyle = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 };
const cancelButtonStyle = { ...secondaryButtonStyle, color: "#667085" };

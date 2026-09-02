"use client";

import { useEffect, useMemo, useState } from "react";

import { createQuote, deleteQuote, loadLinkableCrmOpportunities, loadQuotes, updateQuote } from "@/lib/orcamentos";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { loadClientOptions, loadClients } from "@/lib/clientes";
import { defaultQuoteParametersByCompany } from "@/lib/gerenciador/data";
import type { EngineeringFormula, ProductFicha, QuoteCompanyKey, QuoteParametersByCompany, SpecificMaterial } from "@/types/gerenciador";
import type { ClientRecord, RepresentativeOption } from "@/types/clientes";
import type { PaymentCondition } from "@/types/cadastros-gerais";
import type { CrmOpportunityLinkCandidate, PricingQuotePrefill, QuoteDraft, QuoteItem, QuoteRecord } from "@/types/orcamentos";

const companies = [
  { name: "DAWOS", slug: "dawos" },
  { name: "CARCAT", slug: "carcat" },
  { name: "GTA", slug: "gta" },
];

const today = new Date().toISOString().slice(0, 10);
const closedCrmStages = new Set(["WON", "LOST"]);

function dateAfterDays(days: number, baseDate = today) {
  const date = new Date(`${baseDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCnpj(value: string) {
  return value.replace(/\D/g, "").slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 8) return `(${area}) ${number.slice(0, 4)}${number.length > 4 ? `-${number.slice(4)}` : ""}`;
  return `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`;
}

function resolveCompanyKey(companyName: string): QuoteCompanyKey {
  const normalized = companyName.toLowerCase();
  if (normalized.includes("carcat")) return "carcat";
  if (normalized.includes("gta")) return "gta";
  return "dawos";
}

function resolveValidityDays(companyName: string, parameters: QuoteParametersByCompany) {
  const key = resolveCompanyKey(companyName);
  const value = Number(parameters[key]?.validityDays ?? defaultQuoteParametersByCompany[key].validityDays);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 3;
}

function isPendingQuote(quote: QuoteRecord) {
  return Boolean(quote.crmOpportunityId) && !closedCrmStages.has(quote.crmStage ?? "");
}

function isWonQuote(quote: QuoteRecord) {
  return quote.crmStage === "WON";
}

function isQuoteWithinDateRange(quote: QuoteRecord, from: string, until: string) {
  const issueDate = quote.issueDate.slice(0, 10);
  return (!from || issueDate >= from) && (!until || issueDate <= until);
}

type QuoteFormState = {
  clientName: string;
  buyerName: string;
  phone: string;
  email: string;
  cnpj: string;
  address: string;
  company: string;
  representative: string;
  paymentTerms: string;
  freight: string;
  deliveryDate: string;
  validUntil: string;
  observations: string;
};

function emptyQuoteForm(validityDays = 3): QuoteFormState {
  return { clientName: "", buyerName: "", phone: "", email: "", cnpj: "", address: "", company: "DAWOS", representative: "", paymentTerms: "", freight: "CIF", deliveryDate: "", validUntil: dateAfterDays(validityDays), observations: "" };
}

function emptyItem(): QuoteItem {
  return { itemNumber: 1, ftNumber: "", description: "", length: 0, width: 0, height: 0, area: 0, quality: "", boxType: "", material: "", quantity: 1, unitPrice: 0, ipiPercent: 0, ipiValue: 0, total: 0 };
}

function normalizeFichaNumber(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function findDuplicateFichaNumber(items: QuoteItem[]) {
  const seen = new Set<string>();
  for (const item of items) {
    const ftNumber = normalizeFichaNumber(item.ftNumber);
    if (!ftNumber) continue;
    if (seen.has(ftNumber)) return ftNumber;
    seen.add(ftNumber);
  }
  return "";
}

function resolveFichaArea(ficha: ProductFicha) {
  const configuredArea = Number(ficha.areaM2);
  if (Number.isFinite(configuredArea) && configuredArea > 0) return configuredArea;

  const currentArea = Number(ficha.pricingData?.areaM2);
  if (Number.isFinite(currentArea) && currentArea > 0) return currentArea;

  const historicalArea = [...(ficha.priceHistory ?? [])]
    .reverse()
    .map((snapshot) => Number(snapshot.areaM2))
    .find((area) => Number.isFinite(area) && area > 0);

  return historicalArea ?? 0;
}

function resolveFichaQuantity(ficha: ProductFicha) {
  const currentQuantity = Number(ficha.pricingData?.quantity);
  if (Number.isFinite(currentQuantity) && currentQuantity > 0) return Math.trunc(currentQuantity);

  const historicalQuantity = [...(ficha.priceHistory ?? [])]
    .reverse()
    .map((snapshot) => Number(snapshot.quantity))
    .find((quantity) => Number.isFinite(quantity) && quantity > 0);

  return historicalQuantity ? Math.trunc(historicalQuantity) : 1;
}

export default function FinanceiroEmpresa({
  companySlug,
  productFichas,
  materials,
  engineeringFormulas,
  prefill,
  quoteParameters,
  paymentConditions,
}: {
  companySlug: string;
  productFichas: ProductFicha[];
  materials: SpecificMaterial[];
  engineeringFormulas: EngineeringFormula[];
  prefill?: PricingQuotePrefill | null;
  quoteParameters: QuoteParametersByCompany;
  paymentConditions: PaymentCondition[];
}) {
  const [kind, setKind] = useState<"DIRECT" | "ENGINEERING">("DIRECT");
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteListTab, setQuoteListTab] = useState<"PENDING" | "WON" | "ALL">("PENDING");
  const [quoteDateFrom, setQuoteDateFrom] = useState("");
  const [quoteDateUntil, setQuoteDateUntil] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [representatives, setRepresentatives] = useState<RepresentativeOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedFichaId, setSelectedFichaId] = useState("");
  const [editingQuoteId, setEditingQuoteId] = useState("");
  const [form, setForm] = useState<QuoteFormState>(() => emptyQuoteForm(resolveValidityDays("DAWOS", quoteParameters)));
  const [pendingQuoteDraft, setPendingQuoteDraft] = useState<QuoteDraft | null>(null);
  const [linkableOpportunities, setLinkableOpportunities] = useState<CrmOpportunityLinkCandidate[]>([]);

  useEffect(() => {
    Promise.all([loadClients(companySlug), loadClientOptions(companySlug)])
      .then(([records, options]) => {
        setClients(records);
        setRepresentatives(options.representatives);
      })
      .catch(() => {
        setClients([]);
        setRepresentatives([]);
      });
    refreshQuotes("DIRECT");
  }, [companySlug]);

  useEffect(() => {
    const validityDays = resolveValidityDays(form.company, quoteParameters);
    const calculatedValidity = dateAfterDays(validityDays);
    setForm((current) => current.validUntil === calculatedValidity ? current : { ...current, validUntil: calculatedValidity });
  }, [form.company, quoteParameters]);

  useEffect(() => {
    if (!prefill) return;

    setKind(prefill.kind);
    setShowForm(true);
    setItems(prefill.items);
    setSelectedClientId(prefill.clientId ?? "");
    setSelectedFichaId(prefill.fichaId ?? "");
    setForm((current) => ({
      ...current,
      clientName: prefill.clientName ?? "",
      buyerName: prefill.buyerName ?? "",
      phone: formatPhone(prefill.phone ?? ""),
      email: prefill.email ?? "",
      cnpj: formatCnpj(prefill.clientCnpj ?? ""),
      address: prefill.address ?? "",
      company: prefill.sellerCompanyName,
      representative: prefill.representativeName ?? current.representative,
    }));
    setMessage("ITEM RECEBIDO DA FORMACAO DE PRECO. ADICIONE OUTROS ITENS OU GERE O ORCAMENTO.");
    void refreshQuotes(prefill.kind, "");
  }, [prefill, companySlug]);

  const selectedClient = clients.find((client) => client.id === selectedClientId);
  const clientFichas = useMemo(() => productFichas.filter((ficha) => ficha.clientId === selectedClientId), [productFichas, selectedClientId]);
  const selectedFicha = productFichas.find((ficha) => ficha.id === selectedFichaId);
  const pendingQuotes = useMemo(() => quotes.filter(isPendingQuote), [quotes]);
  const wonQuotes = useMemo(() => quotes.filter(isWonQuote), [quotes]);
  const selectedQuoteList = quoteListTab === "PENDING" ? pendingQuotes : quoteListTab === "WON" ? wonQuotes : quotes;
  const visibleQuotes = useMemo(
    () => selectedQuoteList.filter((quote) => isQuoteWithinDateRange(quote, quoteDateFrom, quoteDateUntil)),
    [selectedQuoteList, quoteDateFrom, quoteDateUntil],
  );

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
    setEditingQuoteId("");
    setPendingQuoteDraft(null);
    setLinkableOpportunities([]);
    setMessage("");
    void refreshQuotes(nextKind, "");
  }

  function startCreate() {
    setShowForm(true);
    setEditingQuoteId("");
    setItems([emptyItem()]);
    setSelectedClientId("");
    setSelectedFichaId("");
    setForm(emptyQuoteForm(resolveValidityDays("DAWOS", quoteParameters)));
    setPendingQuoteDraft(null);
    setLinkableOpportunities([]);
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
    const fichaAlreadyAdded = items.some((item) => normalizeFichaNumber(item.ftNumber) === normalizeFichaNumber(ficha.ftNumber));
    if (fichaAlreadyAdded) {
      setSelectedFichaId("");
      setMessage(`A FICHA TECNICA ${ficha.ftNumber} JA ESTA NESTE ORCAMENTO.`);
      return;
    }
    const material = materials.find((item) => item.id === ficha.materialId);
    const formula = engineeringFormulas.find((item) => item.id === ficha.engineeringId);
    const nextItem = { ...emptyItem(), ftNumber: ficha.ftNumber, description: ficha.reference, length: ficha.length, width: ficha.width, height: ficha.height, area: resolveFichaArea(ficha), quality: material?.paperType || ficha.supplierQuality, boxType: formula?.description || "", material: material?.code || "", quantity: resolveFichaQuantity(ficha), unitPrice: ficha.price, snapshot: { fichaId: ficha.id, revision: ficha.revision, company: ficha.company, engineeringId: ficha.engineeringId, paperType: material?.paperType || "" } };
    setItems((current) => {
      const hasFilledItem = current.some((item) => item.description.trim() || item.ftNumber.trim());
      const next = hasFilledItem ? [...current, nextItem] : [nextItem];
      return next.map((item, index) => ({ ...item, itemNumber: index + 1 }));
    });
    setSelectedFichaId("");
    updateForm("company", ficha.company);
  }

  async function saveQuote() {
    if (!form.clientName.trim() || !items.some((item) => item.description.trim())) {
      setMessage("PREENCHA O CLIENTE E A DESCRICAO DE PELO MENOS UM ITEM.");
      return;
    }
    const duplicateFichaNumber = findDuplicateFichaNumber(items);
    if (duplicateFichaNumber) {
      setMessage(`A FICHA TECNICA ${duplicateFichaNumber} ESTA REPETIDA. REMOVA O ITEM DUPLICADO PARA GERAR O ORCAMENTO.`);
      return;
    }
    try {
      const appliesIpi = resolveCompanyKey(form.company) === "gta";
      const normalizedItems = items.filter((item) => item.description.trim()).map((item, index) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const ipiPercent = appliesIpi ? Number(item.ipiPercent || 0) : 0;
        const productTotal = quantity * unitPrice;
        const ipiValue = productTotal * ipiPercent / 100;
        return { ...item, itemNumber: index + 1, quantity, unitPrice, ipiPercent, ipiValue, total: productTotal + ipiValue };
      });
      const draft: QuoteDraft = {
        kind,
        recipient: "CLIENT",
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
        items: normalizedItems,
      };
      if (!editingQuoteId && selectedClientId) {
        const opportunities = await loadLinkableCrmOpportunities(companySlug, selectedClientId);
        if (opportunities.length) {
          setPendingQuoteDraft(draft);
          setLinkableOpportunities(opportunities);
          return;
        }
      }
      await persistQuote(draft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL GERAR O ORCAMENTO.");
    }
  }

  async function persistQuote(draft: QuoteDraft) {
    const editing = Boolean(editingQuoteId);
    try {
      const quote = editing
        ? await updateQuote(companySlug, editingQuoteId, draft)
        : await createQuote(companySlug, draft);
      setShowForm(false);
      setEditingQuoteId("");
      setPendingQuoteDraft(null);
      setLinkableOpportunities([]);
      setMessage(`ORCAMENTO ${quote.quoteNumber} ${editing ? "ATUALIZADO" : "GERADO"} COM SUCESSO.`);
      await refreshQuotes();
      printQuote(quote, quoteParameters);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL GERAR O ORCAMENTO.");
    }
  }

  async function linkPendingQuote(opportunityId?: string) {
    if (!pendingQuoteDraft) return;
    await persistQuote({ ...pendingQuoteDraft, ...(opportunityId ? { crmOpportunityId: opportunityId } : {}) });
  }

  function editQuote(quote: QuoteRecord) {
    setKind(quote.kind);
    setShowForm(true);
    setEditingQuoteId(quote.id);
    setSelectedClientId(quote.clientId || "");
    setSelectedFichaId("");
    setItems(quote.items.length ? quote.items.map((item, index) => ({ ...item, itemNumber: index + 1 })) : [emptyItem()]);
    setForm({
      clientName: quote.clientName,
      buyerName: quote.buyerName,
      phone: formatPhone(quote.phone),
      email: quote.email,
      cnpj: formatCnpj(quote.clientCnpj),
      address: quote.address,
      company: quote.sellerCompanyName,
      representative: quote.representativeName,
      paymentTerms: quote.paymentTerms,
      freight: quote.freight,
      deliveryDate: quote.deliveryDate,
      validUntil: quote.validUntil,
      observations: quote.observations,
    });
    setMessage(`EDITANDO ORCAMENTO ${quote.quoteNumber}.`);
  }

  async function removeQuote(quote: QuoteRecord) {
    if (!window.confirm(`EXCLUIR O ORCAMENTO ${quote.quoteNumber}?`)) return;
    try {
      await deleteQuote(companySlug, quote.id);
      setMessage(`ORCAMENTO ${quote.quoteNumber} EXCLUIDO.`);
      await refreshQuotes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "NAO FOI POSSIVEL EXCLUIR O ORCAMENTO.");
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

      {showForm && <><QuoteForm kind={kind} editing={Boolean(editingQuoteId)} form={form} items={items} clients={clients} representatives={representatives} paymentConditions={paymentConditions} clientFichas={clientFichas} selectedClientId={selectedClientId} selectedFichaId={selectedFichaId} selectedClient={selectedClient} selectedFicha={selectedFicha} updateForm={updateForm} updateItem={updateItem} selectClient={selectClient} selectFicha={selectFicha} addItem={() => setItems((current) => [...current, { ...emptyItem(), itemNumber: current.length + 1 }])} removeItem={(index: number) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, itemNumber: itemIndex + 1 })))} onCancel={() => { setShowForm(false); setEditingQuoteId(""); setPendingQuoteDraft(null); setLinkableOpportunities([]); }} onSave={saveQuote} />
        {pendingQuoteDraft && <section style={opportunityLinkPanelStyle}>
          <div><span style={eyebrowStyle}>OPORTUNIDADE EM ABERTO</span><h3 style={opportunityLinkTitleStyle}>VINCULAR ESTE ORCAMENTO?</h3><p style={opportunityLinkDescriptionStyle}>ESCOLHA UMA OPORTUNIDADE PARA MANTER A MESMA AGENDA OU CRIE UMA NOVA NEGOCIACAO.</p></div>
          <div style={opportunityLinkListStyle}>{linkableOpportunities.map((opportunity) => <article key={opportunity.id} style={opportunityLinkItemStyle}><div style={opportunityLinkDetailsStyle}><strong>{opportunity.title}</strong><span>{opportunity.productReference || "PRODUTO NAO INFORMADO"}</span><small>{formatCurrency(opportunity.estimatedValue)} · {formatOpportunityStage(opportunity.stage)}</small></div><button type="button" onClick={() => linkPendingQuote(opportunity.id)} style={secondaryButtonStyle}>VINCULAR</button></article>)}</div>
          <div style={opportunityLinkActionsStyle}><button type="button" onClick={() => { setPendingQuoteDraft(null); setLinkableOpportunities([]); }} style={cancelButtonStyle}>VOLTAR</button><button type="button" onClick={() => linkPendingQuote()} style={primaryButtonStyle}>CRIAR NOVA OPORTUNIDADE</button></div>
        </section>}</>}

      <section style={panelStyle}>
        <div style={quoteListToolbarStyle}>
          <div style={quoteListTabsStyle}>
            <button type="button" onClick={() => setQuoteListTab("PENDING")} style={{ ...quoteListTabStyle, ...(quoteListTab === "PENDING" ? activeQuoteListTabStyle : {}) }}>PENDENTES ({pendingQuotes.length})</button>
            <button type="button" onClick={() => setQuoteListTab("WON")} style={{ ...quoteListTabStyle, ...(quoteListTab === "WON" ? activeQuoteListTabStyle : {}) }}>GANHOS ({wonQuotes.length})</button>
            <button type="button" onClick={() => setQuoteListTab("ALL")} style={{ ...quoteListTabStyle, ...(quoteListTab === "ALL" ? activeQuoteListTabStyle : {}) }}>TODOS OS ORCAMENTOS ({quotes.length})</button>
          </div>
          <div style={quoteDateFilterStyle}>
            <label style={quoteDateFilterLabelStyle}>DE<input type="date" value={quoteDateFrom} onChange={(event) => setQuoteDateFrom(event.target.value)} style={quoteDateInputStyle} /></label>
            <label style={quoteDateFilterLabelStyle}>ATE<input type="date" value={quoteDateUntil} onChange={(event) => setQuoteDateUntil(event.target.value)} style={quoteDateInputStyle} /></label>
            {(quoteDateFrom || quoteDateUntil) && <button type="button" onClick={() => { setQuoteDateFrom(""); setQuoteDateUntil(""); }} style={quoteDateClearButtonStyle} title="LIMPAR FILTRO DE DATA" aria-label="LIMPAR FILTRO DE DATA">X</button>}
          </div>
        </div>
        <div style={listHeadingStyle}>
          <h2 style={sectionTitleStyle}>{quoteListTab === "PENDING" ? "ORCAMENTOS PENDENTES" : quoteListTab === "WON" ? "ORCAMENTOS GANHOS" : "ORCAMENTOS SALVOS"}</h2>
          <span style={countStyle}>{visibleQuotes.length} REGISTRO(S)</span>
        </div>
        {visibleQuotes.length === 0 ? <div style={emptyStyle}>{quoteListTab === "PENDING" ? "NENHUM ORCAMENTO PENDENTE." : quoteListTab === "WON" ? "NENHUM ORCAMENTO GANHO." : "NENHUM ORCAMENTO ENCONTRADO."}</div> : <div style={quoteListStyle}>{visibleQuotes.map((quote) => <article key={quote.id} style={quoteRowStyle}><div><strong style={quoteNumberStyle}>{quote.quoteNumber}</strong><span style={quoteClientStyle}>{quote.clientName}</span><small style={quoteMetaStyle}>{quote.issueDate} · {quote.items.length} ITEM(NS) · {formatCurrency(quote.grandTotal)}</small></div><div style={quoteActionsStyle}><button type="button" onClick={() => editQuote(quote)} style={secondaryButtonStyle}>EDITAR</button><button type="button" onClick={() => printQuote(quote, quoteParameters)} style={pdfButtonStyle}>GERAR PDF</button><button type="button" onClick={() => removeQuote(quote)} style={deleteButtonStyle}>EXCLUIR</button></div></article>)}</div>}
      </section>
    </section>
  );
}

function QuoteForm({ kind, editing, form, items, clients, representatives, paymentConditions, clientFichas, selectedClientId, selectedFichaId, selectedClient, selectedFicha, updateForm, updateItem, selectClient, selectFicha, addItem, removeItem, onCancel, onSave }: any) {
  const appliesIpi = resolveCompanyKey(form.company) === "gta";
  const [additionalFichaId, setAdditionalFichaId] = useState("");
  return <section style={formPanelStyle}><div style={formHeaderStyle}><div><span style={eyebrowStyle}>{kind === "DIRECT" ? "ORCAMENTO DIRETO" : "ORCAMENTO DE ENGENHARIA"}</span><h2 style={titleStyle}>MONTAR ORCAMENTO</h2></div><button type="button" onClick={onCancel} style={closeButtonStyle}>FECHAR</button></div>
    {kind === "ENGINEERING" ? <div style={lookupGridStyle}><label style={labelStyle}>CLIENTE<select value={selectedClientId} onChange={(event) => selectClient(event.target.value)} style={inputStyle}><option value="">SELECIONE O CLIENTE</option>{clients.map((client: ClientRecord) => <option key={client.id} value={client.id}>{client.tradeName || client.legalName} · {client.cnpj}</option>)}</select></label><label style={labelStyle}>FICHA TECNICA<select value={selectedFichaId} onChange={(event) => selectFicha(event.target.value)} style={inputStyle}><option value="">SELECIONE O PRODUTO</option>{clientFichas.map((ficha: ProductFicha) => <option key={ficha.id} value={ficha.id}>{ficha.ftNumber} · {ficha.reference}</option>)}</select></label></div> : <div style={noticeStyle}>NO ORCAMENTO DIRETO, OS DADOS DO CLIENTE E DO ITEM SAO PREENCHIDOS MANUALMENTE.</div>}
    <div style={formGridStyle}><Field label="NOME DO CLIENTE" value={form.clientName} onChange={(value: string) => updateForm("clientName", value)} /><Field label="COMPRADOR" value={form.buyerName} onChange={(value: string) => updateForm("buyerName", value)} /><Field label="TELEFONE" value={form.phone} onChange={(value: string) => updateForm("phone", formatPhone(value))} /><Field label="E-MAIL" value={form.email} onChange={(value: string) => updateForm("email", value.toLowerCase())} lower /><Field label="CNPJ" value={form.cnpj} onChange={(value: string) => updateForm("cnpj", formatCnpj(value))} /><Field label="EMPRESA VENDEDORA" value={form.company} onChange={(value: string) => updateForm("company", value)} /><Field label="REPRESENTANTE" value={form.representative} onChange={(value: string) => updateForm("representative", value)} options={representatives.map((item: RepresentativeOption) => ({ value: item.name, label: item.name }))} placeholder="SELECIONE O REPRESENTANTE" /><Field label="CONDICAO DE PAGAMENTO" value={form.paymentTerms} onChange={(value: string) => updateForm("paymentTerms", value)} options={paymentConditions.map((item: PaymentCondition) => ({ value: item.name, label: item.name }))} placeholder="SELECIONE A CONDICAO" /><Field label="FRETE" value={form.freight} onChange={(value: string) => updateForm("freight", value)} options={[{ value: "CIF", label: "CIF - REMETENTE" }, { value: "FOB", label: "FOB - RETIRADA / DESTINATARIO" }, { value: "SEM_FRETE", label: "SEM FRETE" }]} /><Field label="DATA DE ENTREGA" value={form.deliveryDate} onChange={(value: string) => updateForm("deliveryDate", value)} type="date" /><Field label="VALIDADE DO ORCAMENTO (AUTOMATICA)" value={form.validUntil} onChange={() => undefined} type="date" readOnly /><label style={{ ...labelStyle, gridColumn: "1 / -1" }}>ENDERECO<input value={form.address} onChange={(event) => updateForm("address", event.target.value)} style={inputStyle} /></label><label style={{ ...labelStyle, gridColumn: "1 / -1" }}>OBSERVACOES<textarea value={form.observations} onChange={(event) => updateForm("observations", event.target.value)} style={{ ...inputStyle, minHeight: 84, resize: "vertical" }} /></label></div>
    <div style={itemsHeadingStyle}><h3 style={sectionTitleStyle}>ITENS DO ORCAMENTO</h3><div style={itemActionsStyle}>{kind === "ENGINEERING" ? <select aria-label="PUXAR PRODUTO CADASTRADO" value={additionalFichaId} onChange={(event) => { const fichaId = event.target.value; setAdditionalFichaId(""); if (fichaId) selectFicha(fichaId); }} disabled={!selectedClientId || !clientFichas.length} style={additionalItemSelectStyle}><option value="">+ PUXAR PRODUTO CADASTRADO</option>{clientFichas.map((ficha: ProductFicha) => <option key={ficha.id} value={ficha.id}>{ficha.ftNumber} · {ficha.reference}</option>)}</select> : null}<button type="button" onClick={addItem} style={secondaryButtonStyle}>+ ITEM MANUAL</button></div></div>{items.map((item: QuoteItem, index: number) => <div key={index} style={itemCardStyle}><div style={itemCardHeaderStyle}><strong>ITEM {index + 1}</strong>{items.length > 1 && <button type="button" onClick={() => removeItem(index)} style={removeButtonStyle}>REMOVER</button>}</div><div style={itemGridStyle}><Field label="FICHA TECNICA" value={item.ftNumber} onChange={(value: string) => updateItem(index, "ftNumber", value)} /><Field label="DESCRICAO" value={item.description} onChange={(value: string) => updateItem(index, "description", value)} /><Field label="TIPO DE CAIXA" value={item.boxType} onChange={(value: string) => updateItem(index, "boxType", value)} /><Field label="MATERIAL" value={item.material} onChange={(value: string) => updateItem(index, "material", value)} /><Field label="COMPRIMENTO (MM)" value={String(item.length || "")} onChange={(value: string) => updateItem(index, "length", value)} type="number" /><Field label="LARGURA (MM)" value={String(item.width || "")} onChange={(value: string) => updateItem(index, "width", value)} type="number" /><Field label="ALTURA (MM)" value={String(item.height || "")} onChange={(value: string) => updateItem(index, "height", value)} type="number" /><Field label="AREA (M2)" value={String(item.area || "")} onChange={(value: string) => updateItem(index, "area", value)} type="number" /><Field label="QUALIDADE" value={item.quality} onChange={(value: string) => updateItem(index, "quality", value)} /><Field label="QUANTIDADE" value={String(item.quantity || "")} onChange={(value: string) => updateItem(index, "quantity", value)} type="number" /><Field label="VALOR UNITARIO" value={String(item.unitPrice || "")} onChange={(value: string) => updateItem(index, "unitPrice", value)} currency /><Field label="IPI (%)" value={String(appliesIpi ? item.ipiPercent || "" : 0)} onChange={(value: string) => updateItem(index, "ipiPercent", value)} type="number" readOnly={!appliesIpi} /></div></div>)}
    <div style={formActionsStyle}><button type="button" onClick={onCancel} style={cancelButtonStyle}>CANCELAR</button><button type="button" onClick={onSave} style={primaryButtonStyle}>{editing ? "SALVAR ALTERACOES E PDF" : "GERAR ORCAMENTO E PDF"}</button></div>
  </section>;
}

function Field({ label, value, onChange, type = "text", lower = false, options, placeholder, readOnly = false, currency = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; lower?: boolean; options?: Array<{ value: string; label: string }>; placeholder?: string; readOnly?: boolean; currency?: boolean }) {
  return <label style={labelStyle}>{label}{options ? <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}><option value="">{placeholder ?? "SELECIONE"}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : currency ? <CurrencyInput value={value} onValueChange={(nextValue) => onChange(nextValue === null ? "" : String(nextValue))} readOnly={readOnly} style={inputStyle} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} style={{ ...inputStyle, textTransform: lower ? "none" : "uppercase", ...(readOnly ? { background: "#f2f4f7", color: "#667085", cursor: "default" } : {}) }} />}</label>;
}

function formatCurrency(value: number) { return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatOpportunityStage(value: string) { return ({ CONTACT_PENDING: "CONTATO PENDENTE", CONTACTED: "CONTATADO", QUOTE_PREPARATION: "ORCAMENTO EM PREPARACAO", QUOTE_SENT: "ORCAMENTO ENVIADO", NEGOTIATION: "NEGOCIACAO" } as Record<string, string>)[value] || value; }

function resolveQuoteCompanyKey(quote: QuoteRecord): QuoteCompanyKey {
  const company = `${quote.sellerCompanySlug} ${quote.sellerCompanyName}`.toLowerCase();
  if (company.includes("carcat")) return "carcat";
  if (company.includes("gta")) return "gta";
  return "dawos";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function validityDaysBetween(issueDate: string, validUntil: string, fallback: number) {
  const issue = new Date(`${issueDate}T12:00:00`);
  const validity = new Date(`${validUntil}T12:00:00`);
  const difference = Math.round((validity.getTime() - issue.getTime()) / 86_400_000);
  return Number.isFinite(difference) && difference >= 0 ? difference : fallback;
}

function printQuote(quote: QuoteRecord, quoteParameters: QuoteParametersByCompany) {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char] ?? char));
  const companyKey = resolveQuoteCompanyKey(quote);
  const seller = { ...defaultQuoteParametersByCompany[companyKey], ...(quoteParameters[companyKey] ?? {}) };
  const isDirect = quote.kind === "DIRECT";
  const appliesIpi = companyKey === "gta";
  const logoSource = seller.logo
    ? seller.logo.startsWith("data:") || seller.logo.startsWith("http")
      ? seller.logo
      : `${location.origin}${seller.logo.startsWith("/") ? "" : "/"}${seller.logo}`
    : "";
  const logo = logoSource
    ? `<img class="company-logo" src="${escape(logoSource)}" alt="${escape(seller.name)}">`
    : `<div class="logo-fallback">${escape(companyKey.toUpperCase())}</div>`;
  const printableItems = quote.items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const ipiPercent = appliesIpi ? Number(item.ipiPercent || 0) : 0;
    const productTotal = quantity * unitPrice;
    const ipiValue = productTotal * ipiPercent / 100;
    return { ...item, quantity, unitPrice, ipiPercent, ipiValue, total: productTotal + ipiValue };
  });
  const printableProductTotal = printableItems.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const printableIpiTotal = printableItems.reduce((total, item) => total + item.ipiValue, 0);
  const printableGrandTotal = printableProductTotal + printableIpiTotal;
  const rows = printableItems.map((item, index) => {
    const ftNumber = isDirect ? "OD" : item.ftNumber || "FT";
    const dimensions = `${item.length || 0} x ${item.width || 0} x ${item.height || 0} MM`;
    const snapshotPaperType = typeof item.snapshot?.paperType === "string" ? item.snapshot.paperType : "";
    return `<tr>
      <td class="center">${index + 1}</td>
      <td class="center strong">${escape(ftNumber)}</td>
      <td class="center">${escape(item.description)}</td>
      <td class="center">${escape(dimensions)}</td>
      <td class="center">${Number(item.area || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 4 })}</td>
      <td class="center">${escape(snapshotPaperType || item.quality || item.material || "-")}</td>
      <td class="center">${escape(item.boxType || "-")}</td>
      <td class="number">${Number(item.quantity || 0).toLocaleString("pt-BR")}</td>
      <td class="number">${formatCurrency(item.unitPrice)}</td>
      <td class="number">${Number(item.ipiPercent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%</td>
      <td class="number strong">${formatCurrency(item.total)}</td>
    </tr>`;
  }).join("");
  const freight = quote.freight || (isDirect ? "CIF" : "-");
  const deliveryAddress = isDirect ? "NAO SE APLICA" : quote.address || "-";
  const deliveryDate = quote.deliveryDate ? formatDate(quote.deliveryDate) : "PERANTE CONFIRMACAO";
  const configuredValidityDays = Number(seller.validityDays) > 0 ? Math.round(Number(seller.validityDays)) : 3;
  const validityDays = quote.validUntil ? validityDaysBetween(quote.issueDate, quote.validUntil, configuredValidityDays) : configuredValidityDays;
  const validity = quote.validUntil ? `${validityDays} DIAS - ATE ${formatDate(quote.validUntil)}` : `${validityDays} DIAS`;
  const popup = window.open("", "_blank", "width=1280,height=900");
  if (!popup) return;
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escape(quote.quoteNumber)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 22px; background: #edf1f6; color: #172033; font-family: Arial, sans-serif; }
    .document { width: min(277mm, calc(100vw - 44px)); min-height: 185mm; margin: 0 auto; padding: 10mm; background: #fff; border-radius: 12px; box-shadow: 0 18px 48px rgba(20,24,39,.14); }
    .header { display: grid; grid-template-columns: 27% 45% 28%; min-height: 92px; border: 1px solid #d8dee9; border-radius: 10px; overflow: hidden; }
    .logo-box { display: grid; place-items: center; padding: 12px 18px; border-right: 1px solid #d8dee9; }
    .company-logo { display: block; max-width: 100%; max-height: 72px; object-fit: contain; }
    .logo-fallback { color: #6f32d2; font-size: 28px; font-weight: 900; letter-spacing: 2px; }
    .seller { display: grid; align-content: center; justify-items: center; padding: 12px 20px; text-align: center; }
    .seller h1 { margin: 0 0 6px; color: #172033; font-size: 20px; letter-spacing: .8px; }
    .seller p { margin: 2px 0; color: #596579; font-size: 9.5px; font-weight: 700; line-height: 1.25; }
    .quote-meta { display: grid; align-content: center; justify-items: center; padding: 12px 18px; border-left: 1px solid #d8dee9; background: #faf7ff; text-align: center; }
    .badge { width: fit-content; margin-bottom: 8px; padding: 5px 10px; border-radius: 999px; background: #fce7f3; color: #d60078; font-size: 9px; font-weight: 900; letter-spacing: .8px; }
    .quote-meta strong { font-size: 16px; }
    .quote-meta span { margin-top: 4px; color: #596579; font-size: 9.5px; font-weight: 700; }
    .client-strip { display: grid; grid-template-columns: 2fr 1fr; margin-top: 10px; border: 1px solid #d8dee9; border-radius: 10px; overflow: hidden; }
    .client-data, .commercial-data { padding: 12px 15px; }
    .commercial-data { border-left: 1px solid #d8dee9; background: #fbfcfe; }
    .section-title { margin: 0 0 9px; color: #d60078; font-size: 10px; font-weight: 900; letter-spacing: 1px; }
    .data-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px 14px; }
    .commercial-data .data-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .datum label { display: block; margin-bottom: 2px; color: #778195; font-size: 7.5px; font-weight: 900; letter-spacing: .65px; }
    .datum span { display: block; color: #172033; font-size: 9.5px; font-weight: 800; line-height: 1.25; }
    .items { margin-top: 10px; border: 1px solid #d8dee9; border-radius: 10px; overflow: hidden; }
    .items-title { padding: 9px 12px; background: linear-gradient(90deg,#fdf1f8,#f7f3ff); color: #d60078; font-size: 10px; font-weight: 900; letter-spacing: 1px; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 8px; }
    th { padding: 7px 5px; background: #172033; color: #fff; font-size: 7px; letter-spacing: .35px; text-align: center; vertical-align: middle; }
    td { padding: 7px 5px; border-bottom: 1px solid #e5e9f0; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
    tr:last-child td { border-bottom: 0; }
    th:nth-child(1) { width: 3%; } th:nth-child(2) { width: 6%; } th:nth-child(3) { width: 18%; }
    th:nth-child(4) { width: 12%; } th:nth-child(5) { width: 6%; } th:nth-child(6) { width: 8%; }
    th:nth-child(7) { width: 11%; } th:nth-child(8) { width: 8%; } th:nth-child(9) { width: 9%; }
    th:nth-child(10) { width: 6%; } th:nth-child(11) { width: 13%; }
    .center { text-align: center; } .number { text-align: center; white-space: nowrap; } .strong { font-weight: 900; }
    .summary { display: grid; grid-template-columns: 1fr 310px; gap: 10px; margin-top: 10px; }
    .notes, .totals { border: 1px solid #d8dee9; border-radius: 10px; padding: 12px 15px; }
    .notes { min-height: 72px; }
    .notes p { margin: 0; color: #445066; font-size: 9px; line-height: 1.45; white-space: pre-wrap; }
    .total-row { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 4px 0; color: #445066; font-size: 9.5px; font-weight: 800; }
    .total-row.grand { margin-top: 4px; padding-top: 8px; border-top: 1px solid #e1e5ec; color: #009c4b; font-size: 15px; font-weight: 900; }
    .terms { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px; margin-top: 10px; }
    .term { min-height: 52px; padding: 9px 10px; border: 1px solid #d8dee9; border-radius: 9px; background: #fbfcfe; }
    .term label { display: block; margin-bottom: 4px; color: #778195; font-size: 7px; font-weight: 900; letter-spacing: .6px; }
    .term span { display: block; color: #172033; font-size: 8.5px; font-weight: 800; line-height: 1.25; }
    .footer { display: grid; grid-template-columns: 1fr 290px; gap: 18px; margin-top: 10px; padding: 11px 14px; border-radius: 9px; background: #f7f9fc; color: #596579; font-size: 8px; line-height: 1.45; }
    .signature { align-self: end; padding-top: 18px; border-top: 1px solid #778195; text-align: center; font-weight: 900; }
    @media print {
      body { padding: 0; background: #fff; }
      .document { width: auto; min-height: 0; margin: 0; padding: 0; border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <main class="document">
    <header class="header">
      <div class="logo-box">${logo}</div>
      <div class="seller">
        <h1>${escape(seller.name || quote.sellerCompanyName)}</h1>
        <p>${escape(seller.address || "ENDERECO A CADASTRAR")}</p>
        <p>${escape([seller.phone, seller.email].filter(Boolean).join(" · ") || "CONTATOS A CADASTRAR")}</p>
        <p>${escape(seller.site || "")}</p>
      </div>
      <div class="quote-meta">
        <span class="badge">${escape(isDirect ? "ORCAMENTO DIRETO" : "ORCAMENTO ENGENHARIA")}</span>
        <strong>${escape(quote.quoteNumber)}</strong>
        <span>EMISSAO: ${escape(formatDate(quote.issueDate))}</span>
        <span>REPRESENTANTE: ${escape(quote.representativeName || "-")}</span>
      </div>
    </header>

    <section class="client-strip">
      <div class="client-data">
        <h2 class="section-title">DADOS DO CLIENTE</h2>
        <div class="data-grid">
          <div class="datum"><label>CLIENTE</label><span>${escape(quote.clientName || "-")}</span></div>
          <div class="datum"><label>CNPJ</label><span>${escape(quote.clientCnpj || "-")}</span></div>
          <div class="datum"><label>COMPRADOR</label><span>${escape(quote.buyerName || "-")}</span></div>
          <div class="datum"><label>E-MAIL</label><span>${escape(quote.email || "-")}</span></div>
          <div class="datum"><label>TELEFONE</label><span>${escape(quote.phone || "-")}</span></div>
          <div class="datum"><label>ENDERECO</label><span>${escape(isDirect ? "NAO INFORMADO" : quote.address || "-")}</span></div>
        </div>
      </div>
      <div class="commercial-data">
        <h2 class="section-title">DADOS DO ORCAMENTO</h2>
        <div class="data-grid">
          <div class="datum"><label>NUMERO</label><span>${escape(quote.quoteNumber)}</span></div>
          <div class="datum"><label>EMISSAO</label><span>${escape(formatDate(quote.issueDate))}</span></div>
          <div class="datum"><label>EMPRESA</label><span>${escape(seller.name || quote.sellerCompanyName)}</span></div>
          <div class="datum"><label>REPRESENTANTE</label><span>${escape(quote.representativeName || "-")}</span></div>
        </div>
      </div>
    </section>

    <section class="items">
      <div class="items-title">ITENS DO ORCAMENTO</div>
      <table>
        <thead><tr><th>IT.</th><th>F.T.</th><th>DESCRICAO</th><th>MEDIDAS</th><th>AREA M2</th><th>QUALIDADE</th><th>ESTRUTURA</th><th>QTDE.</th><th>VL. UNIT.</th><th>IPI</th><th>VL. TOTAL</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>

    <section class="summary">
      <div class="notes"><h2 class="section-title">OBSERVACOES</h2><p>${escape(quote.observations || "SEM OBSERVACOES.")}</p></div>
      <div class="totals">
        <div class="total-row"><span>TOTAL DOS PRODUTOS</span><strong>${formatCurrency(printableProductTotal)}</strong></div>
        <div class="total-row"><span>TOTAL DO IPI</span><strong>${formatCurrency(printableIpiTotal)}</strong></div>
        <div class="total-row grand"><span>TOTAL DO ORCAMENTO</span><strong>${formatCurrency(printableGrandTotal)}</strong></div>
      </div>
    </section>

    <section class="terms">
      <div class="term"><label>FRETE</label><span>${escape(freight)}</span></div>
      <div class="term"><label>ENTREGA EM</label><span>${escape(deliveryAddress)}</span></div>
      <div class="term"><label>CONDICAO DE PAGAMENTO</label><span>${escape(quote.paymentTerms || "-")}</span></div>
      <div class="term"><label>PRAZO DE ENTREGA</label><span>${escape(deliveryDate)}</span></div>
      <div class="term"><label>VALIDADE</label><span>${escape(validity)}</span></div>
    </section>

    <footer class="footer">
      <div><strong>OBSERVACOES TECNICAS</strong><br>${escape(seller.technicalNotes || "CADASTRE AS OBSERVACOES TECNICAS NOS PARAMETROS DE ORCAMENTO.")}</div>
      <div class="signature">${escape(quote.representativeName || seller.name || quote.sellerCompanyName)}</div>
    </footer>
  </main>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
</body>
</html>`);
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
const quoteListToolbarStyle = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, paddingBottom: 16, marginBottom: 18, borderBottom: "1px solid rgba(52,64,84,.12)", flexWrap: "wrap" as const };
const quoteListTabsStyle = { display: "flex", gap: 10, flexWrap: "wrap" as const };
const quoteListTabStyle = { minHeight: 40, padding: "0 16px", border: "1px solid rgba(111,50,210,.24)", borderRadius: 8, color: "#667085", background: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const activeQuoteListTabStyle = { color: "#fff", borderColor: "#6f32d2", background: "#6f32d2" };
const quoteDateFilterStyle = { display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" as const };
const quoteDateFilterLabelStyle = { display: "grid", gap: 5, color: "#667085", fontSize: 10, fontWeight: 900, letterSpacing: .7 };
const quoteDateInputStyle = { minHeight: 40, padding: "0 10px", border: "1px solid rgba(111,50,210,.24)", borderRadius: 8, background: "#fff", color: "#344054", fontSize: 12, fontWeight: 800, outline: "none" };
const quoteDateClearButtonStyle = { width: 40, minHeight: 40, padding: 0, border: "1px solid rgba(255,59,37,.28)", borderRadius: 8, background: "#fff4f2", color: "#ff3b25", fontSize: 13, fontWeight: 900, cursor: "pointer" };
const countStyle = { color: "#6f32d2", fontSize: 13, fontWeight: 900 };
const emptyStyle = { padding: 30, textAlign: "center" as const, color: "#667085", fontSize: 15, fontWeight: 800 };
const quoteListStyle = { display: "grid", gap: 10 };
const quoteRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, padding: "18px 20px", border: "1px solid rgba(230,61,174,.18)", borderRadius: 12, background: "rgba(255,255,255,.82)" };
const quoteNumberStyle = { display: "block", color: "#6f32d2", fontSize: 18, fontWeight: 900 };
const quoteClientStyle = { display: "block", marginTop: 4, color: "#141827", fontSize: 16, fontWeight: 900 };
const quoteMetaStyle = { display: "block", marginTop: 5, color: "#667085", fontSize: 12, fontWeight: 800 };
const pdfButtonStyle = { ...primaryButtonStyle, background: "linear-gradient(135deg,#ff8a00,#ff3b25)" };
const deleteButtonStyle = { ...secondaryButtonStyle, color: "#ff3b25", borderColor: "rgba(255,59,37,.30)" };
const quoteActionsStyle = { display: "flex", gap: 10, alignItems: "center" };
const lookupGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, marginBottom: 18 };
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 };
const itemGridStyle = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 };
const labelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 11, fontWeight: 900, letterSpacing: 1 };
const noticeStyle = { marginBottom: 18, padding: "12px 14px", borderRadius: 10, background: "rgba(111,50,210,.06)", color: "#667085", fontSize: 12, fontWeight: 800 };
const itemsHeadingStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "28px 0 14px" };
const itemActionsStyle = { display: "flex", alignItems: "center", flexWrap: "wrap" as const, justifyContent: "flex-end", gap: 10 };
const additionalItemSelectStyle = { ...inputStyle, width: "auto", minWidth: 260, color: "#6f32d2" };
const itemCardStyle = { padding: 18, border: "1px solid rgba(230,61,174,.20)", borderRadius: 14, background: "rgba(255,255,255,.76)", marginBottom: 12 };
const itemCardHeaderStyle = { display: "flex", justifyContent: "space-between", marginBottom: 14, color: "#d60078", fontSize: 13, fontWeight: 900 };
const removeButtonStyle = { border: "none", background: "transparent", color: "#ff3b25", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const formActionsStyle = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 };
const cancelButtonStyle = { ...secondaryButtonStyle, color: "#667085" };
const opportunityLinkPanelStyle = { display: "grid", gap: 16, marginTop: 18, padding: 22, border: "1px solid rgba(111,50,210,.32)", borderRadius: 14, background: "#f8f5ff" };
const opportunityLinkTitleStyle = { margin: "6px 0 0", color: "#141827", fontSize: 19, fontWeight: 900 };
const opportunityLinkDescriptionStyle = { margin: "7px 0 0", color: "#667085", fontSize: 13, fontWeight: 800 };
const opportunityLinkListStyle = { display: "grid", gap: 9 };
const opportunityLinkItemStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, padding: "14px 16px", border: "1px solid rgba(111,50,210,.16)", borderRadius: 10, background: "#fff" };
const opportunityLinkDetailsStyle = { display: "grid", gap: 4, minWidth: 0, color: "#344054", fontSize: 13, fontWeight: 800 };
const opportunityLinkActionsStyle = { display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" as const };

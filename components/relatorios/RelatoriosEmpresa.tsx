"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type ReportKey = "closing" | "pipeline" | "forecast" | "losses" | "clients" | "materials" | "team" | "followup" | "cycle" | "risk" | "goals" | "executive" | "no-agenda";
type PeriodPreset = "CURRENT" | "PREVIOUS" | "CUSTOM";
type ReportCategory = "RESULTADOS" | "CARTEIRA" | "OPERACAO" | "GESTAO";
type ReportArea = "COMMERCIAL" | "PURCHASES" | "PRODUCTION";

type Client = { id: string; name: string; sellerCompanyId: string; sellerCompanyName: string; sellerCompanySlug: string; representativeProfileId: string; representativeName: string; updatedAt: string };
type Profile = { client_id: string; owner_profile_id: string | null; purchase_frequency_days: number | null; average_purchase_value: number; last_purchase_at: string | null; next_purchase_at: string | null; next_contact_at: string | null; relationship_status: string };
type Opportunity = { id: string; client_id: string | null; representative_profile_id: string | null; quote_id: string | null; title: string; product_ficha_id: string | null; product_reference: string | null; stage: string; estimated_value: number; expected_close_date: string | null; lost_reason: string | null; created_at: string; updated_at: string };
type Activity = { id: string; client_id: string; opportunity_id: string | null; representative_profile_id: string | null; activity_type: string; outcome: string; subject: string | null; occurred_at: string; next_action_at: string | null };
type QuoteItem = { item_number: number; ft_number: string | null; description: string; total: number; snapshot?: Record<string, unknown> };
type Quote = { id: string; client_id: string | null; representative_profile_id: string | null; seller_company_name: string; seller_company_slug: string; quote_number: string; grand_total: number; issue_date: string; valid_until: string | null; created_at: string; quote_items: QuoteItem[] };
type MaterialSnapshot = { materialId?: string; materialCode?: string; paperType?: string; createdAt?: string };
type ProductFicha = { id?: string; ftNumber?: string; clientId?: string; reference?: string; materialId?: string; company?: string; pricingData?: MaterialSnapshot; priceHistory?: MaterialSnapshot[] };
type Material = { id?: string; code?: string; paperType?: string; supplier?: string; pressure?: string; costIpi?: number };
type ReportData = { isManager: boolean; currentProfileId: string; representatives: Array<{ id: string; name: string }>; clients: Client[]; profiles: Profile[]; activities: Activity[]; opportunities: Opportunity[]; quotes: Quote[]; productFichas: ProductFicha[]; materials: Material[]; salesGoals: { byRepresentative?: Record<string, number> } | null };

const reports: Array<{ key: ReportKey; number: number; title: string; managerOnly?: boolean }> = [
  { key: "closing", number: 1, title: "FECHAMENTO DO MES" },
  { key: "pipeline", number: 2, title: "FUNIL COMERCIAL" },
  { key: "forecast", number: 3, title: "PREVISAO DE FATURAMENTO" },
  { key: "losses", number: 4, title: "MOTIVOS DE PERDA" },
  { key: "clients", number: 5, title: "RANKING DE CLIENTES" },
  { key: "materials", number: 6, title: "RANKING POR MATERIAL" },
  { key: "team", number: 7, title: "DESEMPENHO POR VENDEDOR", managerOnly: true },
  { key: "followup", number: 8, title: "ORCAMENTOS SEM RETORNO" },
  { key: "cycle", number: 9, title: "CICLO DE VENDAS" },
  { key: "risk", number: 10, title: "CLIENTES EM RISCO" },
  { key: "goals", number: 11, title: "META X REALIZADO", managerOnly: true },
  { key: "executive", number: 12, title: "RELATORIO EXECUTIVO", managerOnly: true },
  { key: "no-agenda", number: 13, title: "CLIENTES SEM AGENDA", managerOnly: true },
];

const reportCategories: Array<{ key: ReportCategory; label: string; reports: ReportKey[] }> = [
  { key: "RESULTADOS", label: "RESULTADOS", reports: ["closing", "pipeline", "forecast", "losses"] },
  { key: "CARTEIRA", label: "CARTEIRA", reports: ["clients", "materials", "risk"] },
  { key: "OPERACAO", label: "OPERACAO", reports: ["team", "followup", "cycle"] },
  { key: "GESTAO", label: "GESTAO", reports: ["goals", "executive", "no-agenda"] },
];

const stageLabels: Record<string, string> = {
  CONTACT_PENDING: "CONTATO PENDENTE", CONTACTED: "CONTATADO", QUOTE_PREPARATION: "ORCAMENTO EM PREPARACAO", QUOTE_SENT: "ORCAMENTO ENVIADO", NEGOTIATION: "NEGOCIACAO", WON: "GANHO", LOST: "PERDIDO",
};

export default function RelatoriosEmpresa({ slug }: { slug: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [activeArea, setActiveArea] = useState<ReportArea>("COMMERCIAL");
  const [activeReport, setActiveReport] = useState<ReportKey>("closing");
  const [activeCategory, setActiveCategory] = useState<ReportCategory>("RESULTADOS");
  const [representativeId, setRepresentativeId] = useState("ALL");
  const [preset, setPreset] = useState<PeriodPreset>("CURRENT");
  const [customStart, setCustomStart] = useState(isoMonthStart(new Date()));
  const [customEnd, setCustomEnd] = useState(isoToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("SESSAO NAO ENCONTRADA.");
        const response = await fetch(`/api/relatorios?slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.message || "NAO FOI POSSIVEL CARREGAR OS RELATORIOS.");
        if (active) setData(payload.report as ReportData);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "NAO FOI POSSIVEL CARREGAR OS RELATORIOS.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [slug]);

  const range = useMemo(() => resolveRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const scoped = useMemo(() => {
    if (!data) return { clients: [] as Client[], profiles: [] as Profile[], opportunities: [] as Opportunity[], activities: [] as Activity[], quotes: [] as Quote[] };
    if (!data.isManager || representativeId === "ALL") return data;
    const clientIds = new Set(data.clients.filter((item) => item.representativeProfileId === representativeId).map((item) => item.id));
    return {
      ...data,
      representatives: data.representatives.filter((item) => item.id === representativeId),
      clients: data.clients.filter((item) => clientIds.has(item.id)),
      profiles: data.profiles.filter((item) => clientIds.has(item.client_id)),
      opportunities: data.opportunities.filter((item) => item.representative_profile_id === representativeId || clientIds.has(item.client_id || "")),
      activities: data.activities.filter((item) => item.representative_profile_id === representativeId || clientIds.has(item.client_id)),
      quotes: data.quotes.filter((item) => item.representative_profile_id === representativeId || clientIds.has(item.client_id || "")),
    };
  }, [data, representativeId]);

  const activeDefinition = reports.find((item) => item.key === activeReport)!;
  const canViewActive = !activeDefinition.managerOnly || Boolean(data?.isManager);
  const visibleCategories = reportCategories.filter((category) => data?.isManager || category.reports.some((key) => !reports.find((item) => item.key === key)?.managerOnly));
  const activeCategoryDefinition = reportCategories.find((category) => category.key === activeCategory)!;
  const categoryReports = reports.filter((item) => activeCategoryDefinition.reports.includes(item.key));

  function selectCategory(category: ReportCategory) {
    const definition = reportCategories.find((item) => item.key === category)!;
    const firstAvailable = definition.reports.map((key) => reports.find((item) => item.key === key)!).find((item) => !item.managerOnly || data?.isManager);
    setActiveCategory(category);
    if (firstAvailable) setActiveReport(firstAvailable.key);
  }

  const areaTitle = activeArea === "PURCHASES" ? "INTELIGENCIA DE COMPRAS" : activeArea === "PRODUCTION" ? "INTELIGENCIA DE PRODUCAO" : "INTELIGENCIA COMERCIAL";
  const areaDescription = activeArea === "PURCHASES"
    ? "COMPARE CONDICOES DE MATERIA PRIMA ENTRE FORNECEDORES."
    : activeArea === "PRODUCTION"
      ? "INDICADORES DE PRODUCAO EM ESTRUTURACAO."
      : "ANALISES PARA PRIORIZAR ACOES COMERCIAIS, NAO APENAS ACOMPANHAR NUMEROS.";

  function selectArea(area: ReportArea) {
    if (area === "PURCHASES" && !data?.isManager) return;
    setActiveArea(area);
  }

  return <section style={shellStyle}>
    <header style={headerStyle}>
      <div><span style={eyebrowStyle}>{areaTitle}</span><h2 style={titleStyle}>RELATORIOS</h2><p style={subtitleStyle}>{areaDescription}</p></div>
      {activeArea === "COMMERCIAL" ? <div style={periodHintStyle}>PERIODO: {displayDate(range.start)} A {displayDate(range.end)}</div> : null}
    </header>
    <nav className="reports-navigation" aria-label="AREAS DE RELATORIOS">
      <div className="reports-domain-nav">
        <button type="button" onClick={() => selectArea("COMMERCIAL")} className={`reports-domain-button${activeArea === "COMMERCIAL" ? " is-active is-commercial" : ""}`} aria-current={activeArea === "COMMERCIAL" ? "page" : undefined}>COMERCIAL</button>
        <button type="button" onClick={() => selectArea("PURCHASES")} disabled={!data?.isManager} className={`reports-domain-button${activeArea === "PURCHASES" ? " is-active is-purchases" : ""}${!data?.isManager ? " is-restricted" : ""}`} aria-current={activeArea === "PURCHASES" ? "page" : undefined}>COMPRAS</button>
        <button type="button" onClick={() => selectArea("PRODUCTION")} className={`reports-domain-button${activeArea === "PRODUCTION" ? " is-active is-production" : ""}`} aria-current={activeArea === "PRODUCTION" ? "page" : undefined}>PRODUCAO</button>
      </div>
      {activeArea === "COMMERCIAL" ? <>
        <div className="reports-category-nav">
          {visibleCategories.map((category) => <button key={category.key} type="button" onClick={() => selectCategory(category.key)} className={`reports-category-button ${category.key === activeCategory ? `is-active is-${category.key.toLowerCase()}` : ""}`} aria-current={category.key === activeCategory ? "page" : undefined}>{category.label}</button>)}
        </div>
        <section className={`reports-navigation-panel is-${activeCategory.toLowerCase()}`} aria-label={`RELATORIOS DE ${activeCategoryDefinition.label}`}>
          <div className="reports-navigation-panel-header"><span>RELATORIOS</span><strong>{activeCategoryDefinition.label}</strong></div>
          <div className="reports-navigation-list">
            {categoryReports.map((item) => {
              const restricted = item.managerOnly && !data?.isManager;
              const active = activeReport === item.key;
              return <button key={item.key} type="button" disabled={restricted} onClick={() => setActiveReport(item.key)} className={`reports-navigation-button${active ? " is-active" : ""}${restricted ? " is-restricted" : ""}`} aria-current={active ? "page" : undefined}>
                <span>{String(item.number).padStart(2, "0")}</span><b>{item.title}</b>{restricted ? <small>GERENCIA</small> : null}
              </button>;
            })}
          </div>
        </section>
      </> : null}
      {activeArea === "PURCHASES" && data?.isManager ? <section className="reports-navigation-panel is-purchases" aria-label="RELATORIOS DE COMPRAS">
        <div className="reports-navigation-panel-header"><span>RELATORIOS</span><strong>COMPRAS</strong></div>
        <div className="reports-navigation-list"><button type="button" className="reports-navigation-button is-active" aria-current="page"><span>01</span><b>COMPARATIVO DE MATERIA PRIMA</b></button></div>
      </section> : null}
    </nav>
    {activeArea === "COMMERCIAL" ? <section style={filterStyle}>
      <label style={filterLabelStyle}>PERIODO<select value={preset} onChange={(event) => setPreset(event.target.value as PeriodPreset)} style={selectStyle}><option value="CURRENT">MES ATUAL</option><option value="PREVIOUS">MES ANTERIOR</option><option value="CUSTOM">PERSONALIZADO</option></select></label>
      {preset === "CUSTOM" ? <><label style={filterLabelStyle}>DE<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} style={inputStyle} /></label><label style={filterLabelStyle}>ATE<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} style={inputStyle} /></label></> : null}
      {data?.isManager ? <label style={filterLabelStyle}>REPRESENTANTE<select value={representativeId} onChange={(event) => setRepresentativeId(event.target.value)} style={selectStyle}><option value="ALL">TODA A EQUIPE</option>{data.representatives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <div style={ownDataStyle}>EXIBINDO SOMENTE SEUS DADOS</div>}
    </section> : null}
    {loading ? <div style={emptyStyle}>CARREGANDO RELATORIOS...</div> : null}
    {error ? <div style={errorStyle}>{error}</div> : null}
    {!loading && !error && data && activeArea === "COMMERCIAL" && canViewActive ? <ReportContent report={activeReport} data={scoped as ReportData} rawData={data} range={range} /> : null}
    {!loading && !error && data && activeArea === "PURCHASES" && data.isManager ? <MaterialComparisonReport materials={data.materials} /> : null}
    {!loading && !error && data && activeArea === "PRODUCTION" ? <ProductionComingSoon /> : null}
    {!loading && data && activeArea === "COMMERCIAL" && !canViewActive ? <div style={emptyStyle}>ESTE RELATORIO E EXCLUSIVO PARA ADMINISTRADORES E GERENTES.</div> : null}
  </section>;
}

function ReportContent({ report, data, rawData, range }: { report: ReportKey; data: ReportData; rawData: ReportData; range: { start: string; end: string } }) {
  const clientById = new Map(data.clients.map((item) => [item.id, item]));
  const profileByClient = new Map(data.profiles.map((item) => [item.client_id, item]));
  const inRangeOpps = data.opportunities.filter((item) => inRange(item.updated_at, range));
  const won = inRangeOpps.filter((item) => item.stage === "WON");
  const lost = inRangeOpps.filter((item) => item.stage === "LOST");
  const open = data.opportunities.filter((item) => !["WON", "LOST"].includes(item.stage));
  const totalWon = sum(won, (item) => item.estimated_value);
  const totalLost = sum(lost, (item) => item.estimated_value);

  if (report === "closing") {
    const qualified = [...won, ...lost];
    return <ReportLayout title="FECHAMENTO DO MES" description="GANHOS E PERDAS SAO CLASSIFICADOS PELA ULTIMA ATUALIZACAO DA OPORTUNIDADE, POIS O CRM AINDA NAO REGISTRA UMA DATA DE FECHAMENTO SEPARADA.">
      <MetricGrid items={[metric("ORCADO NO PERIODO", sum(data.quotes.filter((item) => inRange(item.created_at, range)), (item) => item.grand_total), "#7c3aed"), metric("GANHO", totalWon, "#16a34a"), metric("PERDIDO", totalLost, "#f43f5e"), metric("CONVERSAO", qualified.length ? `${Math.round((won.length / qualified.length) * 100)}%` : "-", "#0284c7", true), metric("TICKET MEDIO GANHO", won.length ? totalWon / won.length : 0, "#e68019")]}/>
      <StageTable opportunities={inRangeOpps} />
    </ReportLayout>;
  }
  if (report === "pipeline") return <ReportLayout title="FUNIL COMERCIAL" description="MOSTRA VALOR, quantidade e tempo medio em cada etapa aberta."><StageTable opportunities={open} showAge /></ReportLayout>;
  if (report === "forecast") {
    const forecast = open.filter((item) => !item.expected_close_date || inRange(item.expected_close_date, range));
    const levels = [{ label: "ALTA CONFIANCA", stages: ["NEGOTIATION"], weight: .8, color: "#16a34a" }, { label: "MEDIA CONFIANCA", stages: ["QUOTE_SENT"], weight: .5, color: "#e68019" }, { label: "BAIXA CONFIANCA", stages: ["CONTACT_PENDING", "CONTACTED", "QUOTE_PREPARATION"], weight: .2, color: "#7c3aed" }];
    const weightedValue = (item: Opportunity) => {
      const level = levels.find((entry) => entry.stages.includes(item.stage));
      const profile = profileByClient.get(item.client_id || "");
      return item.estimated_value * confidenceWeight(level?.weight || 0, profile);
    };
    const frequencyOnTime = forecast.filter((item) => isWithinPurchaseFrequency(profileByClient.get(item.client_id || ""))).length;
    return <ReportLayout title="PREVISAO DE FATURAMENTO" description="A confianca considera a etapa do funil e a aderencia a frequencia de compra do cliente. Ela nao soma toda oportunidade como receita certa."><MetricGrid items={levels.map((level) => { const items = forecast.filter((item) => level.stages.includes(item.stage)); return metric(level.label, sum(items, weightedValue), level.color); }).concat([metric("PREVISAO PONDERADA", sum(forecast, weightedValue), "#141827"), metric("DENTRO DA FREQUENCIA", `${frequencyOnTime}/${forecast.length || 0}`, "#0284c7", true)])}/><OpportunityTable opportunities={forecast} clients={clientById} /></ReportLayout>;
  }
  if (report === "losses") return <ReportLayout title="MOTIVOS DE PERDA" description="A lista vem do cadastro geral do CRM. O motivo agora e obrigatorio em novas perdas."><LossesReport opportunities={lost} clients={clientById} quotes={new Map(data.quotes.map((item) => [item.id, item]))} /></ReportLayout>;
  if (report === "clients") return <ReportLayout title="RANKING DE CLIENTES" description="Classifica pelo valor de oportunidades ganhas no periodo. Sem faturamento integrado, este valor representa negocios ganhos no CRM."><RankTable rows={groupRows(won, (item) => clientById.get(item.client_id || "")?.name || "SEM CLIENTE", (item) => item.estimated_value)} labels={["CLIENTE", "GANHOS", "VALOR"]} /></ReportLayout>;
  if (report === "materials") {
    const materialById = new Map(data.materials.map((item) => [item.id || "", item]));
    const fichaByClientNumber = uniqueFichasByNumber(data.productFichas);
    const quoteItems = data.quotes.filter((quote) => inRange(quote.created_at, range)).flatMap((quote) => quote.quote_items.map((item) => ({ quote, item })));
    return <ReportLayout title="RANKING POR MATERIAL" description="AGRUPA CADA ITEM ORCADO PELO MATERIAL DA FICHA TECNICA. ISSO MANTEM O RELATORIO CORRETO MESMO QUANDO UM ORCAMENTO TEM MAIS DE UMA FICHA."><RankTable rows={groupRows(quoteItems, ({ quote, item }) => materialLabelForQuoteItem(quote, item, fichaByClientNumber, materialById), ({ item }) => item.total)} labels={["MATERIAL", "ITENS ORCADOS", "VALOR ORCADO"]} /></ReportLayout>;
  }
  if (report === "team") return <ReportLayout title="DESEMPENHO POR VENDEDOR" description="Visao gerencial: compara conversao, valor ganho e tempo de ciclo por representante."><TeamTable opportunities={inRangeOpps} clients={clientById} representatives={new Map(data.representatives.map((item) => [item.id, item.name]))} /></ReportLayout>;
  if (report === "followup") {
    const lastActivityByOpportunity = new Map<string, Activity>();
    data.activities.forEach((item) => { if (item.opportunity_id && (!lastActivityByOpportunity.has(item.opportunity_id) || item.occurred_at > lastActivityByOpportunity.get(item.opportunity_id)!.occurred_at)) lastActivityByOpportunity.set(item.opportunity_id, item); });
    const unattended = open.filter((item) => ["QUOTE_SENT", "NEGOTIATION"].includes(item.stage) && daysSince(lastActivityByOpportunity.get(item.id)?.occurred_at || item.updated_at) >= 3).sort((a, b) => daysSince(lastActivityByOpportunity.get(b.id)?.occurred_at || b.updated_at) - daysSince(lastActivityByOpportunity.get(a.id)?.occurred_at || a.updated_at));
    return <ReportLayout title="ORCAMENTOS SEM RETORNO" description="Oportunidades abertas sem atividade registrada ha tres dias ou mais. Esta e uma lista de acao comercial."><OpportunityTable opportunities={unattended} clients={clientById} activityByOpportunity={lastActivityByOpportunity} /></ReportLayout>;
  }
  if (report === "cycle") {
    const closed = [...won, ...lost];
    return <ReportLayout title="CICLO DE VENDAS" description="Tempo entre criacao e ultima atualizacao da oportunidade. Para os registros atuais, a ultima atualizacao e usada como data de encerramento."><MetricGrid items={[metric("CICLO MEDIO GANHO", average(won.map((item) => daysBetween(item.created_at, item.updated_at))), "#16a34a", true), metric("CICLO MEDIO PERDIDO", average(lost.map((item) => daysBetween(item.created_at, item.updated_at))), "#f43f5e", true), metric("NEGOCIOS ENCERRADOS", closed.length, "#7c3aed", true)]}/><StageTable opportunities={closed} showAge /></ReportLayout>;
  }
  if (report === "risk") {
    const activeClientIds = new Set(open.map((item) => item.client_id || ""));
    const atRisk = data.clients.map((client) => ({ client, profile: profileByClient.get(client.id) })).filter(({ client, profile }) => { const frequency = Number(profile?.purchase_frequency_days || 0); if (!frequency || !profile?.last_purchase_at || activeClientIds.has(client.id)) return false; return daysSince(profile.last_purchase_at) > frequency; }).sort((a, b) => (daysSince(b.profile?.last_purchase_at || "") - Number(b.profile?.purchase_frequency_days || 0)) - (daysSince(a.profile?.last_purchase_at || "") - Number(a.profile?.purchase_frequency_days || 0)));
    return <ReportLayout title="CLIENTES EM RISCO" description="Clientes que passaram da frequencia de compra definida e nao possuem oportunidade ativa."><RiskTable rows={atRisk} /></ReportLayout>;
  }
  if (report === "no-agenda") {
    const clientIdsWithAgenda = new Set([
      ...data.profiles.filter((item) => item.next_contact_at).map((item) => item.client_id),
      ...data.activities.filter((item) => item.next_action_at).map((item) => item.client_id),
    ]);
    const lastActivityByClient = new Map<string, Activity>();
    data.activities.forEach((activity) => {
      const current = lastActivityByClient.get(activity.client_id);
      if (!current || activity.occurred_at > current.occurred_at) lastActivityByClient.set(activity.client_id, activity);
    });
    const rows = data.clients
      .filter((client) => !clientIdsWithAgenda.has(client.id))
      .map((client) => ({ client, activity: lastActivityByClient.get(client.id) }))
      .sort((first, second) => {
        if (!first.activity) return -1;
        if (!second.activity) return 1;
        return first.activity.occurred_at.localeCompare(second.activity.occurred_at);
      });
    return <ReportLayout title="CLIENTES SEM AGENDA" description="Clientes ativos sem nenhuma proxima acao registrada, seja na carteira ou em uma oportunidade. A lista e atual e nao depende do periodo selecionado."><NoAgendaTable rows={rows} /></ReportLayout>;
  }
  if (report === "goals") {
    const goals = rawData.salesGoals?.byRepresentative || {};
    const byRepresentative = data.representatives.map((representative) => { const actual = sum(won.filter((item) => opportunityRepresentativeId(item, clientById) === representative.id), (item) => item.estimated_value); return { name: representative.name, actual, goal: Number(goals[representative.id] || 0) }; });
    const totalGoal = sum(byRepresentative, (item) => item.goal);
    const totalActual = sum(byRepresentative, (item) => item.actual);
    return <ReportLayout title="META X REALIZADO" description="Compara a meta global de cada vendedor com seus ganhos no periodo, somando Dawos, Carcat e GTA."><MetricGrid items={[metric("META TOTAL DA EQUIPE", totalGoal, "#7c3aed"), metric("REALIZADO TOTAL", totalActual, "#16a34a"), metric("ATINGIMENTO", totalGoal ? `${Math.round((totalActual / totalGoal) * 100)}%` : "META NAO CONFIGURADA", "#0284c7", true)]}/><GoalTable rows={byRepresentative} /></ReportLayout>;
  }
  const overdueAgenda = data.activities.filter((item) => item.next_action_at && item.next_action_at < new Date().toISOString()).length;
  return <ReportLayout title="RELATORIO EXECUTIVO" description="Resumo gerencial do periodo selecionado."><MetricGrid items={[metric("GANHO", totalWon, "#16a34a"), metric("PERDIDO", totalLost, "#f43f5e"), metric("EM ABERTO", sum(open, (item) => item.estimated_value), "#7c3aed"), metric("AGENDA ATRASADA", overdueAgenda, "#e68019", true), metric("CLIENTES EM CARTEIRA", data.clients.length, "#0284c7", true)]}/><StageTable opportunities={inRangeOpps}/></ReportLayout>;
}

function MaterialComparisonReport({ materials }: { materials: Material[] }) {
  const groups = new Map<string, Material[]>();
  materials.forEach((material) => {
    const paperType = material.paperType?.trim() || "TIPO NAO INFORMADO";
    groups.set(paperType, [...(groups.get(paperType) || []), material]);
  });
  const rows = [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second, "pt-BR"))
    .map(([paperType, groupMaterials]) => {
      const items = [...groupMaterials].sort((first, second) => compareMaterialPressure(first.pressure, second.pressure) || Number(first.costIpi || 0) - Number(second.costIpi || 0) || (first.supplier || "").localeCompare(second.supplier || "", "pt-BR"));
      return { paperType, items, pressureTones: materialPressureToneMap(items) };
    });

  return <ReportLayout title="COMPARATIVO DE MATERIA PRIMA" description="COMPARE CODIGO DO MATERIAL, FORNECEDOR, RESISTENCIA DE COLUNA E PRECO C/ IPI DENTRO DE CADA TIPO DE MATERIAL.">
    <ReportTable>
      <thead><tr><th>MATERIAL</th><th>FORNECEDOR</th><th>COLUNA / RES. PRESSAO</th><th>PRECO C/ IPI</th></tr></thead>
      <tbody>
        {rows.map(({ paperType, items, pressureTones }) => <Fragment key={paperType}>
          <tr><td colSpan={4} style={materialTypeGroupCellStyle}>{paperType}</td></tr>
          {items.map((material) => <tr key={material.id || `${paperType}-${material.supplier}-${material.code}`} style={pressureTones.get(materialPressureValue(material.pressure))}>
            <td>{material.code || "NAO INFORMADO"}</td>
            <td>{material.supplier || "NAO INFORMADO"}</td>
            <td>{material.pressure || "NAO INFORMADA"}</td>
            <td>{Number(material.costIpi || 0) > 0 ? money(Number(material.costIpi)) : "NAO INFORMADO"}</td>
          </tr>)}
        </Fragment>)}
        {!rows.length ? <tr><td colSpan={4} style={emptyCellStyle}>NENHUM MATERIAL ESPECIFICO CADASTRADO.</td></tr> : null}
      </tbody>
    </ReportTable>
  </ReportLayout>;
}

function ProductionComingSoon() {
  return <ReportLayout title="RELATORIOS DE PRODUCAO" description="ESTA AREA VAI REUNIR INDICADORES DE PRODUTIVIDADE, TEMPO E EFICIENCIA DA FABRICA.">
    <div style={emptyStyle}>EM CONSTRUCAO.</div>
  </ReportLayout>;
}

function ReportLayout({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <section style={contentStyle}><div style={contentHeaderStyle}><h3 style={contentTitleStyle}>{title}</h3><p style={contentDescriptionStyle}>{description}</p></div>{children}</section>; }
function MetricGrid({ items }: { items: Array<{ label: string; value: string; color: string }> }) { return <div style={metricGridStyle}>{items.map((item) => <article key={item.label} style={{ ...metricCardStyle, borderTopColor: item.color }}><span>{item.label}</span><strong style={{ color: item.color }}>{item.value}</strong></article>)}</div>; }
function ReportTable({ children }: { children: React.ReactNode }) { return <div className="reports-table-wrap"><table className="reports-table" style={tableStyle}>{children}</table></div>; }
function StageTable({ opportunities, showAge = false }: { opportunities: Opportunity[]; showAge?: boolean }) { const rows = groupRows(opportunities, (item) => stageLabels[item.stage] || item.stage, (item) => item.estimated_value); return <ReportTable><thead><tr><th>ETAPA</th><th>QUANTIDADE</th><th>VALOR</th>{showAge ? <th>TEMPO MEDIO</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.count}</td><td>{money(row.value)}</td>{showAge ? <td>{Math.round(average(opportunities.filter((item) => (stageLabels[item.stage] || item.stage) === row.label).map((item) => daysSince(item.created_at))))} DIAS</td> : null}</tr>)}</tbody></ReportTable>; }
function RankTable({ rows, labels }: { rows: Array<{ label: string; count: number; value: number }>; labels: string[] }) { return <ReportTable><thead><tr>{labels.map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.count}</td><td>{money(row.value)}</td></tr>)}{!rows.length ? <tr><td colSpan={labels.length} style={emptyCellStyle}>SEM DADOS NO PERIODO.</td></tr> : null}</tbody></ReportTable>; }
function LossesReport({ opportunities, clients, quotes }: { opportunities: Opportunity[]; clients: Map<string, Client>; quotes: Map<string, Quote> }) {
  const rows = [...opportunities].sort((first, second) => second.updated_at.localeCompare(first.updated_at));
  return <>
    <RankTable rows={groupRows(rows, (item) => item.lost_reason || "NAO INFORMADO", (item) => item.estimated_value)} labels={["MOTIVO", "PERDAS", "VALOR"]} />
    {rows.length ? <section style={lossDetailsStyle}>
      <h4 style={lossDetailsTitleStyle}>DETALHAMENTO DAS PERDAS</h4>
      <ReportTable>
        <thead><tr><th>MOTIVO</th><th>CLIENTE</th><th>ORCAMENTO</th><th>VALOR</th></tr></thead>
        <tbody>{rows.map((item) => <tr key={item.id}>
          <td>{item.lost_reason || "NAO INFORMADO"}</td>
          <td>{clients.get(item.client_id || "")?.name || "SEM CLIENTE"}</td>
          <td>{quotes.get(item.quote_id || "")?.quote_number || "SEM ORCAMENTO VINCULADO"}</td>
          <td>{money(item.estimated_value)}</td>
        </tr>)}</tbody>
      </ReportTable>
    </section> : null}
  </>;
}
function OpportunityTable({ opportunities, clients, activityByOpportunity }: { opportunities: Opportunity[]; clients: Map<string, Client>; activityByOpportunity?: Map<string, Activity> }) { return <ReportTable><thead><tr><th>CLIENTE</th><th>OPORTUNIDADE</th><th>ETAPA</th><th>VALOR</th><th>PREVISAO</th>{activityByOpportunity ? <th>SEM RETORNO</th> : null}</tr></thead><tbody>{opportunities.map((item) => <tr key={item.id}><td>{clients.get(item.client_id || "")?.name || "SEM CLIENTE"}</td><td>{item.title}</td><td>{stageLabels[item.stage] || item.stage}</td><td>{money(item.estimated_value)}</td><td>{displayDate(item.expected_close_date || "")}</td>{activityByOpportunity ? <td>{daysSince(activityByOpportunity.get(item.id)?.occurred_at || item.updated_at)} DIAS</td> : null}</tr>)}{!opportunities.length ? <tr><td colSpan={activityByOpportunity ? 6 : 5} style={emptyCellStyle}>NENHUMA OPORTUNIDADE NESTA VISAO.</td></tr> : null}</tbody></ReportTable>; }
function TeamTable({ opportunities, clients, representatives }: { opportunities: Opportunity[]; clients: Map<string, Client>; representatives: Map<string, string> }) { const rows = groupRows(opportunities, (item) => representatives.get(item.representative_profile_id || "") || clients.get(item.client_id || "")?.representativeName || "SEM REPRESENTANTE", (item) => item.estimated_value); return <RankTable rows={rows} labels={["REPRESENTANTE", "OPORTUNIDADES", "VALOR MOVIMENTADO"]} />; }
function RiskTable({ rows }: { rows: Array<{ client: Client; profile?: Profile }> }) { return <ReportTable><thead><tr><th>CLIENTE</th><th>REPRESENTANTE</th><th>FREQUENCIA</th><th>ULTIMA COMPRA</th><th>ATRASO</th></tr></thead><tbody>{rows.map(({ client, profile }) => <tr key={client.id}><td>{client.name}</td><td>{client.representativeName}</td><td>{profile?.purchase_frequency_days} DIAS</td><td>{displayDate(profile?.last_purchase_at || "")}</td><td>{daysSince(profile?.last_purchase_at || "") - Number(profile?.purchase_frequency_days || 0)} DIAS</td></tr>)}{!rows.length ? <tr><td colSpan={5} style={emptyCellStyle}>NENHUM CLIENTE FORA DA FREQUENCIA DE COMPRA.</td></tr> : null}</tbody></ReportTable>; }
function NoAgendaTable({ rows }: { rows: Array<{ client: Client; activity?: Activity }> }) { return <ReportTable><thead><tr><th>CLIENTE</th><th>ULTIMA ACAO REGISTRADA</th><th>REPRESENTANTE</th></tr></thead><tbody>{rows.map(({ client, activity }) => <tr key={client.id}><td>{client.name}</td><td>{activity ? displayDate(activity.occurred_at) : "NENHUMA ACAO REGISTRADA"}</td><td>{client.representativeName || "SEM REPRESENTANTE"}</td></tr>)}{!rows.length ? <tr><td colSpan={3} style={emptyCellStyle}>TODOS OS CLIENTES POSSUEM UMA PROXIMA ACAO REGISTRADA.</td></tr> : null}</tbody></ReportTable>; }
function GoalTable({ rows }: { rows: Array<{ name: string; actual: number; goal: number }> }) { return <ReportTable><thead><tr><th>VENDEDOR</th><th>META</th><th>REALIZADO</th><th>ATINGIMENTO</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{money(row.goal)}</td><td>{money(row.actual)}</td><td>{row.goal ? `${Math.round((row.actual / row.goal) * 100)}%` : "META NAO CONFIGURADA"}</td></tr>)}</tbody></ReportTable>; }

function metric(label: string, value: number | string, color: string, plain = false) { return { label, value: plain || typeof value === "string" ? String(value) : money(value), color }; }
function opportunityRepresentativeId(opportunity: Opportunity, clients: Map<string, Client>) { return opportunity.representative_profile_id || clients.get(opportunity.client_id || "")?.representativeProfileId || ""; }
function groupRows<T>(items: T[], getLabel: (item: T) => string, getValue: (item: T) => number) { const groups = new Map<string, { label: string; count: number; value: number }>(); items.forEach((item) => { const label = getLabel(item); const current = groups.get(label) || { label, count: 0, value: 0 }; current.count += 1; current.value += Number(getValue(item) || 0); groups.set(label, current); }); return [...groups.values()].sort((a, b) => b.value - a.value || b.count - a.count); }
function uniqueFichasByNumber(fichas: ProductFicha[]) { const index = new Map<string, ProductFicha | null>(); fichas.forEach((ficha) => { const key = fichaNumberKey(ficha.clientId, ficha.ftNumber); if (!key) return; index.set(key, index.has(key) ? null : ficha); }); return index; }
function materialLabelForQuoteItem(quote: Quote, item: QuoteItem, fichaByClientNumber: Map<string, ProductFicha | null>, materialById: Map<string, Material>) {
  const ficha = fichaByClientNumber.get(fichaNumberKey(quote.client_id, item.ft_number)) || undefined;
  if (!ficha) return "SEM FICHA TECNICA VINCULADA";
  const snapshot = latestMaterialSnapshot(ficha);
  const material = materialById.get(ficha.materialId || "") || materialById.get(snapshot?.materialId || "");
  return material?.code || snapshot?.materialCode || material?.paperType || snapshot?.paperType || "MATERIAL NAO CADASTRADO";
}
function latestMaterialSnapshot(ficha: ProductFicha) { return [ficha.pricingData, ...(ficha.priceHistory || [])].filter((item): item is MaterialSnapshot => Boolean(item)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0]; }
function fichaNumberKey(clientId?: string | null, ftNumber?: string | null) { return clientId && ftNumber ? `${clientId}::${ftNumber.trim().toUpperCase()}` : ""; }
function sum<T>(items: T[], getValue: (item: T) => number) { return items.reduce((total, item) => total + Number(getValue(item) || 0), 0); }
function average(values: number[]) { return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0; }
function materialPressureValue(value?: string) {
  const match = value?.match(/[\d.,]+/);
  if (!match) return 0;
  const normalized = match[0].includes(",") ? match[0].replace(/\./g, "").replace(",", ".") : match[0];
  return Number(normalized) || 0;
}
function compareMaterialPressure(first?: string, second?: string) { const firstValue = materialPressureValue(first) || Number.POSITIVE_INFINITY; const secondValue = materialPressureValue(second) || Number.POSITIVE_INFINITY; return firstValue - secondValue; }
function materialPressureToneMap(materials: Material[]) {
  const values = [...new Set(materials.map((material) => materialPressureValue(material.pressure)).filter(Boolean))].sort((first, second) => first - second);
  const tones = ["#fff8ed", "#eff8ff", "#f6f2ff", "#fff2f7", "#eefcf7", "#f0f9ff", "#fdf4ff", "#fff7ed", "#f0fdf4"];
  const result = new Map<number, { background: string }>();
  let toneIndex = 0;
  values.forEach((value) => {
    if (value === 5) result.set(value, { background: "#fff2f4" });
    else if (value === 6) result.set(value, { background: "#effaf2" });
    else {
      result.set(value, { background: tones[toneIndex % tones.length] });
      toneIndex += 1;
    }
  });
  return result;
}
function daysSince(value: string) { return value ? Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)) : 0; }
function daysBetween(start: string, end: string) { return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)); }
function isWithinPurchaseFrequency(profile?: Profile) { const frequency = Number(profile?.purchase_frequency_days || 0); return Boolean(frequency && profile?.last_purchase_at && daysSince(profile.last_purchase_at) <= frequency); }
function confidenceWeight(base: number, profile?: Profile) { if (!profile?.purchase_frequency_days || !profile.last_purchase_at) return base; return Math.max(.1, Math.min(.95, base + (isWithinPurchaseFrequency(profile) ? .1 : -.15))); }
function inRange(value: string, range: { start: string; end: string }) { const date = value.slice(0, 10); return Boolean(date && date >= range.start && date <= range.end); }
function resolveRange(preset: PeriodPreset, customStart: string, customEnd: string) { const today = new Date(); if (preset === "CUSTOM") return { start: customStart, end: customEnd }; if (preset === "CURRENT") return { start: isoMonthStart(today), end: isoMonthEnd(today) }; const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1); return { start: isoMonthStart(previous), end: isoMonthEnd(previous) }; }
function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoMonthStart(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`; }
function isoMonthEnd(value: Date) { return new Date(value.getFullYear(), value.getMonth() + 1, 0).toISOString().slice(0, 10); }
function displayDate(value: string) { if (!value) return "NAO INFORMADA"; const [year, month, day] = value.slice(0, 10).split("-"); return year && month && day ? `${day}/${month}/${year}` : value; }
function money(value: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }

const shellStyle = { display: "grid", gap: 18 };
const headerStyle = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" as const };
const eyebrowStyle = { color: "#7c3aed", fontSize: 11, fontWeight: 900, letterSpacing: 2.4 };
const titleStyle = { margin: "6px 0 4px", color: "#141827", fontSize: 29, fontWeight: 900, letterSpacing: 0 };
const subtitleStyle = { margin: 0, color: "#667085", fontSize: 13, fontWeight: 700, maxWidth: 720 };
const periodHintStyle = { padding: "10px 13px", border: "1px solid #d9cdf9", borderRadius: 8, background: "#faf8ff", color: "#6f32d2", fontSize: 11, fontWeight: 900, letterSpacing: .6 };
const filterStyle = { display: "flex", alignItems: "end", gap: 12, flexWrap: "wrap" as const, padding: 14, border: "1px solid #ddd6fe", borderRadius: 8, background: "#fcfbff" };
const filterLabelStyle = { display: "grid", gap: 5, color: "#475467", fontSize: 10, fontWeight: 900, letterSpacing: .8 };
const selectStyle = { minHeight: 38, minWidth: 178, padding: "0 10px", border: "1px solid #cfd6e4", borderRadius: 6, background: "#fff", color: "#141827", fontSize: 12, fontWeight: 800 };
const inputStyle = { minHeight: 38, padding: "0 10px", border: "1px solid #cfd6e4", borderRadius: 6, background: "#fff", color: "#141827", fontSize: 12, fontWeight: 800 };
const ownDataStyle = { minHeight: 38, display: "grid", placeItems: "center", padding: "0 12px", borderRadius: 6, background: "#eefaf2", color: "#16803e", fontSize: 10, fontWeight: 900, letterSpacing: .7 };
const contentStyle = { display: "grid", gap: 16, padding: 18, border: "1px solid #d8dee9", borderRadius: 8, background: "#fff" };
const contentHeaderStyle = { display: "grid", gap: 5, paddingBottom: 13, borderBottom: "1px solid #eef0f4" };
const contentTitleStyle = { margin: 0, color: "#141827", fontSize: 20, fontWeight: 900, letterSpacing: 0 };
const contentDescriptionStyle = { margin: 0, color: "#667085", fontSize: 12, fontWeight: 700, lineHeight: 1.45 };
const metricGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10 };
const metricCardStyle = { minHeight: 78, display: "grid", alignContent: "center", gap: 8, padding: "11px 13px", border: "1px solid #e2e6ef", borderTop: "4px solid", borderRadius: 7, background: "#fff" };
const tableStyle = { width: "100%", borderCollapse: "collapse" as const, tableLayout: "fixed" as const };
const lossDetailsStyle = { display: "grid", gap: 9, marginTop: 8 };
const lossDetailsTitleStyle = { margin: 0, color: "#475467", fontSize: 12, fontWeight: 900, letterSpacing: .7 };
const emptyStyle = { padding: 36, border: "1px dashed #c8b7f3", borderRadius: 8, color: "#667085", textAlign: "center" as const, fontSize: 13, fontWeight: 800 };
const errorStyle = { padding: 14, border: "1px solid #fcb6be", borderRadius: 7, background: "#fff1f2", color: "#be123c", fontSize: 12, fontWeight: 800 };
const emptyCellStyle = { padding: 20, textAlign: "center" as const, color: "#667085", fontWeight: 700 };
const materialTypeGroupCellStyle = { padding: "10px 16px", background: "#f3edff", color: "#5d22c5", fontSize: 12, fontWeight: 900, letterSpacing: .7, textAlign: "left" as const };

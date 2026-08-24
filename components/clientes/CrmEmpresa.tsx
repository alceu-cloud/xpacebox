"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { createCrmActivity, loadCrmOverview, saveCrmOpportunity, saveCrmProfile } from "@/lib/crm";
import CurrencyInput from "@/components/ui/CurrencyInput";
import type { ClientRecord, RepresentativeOption, SellerCompanyOption } from "@/types/clientes";
import type {
  CrmActivityInput,
  CrmCustomerProfile,
  CrmHealth,
  CrmOpportunity,
  CrmOpportunityInput,
  CrmOpportunityStage,
  CrmOverview,
  CrmProfileInput,
} from "@/types/crm";

type CrmView = "agenda" | "carteira" | "pipeline" | "whatsapp";

const stageOptions: Array<{ value: CrmOpportunityStage; label: string }> = [
  { value: "CONTACT_PENDING", label: "CONTATO PENDENTE" },
  { value: "CONTACTED", label: "CONTATADO" },
  { value: "QUOTE_PREPARATION", label: "ORCAMENTO EM PREPARACAO" },
  { value: "QUOTE_SENT", label: "ORCAMENTO ENVIADO" },
  { value: "NEGOTIATION", label: "NEGOCIACAO" },
  { value: "WON", label: "GANHO" },
  { value: "LOST", label: "PERDIDO" },
];

const emptyOverview: CrmOverview = {
  currentProfileId: "",
  currentProfileName: "",
  isManager: false,
  profiles: [],
  activities: [],
  opportunities: [],
  quotes: [],
  whatsappConnections: [],
};

const emptyProfile: CrmProfileInput = {
  clientId: "",
  ownerProfileId: "",
  purchaseFrequencyDays: null,
  averagePurchaseValue: 0,
  lastPurchaseAt: "",
  nextPurchaseAt: "",
  nextContactAt: "",
  relationshipStatus: "ACTIVE",
  whatsappOptIn: false,
  whatsappOptInSource: "CRM",
  notes: "",
};

const emptyActivity: CrmActivityInput = {
  clientId: "",
  representativeProfileId: "",
  activityType: "WHATSAPP",
  outcome: "CONTACTED",
  subject: "",
  notes: "",
  occurredAt: "",
  nextActionType: "FOLLOW_UP",
  nextActionAt: "",
};

const emptyOpportunity: CrmOpportunityInput = {
  clientId: "",
  representativeProfileId: "",
  title: "",
  stage: "CONTACT_PENDING",
  estimatedValue: 0,
  expectedCloseDate: "",
  notes: "",
  lostReason: "",
};

export default function CrmEmpresa({
  slug,
  clients,
  representatives,
  sellerCompanies,
}: {
  slug: string;
  clients: ClientRecord[];
  representatives: RepresentativeOption[];
  sellerCompanies: SellerCompanyOption[];
}) {
  const [overview, setOverview] = useState<CrmOverview>(emptyOverview);
  const [view, setView] = useState<CrmView>("agenda");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profileDraft, setProfileDraft] = useState<CrmProfileInput>(emptyProfile);
  const [activityDraft, setActivityDraft] = useState<CrmActivityInput>(emptyActivity);
  const [opportunityDraft, setOpportunityDraft] = useState<CrmOpportunityInput>(emptyOpportunity);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const next = await loadCrmOverview(slug);
      setOverview(next);
      if (!selectedClientId && clients.length) {
        const firstDue = rankClients(clients, next.profiles)[0];
        setSelectedClientId(firstDue?.client.id || clients[0].id);
      }
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, clients.length]);

  const profileByClient = useMemo(
    () => new Map(overview.profiles.map((profile) => [profile.clientId, profile])),
    [overview.profiles]
  );
  const quoteByClient = useMemo(
    () => new Map(overview.quotes.map((quote) => [quote.clientId, quote])),
    [overview.quotes]
  );
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedProfile = selectedClient ? profileByClient.get(selectedClient.id) : undefined;

  useEffect(() => {
    if (!selectedClient) return;
    const owner = selectedProfile?.ownerProfileId || selectedClient.representativeUserId || overview.currentProfileId;
    setProfileDraft({
      clientId: selectedClient.id,
      ownerProfileId: owner,
      purchaseFrequencyDays: selectedProfile?.purchaseFrequencyDays ?? null,
      averagePurchaseValue: selectedProfile?.averagePurchaseValue ?? 0,
      lastPurchaseAt: selectedProfile?.lastPurchaseAt || "",
      nextPurchaseAt: calculateNextPurchaseDate(selectedProfile?.lastPurchaseAt || "", selectedProfile?.purchaseFrequencyDays ?? null),
      nextContactAt: toLocalDateTime(selectedProfile?.nextContactAt || ""),
      relationshipStatus: selectedProfile?.relationshipStatus || "ACTIVE",
      whatsappOptIn: selectedProfile?.whatsappOptIn ?? false,
      whatsappOptInSource: selectedProfile?.whatsappOptInSource || "CRM",
      notes: selectedProfile?.notes || "",
    });
    setActivityDraft({
      ...emptyActivity,
      clientId: selectedClient.id,
      representativeProfileId: owner,
      occurredAt: toLocalDateTime(new Date().toISOString()),
    });
    setOpportunityDraft({ ...emptyOpportunity, clientId: selectedClient.id, representativeProfileId: owner });
  }, [overview.currentProfileId, selectedClient, selectedProfile]);

  const rankedClients = useMemo(() => rankClients(clients, overview.profiles), [clients, overview.profiles]);
  const visibleClients = useMemo(() => {
    const term = upper(search);
    return rankedClients.filter(({ client, profile }) => {
      const matchesTerm = !term || upper(`${client.clientCode} ${client.legalName} ${client.tradeName} ${client.cnpj}`).includes(term);
      const matchesOwner = ownerFilter === "ALL" || (profile?.ownerProfileId || client.representativeUserId) === ownerFilter;
      return matchesTerm && matchesOwner;
    });
  }, [ownerFilter, rankedClients, search]);
  const agendaClients = visibleClients.filter((item) => item.health !== "GREEN" || item.daysToAction <= 7);
  const selectedActivities = overview.activities.filter((activity) => activity.clientId === selectedClientId);
  const selectedOpportunities = overview.opportunities.filter((opportunity) => opportunity.clientId === selectedClientId);
  const activeOpportunities = overview.opportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST");

  async function handleSaveProfile() {
    if (!selectedClient) return;
    setSaving(true);
    clearFeedback();
    try {
      await saveCrmProfile(slug, {
        ...profileDraft,
        clientId: selectedClient.id,
        nextPurchaseAt: calculateNextPurchaseDate(profileDraft.lastPurchaseAt, profileDraft.purchaseFrequencyDays),
        nextContactAt: toIsoDateTime(profileDraft.nextContactAt),
      });
      await refresh(true);
      setMessage("CARTEIRA DO CLIENTE ATUALIZADA.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveActivity() {
    if (!selectedClient) return;
    setSaving(true);
    clearFeedback();
    try {
      await createCrmActivity(slug, {
        ...activityDraft,
        clientId: selectedClient.id,
        occurredAt: toIsoDateTime(activityDraft.occurredAt) || new Date().toISOString(),
        nextActionAt: toIsoDateTime(activityDraft.nextActionAt),
      });
      await refresh(true);
      setActivityDraft((current) => ({
        ...emptyActivity,
        clientId: selectedClient.id,
        representativeProfileId: current.representativeProfileId,
        occurredAt: toLocalDateTime(new Date().toISOString()),
      }));
      setMessage("CONTATO REGISTRADO NA LINHA DO TEMPO.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOpportunity() {
    if (!selectedClient || !opportunityDraft.title.trim()) {
      setError("INFORME O TITULO DA OPORTUNIDADE.");
      return;
    }
    setSaving(true);
    clearFeedback();
    try {
      await saveCrmOpportunity(slug, { ...opportunityDraft, clientId: selectedClient.id });
      await refresh(true);
      setOpportunityDraft({
        ...emptyOpportunity,
        clientId: selectedClient.id,
        representativeProfileId: opportunityDraft.representativeProfileId,
      });
      setMessage("OPORTUNIDADE SALVA NO FUNIL.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(opportunity: CrmOpportunity, stage: CrmOpportunityStage) {
    const previousStage = opportunity.stage;
    setSaving(true);
    clearFeedback();
    setOverview((current) => ({
      ...current,
      opportunities: current.opportunities.map((item) => item.id === opportunity.id ? { ...item, stage } : item),
    }));
    try {
      await saveCrmOpportunity(slug, {
        id: opportunity.id,
        clientId: opportunity.clientId,
        representativeProfileId: opportunity.representativeProfileId,
        title: opportunity.title,
        stage,
        estimatedValue: opportunity.estimatedValue,
        expectedCloseDate: opportunity.expectedCloseDate,
        notes: opportunity.notes,
        lostReason: opportunity.lostReason,
      });
      await refresh(true);
      setMessage("ETAPA DA OPORTUNIDADE ATUALIZADA.");
    } catch (saveError) {
      setOverview((current) => ({
        ...current,
        opportunities: current.opportunities.map((item) => item.id === opportunity.id ? { ...item, stage: previousStage } : item),
      }));
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function selectClient(clientId: string) {
    setSelectedClientId(clientId);
    clearFeedback();
  }

  const overdueCount = rankedClients.filter((item) => item.health === "RED").length;
  const dueSoonCount = rankedClients.filter((item) => item.health === "YELLOW").length;
  const noHistoryCount = rankedClients.filter((item) => item.health === "GRAY").length;

  return (
    <section className="crm-shell">
      <header className="crm-header">
        <div>
          <span className="clients-eyebrow">CENTRAL COMERCIAL</span>
          <h2>CRM</h2>
          <p>AGENDA, CARTEIRA E OPORTUNIDADES DA EMPRESA.</p>
        </div>
        <div className="crm-summary" aria-label="RESUMO COMERCIAL">
          <SummaryStat label="ATRASADOS" value={overdueCount} tone="red" />
          <SummaryStat label="PROXIMOS" value={dueSoonCount} tone="yellow" />
          <SummaryStat label="EM NEGOCIACAO" value={activeOpportunities.length} tone="purple" />
          <SummaryStat label="SEM HISTORICO" value={noHistoryCount} tone="gray" />
        </div>
      </header>

      <nav className="crm-nav" aria-label="VISOES DO CRM">
        {(["agenda", "carteira", "pipeline", "whatsapp"] as CrmView[]).map((item) => (
          <button key={item} type="button" className={view === item ? "crm-nav-active" : ""} onClick={() => setView(item)}>
            {item === "agenda" ? "AGENDA" : item === "carteira" ? "CARTEIRA" : item === "pipeline" ? "OPORTUNIDADES" : "WHATSAPP"}
          </button>
        ))}
      </nav>

      {error && <div className="clients-feedback clients-feedback-error">{error}</div>}
      {message && <div className="clients-feedback clients-feedback-success">{message}</div>}
      {loading ? <div className="clients-empty crm-loading">CARREGANDO CENTRAL COMERCIAL...</div> : null}

      {!loading && view === "agenda" ? (
        <AgendaBoard
          items={agendaClients}
          search={search}
          setSearch={setSearch}
          ownerFilter={ownerFilter}
          setOwnerFilter={setOwnerFilter}
          representatives={representatives}
          isManager={overview.isManager}
          opportunityCount={(clientId) => activeOpportunities.filter((opportunity) => opportunity.clientId === clientId).length}
          quoteCount={(clientId) => quoteByClient.get(clientId)?.count || 0}
          onOpenClient={(clientId) => {
            selectClient(clientId);
            setView("carteira");
          }}
        />
      ) : null}

      {!loading && view === "carteira" ? (
        <div className="crm-workspace">
            <section className="crm-list-panel">
              <div className="crm-panel-title">
                <div>
                  <span>CLIENTES</span>
                  <strong>CARTEIRA COMERCIAL</strong>
                </div>
                <b>{visibleClients.length}</b>
              </div>
              <div className="crm-list-filters">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BUSCAR CLIENTE" />
                {overview.isManager ? (
                  <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                    <option value="ALL">TODA A EQUIPE</option>
                    {representatives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                ) : null}
              </div>
              <div className="crm-client-list">
                {visibleClients.map((item) => (
                  <ClientListItem
                    key={item.client.id}
                    item={item}
                    active={selectedClientId === item.client.id}
                    opportunityCount={activeOpportunities.filter((opportunity) => opportunity.clientId === item.client.id).length}
                    quoteCount={quoteByClient.get(item.client.id)?.count || 0}
                    onClick={() => selectClient(item.client.id)}
                  />
                ))}
                {visibleClients.length === 0 ? (
                  <div className="clients-empty">NENHUM CLIENTE NESTA VISAO.</div>
                ) : null}
              </div>
            </section>

            <ClientDetail
              client={selectedClient}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              representatives={representatives}
              activities={selectedActivities}
              opportunities={selectedOpportunities}
              quote={selectedClient ? quoteByClient.get(selectedClient.id) : undefined}
              activityDraft={activityDraft}
              setActivityDraft={setActivityDraft}
              opportunityDraft={opportunityDraft}
              setOpportunityDraft={setOpportunityDraft}
              onSaveProfile={handleSaveProfile}
              onSaveActivity={handleSaveActivity}
              onSaveOpportunity={handleSaveOpportunity}
              saving={saving}
            />
          </div>
      ) : null}

      {!loading && view === "pipeline" ? (
        <PipelineBoard
          opportunities={overview.opportunities}
          clients={clients}
          onSelectClient={(clientId) => { selectClient(clientId); setView("carteira"); }}
          onStageChange={handleStageChange}
          saving={saving}
        />
      ) : null}

      {!loading && view === "whatsapp" ? (
        <WhatsAppPanel
          connections={overview.whatsappConnections}
          sellerCompanies={sellerCompanies}
          optedIn={overview.profiles.filter((item) => item.whatsappOptIn).length}
        />
      ) : null}
    </section>
  );
}

function AgendaBoard({
  items,
  search,
  setSearch,
  ownerFilter,
  setOwnerFilter,
  representatives,
  isManager,
  opportunityCount,
  quoteCount,
  onOpenClient,
}: {
  items: RankedClient[];
  search: string;
  setSearch: (value: string) => void;
  ownerFilter: string;
  setOwnerFilter: (value: string) => void;
  representatives: RepresentativeOption[];
  isManager: boolean;
  opportunityCount: (clientId: string) => number;
  quoteCount: (clientId: string) => number;
  onOpenClient: (clientId: string) => void;
}) {
  const groups = [
    { key: "overdue", label: "ATRASADOS", tone: "red", items: items.filter((item) => item.daysToAction < 0) },
    { key: "today", label: "PARA HOJE", tone: "purple", items: items.filter((item) => item.daysToAction === 0) },
    { key: "soon", label: "PROXIMOS 7 DIAS", tone: "yellow", items: items.filter((item) => item.daysToAction > 0 && item.daysToAction <= 7) },
    { key: "unscheduled", label: "SEM PROGRAMACAO", tone: "gray", items: items.filter((item) => item.daysToAction > 7) },
  ];

  return (
    <section className="crm-agenda">
      <header className="crm-agenda-header">
        <div>
          <span className="clients-eyebrow">ROTINA DO VENDEDOR</span>
          <h3>O QUE PRECISA SER FEITO</h3>
          <p>ATENDA AS PRIORIDADES E USE A CARTEIRA PARA CONSULTAR OU ATUALIZAR O CLIENTE.</p>
        </div>
        <div className="crm-list-filters crm-agenda-filters">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BUSCAR NA AGENDA" />
          {isManager ? (
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="ALL">TODA A EQUIPE</option>
              {representatives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          ) : null}
        </div>
      </header>

      <div className="crm-agenda-groups">
        {groups.map((group) => (
          <section className={`crm-agenda-group crm-agenda-${group.tone}`} key={group.key}>
            <header><strong>{group.label}</strong><span>{group.items.length}</span></header>
            <div>
              {group.items.map((item) => {
                const phone = item.client.whatsapp || item.client.phone;
                return (
                  <article className="crm-agenda-item" key={item.client.id}>
                    <i className={`crm-dot crm-dot-${item.health.toLowerCase()}`} />
                    <div className="crm-agenda-client">
                      <strong>{item.client.tradeName || item.client.legalName}</strong>
                      <span>{item.profile?.ownerName || item.client.representativeName || "SEM RESPONSAVEL"}</span>
                    </div>
                    <div className="crm-agenda-action">
                      <b>{agendaActionLabel(item)}</b>
                      <span>{nextActionLabel(item)} · {agendaDateLabel(item)}</span>
                    </div>
                    <div className="crm-agenda-context">
                      <span>{opportunityCount(item.client.id)} NEGOCIACAO(OES)</span>
                      <span>{quoteCount(item.client.id)} ORCAMENTO(S)</span>
                    </div>
                    <div className="crm-agenda-buttons">
                      {phone ? <a href={whatsAppLink(phone, item.client.buyerName || item.client.tradeName || item.client.legalName)} target="_blank" rel="noreferrer" title="ABRIR WHATSAPP">WHATSAPP</a> : null}
                      <button type="button" onClick={() => onOpenClient(item.client.id)}>ATENDER</button>
                    </div>
                  </article>
                );
              })}
              {!group.items.length ? <p>NENHUMA ACAO NESTA FAIXA.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ClientDetail({
  client,
  profileDraft,
  setProfileDraft,
  representatives,
  activities,
  opportunities,
  quote,
  activityDraft,
  setActivityDraft,
  opportunityDraft,
  setOpportunityDraft,
  onSaveProfile,
  onSaveActivity,
  onSaveOpportunity,
  saving,
}: {
  client: ClientRecord | null;
  profileDraft: CrmProfileInput;
  setProfileDraft: (value: CrmProfileInput) => void;
  representatives: RepresentativeOption[];
  activities: CrmOverview["activities"];
  opportunities: CrmOpportunity[];
  quote: CrmOverview["quotes"][number] | undefined;
  activityDraft: CrmActivityInput;
  setActivityDraft: (value: CrmActivityInput) => void;
  opportunityDraft: CrmOpportunityInput;
  setOpportunityDraft: (value: CrmOpportunityInput) => void;
  onSaveProfile: () => void;
  onSaveActivity: () => void;
  onSaveOpportunity: () => void;
  saving: boolean;
}) {
  const [detailTab, setDetailTab] = useState<"resumo" | "contato" | "negocio">("resumo");
  if (!client) return <section className="crm-detail-panel crm-detail-empty">SELECIONE UM CLIENTE PARA ABRIR A CARTEIRA.</section>;
  const phone = client.whatsapp || client.phone;

  return (
    <section className="crm-detail-panel">
      <header className="crm-customer-header">
        <div>
          <span>{client.clientCode} · {client.sellerCompanyName || "EMPRESA"}</span>
          <h3>{client.tradeName || client.legalName}</h3>
          <p>{client.buyerName || "COMPRADOR NAO INFORMADO"} · {phone || "SEM TELEFONE"}</p>
        </div>
        <div className="crm-customer-actions">
          {phone ? <a href={whatsAppLink(phone, client.buyerName || client.tradeName || client.legalName)} target="_blank" rel="noreferrer">ABRIR WHATSAPP</a> : null}
          <span className={`crm-health crm-health-${calculateHealth(toProfile(profileDraft)).toLowerCase()}`}>{healthLabel(calculateHealth(toProfile(profileDraft)))}</span>
        </div>
      </header>

      <nav className="crm-detail-tabs">
        <button type="button" className={detailTab === "resumo" ? "active" : ""} onClick={() => setDetailTab("resumo")}>RESUMO</button>
        <button type="button" className={detailTab === "contato" ? "active" : ""} onClick={() => setDetailTab("contato")}>REGISTRAR CONTATO</button>
        <button type="button" className={detailTab === "negocio" ? "active" : ""} onClick={() => setDetailTab("negocio")}>NOVA OPORTUNIDADE</button>
      </nav>

      {detailTab === "resumo" ? (
        <>
          <div className="crm-metrics">
            <Metric label="FREQUENCIA" value={profileDraft.purchaseFrequencyDays ? `${profileDraft.purchaseFrequencyDays} DIAS` : "NAO DEFINIDA"} />
            <Metric label="COMPRA MEDIA" value={money(profileDraft.averagePurchaseValue)} />
            <Metric label="ORCAMENTOS" value={`${quote?.count || 0} · ${money(quote?.total || 0)}`} />
            <Metric label="NEGOCIOS ATIVOS" value={String(opportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST").length)} />
          </div>
          <div className="crm-profile-grid">
            <CrmSelect label="RESPONSAVEL" value={profileDraft.ownerProfileId} onChange={(ownerProfileId) => setProfileDraft({ ...profileDraft, ownerProfileId })} options={representatives.map((item) => ({ value: item.id, label: item.name }))} />
            <CrmInput label="FREQUENCIA DE COMPRA (DIAS)" type="number" value={profileDraft.purchaseFrequencyDays ?? ""} onChange={(value) => { const purchaseFrequencyDays = value ? Number(value) : null; setProfileDraft({ ...profileDraft, purchaseFrequencyDays, nextPurchaseAt: calculateNextPurchaseDate(profileDraft.lastPurchaseAt, purchaseFrequencyDays) }); }} />
            <CrmInput label="VALOR MEDIO DE COMPRA" value={profileDraft.averagePurchaseValue || ""} onChange={(value) => setProfileDraft({ ...profileDraft, averagePurchaseValue: Number(value || 0) })} currency />
            <CrmInput label="ULTIMA COMPRA" type="date" value={profileDraft.lastPurchaseAt} onChange={(lastPurchaseAt) => setProfileDraft({ ...profileDraft, lastPurchaseAt, nextPurchaseAt: calculateNextPurchaseDate(lastPurchaseAt, profileDraft.purchaseFrequencyDays) })} />
            <CrmInput label="PROXIMA COMPRA PREVISTA" type="date" value={profileDraft.nextPurchaseAt} onChange={() => undefined} readOnly />
            <CrmInput label="PROXIMO CONTATO" type="datetime-local" value={profileDraft.nextContactAt} onChange={(nextContactAt) => setProfileDraft({ ...profileDraft, nextContactAt })} />
            <CrmSelect label="SITUACAO" value={profileDraft.relationshipStatus} onChange={(relationshipStatus) => setProfileDraft({ ...profileDraft, relationshipStatus: relationshipStatus as CrmProfileInput["relationshipStatus"] })} options={[{ value: "ACTIVE", label: "ATIVO" }, { value: "DORMANT", label: "INATIVO COMERCIAL" }, { value: "BLOCKED", label: "BLOQUEADO" }]} />
            <label className="crm-check-field"><input type="checkbox" checked={profileDraft.whatsappOptIn} onChange={(event) => setProfileDraft({ ...profileDraft, whatsappOptIn: event.target.checked })} /><span>AUTORIZOU CONTATO PELO WHATSAPP</span></label>
            <label className="crm-textarea crm-span-2"><span>ANOTACOES DA CARTEIRA</span><textarea value={profileDraft.notes} onChange={(event) => setProfileDraft({ ...profileDraft, notes: upper(event.target.value) })} /></label>
          </div>
          <div className="crm-form-actions"><button type="button" onClick={onSaveProfile} disabled={saving}>SALVAR CARTEIRA</button></div>
          <Timeline activities={activities} opportunities={opportunities} />
        </>
      ) : null}

      {detailTab === "contato" ? (
        <div className="crm-entry-form">
          <div className="crm-profile-grid">
            <CrmSelect label="CANAL" value={activityDraft.activityType} onChange={(activityType) => setActivityDraft({ ...activityDraft, activityType: activityType as CrmActivityInput["activityType"] })} options={[{ value: "WHATSAPP", label: "WHATSAPP" }, { value: "CALL", label: "LIGACAO" }, { value: "EMAIL", label: "E-MAIL" }, { value: "VISIT", label: "VISITA" }, { value: "NOTE", label: "ANOTACAO" }, { value: "QUOTE", label: "ORCAMENTO" }]} />
            <CrmSelect label="RESULTADO" value={activityDraft.outcome} onChange={(outcome) => setActivityDraft({ ...activityDraft, outcome: outcome as CrmActivityInput["outcome"] })} options={[{ value: "CONTACTED", label: "CONTATO REALIZADO" }, { value: "NO_RESPONSE", label: "SEM RESPOSTA" }, { value: "QUOTE_REQUESTED", label: "SOLICITOU ORCAMENTO" }, { value: "PURCHASE_EXPECTED", label: "COMPRA PREVISTA" }, { value: "FOLLOW_UP", label: "ACOMPANHAR" }, { value: "NO_INTEREST", label: "SEM INTERESSE" }, { value: "OTHER", label: "OUTRO" }]} />
            <CrmSelect label="REPRESENTANTE" value={activityDraft.representativeProfileId} onChange={(representativeProfileId) => setActivityDraft({ ...activityDraft, representativeProfileId })} options={representatives.map((item) => ({ value: item.id, label: item.name }))} />
            <CrmInput label="DATA DO CONTATO" type="datetime-local" value={activityDraft.occurredAt} onChange={(occurredAt) => setActivityDraft({ ...activityDraft, occurredAt })} />
            <CrmInput label="ASSUNTO" value={activityDraft.subject} onChange={(subject) => setActivityDraft({ ...activityDraft, subject: upper(subject) })} />
            <CrmSelect label="PROXIMA ACAO" value={activityDraft.nextActionType} onChange={(nextActionType) => setActivityDraft({ ...activityDraft, nextActionType: nextActionType as CrmActivityInput["nextActionType"] })} options={[{ value: "FOLLOW_UP", label: "ACOMPANHAR" }, { value: "WHATSAPP", label: "WHATSAPP" }, { value: "CALL", label: "LIGAR" }, { value: "EMAIL", label: "E-MAIL" }, { value: "VISIT", label: "VISITAR" }, { value: "QUOTE", label: "ORCAMENTO" }]} />
            <CrmInput label="DATA DA PROXIMA ACAO" type="datetime-local" value={activityDraft.nextActionAt} onChange={(nextActionAt) => setActivityDraft({ ...activityDraft, nextActionAt })} />
            <label className="crm-textarea crm-span-2"><span>RESUMO DO CONTATO</span><textarea value={activityDraft.notes} onChange={(event) => setActivityDraft({ ...activityDraft, notes: upper(event.target.value) })} /></label>
          </div>
          <div className="crm-form-actions"><button type="button" onClick={onSaveActivity} disabled={saving}>REGISTRAR CONTATO</button></div>
        </div>
      ) : null}

      {detailTab === "negocio" ? (
        <div className="crm-entry-form">
          <div className="crm-profile-grid">
            <CrmInput label="OPORTUNIDADE" value={opportunityDraft.title} onChange={(title) => setOpportunityDraft({ ...opportunityDraft, title: upper(title) })} />
            <CrmSelect label="ETAPA" value={opportunityDraft.stage} onChange={(stage) => setOpportunityDraft({ ...opportunityDraft, stage: stage as CrmOpportunityStage })} options={stageOptions} />
            <CrmInput label="VALOR ESTIMADO" value={opportunityDraft.estimatedValue || ""} onChange={(value) => setOpportunityDraft({ ...opportunityDraft, estimatedValue: Number(value || 0) })} currency />
            <CrmInput label="PREVISAO DE FECHAMENTO" type="date" value={opportunityDraft.expectedCloseDate} onChange={(expectedCloseDate) => setOpportunityDraft({ ...opportunityDraft, expectedCloseDate })} />
            <CrmSelect label="REPRESENTANTE" value={opportunityDraft.representativeProfileId} onChange={(representativeProfileId) => setOpportunityDraft({ ...opportunityDraft, representativeProfileId })} options={representatives.map((item) => ({ value: item.id, label: item.name }))} />
            <label className="crm-textarea crm-span-2"><span>ANOTACOES</span><textarea value={opportunityDraft.notes} onChange={(event) => setOpportunityDraft({ ...opportunityDraft, notes: upper(event.target.value) })} /></label>
          </div>
          <div className="crm-form-actions"><button type="button" onClick={onSaveOpportunity} disabled={saving}>CRIAR OPORTUNIDADE</button></div>
        </div>
      ) : null}
    </section>
  );
}

function PipelineBoard({ opportunities, clients, onSelectClient, onStageChange, saving }: { opportunities: CrmOpportunity[]; clients: ClientRecord[]; onSelectClient: (id: string) => void; onStageChange: (opportunity: CrmOpportunity, stage: CrmOpportunityStage) => void; saving: boolean }) {
  const [draggedOpportunityId, setDraggedOpportunityId] = useState("");
  const [dropStage, setDropStage] = useState<CrmOpportunityStage | "">("");
  const clientNames = new Map(clients.map((client) => [client.id, client.tradeName || client.legalName]));

  function handleDragStart(event: DragEvent<HTMLElement>, opportunityId: string) {
    setDraggedOpportunityId(opportunityId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", opportunityId);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>, stage: CrmOpportunityStage) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    if (dropStage === stage) setDropStage("");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, stage: CrmOpportunityStage) {
    event.preventDefault();
    const opportunityId = event.dataTransfer.getData("text/plain") || draggedOpportunityId;
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    setDraggedOpportunityId("");
    setDropStage("");
    if (!opportunity || opportunity.stage === stage || saving) return;
    onStageChange(opportunity, stage);
  }

  return (
    <section className="crm-pipeline">
      {stageOptions.map((stage) => {
        const items = opportunities.filter((item) => item.stage === stage.value);
        const stageTotal = items.reduce((total, item) => total + Number(item.estimatedValue || 0), 0);
        return (
          <div
            className={`crm-pipeline-column crm-stage-${stage.value.toLowerCase()}${dropStage === stage.value ? " is-drop-target" : ""}`}
            key={stage.value}
            onDragEnter={(event) => { event.preventDefault(); setDropStage(stage.value); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDragLeave={(event) => handleDragLeave(event, stage.value)}
            onDrop={(event) => handleDrop(event, stage.value)}
          >
            <header>
              <div><strong>{stage.label}</strong><small>{money(stageTotal)}</small></div>
              <span>{items.length}</span>
            </header>
            <div>
              {items.map((item) => (
                <article
                  className={`crm-opportunity-card${draggedOpportunityId === item.id ? " is-dragging" : ""}`}
                  draggable={!saving}
                  key={item.id}
                  onDragStart={(event) => handleDragStart(event, item.id)}
                  onDragEnd={() => { setDraggedOpportunityId(""); setDropStage(""); }}
                >
                  <button type="button" onClick={() => onSelectClient(item.clientId)}>{clientNames.get(item.clientId) || "CLIENTE"}</button>
                  <strong>{item.title}</strong>
                  <span>{money(item.estimatedValue)}</span>
                  <small>{item.expectedCloseDate ? `PREVISAO ${displayDate(item.expectedCloseDate)}` : "SEM PREVISAO"}</small>
                </article>
              ))}
              {!items.length ? <p>SEM OPORTUNIDADES.</p> : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function WhatsAppPanel({ connections, sellerCompanies, optedIn }: { connections: CrmOverview["whatsappConnections"]; sellerCompanies: SellerCompanyOption[]; optedIn: number }) {
  const bySeller = new Map(connections.map((item) => [item.sellerCompanyId, item]));
  return (
    <section className="crm-whatsapp-panel">
      <header><div><span className="clients-eyebrow">CANAIS OFICIAIS</span><h3>WHATSAPP BUSINESS</h3></div><strong>{optedIn} CLIENTES COM AUTORIZACAO</strong></header>
      <div className="crm-whatsapp-grid">
        {sellerCompanies.map((seller) => {
          const connection = bySeller.get(seller.id);
          const connected = connection?.status === "CONNECTED";
          return (
            <article key={seller.id}>
              <div className={connected ? "connected" : "pending"}>{connected ? "ATIVO" : "AGUARDANDO CONEXAO"}</div>
              <h4>{seller.name}</h4>
              <p>{connection?.displayPhoneNumber || "NUMERO NAO CONECTADO"}</p>
              <span>{connected ? connection?.displayName || "WHATSAPP BUSINESS" : "META EMBEDDED SIGNUP"}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Timeline({ activities, opportunities }: { activities: CrmOverview["activities"]; opportunities: CrmOpportunity[] }) {
  const rows = [
    ...activities.map((item) => ({ id: item.id, date: item.occurredAt, title: `${activityLabel(item.activityType)} · ${outcomeLabel(item.outcome)}`, detail: item.notes || item.subject || "CONTATO REGISTRADO", type: "CONTATO" })),
    ...opportunities.map((item) => ({ id: item.id, date: item.updatedAt, title: item.title, detail: `${stageOptions.find((stage) => stage.value === item.stage)?.label || item.stage} · ${money(item.estimatedValue)}`, type: "NEGOCIO" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  return (
    <section className="crm-timeline">
      <h4>LINHA DO TEMPO</h4>
      {rows.map((row) => <article key={`${row.type}-${row.id}`}><i /><div><span>{row.type} · {displayDateTime(row.date)}</span><strong>{row.title}</strong><p>{row.detail}</p></div></article>)}
      {!rows.length ? <div className="clients-empty">NENHUM CONTATO OU NEGOCIO REGISTRADO.</div> : null}
    </section>
  );
}

function ClientListItem({ item, active, opportunityCount, quoteCount, onClick }: { item: RankedClient; active: boolean; opportunityCount: number; quoteCount: number; onClick: () => void }) {
  return (
    <button type="button" className={`crm-client-row ${active ? "active" : ""}`} onClick={onClick}>
      <i className={`crm-dot crm-dot-${item.health.toLowerCase()}`} />
      <div><strong>{item.client.tradeName || item.client.legalName}</strong><span>{item.client.clientCode} · {item.profile?.ownerName || item.client.representativeName || "SEM RESPONSAVEL"}</span></div>
      <div className="crm-client-row-info"><b>{nextActionLabel(item)}</b><small>{opportunityCount} NEG. · {quoteCount} ORC.</small></div>
    </button>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className={`crm-stat crm-stat-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="crm-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function CrmInput({ label, value, onChange, type = "text", currency = false, readOnly = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; currency?: boolean; readOnly?: boolean }) {
  return <label className="crm-field"><span>{label}</span>{currency ? <CurrencyInput value={value} onValueChange={(nextValue) => onChange(nextValue === null ? "" : String(nextValue))} readOnly={readOnly} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} />}</label>;
}

function CrmSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="crm-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">SELECIONE</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}

type RankedClient = {
  client: ClientRecord;
  profile?: CrmCustomerProfile;
  health: CrmHealth;
  daysToAction: number;
  nextPurchaseAt: string;
};

function rankClients(clients: ClientRecord[], profiles: CrmCustomerProfile[]): RankedClient[] {
  const profileMap = new Map(profiles.map((profile) => [profile.clientId, profile]));
  const healthRank: Record<CrmHealth, number> = { RED: 0, YELLOW: 1, GRAY: 2, GREEN: 3 };
  return clients.map((client) => {
    const profile = profileMap.get(client.id);
    const nextPurchaseAt = purchaseDate(profile);
    const health = calculateHealth(profile, nextPurchaseAt);
    const actionDates = [profile?.nextContactAt, nextPurchaseAt].filter(Boolean) as string[];
    const daysToAction = actionDates.length ? Math.min(...actionDates.map(daysUntil)) : 99999;
    return { client, profile, health, daysToAction, nextPurchaseAt };
  }).sort((a, b) => healthRank[a.health] - healthRank[b.health] || a.daysToAction - b.daysToAction || a.client.legalName.localeCompare(b.client.legalName, "pt-BR"));
}

function purchaseDate(profile?: CrmCustomerProfile) {
  if (!profile) return "";
  return calculateNextPurchaseDate(profile.lastPurchaseAt, profile.purchaseFrequencyDays);
}

function calculateNextPurchaseDate(lastPurchaseAt: string, purchaseFrequencyDays: number | null) {
  if (!lastPurchaseAt || !purchaseFrequencyDays || purchaseFrequencyDays <= 0) return "";
  const [year, month, day] = lastPurchaseAt.split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() + purchaseFrequencyDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calculateHealth(profile?: CrmCustomerProfile, calculatedPurchase = ""): CrmHealth {
  if (!profile || profile.relationshipStatus === "BLOCKED") return "GRAY";
  const dates = [profile.nextContactAt, calculatedPurchase || purchaseDate(profile)].filter(Boolean) as string[];
  if (!dates.length) return "GRAY";
  const closest = Math.min(...dates.map(daysUntil));
  if (closest < 0) return "RED";
  if (closest <= 7) return "YELLOW";
  return "GREEN";
}

function nextActionLabel(item: RankedClient) {
  if (item.health === "GRAY") return "PROGRAMAR CONTATO";
  if (item.daysToAction < 0) return `${Math.abs(item.daysToAction)} DIA(S) ATRASADO`;
  if (item.daysToAction === 0) return "HOJE";
  return `EM ${item.daysToAction} DIA(S)`;
}

function agendaActionLabel(item: RankedClient) {
  if (item.health === "GRAY") return "PROGRAMAR PRIMEIRO CONTATO";
  const contactDays = item.profile?.nextContactAt ? daysUntil(item.profile.nextContactAt) : 99999;
  const purchaseDays = item.nextPurchaseAt ? daysUntil(item.nextPurchaseAt) : 99999;
  if (contactDays <= purchaseDays) return "REALIZAR CONTATO PROGRAMADO";
  return "ACOMPANHAR PREVISAO DE COMPRA";
}

function agendaDateLabel(item: RankedClient) {
  if (item.health === "GRAY") return "SEM DATA DEFINIDA";
  const contactDays = item.profile?.nextContactAt ? daysUntil(item.profile.nextContactAt) : 99999;
  const purchaseDays = item.nextPurchaseAt ? daysUntil(item.nextPurchaseAt) : 99999;
  const value = contactDays <= purchaseDays ? item.profile?.nextContactAt : item.nextPurchaseAt;
  return value ? displayDate(value) : "SEM DATA DEFINIDA";
}

function toProfile(input: CrmProfileInput): CrmCustomerProfile {
  return { ...input, ownerName: "", whatsappOptInAt: "", updatedAt: "" };
}

function daysUntil(value: string) {
  const target = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.floor((target.getTime() - start.getTime()) / 86400000);
}

function whatsAppLink(value: string, name: string) {
  const clean = value.replace(/\D/g, "");
  const phone = clean.startsWith("55") ? clean : `55${clean}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(`OLA ${name}, TUDO BEM?`)}`;
}

function healthLabel(value: CrmHealth) {
  return value === "RED" ? "ATENCAO" : value === "YELLOW" ? "PROXIMO" : value === "GREEN" ? "EM DIA" : "SEM AGENDA";
}

function activityLabel(value: string) {
  return ({ WHATSAPP: "WHATSAPP", CALL: "LIGACAO", EMAIL: "E-MAIL", VISIT: "VISITA", NOTE: "ANOTACAO", QUOTE: "ORCAMENTO" } as Record<string, string>)[value] || value;
}

function outcomeLabel(value: string) {
  return ({ CONTACTED: "CONTATO REALIZADO", NO_RESPONSE: "SEM RESPOSTA", QUOTE_REQUESTED: "SOLICITOU ORCAMENTO", PURCHASE_EXPECTED: "COMPRA PREVISTA", FOLLOW_UP: "ACOMPANHAR", NO_INTEREST: "SEM INTERESSE", OTHER: "OUTRO" } as Record<string, string>)[value] || value;
}

function displayDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function displayDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function toLocalDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : "";
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function upper(value: string) {
  return (value || "").toLocaleUpperCase("pt-BR");
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "NAO FOI POSSIVEL CONCLUIR A OPERACAO.";
}

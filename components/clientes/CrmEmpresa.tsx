"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { createCrmActivity, loadCrmOverview, postponeCrmAgenda, saveCrmOpportunity, saveCrmProfile } from "@/lib/crm";
import { useCrmOperationalLock } from "@/components/clientes/CrmOperationalLock";
import TelephonyCallHistory from "@/components/clientes/TelephonyCallHistory";
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
import type { ProductFicha } from "@/types/gerenciador";
import type { GeneralOption } from "@/types/cadastros-gerais";

type CrmView = "agenda" | "carteira" | "pipeline";
type CrmClosedPeriod = "ALL" | "MONTH" | "QUARTER" | "SEMESTER" | "CUSTOM";
type CrmDetailEntryTab = "resumo" | "contato";
type PurchaseAverageAlert = {
  clientId: string;
  clientName: string;
  opportunityValue: number;
  averageValue: number;
  differencePercent: number;
};

const purchaseAverageAlertThreshold = 0.3;

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
  telephonyCalls: [],
  opportunities: [],
  quotes: [],
  expiredQuotes: [],
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
  linkedActivityId: "",
  reuseExistingAgenda: false,
  productFichaId: "",
  productReference: "",
  productQuantity: 1,
  productUnitPrice: 0,
  representativeProfileId: "",
  title: "",
  stage: "CONTACT_PENDING",
  estimatedValue: 0,
  expectedCloseDate: "",
  notes: "",
  lostReason: "",
  nextActionType: "FOLLOW_UP",
  nextActionAt: "",
};

export default function CrmEmpresa({
  slug,
  clients,
  representatives,
  sellerCompanies,
  productFichas,
  lostReasons,
  forcedClientId = "",
}: {
  slug: string;
  clients: ClientRecord[];
  representatives: RepresentativeOption[];
  sellerCompanies: SellerCompanyOption[];
  productFichas: ProductFicha[];
  lostReasons: GeneralOption[];
  forcedClientId?: string;
}) {
  const { isBlocked: crmBlocked, lock: crmLock, refreshOperationalLock } = useCrmOperationalLock();
  const [overview, setOverview] = useState<CrmOverview>(emptyOverview);
  const [view, setView] = useState<CrmView>("agenda");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [detailEntryTab, setDetailEntryTab] = useState<CrmDetailEntryTab>("resumo");
  const [agendaSearch, setAgendaSearch] = useState("");
  const [agendaOwnerFilter, setAgendaOwnerFilter] = useState("ALL");
  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioOwnerFilter, setPortfolioOwnerFilter] = useState("ALL");
  const [pipelineClosedPeriod, setPipelineClosedPeriod] = useState<CrmClosedPeriod>("ALL");
  const [pipelineClosedStart, setPipelineClosedStart] = useState("");
  const [pipelineClosedEnd, setPipelineClosedEnd] = useState("");
  const [pipelineOpenCompanyFilter, setPipelineOpenCompanyFilter] = useState("ALL");
  const [pipelineOpenClientFilter, setPipelineOpenClientFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [postponingClientId, setPostponingClientId] = useState("");
  const [profileDraft, setProfileDraft] = useState<CrmProfileInput>(emptyProfile);
  const [activityDraft, setActivityDraft] = useState<CrmActivityInput>(emptyActivity);
  const [opportunityDraft, setOpportunityDraft] = useState<CrmOpportunityInput>(emptyOpportunity);
  const [lostStagePrompt, setLostStagePrompt] = useState<CrmOpportunity | null>(null);
  const [lostStageReason, setLostStageReason] = useState("");
  const [purchaseAverageAlert, setPurchaseAverageAlert] = useState<PurchaseAverageAlert | null>(null);

  useEffect(() => {
    if (!forcedClientId) return;
    setSelectedClientId(forcedClientId);
    setDetailEntryTab("resumo");
    setView("carteira");
    setPortfolioSearch("");
  }, [forcedClientId]);

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
  const expiredQuoteCountByClient = useMemo(
    () => new Map(overview.expiredQuotes.map((quote) => [quote.clientId, quote.count])),
    [overview.expiredQuotes]
  );
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedProfile = selectedClient ? profileByClient.get(selectedClient.id) : undefined;
  const scheduledActivity = useMemo(() => {
    if (!selectedClient) return undefined;
    const nextContactAt = selectedProfile?.nextContactAt || "";
    return overview.activities.find((activity) => {
      if (activity.clientId !== selectedClient.id || !activity.nextActionAt || activity.opportunityId) return false;
      return !nextContactAt || new Date(activity.nextActionAt).getTime() === new Date(nextContactAt).getTime();
    });
  }, [overview.activities, selectedClient, selectedProfile?.nextContactAt]);
  const scheduledAgendaAt = scheduledActivity?.nextActionAt || selectedProfile?.nextContactAt || "";

  useEffect(() => {
    if (!selectedClient) return;
    const owner = selectedProfile?.ownerProfileId || selectedClient.representativeUserId || overview.currentProfileId;
    const nextContactAt = selectedProfile?.nextContactAt || "";
    setProfileDraft({
      clientId: selectedClient.id,
      ownerProfileId: owner,
      purchaseFrequencyDays: selectedProfile?.purchaseFrequencyDays ?? null,
      averagePurchaseValue: selectedProfile?.averagePurchaseValue ?? 0,
      lastPurchaseAt: selectedProfile?.lastPurchaseAt || "",
      nextPurchaseAt:
        selectedProfile?.nextPurchaseAt ||
        calculateNextPurchaseDate(selectedProfile?.lastPurchaseAt || "", selectedProfile?.purchaseFrequencyDays ?? null),
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
      nextActionType: "",
      nextActionAt: "",
    });
    setOpportunityDraft({ ...emptyOpportunity, clientId: selectedClient.id, representativeProfileId: owner });
  }, [overview.currentProfileId, selectedClient, selectedProfile, scheduledActivity]);

  const activeOpportunities = useMemo(
    () => overview.opportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST"),
    [overview.opportunities]
  );
  const activeOpportunityClientIds = useMemo(
    () => new Set(activeOpportunities.map((item) => item.clientId)),
    [activeOpportunities]
  );
  const rankedClients = useMemo(() => rankClients(clients, overview.profiles), [clients, overview.profiles]);
  const agendaFilteredClients = useMemo(() => {
    const term = upper(agendaSearch);
    return rankedClients.filter(({ client, profile }) => {
      const matchesTerm = !term || upper(`${client.clientCode} ${client.legalName} ${client.tradeName} ${client.cnpj}`).includes(term);
      const matchesOwner = agendaOwnerFilter === "ALL" || (profile?.ownerProfileId || client.representativeUserId) === agendaOwnerFilter;
      return matchesTerm && matchesOwner;
    });
  }, [agendaOwnerFilter, agendaSearch, rankedClients]);
  const portfolioFilteredClients = useMemo(() => {
    const term = upper(portfolioSearch);
    return rankedClients.filter(({ client, profile }) => {
      const matchesTerm = !term || upper(`${client.clientCode} ${client.legalName} ${client.tradeName} ${client.cnpj}`).includes(term);
      const matchesOwner = portfolioOwnerFilter === "ALL" || (profile?.ownerProfileId || client.representativeUserId) === portfolioOwnerFilter;
      return matchesTerm && matchesOwner;
    });
  }, [portfolioOwnerFilter, portfolioSearch, rankedClients]);
  const agendaClients = agendaFilteredClients.filter((item) => {
    const hasActiveOpportunity = activeOpportunityClientIds.has(item.client.id);
    const hasScheduledContact = Boolean(item.profile?.nextContactAt);
    return (!hasActiveOpportunity || hasScheduledContact) && (item.health !== "GREEN" || item.daysToAction <= 7);
  });
  const agendaOverdueCount = agendaClients.filter((item) => item.daysToAction < 0).length;
  const agendaTodayCount = agendaClients.filter((item) => item.daysToAction === 0).length;
  const agendaTomorrowCount = agendaClients.filter((item) => item.daysToAction === 1).length;
  const agendaUpcomingCount = agendaClients.filter((item) => item.daysToAction >= 2 && item.daysToAction <= 7).length;
  const pipelineClientCompanyIds = useMemo(
    () => new Map(clients.map((client) => [client.id, client.sellerCompanyId])),
    [clients]
  );
  const visiblePipelineOpportunities = useMemo(
    () => overview.opportunities.filter((item) => {
      if (item.stage !== "WON" && item.stage !== "LOST") {
        const matchesCompany = pipelineOpenCompanyFilter === "ALL" || pipelineClientCompanyIds.get(item.clientId) === pipelineOpenCompanyFilter;
        const matchesClient = pipelineOpenClientFilter === "ALL" || item.clientId === pipelineOpenClientFilter;
        return matchesCompany && matchesClient;
      }
      return isInsideClosedPeriod(item.updatedAt || item.createdAt, pipelineClosedPeriod, pipelineClosedStart, pipelineClosedEnd);
    }),
    [overview.opportunities, pipelineClientCompanyIds, pipelineClosedEnd, pipelineClosedPeriod, pipelineClosedStart, pipelineOpenClientFilter, pipelineOpenCompanyFilter]
  );
  const visiblePipelineActiveOpportunities = visiblePipelineOpportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST");
  const quoteSentCount = visiblePipelineOpportunities.filter((item) => item.stage === "QUOTE_SENT").length;
  const negotiationCount = visiblePipelineOpportunities.filter((item) => item.stage === "NEGOTIATION").length;
  const wonOpportunityCount = visiblePipelineOpportunities.filter((item) => item.stage === "WON").length;
  const selectedActivities = overview.activities.filter((activity) => activity.clientId === selectedClientId);
  const selectedTelephonyCalls = overview.telephonyCalls.filter((call) => call.clientId === selectedClientId);
  const selectedOpportunities = overview.opportunities.filter((opportunity) => opportunity.clientId === selectedClientId);

  async function handleSaveProfile() {
    if (!selectedClient) return;
    setSaving(true);
    clearFeedback();
    try {
      await saveCrmProfile(slug, {
        ...profileDraft,
        clientId: selectedClient.id,
        nextPurchaseAt:
          profileDraft.nextPurchaseAt ||
          calculateNextPurchaseDate(profileDraft.lastPurchaseAt, profileDraft.purchaseFrequencyDays),
        nextContactAt: toIsoDateTime(profileDraft.nextContactAt),
      });
      await refresh(true);
      await refreshOperationalLock();
      setMessage("CARTEIRA DO CLIENTE ATUALIZADA.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveActivity() {
    if (!selectedClient) return;
    if (!activityDraft.nextActionType || !activityDraft.nextActionAt) {
      setError("INFORME A PROXIMA ACAO E A DATA PARA GERAR A AGENDA.");
      return;
    }
    setSaving(true);
    clearFeedback();
    try {
      const savedNextActionAt = toIsoDateTime(activityDraft.nextActionAt);
      await createCrmActivity(slug, {
        ...activityDraft,
        clientId: selectedClient.id,
        occurredAt: toIsoDateTime(activityDraft.occurredAt) || new Date().toISOString(),
        nextActionAt: savedNextActionAt,
      });
      await refresh(true);
      await refreshOperationalLock();
      setActivityDraft((current) => ({
        ...emptyActivity,
        clientId: selectedClient.id,
        representativeProfileId: current.representativeProfileId,
        occurredAt: toLocalDateTime(new Date().toISOString()),
        nextActionType: "",
        nextActionAt: "",
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
    const editingExistingOpportunity = Boolean(opportunityDraft.id);
    if (!editingExistingOpportunity && (!opportunityDraft.nextActionType || !opportunityDraft.nextActionAt)) {
      setError("INFORME A PROXIMA ACAO E A DATA PARA GERAR A AGENDA.");
      return;
    }
    if (opportunityDraft.stage === "LOST" && !opportunityDraft.lostReason.trim()) {
      setError("INFORME O MOTIVO DA PERDA.");
      return;
    }
    setSaving(true);
    clearFeedback();
    try {
      const result = await saveCrmOpportunity(slug, {
        ...opportunityDraft,
        clientId: selectedClient.id,
        nextActionAt: toIsoDateTime(opportunityDraft.nextActionAt || ""),
      });
      await refresh(true);
      await refreshOperationalLock();
      setOpportunityDraft({
        ...emptyOpportunity,
        clientId: selectedClient.id,
        representativeProfileId: opportunityDraft.representativeProfileId,
      });
      setMessage(editingExistingOpportunity
        ? result.agendaLinked
        ? "OPORTUNIDADE ATUALIZADA E AGENDA VINCULADA."
        : "OPORTUNIDADE EXISTENTE ATUALIZADA."
        : opportunityDraft.linkedActivityId || opportunityDraft.reuseExistingAgenda
        ? "OPORTUNIDADE SALVA E VINCULADA A AGENDA JA EXISTENTE."
        : result.previousCycleCancelled
        ? "OPORTUNIDADE SALVA. O AGENDAMENTO AUTOMATICO ANTERIOR FOI ENCERRADO."
        : "OPORTUNIDADE SALVA NO FUNIL E COM AGENDA PROGRAMADA.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(opportunity: CrmOpportunity, stage: CrmOpportunityStage, selectedLostReason = "") {
    if (stage === "LOST" && !(selectedLostReason || opportunity.lostReason).trim()) {
      setLostStagePrompt(opportunity);
      setLostStageReason("");
      return;
    }
    const previousStage = opportunity.stage;
    const lostReason = stage === "LOST" ? selectedLostReason || opportunity.lostReason : opportunity.lostReason;
    const client = clients.find((item) => item.id === opportunity.clientId);
    const averageValue = Number(profileByClient.get(opportunity.clientId)?.averagePurchaseValue || 0);
    const opportunityValue = Number(opportunity.estimatedValue || 0);
    const differencePercent = averageValue > 0 ? Math.abs(opportunityValue - averageValue) / averageValue : 0;
    const shouldAlertPurchaseAverage = stage === "WON"
      && previousStage !== "WON"
      && averageValue > 0
      && differencePercent >= purchaseAverageAlertThreshold;
    setSaving(true);
    clearFeedback();
    setOverview((current) => ({
      ...current,
      opportunities: current.opportunities.map((item) => item.id === opportunity.id ? { ...item, stage } : item),
    }));
    try {
      const result = await saveCrmOpportunity(slug, {
        id: opportunity.id,
        clientId: opportunity.clientId,
        representativeProfileId: opportunity.representativeProfileId,
        title: opportunity.title,
        productFichaId: opportunity.productFichaId,
        productReference: opportunity.productReference,
        productQuantity: opportunity.productQuantity,
        productUnitPrice: opportunity.productUnitPrice,
        stage,
        estimatedValue: opportunity.estimatedValue,
        expectedCloseDate: opportunity.expectedCloseDate,
        notes: opportunity.notes,
        lostReason,
      });
      await refresh(true);
      await refreshOperationalLock();
      if (shouldAlertPurchaseAverage) {
        setPurchaseAverageAlert({
          clientId: opportunity.clientId,
          clientName: client?.tradeName || client?.legalName || "CLIENTE",
          opportunityValue,
          averageValue,
          differencePercent,
        });
      }
      if (stage === "WON" || stage === "LOST") {
        setMessage(result.cycleScheduled
          ? "ETAPA ATUALIZADA. O PROXIMO CICLO FOI AGENDADO AUTOMATICAMENTE."
          : result.cycleSkippedBecauseActiveOpportunity
          ? "ETAPA ATUALIZADA. HA OUTRA OPORTUNIDADE ABERTA PARA ESTE CLIENTE; O PROXIMO CICLO SERA GERADO QUANDO A ULTIMA FOR ENCERRADA."
          : "ETAPA ATUALIZADA. DEFINA A FREQUENCIA DE COMPRA PARA AUTOMATIZAR O PROXIMO CICLO.");
      } else {
        setMessage("ETAPA DA OPORTUNIDADE ATUALIZADA.");
      }
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

  async function handlePostponeAgenda(clientId: string) {
    setPostponingClientId(clientId);
    clearFeedback();
    try {
      await postponeCrmAgenda(slug, clientId);
      await refresh(true);
      await refreshOperationalLock();
      setMessage("AGENDA ADIADA PARA O PROXIMO DIA UTIL.");
    } catch (postponeError) {
      setError(messageFrom(postponeError));
    } finally {
      setPostponingClientId("");
    }
  }

  async function handleLinkOpportunityClient(opportunity: CrmOpportunity, clientId: string) {
    if (!clientId) return;
    setSaving(true);
    clearFeedback();
    try {
      await saveCrmOpportunity(slug, {
        id: opportunity.id,
        clientId,
        representativeProfileId: opportunity.representativeProfileId,
        title: opportunity.title,
        productFichaId: opportunity.productFichaId,
        productReference: opportunity.productReference,
        productQuantity: opportunity.productQuantity,
        productUnitPrice: opportunity.productUnitPrice,
        stage: opportunity.stage,
        estimatedValue: opportunity.estimatedValue,
        expectedCloseDate: opportunity.expectedCloseDate,
        notes: opportunity.notes,
        lostReason: opportunity.lostReason,
      });
      await refresh(true);
      await refreshOperationalLock();
      setMessage("OPORTUNIDADE VINCULADA AO CLIENTE. O ALERTA FOI REMOVIDO.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  function selectClient(clientId: string, entryTab: CrmDetailEntryTab = "resumo") {
    setSelectedClientId(clientId);
    setDetailEntryTab(entryTab);
    clearFeedback();
  }

  return (
    <section className="crm-shell">
      <header className="crm-header">
        <div>
          <span className="clients-eyebrow">CENTRAL COMERCIAL</span>
          <h2>CRM</h2>
          <p>AGENDA, CARTEIRA E OPORTUNIDADES DA EMPRESA.</p>
        </div>
        {view === "agenda" ? (
          <div className="crm-summary" aria-label="RESUMO DA AGENDA">
            <SummaryStat label="ATRASADOS" value={agendaOverdueCount} tone="red" />
            <SummaryStat label="HOJE" value={agendaTodayCount} tone="purple" />
            <SummaryStat label="AMANHA" value={agendaTomorrowCount} tone="yellow" />
            <SummaryStat label="PROXIMOS 7 DIAS" note="NAO INCLUI AMANHA" value={agendaUpcomingCount} tone="gray" />
          </div>
        ) : null}
        {view === "pipeline" ? (
          <div className="crm-summary" aria-label="RESUMO DO FUNIL">
            <SummaryStat label="EM ABERTO" value={visiblePipelineActiveOpportunities.length} tone="purple" />
            <SummaryStat label="ORCAMENTOS ENVIADOS" value={quoteSentCount} tone="yellow" />
            <SummaryStat label="EM NEGOCIACAO" value={negotiationCount} tone="purple" />
            <SummaryStat label="GANHOS" value={wonOpportunityCount} tone="green" />
          </div>
        ) : null}
      </header>

      <nav className="crm-nav" aria-label="VISOES DO CRM">
        {(["agenda", "carteira", "pipeline"] as CrmView[]).map((item) => (
          <button key={item} type="button" className={view === item ? "crm-nav-active" : ""} onClick={() => {
            if (item === "carteira") setDetailEntryTab("resumo");
            setView(item);
          }}>
            {item === "agenda" ? "AGENDA" : item === "carteira" ? "CARTEIRA" : "OPORTUNIDADES"}
          </button>
        ))}
      </nav>

      {error && <div className="clients-feedback clients-feedback-error">{error}</div>}
      {message && <div className="clients-feedback clients-feedback-success">{message}</div>}
      {loading ? <div className="clients-empty crm-loading">CARREGANDO CENTRAL COMERCIAL...</div> : null}

      {!loading && view === "agenda" ? (
        <AgendaBoard
          items={agendaClients}
          search={agendaSearch}
          setSearch={setAgendaSearch}
          ownerFilter={agendaOwnerFilter}
          setOwnerFilter={setAgendaOwnerFilter}
          representatives={representatives}
          isManager={overview.isManager}
          opportunityCount={(clientId) => activeOpportunities.filter((opportunity) => opportunity.clientId === clientId).length}
          quoteCount={(clientId) => quoteByClient.get(clientId)?.count || 0}
          expiredQuoteCount={(clientId) => expiredQuoteCountByClient.get(clientId) || 0}
          onPostpone={handlePostponeAgenda}
          postponingClientId={postponingClientId}
          onOpenClient={(clientId) => {
            selectClient(clientId, "contato");
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
                <b>{portfolioFilteredClients.length}</b>
              </div>
              <div className="crm-list-filters">
                <input value={portfolioSearch} onChange={(event) => setPortfolioSearch(event.target.value)} placeholder="BUSCAR CLIENTE" />
                {overview.isManager ? (
                  <select value={portfolioOwnerFilter} onChange={(event) => setPortfolioOwnerFilter(event.target.value)}>
                    <option value="ALL">TODA A EQUIPE</option>
                    {representatives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                ) : null}
              </div>
              <div className="crm-client-list">
                {portfolioFilteredClients.map((item) => (
                  <ClientListItem
                    key={item.client.id}
                    item={item}
                    active={selectedClientId === item.client.id}
                    opportunityCount={activeOpportunities.filter((opportunity) => opportunity.clientId === item.client.id).length}
                    quoteCount={quoteByClient.get(item.client.id)?.count || 0}
                    expiredQuoteCount={expiredQuoteCountByClient.get(item.client.id) || 0}
                    onClick={() => selectClient(item.client.id)}
                  />
                ))}
                {portfolioFilteredClients.length === 0 ? (
                  <div className="clients-empty">NENHUM CLIENTE NESTA VISAO.</div>
                ) : null}
              </div>
            </section>

            <ClientDetail
              slug={slug}
              client={selectedClient}
              entryTab={detailEntryTab}
              profileDraft={profileDraft}
              setProfileDraft={setProfileDraft}
              representatives={representatives}
              activities={selectedActivities}
              telephonyCalls={selectedTelephonyCalls}
              opportunities={selectedOpportunities}
              quote={selectedClient ? quoteByClient.get(selectedClient.id) : undefined}
              activityDraft={activityDraft}
              setActivityDraft={setActivityDraft}
              opportunityDraft={opportunityDraft}
              setOpportunityDraft={setOpportunityDraft}
              scheduledActivity={scheduledActivity}
              scheduledAgendaAt={scheduledAgendaAt}
              productFichas={productFichas}
              lostReasons={lostReasons}
              onSaveProfile={handleSaveProfile}
              onSaveActivity={handleSaveActivity}
              onSaveOpportunity={handleSaveOpportunity}
              saving={saving}
              operationalLockClientId={crmBlocked ? crmLock?.clientId || "" : ""}
              operationalLockRepresentativeId={crmBlocked ? crmLock?.representativeProfileId || "" : ""}
              operationalLockActionAt={crmBlocked ? crmLock?.nextActionAt || "" : ""}
            />
          </div>
      ) : null}

      {!loading && view === "pipeline" ? (
        <PipelineBoard
          opportunities={overview.opportunities}
          visibleOpportunities={visiblePipelineOpportunities}
          clients={clients}
          sellerCompanies={sellerCompanies}
          closedPeriod={pipelineClosedPeriod}
          setClosedPeriod={setPipelineClosedPeriod}
          closedStart={pipelineClosedStart}
          setClosedStart={setPipelineClosedStart}
          closedEnd={pipelineClosedEnd}
          setClosedEnd={setPipelineClosedEnd}
          openCompanyFilter={pipelineOpenCompanyFilter}
          setOpenCompanyFilter={setPipelineOpenCompanyFilter}
          openClientFilter={pipelineOpenClientFilter}
          setOpenClientFilter={setPipelineOpenClientFilter}
          onSelectClient={(clientId) => { selectClient(clientId); setView("carteira"); }}
          onStageChange={handleStageChange}
          onLinkClient={handleLinkOpportunityClient}
          saving={saving}
        />
      ) : null}

      {lostStagePrompt ? <LostReasonModal
        reasons={lostReasons}
        value={lostStageReason}
        onChange={setLostStageReason}
        onCancel={() => setLostStagePrompt(null)}
        onConfirm={() => {
          if (!lostStageReason) return;
          const opportunity = lostStagePrompt;
          setLostStagePrompt(null);
          void handleStageChange(opportunity, "LOST", lostStageReason);
        }}
      /> : null}

      {purchaseAverageAlert ? <PurchaseAverageAlertModal
        alert={purchaseAverageAlert}
        onClose={() => setPurchaseAverageAlert(null)}
        onReview={() => {
          selectClient(purchaseAverageAlert.clientId);
          setView("carteira");
          setPurchaseAverageAlert(null);
        }}
      /> : null}

    </section>
  );
}

function LostReasonModal({ reasons, value, onChange, onCancel, onConfirm }: { reasons: GeneralOption[]; value: string; onChange: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  return <div className="crm-lost-reason-overlay" role="presentation">
    <section className="crm-lost-reason-modal" role="dialog" aria-modal="true" aria-label="MOTIVO DA PERDA">
      <span>OPORTUNIDADE PERDIDA</span>
      <h3>QUAL FOI O MOTIVO?</h3>
      <select value={value} onChange={(event) => onChange(event.target.value)} autoFocus>
        <option value="">SELECIONE...</option>
        {reasons.map((reason) => <option key={reason.id} value={reason.name}>{reason.name}</option>)}
      </select>
      <div><button type="button" onClick={onCancel}>CANCELAR</button><button type="button" disabled={!value} onClick={onConfirm}>CONFIRMAR PERDA</button></div>
    </section>
  </div>;
}

function PurchaseAverageAlertModal({ alert, onClose, onReview }: { alert: PurchaseAverageAlert; onClose: () => void; onReview: () => void }) {
  const direction = alert.opportunityValue > alert.averageValue ? "MAIOR" : "MENOR";
  return <div className="crm-lost-reason-overlay" role="presentation">
    <section className="crm-lost-reason-modal crm-purchase-average-modal" role="dialog" aria-modal="true" aria-label="REVISAR COMPRA MEDIA">
      <span>REVISAO CADASTRAL</span>
      <h3>OPORTUNIDADE GANHA FORA DO PADRAO</h3>
      <p><strong>{alert.clientName}</strong> fechou em {money(alert.opportunityValue)}, valor {Math.round(alert.differencePercent * 100)}% {direction} que a compra media cadastrada de {money(alert.averageValue)}.</p>
      <p>CONFIRA SE A COMPRA MEDIA DO CLIENTE AINDA REPRESENTA O TICKET REAL.</p>
      <div><button type="button" onClick={onClose}>DEPOIS</button><button type="button" onClick={onReview}>REVISAR CADASTRO</button></div>
    </section>
  </div>;
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
  expiredQuoteCount,
  onPostpone,
  postponingClientId,
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
  expiredQuoteCount: (clientId: string) => number;
  onPostpone: (clientId: string) => void;
  postponingClientId: string;
  onOpenClient: (clientId: string) => void;
}) {
  const [postponeMenuClientId, setPostponeMenuClientId] = useState("");
  const groups = [
    { key: "overdue", label: "ATRASADOS", tone: "red", items: items.filter((item) => item.daysToAction < 0) },
    { key: "today", label: "PARA HOJE", tone: "purple", items: items.filter((item) => item.daysToAction === 0) },
    { key: "tomorrow", label: "AMANHA", tone: "yellow", items: items.filter((item) => item.daysToAction === 1) },
    { key: "soon", label: "PROXIMOS 7 DIAS", tone: "gray", items: items.filter((item) => item.daysToAction >= 2 && item.daysToAction <= 7) },
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
                      {expiredQuoteCount(item.client.id) ? <span className="crm-expired-quote-alert">{expiredQuoteCount(item.client.id)} ORC. VENCIDO(S)</span> : null}
                    </div>
                    <div className="crm-agenda-buttons">
                      {phone ? <a href={whatsAppLink(phone, item.client.buyerName || item.client.tradeName || item.client.legalName)} title="ABRIR WHATSAPP">WHATSAPP</a> : null}
                      <button type="button" onClick={() => onOpenClient(item.client.id)}>ATENDER</button>
                      {group.key === "overdue" ? <div className="crm-agenda-postpone-menu">
                        <button type="button" className="crm-agenda-more-button" onClick={() => setPostponeMenuClientId((current) => current === item.client.id ? "" : item.client.id)} title="MAIS OPCOES" aria-label={`MAIS OPCOES PARA ${item.client.tradeName || item.client.legalName}`} aria-expanded={postponeMenuClientId === item.client.id}>...</button>
                        {postponeMenuClientId === item.client.id ? <div className="crm-agenda-postpone-options"><button type="button" onClick={() => { setPostponeMenuClientId(""); onPostpone(item.client.id); }} disabled={postponingClientId === item.client.id}>ADIAR PARA PROXIMO DIA UTIL</button></div> : null}
                      </div> : null}
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
  slug,
  client,
  entryTab,
  profileDraft,
  setProfileDraft,
  representatives,
  activities,
  telephonyCalls,
  opportunities,
  quote,
  activityDraft,
  setActivityDraft,
  opportunityDraft,
  setOpportunityDraft,
  scheduledActivity,
  scheduledAgendaAt,
  productFichas,
  lostReasons,
  onSaveProfile,
  onSaveActivity,
  onSaveOpportunity,
  saving,
  operationalLockClientId,
  operationalLockRepresentativeId,
  operationalLockActionAt,
}: {
  slug: string;
  client: ClientRecord | null;
  entryTab: CrmDetailEntryTab;
  profileDraft: CrmProfileInput;
  setProfileDraft: (value: CrmProfileInput) => void;
  representatives: RepresentativeOption[];
  activities: CrmOverview["activities"];
  telephonyCalls: CrmOverview["telephonyCalls"];
  opportunities: CrmOpportunity[];
  quote: CrmOverview["quotes"][number] | undefined;
  activityDraft: CrmActivityInput;
  setActivityDraft: (value: CrmActivityInput) => void;
  opportunityDraft: CrmOpportunityInput;
  setOpportunityDraft: (value: CrmOpportunityInput) => void;
  scheduledActivity?: CrmOverview["activities"][number];
  scheduledAgendaAt: string;
  productFichas: ProductFicha[];
  lostReasons: GeneralOption[];
  onSaveProfile: () => void;
  onSaveActivity: () => void;
  onSaveOpportunity: () => void;
  saving: boolean;
  operationalLockClientId: string;
  operationalLockRepresentativeId: string;
  operationalLockActionAt: string;
}) {
  const [detailTab, setDetailTab] = useState<"resumo" | "contato" | "ligacoes" | "negocio">("resumo");
  const [showExistingOpportunityWarning, setShowExistingOpportunityWarning] = useState(false);
  useEffect(() => {
    setShowExistingOpportunityWarning(false);
  }, [client?.id, opportunityDraft.id]);

  const mustResolveOverdueAgenda = Boolean(client?.id && operationalLockClientId === client.id);
  const purchaseInformationComplete = hasPurchaseInformation(profileDraft);
  const hasPurchaseHistory = hasAnyPurchaseInformation(profileDraft);
  useEffect(() => {
    if (mustResolveOverdueAgenda) setDetailTab("contato");
    else setDetailTab(entryTab);
  }, [client?.id, entryTab, mustResolveOverdueAgenda]);

  if (!client) return <section className="crm-detail-panel crm-detail-empty">SELECIONE UM CLIENTE PARA ABRIR A CARTEIRA.</section>;
  const phone = client.whatsapp || client.phone;
  const isUsingExistingAgenda = Boolean(opportunityDraft.linkedActivityId || opportunityDraft.reuseExistingAgenda);
  const isPreparingOpportunity = Boolean(opportunityDraft.id || opportunityDraft.title.trim());
  const scheduledActivityToLink = scheduledActivity && !isUsingExistingAgenda && isPreparingOpportunity ? scheduledActivity : undefined;
  const availableProducts = productFichas.filter((item) => item.clientId === client.id && item.status !== "INATIVO" && Number(item.price) > 0);
  const selectedProduct = availableProducts.find((item) => item.id === opportunityDraft.productFichaId);
  const activeOpportunities = opportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST");

  function useExistingOpportunity(opportunity: CrmOpportunity) {
    const agenda = activities.find((activity) => activity.opportunityId === opportunity.id && activity.nextActionAt);
    setOpportunityDraft({
      id: opportunity.id,
      clientId: opportunity.clientId,
      linkedActivityId: "",
      reuseExistingAgenda: false,
      representativeProfileId: opportunity.representativeProfileId,
      title: opportunity.title,
      productFichaId: opportunity.productFichaId,
      productReference: opportunity.productReference,
      productQuantity: opportunity.productQuantity,
      productUnitPrice: opportunity.productUnitPrice,
      stage: opportunity.stage,
      estimatedValue: opportunity.estimatedValue,
      expectedCloseDate: opportunity.expectedCloseDate,
      notes: opportunity.notes,
      lostReason: opportunity.lostReason,
      nextActionType: agenda?.nextActionType || "",
      nextActionAt: toLocalDateTime(agenda?.nextActionAt || ""),
    });
    setShowExistingOpportunityWarning(false);
  }

  return (
    <section className="crm-detail-panel">
      <header className="crm-customer-header">
        <div>
          <span>{client.clientCode} · {client.sellerCompanyName || "EMPRESA"}</span>
          <h3>{client.tradeName || client.legalName}</h3>
          <p>{client.buyerName || "COMPRADOR NAO INFORMADO"} · {phone || "SEM TELEFONE"}</p>
        </div>
        <div className="crm-customer-actions">
          {phone ? <a href={whatsAppLink(phone, client.buyerName || client.tradeName || client.legalName)}>ABRIR WHATSAPP</a> : null}
          <span className={`crm-health crm-health-${calculateHealth(toProfile(profileDraft)).toLowerCase()}`}>{healthLabel(calculateHealth(toProfile(profileDraft)))}</span>
        </div>
      </header>

      {mustResolveOverdueAgenda ? (
        <div className="crm-required-summary">
          <strong>ATENDIMENTO ATRASADO EM {displayDateTime(operationalLockActionAt)}</strong>
          <span>REGISTRE O CONTATO OU ATUALIZE A OPORTUNIDADE PARA LIBERAR OS DEMAIS MODULOS.</span>
        </div>
      ) : null}

      <nav className="crm-detail-tabs">
        <button type="button" className={`crm-contact-tab ${detailTab === "contato" ? "active" : ""}`} onClick={() => setDetailTab("contato")}>REGISTRAR CONTATO</button>
        {!mustResolveOverdueAgenda ? <button type="button" className={detailTab === "resumo" ? "active" : ""} onClick={() => setDetailTab("resumo")}>RESUMO</button> : null}
        {!mustResolveOverdueAgenda ? <button type="button" className={detailTab === "ligacoes" ? "active" : ""} onClick={() => setDetailTab("ligacoes")}>LIGACOES</button> : null}
        {!mustResolveOverdueAgenda ? <button type="button" className={detailTab === "negocio" ? "active" : ""} onClick={() => setDetailTab("negocio")}>NOVA OPORTUNIDADE</button> : null}
      </nav>

      {detailTab === "resumo" && !mustResolveOverdueAgenda ? (
        <>
          {!purchaseInformationComplete ? (
            <div className="crm-required-summary">
              <strong>{hasPurchaseHistory ? "DADOS DE COMPRA PENDENTES" : "SEM HISTORICO DE COMPRA"}</strong>
              <span>{hasPurchaseHistory ? "PREENCHA FREQUENCIA, COMPRA MEDIA E ULTIMA COMPRA PARA ATIVAR A RECOMPRA AUTOMATICA." : "REGISTRE FREQUENCIA, COMPRA MEDIA E ULTIMA COMPRA QUANDO HOUVER HISTORICO COMERCIAL."}</span>
            </div>
          ) : null}
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
        </>
      ) : null}

      {detailTab === "contato" ? (
        <div className="crm-entry-form">
          <div className="crm-profile-grid">
            <CrmSelect label="CANAL" value={activityDraft.activityType} onChange={(activityType) => setActivityDraft({ ...activityDraft, activityType: activityType as CrmActivityInput["activityType"] })} options={[{ value: "WHATSAPP", label: "WHATSAPP" }, { value: "CALL", label: "LIGACAO" }, { value: "EMAIL", label: "E-MAIL" }, { value: "VISIT", label: "VISITA" }, { value: "NOTE", label: "ANOTACAO" }, { value: "QUOTE", label: "ORCAMENTO" }]} />
            <CrmSelect label="RESULTADO" value={activityDraft.outcome} onChange={(outcome) => setActivityDraft({ ...activityDraft, outcome: outcome as CrmActivityInput["outcome"] })} options={[{ value: "CONTACTED", label: "CONTATO REALIZADO" }, { value: "NO_RESPONSE", label: "SEM RESPOSTA" }, { value: "QUOTE_REQUESTED", label: "SOLICITOU ORCAMENTO" }, { value: "PURCHASE_EXPECTED", label: "COMPRA PREVISTA" }, { value: "FOLLOW_UP", label: "ACOMPANHAR" }, { value: "NO_INTEREST", label: "SEM INTERESSE" }, { value: "OTHER", label: "OUTRO" }]} />
            <CrmSelect label="REPRESENTANTE" value={mustResolveOverdueAgenda ? operationalLockRepresentativeId : activityDraft.representativeProfileId} onChange={(representativeProfileId) => setActivityDraft({ ...activityDraft, representativeProfileId })} options={representatives.map((item) => ({ value: item.id, label: item.name }))} disabled={mustResolveOverdueAgenda} />
            <CrmInput label="DATA DO CONTATO" type="datetime-local" value={activityDraft.occurredAt} onChange={(occurredAt) => setActivityDraft({ ...activityDraft, occurredAt })} />
            <CrmInput label="ASSUNTO" value={activityDraft.subject} onChange={(subject) => setActivityDraft({ ...activityDraft, subject: upper(subject) })} />
            <CrmSelect label="PROXIMA ACAO *" value={activityDraft.nextActionType} onChange={(nextActionType) => setActivityDraft({ ...activityDraft, nextActionType: nextActionType as CrmActivityInput["nextActionType"] })} options={[{ value: "FOLLOW_UP", label: "ACOMPANHAR" }, { value: "WHATSAPP", label: "WHATSAPP" }, { value: "CALL", label: "LIGAR" }, { value: "EMAIL", label: "E-MAIL" }, { value: "VISIT", label: "VISITAR" }, { value: "QUOTE", label: "ORCAMENTO" }]} />
            <CrmInput label="DATA DA PROXIMA ACAO *" type="datetime-local" value={activityDraft.nextActionAt} onChange={(nextActionAt) => setActivityDraft({ ...activityDraft, nextActionAt })} />
            <label className="crm-textarea crm-span-2"><span>RESUMO DO CONTATO</span><textarea value={activityDraft.notes} onChange={(event) => setActivityDraft({ ...activityDraft, notes: upper(event.target.value) })} /></label>
          </div>
          <div className="crm-form-actions"><button type="button" onClick={onSaveActivity} disabled={saving || !activityDraft.nextActionType || !activityDraft.nextActionAt || (mustResolveOverdueAgenda && !activityDraft.notes.trim())}>REGISTRAR CONTATO</button></div>
          <Timeline activities={activities} opportunities={opportunities} />
        </div>
      ) : null}

      {detailTab === "negocio" ? (
        <div className="crm-entry-form">
          <div className="crm-profile-grid">
            <CrmInput label="OPORTUNIDADE" value={opportunityDraft.title} onChange={(title) => setOpportunityDraft({ ...opportunityDraft, title: upper(title) })} />
            <CrmSelect label="ETAPA" value={opportunityDraft.stage} onChange={(stage) => setOpportunityDraft({ ...opportunityDraft, stage: stage as CrmOpportunityStage })} options={stageOptions} />
            {opportunityDraft.stage === "LOST" ? <CrmSelect label="MOTIVO DA PERDA" value={opportunityDraft.lostReason} onChange={(lostReason) => setOpportunityDraft({ ...opportunityDraft, lostReason })} options={lostReasons.map((item) => ({ value: item.name, label: item.name }))} /> : null}
            <CrmSelect label="PRODUTO CADASTRADO" value={opportunityDraft.productFichaId || ""} onChange={(productFichaId) => {
              const product = availableProducts.find((item) => item.id === productFichaId);
              if (!product) {
                setOpportunityDraft({ ...opportunityDraft, productFichaId: "", productReference: "", productQuantity: 1, productUnitPrice: 0, estimatedValue: 0 });
                return;
              }
              const quantity = opportunityQuantity(product);
              const reference = productLabel(product);
              setOpportunityDraft({
                ...opportunityDraft,
                title: opportunityDraft.title || reference,
                productFichaId: product.id,
                productReference: reference,
                productQuantity: quantity,
                productUnitPrice: Number(product.price),
                estimatedValue: quantity * Number(product.price),
              });
            }} options={availableProducts.map((item) => ({ value: item.id, label: `${productLabel(item)} · ${money(item.price)}` }))} />
            <CrmInput label="QUANTIDADE" type="number" value={opportunityDraft.productQuantity || ""} onChange={(value) => {
              const productQuantity = Number(value || 0);
              setOpportunityDraft({ ...opportunityDraft, productQuantity, estimatedValue: productQuantity * Number(opportunityDraft.productUnitPrice || 0) });
            }} />
            {selectedProduct ? <CrmInput label="PRECO UNITARIO" value={opportunityDraft.productUnitPrice || ""} onChange={() => undefined} currency readOnly /> : null}
            <CrmInput label="VALOR ESTIMADO" value={opportunityDraft.estimatedValue || ""} onChange={(value) => setOpportunityDraft({ ...opportunityDraft, estimatedValue: Number(value || 0) })} currency readOnly={Boolean(selectedProduct)} />
            <CrmInput label="PREVISAO DE FECHAMENTO" type="date" value={opportunityDraft.expectedCloseDate} onChange={(expectedCloseDate) => setOpportunityDraft({ ...opportunityDraft, expectedCloseDate })} />
            <CrmSelect label="REPRESENTANTE" value={opportunityDraft.representativeProfileId} onChange={(representativeProfileId) => setOpportunityDraft({ ...opportunityDraft, representativeProfileId })} options={representatives.map((item) => ({ value: item.id, label: item.name }))} />
            {isUsingExistingAgenda ? <div className="crm-linked-agenda crm-span-2">AGENDA VINCULADA</div> : null}
            <CrmSelect label="PROXIMA ACAO" value={opportunityDraft.nextActionType || ""} onChange={(nextActionType) => setOpportunityDraft({ ...opportunityDraft, nextActionType: nextActionType as CrmOpportunityInput["nextActionType"] })} options={[{ value: "FOLLOW_UP", label: "ACOMPANHAR" }, { value: "WHATSAPP", label: "WHATSAPP" }, { value: "CALL", label: "LIGAR" }, { value: "EMAIL", label: "E-MAIL" }, { value: "VISIT", label: "VISITAR" }, { value: "QUOTE", label: "ORCAMENTO" }]} />
            <CrmInput label="DATA DA PROXIMA ACAO" type="datetime-local" value={opportunityDraft.nextActionAt || ""} onChange={(nextActionAt) => setOpportunityDraft({ ...opportunityDraft, nextActionAt })} />
            <label className="crm-textarea crm-span-2"><span>ANOTACOES</span><textarea value={opportunityDraft.notes} onChange={(event) => setOpportunityDraft({ ...opportunityDraft, notes: upper(event.target.value) })} /></label>
          </div>
          {showExistingOpportunityWarning && !opportunityDraft.id && activeOpportunities.length ? (
            <div className="crm-existing-opportunity-warning">
              <strong>ESTE CLIENTE JA POSSUI OPORTUNIDADE EM ABERTO.</strong>
              <div className="crm-existing-opportunity-list">
                {activeOpportunities.map((opportunity) => (
                  <button type="button" key={opportunity.id} onClick={() => useExistingOpportunity(opportunity)} disabled={saving}>
                    <span>{opportunity.title}</span>
                    <small>{stageOptions.find((item) => item.value === opportunity.stage)?.label} · {money(opportunity.estimatedValue)}</small>
                    <b>USAR ESTA</b>
                  </button>
                ))}
              </div>
              <button type="button" className="crm-create-separate-opportunity" onClick={() => { setShowExistingOpportunityWarning(false); onSaveOpportunity(); }} disabled={saving}>CRIAR OUTRA MESMO ASSIM</button>
            </div>
          ) : null}
          <div className="crm-form-actions">
            {scheduledActivityToLink ? <button type="button" className="crm-secondary-action" onClick={() => setOpportunityDraft({ ...opportunityDraft, linkedActivityId: scheduledActivityToLink.id, reuseExistingAgenda: true, nextActionType: scheduledActivityToLink.nextActionType || "FOLLOW_UP", nextActionAt: toLocalDateTime(scheduledAgendaAt) })} disabled={saving}>VINCULAR AGENDA ABERTA</button> : null}
            {isUsingExistingAgenda ? <button type="button" className="crm-secondary-action" onClick={() => setOpportunityDraft({ ...opportunityDraft, linkedActivityId: "", reuseExistingAgenda: false })} disabled={saving}>CRIAR NOVA AGENDA</button> : null}
            <button type="button" onClick={() => {
              if (!opportunityDraft.id && activeOpportunities.length) {
                setShowExistingOpportunityWarning(true);
                return;
              }
              onSaveOpportunity();
            }} disabled={saving}>{opportunityDraft.id ? "ATUALIZAR OPORTUNIDADE" : "CRIAR OPORTUNIDADE"}</button>
          </div>
        </div>
      ) : null}

      {detailTab === "ligacoes" && !mustResolveOverdueAgenda ? <TelephonyCallHistory slug={slug} calls={telephonyCalls} /> : null}
    </section>
  );
}

function PipelineBoard({
  opportunities,
  visibleOpportunities,
  clients,
  sellerCompanies,
  closedPeriod,
  setClosedPeriod,
  closedStart,
  setClosedStart,
  closedEnd,
  setClosedEnd,
  openCompanyFilter,
  setOpenCompanyFilter,
  openClientFilter,
  setOpenClientFilter,
  onSelectClient,
  onStageChange,
  onLinkClient,
  saving,
}: {
  opportunities: CrmOpportunity[];
  visibleOpportunities: CrmOpportunity[];
  clients: ClientRecord[];
  sellerCompanies: SellerCompanyOption[];
  closedPeriod: CrmClosedPeriod;
  setClosedPeriod: (value: CrmClosedPeriod) => void;
  closedStart: string;
  setClosedStart: (value: string) => void;
  closedEnd: string;
  setClosedEnd: (value: string) => void;
  openCompanyFilter: string;
  setOpenCompanyFilter: (value: string) => void;
  openClientFilter: string;
  setOpenClientFilter: (value: string) => void;
  onSelectClient: (id: string) => void;
  onStageChange: (opportunity: CrmOpportunity, stage: CrmOpportunityStage) => void;
  onLinkClient: (opportunity: CrmOpportunity, clientId: string) => void;
  saving: boolean;
}) {
  const [draggedOpportunityId, setDraggedOpportunityId] = useState("");
  const [dropStage, setDropStage] = useState<CrmOpportunityStage | "">("");
  const clientNames = new Map(clients.map((client) => [client.id, client.tradeName || client.legalName]));
  const openClients = useMemo(() => {
    const activeClientIds = new Set(opportunities
      .filter((item) => item.clientId && item.stage !== "WON" && item.stage !== "LOST")
      .map((item) => item.clientId));
    return clients
      .filter((client) => activeClientIds.has(client.id))
      .sort((first, second) => (first.tradeName || first.legalName).localeCompare(second.tradeName || second.legalName, "pt-BR"));
  }, [clients, opportunities]);
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
    <section className="crm-pipeline-shell">
      <div className="crm-pipeline-filters">
        <div className="crm-pipeline-filter-group">
          <div>
            <span className="clients-eyebrow">FILTRO DE ABERTAS</span>
            <strong>EMPRESA</strong>
          </div>
          <select value={openCompanyFilter} onChange={(event) => setOpenCompanyFilter(event.target.value)}>
            <option value="ALL">TODAS AS EMPRESAS</option>
            {sellerCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </div>
        <div className="crm-pipeline-filter-group">
          <div>
            <span className="clients-eyebrow">FILTRO DE ABERTAS</span>
            <strong>CLIENTE</strong>
          </div>
          <select value={openClientFilter} onChange={(event) => setOpenClientFilter(event.target.value)}>
            <option value="ALL">TODOS OS CLIENTES</option>
            {openClients.map((client) => <option key={client.id} value={client.id}>{client.tradeName || client.legalName}</option>)}
          </select>
        </div>
        <div className="crm-pipeline-filter-group">
          <div>
            <span className="clients-eyebrow">FILTRO DE FECHADOS</span>
            <strong>GANHOS E PERDIDOS</strong>
          </div>
          <div className="crm-pipeline-filter-controls">
            <select value={closedPeriod} onChange={(event) => setClosedPeriod(event.target.value as CrmClosedPeriod)}>
              <option value="ALL">TODOS</option>
              <option value="MONTH">MES ATUAL</option>
              <option value="QUARTER">TRIMESTRE ATUAL</option>
              <option value="SEMESTER">SEMESTRE ATUAL</option>
              <option value="CUSTOM">PERIODO DIGITADO</option>
            </select>
            {closedPeriod === "CUSTOM" ? (
              <>
                <input type="date" value={closedStart} onChange={(event) => setClosedStart(event.target.value)} />
                <input type="date" value={closedEnd} onChange={(event) => setClosedEnd(event.target.value)} />
              </>
            ) : null}
          </div>
        </div>
      </div>
      <section className="crm-pipeline">
      {stageOptions.map((stage) => {
        const items = visibleOpportunities.filter((item) => item.stage === stage.value);
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
                  className={`crm-opportunity-card${draggedOpportunityId === item.id ? " is-dragging" : ""}${isExpiredQuote(item) ? " is-quote-expired" : ""}${isUnlinkedDirectQuote(item) ? " is-direct-unlinked" : ""}`}
                  draggable={!saving}
                  key={item.id}
                  onDragStart={(event) => handleDragStart(event, item.id)}
                  onDragEnd={() => { setDraggedOpportunityId(""); setDropStage(""); }}
                >
                  {item.clientId ? (
                    <button type="button" onClick={() => onSelectClient(item.clientId)}>{clientNames.get(item.clientId) || "CLIENTE"}</button>
                  ) : (
                    <div className="crm-direct-alert"><b>ORCAMENTO DIRETO</b><span>CLIENTE NAO VINCULADO</span></div>
                  )}
                  <strong>{item.title}</strong>
                  {item.productReference ? <small>{item.productReference} · {item.productQuantity || 0} UN.</small> : null}
                  <span>{money(item.estimatedValue)}</span>
                  <small className={isExpiredQuote(item) ? "crm-expired-label" : ""}>
                    {isExpiredQuote(item)
                      ? `ORCAMENTO VENCIDO EM ${displayDate(item.expectedCloseDate)}`
                      : item.expectedCloseDate
                        ? `PREVISAO ${displayDate(item.expectedCloseDate)}`
                        : "SEM PREVISAO"}
                  </small>
                  {!item.clientId ? (
                    <select
                      aria-label="VINCULAR CLIENTE"
                      disabled={saving}
                      value=""
                      onChange={(event) => onLinkClient(item, event.target.value)}
                    >
                      <option value="">VINCULAR CLIENTE</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.tradeName || client.legalName}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </article>
              ))}
              {!items.length ? <p>SEM OPORTUNIDADES.</p> : null}
            </div>
          </div>
        );
      })}
      </section>
    </section>
  );
}

function isUnlinkedDirectQuote(opportunity: CrmOpportunity) {
  return Boolean(opportunity.quoteId && !opportunity.clientId);
}

function isInsideClosedPeriod(value: string, period: "ALL" | "MONTH" | "QUARTER" | "SEMESTER" | "CUSTOM", customStart: string, customEnd: string) {
  if (period === "ALL") return true;
  const dateKey = value?.slice(0, 10);
  if (!dateKey) return false;
  const target = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(target.getTime())) return false;

  if (period === "CUSTOM") {
    const startOk = !customStart || dateKey >= customStart;
    const endOk = !customEnd || dateKey <= customEnd;
    return startOk && endOk;
  }

  const now = new Date();
  const startMonth = period === "MONTH" ? now.getMonth() : period === "QUARTER" ? Math.floor(now.getMonth() / 3) * 3 : now.getMonth() < 6 ? 0 : 6;
  const endMonth = period === "MONTH" ? startMonth : period === "QUARTER" ? startMonth + 2 : startMonth + 5;
  const start = new Date(now.getFullYear(), startMonth, 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), endMonth + 1, 0, 23, 59, 59);
  return target >= start && target <= end;
}

function isExpiredQuote(opportunity: CrmOpportunity) {
  if (!opportunity.quoteId || !opportunity.expectedCloseDate) return false;
  if (opportunity.stage === "WON" || opportunity.stage === "LOST") return false;
  return opportunity.expectedCloseDate.slice(0, 10) < localDateKey();
}

function localDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function Timeline({ activities, opportunities }: { activities: CrmOverview["activities"]; opportunities: CrmOpportunity[] }) {
  const opportunitiesById = new Map(opportunities.map((item) => [item.id, item]));
  const rows = [
    ...activities.map((item) => {
      const opportunity = opportunitiesById.get(item.opportunityId);
      const isAgendaPostponement = item.subject.startsWith("AGENDA_ADIADA:");
      return {
        id: item.id,
        date: item.occurredAt,
        title: isAgendaPostponement ? "AGENDA ADIADA" : opportunity ? `AGENDA · ${opportunity.title}` : `${activityLabel(item.activityType)} · ${outcomeLabel(item.outcome)}`,
        detail: item.notes || item.subject || "CONTATO REGISTRADO",
        type: isAgendaPostponement ? "AGENDA" : "CONTATO",
      };
    }),
    ...opportunities.map((item) => ({ id: item.id, date: item.updatedAt, title: item.title, detail: `${item.productReference ? `${item.productReference} · ` : ""}${stageOptions.find((stage) => stage.value === item.stage)?.label || item.stage} · ${money(item.estimatedValue)}`, type: "NEGOCIO" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  return (
    <section className="crm-timeline">
      <h4>LINHA DO TEMPO</h4>
      {rows.map((row) => <article key={`${row.type}-${row.id}`}><i /><div><span>{row.type} · {displayDateTime(row.date)}</span><strong>{row.title}</strong><p>{row.detail}</p></div></article>)}
      {!rows.length ? <div className="clients-empty">NENHUM CONTATO OU NEGOCIO REGISTRADO.</div> : null}
    </section>
  );
}

function ClientListItem({ item, active, opportunityCount, quoteCount, expiredQuoteCount, onClick }: { item: RankedClient; active: boolean; opportunityCount: number; quoteCount: number; expiredQuoteCount: number; onClick: () => void }) {
  const purchaseInformationPending = !hasPurchaseInformation(item.profile);
  const purchaseInformationTitle = hasAnyPurchaseInformation(item.profile) ? "DADOS DE COMPRA PENDENTES" : "SEM HISTORICO DE COMPRA";
  return (
    <button type="button" className={`crm-client-row ${active ? "active" : ""}${purchaseInformationPending ? " crm-client-row-purchase-pending" : ""}`} onClick={onClick} title={purchaseInformationPending ? purchaseInformationTitle : undefined}>
      <i className={`crm-dot crm-dot-${item.health.toLowerCase()}`} />
      <div><strong>{item.client.tradeName || item.client.legalName}</strong><span>{item.client.clientCode} · {item.profile?.ownerName || item.client.representativeName || "SEM RESPONSAVEL"}</span></div>
      <div className="crm-client-row-info"><b>{nextActionLabel(item)}</b><small>{opportunityCount} NEG. · {quoteCount} ORC.{expiredQuoteCount ? <em className="crm-expired-quote-alert"> · {expiredQuoteCount} ORC. VENCIDO(S)</em> : null}</small></div>
    </button>
  );
}

function SummaryStat({ label, note, value, tone }: { label: string; note?: string; value: number; tone: string }) {
  return <div className={`crm-stat crm-stat-${tone}`}><span>{label}</span>{note ? <small>{note}</small> : null}<strong>{value}</strong></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="crm-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function CrmInput({ label, value, onChange, type = "text", currency = false, readOnly = false }: { label: string; value: string | number; onChange: (value: string) => void; type?: string; currency?: boolean; readOnly?: boolean }) {
  return <label className="crm-field"><span>{label}</span>{currency ? <CurrencyInput value={value} onValueChange={(nextValue) => onChange(nextValue === null ? "" : String(nextValue))} readOnly={readOnly} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} />}</label>;
}

function CrmSelect({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
  return <label className="crm-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">SELECIONE</option>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
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
    const actionDate = profile?.nextContactAt || nextPurchaseAt;
    const daysToAction = actionDate ? daysUntil(actionDate) : 99999;
    return { client, profile, health, daysToAction, nextPurchaseAt };
  }).sort((a, b) => healthRank[a.health] - healthRank[b.health] || a.daysToAction - b.daysToAction || a.client.legalName.localeCompare(b.client.legalName, "pt-BR"));
}

function purchaseDate(profile?: CrmCustomerProfile) {
  if (!profile) return "";
  return profile.nextPurchaseAt || calculateNextPurchaseDate(profile.lastPurchaseAt, profile.purchaseFrequencyDays);
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
  const actionDate = profile.nextContactAt || calculatedPurchase || purchaseDate(profile);
  if (!actionDate) return "GRAY";
  const actionDays = daysUntil(actionDate);
  if (actionDays < 0) return "RED";
  if (actionDays <= 7) return "YELLOW";
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
  return item.profile?.nextContactAt ? "REALIZAR CONTATO PROGRAMADO" : "ACOMPANHAR PREVISAO DE COMPRA";
}

function agendaDateLabel(item: RankedClient) {
  if (item.health === "GRAY") return "SEM DATA DEFINIDA";
  const value = item.profile?.nextContactAt || item.nextPurchaseAt;
  return value ? displayDate(value) : "SEM DATA DEFINIDA";
}

function toProfile(input: CrmProfileInput): CrmCustomerProfile {
  return { ...input, ownerName: "", whatsappOptInAt: "", updatedAt: "" };
}

function productLabel(product: ProductFicha) {
  return [product.ftNumber, product.reference].filter(Boolean).join(" - ") || "PRODUTO SEM REFERENCIA";
}

function opportunityQuantity(product: ProductFicha) {
  const current = Number(product.pricingData?.quantity || 0);
  if (Number.isFinite(current) && current > 0) return current;
  const last = [...(product.priceHistory ?? [])]
    .reverse()
    .map((item) => Number(item.quantity || 0))
    .find((item) => Number.isFinite(item) && item > 0);
  return last || 1;
}

function hasPurchaseInformation(profile?: Pick<CrmProfileInput, "purchaseFrequencyDays" | "averagePurchaseValue" | "lastPurchaseAt">) {
  return Boolean(profile?.purchaseFrequencyDays && Number(profile.averagePurchaseValue || 0) > 0 && profile.lastPurchaseAt);
}

function hasAnyPurchaseInformation(profile?: Pick<CrmProfileInput, "purchaseFrequencyDays" | "averagePurchaseValue" | "lastPurchaseAt">) {
  return Boolean(profile?.purchaseFrequencyDays || Number(profile?.averagePurchaseValue || 0) > 0 || profile?.lastPurchaseAt);
}

function daysUntil(value: string) {
  const target = crmCalendarDate(value);
  if (!target) return 99999;

  const today = new Date();
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetDay - todayDay) / 86400000);
}

function crmCalendarDate(value: string) {
  if (!value) return null;

  if (value.length === 10) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 12);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function whatsAppLink(value: string, name: string) {
  const clean = value.replace(/\D/g, "");
  const phone = clean.startsWith("55") ? clean : `55${clean}`;
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(`OLA ${name}, TUDO BEM?`)}`;
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

"use client";

import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { ContactRound, PackageCheck, PhoneCall, Plus, Target, Trash2 } from "lucide-react";

import { closeClientSample } from "@/lib/amostras";
import { isPendingCrmAgenda } from "@/lib/crm-agenda";
import { createCrmActivity, loadCrmOverview, logWhatsappOpened, postponeCrmAgenda, registerCrmOrder, saveCrmOpportunity, saveCrmProfile } from "@/lib/crm";
import { supabase } from "@/lib/supabase";
import { useCrmOperationalLock } from "@/components/clientes/CrmOperationalLock";
import TelephonyCallHistory from "@/components/clientes/TelephonyCallHistory";
import CurrencyInput from "@/components/ui/CurrencyInput";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import SectionNavigation from "@/components/ui/SectionNavigation";
import type { ClientRecord, RepresentativeOption, SellerCompanyOption } from "@/types/clientes";
import type {
  CrmActivityInput,
  CrmAgendaKind,
  CrmCustomerProfile,
  CrmHealth,
  CrmOpportunity,
  CrmOpportunityInput,
  CrmOpportunityStage,
  CrmOrderInput,
  CrmOverview,
  CrmProfileInput,
  CrmSampleAgendaItem,
} from "@/types/crm";
import type { ProductFicha } from "@/types/gerenciador";
import type { GeneralOption } from "@/types/cadastros-gerais";

export type CrmView = "agenda" | "carteira" | "pipeline";
type CrmClosedPeriod = "ALL" | "MONTH" | "QUARTER" | "SEMESTER" | "CUSTOM";
type CrmDetailEntryTab = "resumo" | "contato" | "pedido";
type PurchaseAverageAlert = {
  clientId: string;
  clientName: string;
  opportunityValue: number;
  averageValue: number;
  differencePercent: number;
};
type AutomaticCycleConfirmation = NonNullable<CrmOpportunityInput["automaticCycleConfirmation"]>;
type AutomaticCycleWinPrompt = { opportunity: CrmOpportunity };

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
  samples: [],
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

const emptyOrder: CrmOrderInput = {
  clientId: "",
  representativeProfileId: "",
  orderDate: localDateKey(),
  notes: "",
  items: [{ productFichaId: "", quantity: 0 }],
};

export default function CrmEmpresa({
  slug,
  clients,
  representatives,
  sellerCompanies,
  productFichas,
  lostReasons,
  view,
  onViewChange,
  forcedClientId = "",
}: {
  slug: string;
  clients: ClientRecord[];
  representatives: RepresentativeOption[];
  sellerCompanies: SellerCompanyOption[];
  productFichas: ProductFicha[];
  lostReasons: GeneralOption[];
  view: CrmView;
  onViewChange: (view: CrmView) => void;
  forcedClientId?: string;
}) {
  const { isBlocked: crmBlocked, lock: crmLock, refreshOperationalLock } = useCrmOperationalLock();
  const [overview, setOverview] = useState<CrmOverview>(emptyOverview);
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
  const [postponingAgendaId, setPostponingAgendaId] = useState("");
  const [closingSampleId, setClosingSampleId] = useState("");
  const [dialingClientId, setDialingClientId] = useState("");
  const [openingWhatsappClientId, setOpeningWhatsappClientId] = useState("");
  const [profileDraft, setProfileDraft] = useState<CrmProfileInput>(emptyProfile);
  const [activityDraft, setActivityDraft] = useState<CrmActivityInput>(emptyActivity);
  const [opportunityDraft, setOpportunityDraft] = useState<CrmOpportunityInput>(emptyOpportunity);
  const [orderDraft, setOrderDraft] = useState<CrmOrderInput>(emptyOrder);
  const [lostStagePrompt, setLostStagePrompt] = useState<CrmOpportunity | null>(null);
  const [lostStageReason, setLostStageReason] = useState("");
  const [purchaseAverageAlert, setPurchaseAverageAlert] = useState<PurchaseAverageAlert | null>(null);
  const [automaticCycleWinPrompt, setAutomaticCycleWinPrompt] = useState<AutomaticCycleWinPrompt | null>(null);

  useEffect(() => {
    if (!forcedClientId) return;
    setSelectedClientId(forcedClientId);
    setDetailEntryTab("resumo");
    onViewChange("carteira");
    setPortfolioSearch("");
  }, [forcedClientId, onViewChange]);

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
  const automaticCycleOpportunityIds = useMemo(
    () => new Set(overview.activities
      .filter((activity) => activity.agendaKind === "CYCLE" && activity.opportunityId)
      .map((activity) => activity.opportunityId)),
    [overview.activities]
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
      if (activity.clientId !== selectedClient.id || !activity.nextActionAt || activity.agendaKind !== "FOLLOW_UP") return false;
      return !nextContactAt || new Date(activity.nextActionAt).getTime() === new Date(nextContactAt).getTime();
    });
  }, [overview.activities, selectedClient, selectedProfile?.nextContactAt]);
  const scheduledAgendaAt = useMemo(() => {
    if (!selectedClient) return "";
    const stages = new Map(overview.opportunities.map((item) => [item.id, item.stage]));
    const dates = overview.activities
      .filter((item) => item.clientId === selectedClient.id && isPendingCrmAgenda(item, stages))
      .map((item) => item.nextActionAt);
    if (selectedProfile?.nextContactAt) dates.push(selectedProfile.nextContactAt);
    return dates.filter((date) => Number.isFinite(Date.parse(date)))
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || "";
  }, [overview.activities, overview.opportunities, selectedClient, selectedProfile?.nextContactAt]);

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
    setOrderDraft({ ...emptyOrder, clientId: selectedClient.id, representativeProfileId: owner, orderDate: localDateKey() });
  }, [overview.currentProfileId, selectedClient, selectedProfile, scheduledActivity]);

  const activeOpportunities = useMemo(
    () => overview.opportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST"),
    [overview.opportunities]
  );
  const rankedClients = useMemo(() => rankClients(clients, overview.profiles), [clients, overview.profiles]);
  const portfolioFilteredClients = useMemo(() => {
    const term = upper(portfolioSearch);
    return rankedClients.filter(({ client, profile }) => {
      const matchesTerm = !term || upper(`${client.clientCode} ${client.legalName} ${client.tradeName} ${client.cnpj}`).includes(term);
      const matchesOwner = portfolioOwnerFilter === "ALL" || (profile?.ownerProfileId || client.representativeUserId) === portfolioOwnerFilter;
      return matchesTerm && matchesOwner;
    });
  }, [portfolioOwnerFilter, portfolioSearch, rankedClients]);
  const agendaItems = useMemo(() => {
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const profileById = new Map(overview.profiles.map((profile) => [profile.clientId, profile]));
    const rows: AgendaItem[] = [];
    for (const profile of overview.profiles) {
      if (!profile.nextContactAt) continue;
      const client = clientById.get(profile.clientId);
      if (!client) continue;
      const activity = overview.activities.find((item) => item.clientId === client.id && item.agendaKind === "CYCLE" && item.nextActionAt === profile.nextContactAt);
      rows.push({ id: `cycle:${client.id}`, client, displayName: client.tradeName || client.legalName, ownerId: profile.ownerProfileId || client.representativeUserId, ownerName: profile.ownerName || client.representativeName, activityId: activity?.id || "", kind: "CYCLE", actionType: "ACOMPANHAR", opportunityId: "", opportunityTitle: "", directQuote: false, scheduledAt: profile.nextContactAt, daysToAction: daysUntil(profile.nextContactAt) });
    }
    for (const activity of overview.activities) {
      if (!activity.nextActionAt || activity.agendaKind === "CYCLE") continue;
      const client = clientById.get(activity.clientId);
      const opportunity = activity.opportunityId ? overview.opportunities.find((item) => item.id === activity.opportunityId) : undefined;
      if (activity.agendaKind === "OPPORTUNITY" && (!opportunity || opportunity.stage === "WON" || opportunity.stage === "LOST")) continue;
      const profile = client ? profileById.get(client.id) : undefined;
      const directQuote = !client && Boolean(opportunity?.quoteId);
      if (!client && !directQuote) continue;
      rows.push({
        id: activity.id,
        client,
        displayName: directQuote ? "ORCAMENTO DIRETO" : client?.tradeName || client?.legalName || "CLIENTE",
        ownerId: activity.representativeProfileId || profile?.ownerProfileId || client?.representativeUserId || "",
        ownerName: activity.representativeName || profile?.ownerName || client?.representativeName || "SEM RESPONSAVEL",
        activityId: activity.id,
        kind: activity.agendaKind,
        actionType: activity.nextActionType || "FOLLOW_UP",
        opportunityId: activity.opportunityId,
        opportunityTitle: opportunity?.title || "",
        directQuote,
        scheduledAt: activity.nextActionAt,
        daysToAction: daysUntil(activity.nextActionAt),
      });
    }
    const term = upper(agendaSearch);
    return rows.filter((item) => {
      const matchesTerm = !term || upper(`${item.client?.clientCode || ""} ${item.displayName} ${item.opportunityTitle}`).includes(term);
      const matchesOwner = agendaOwnerFilter === "ALL" || item.ownerId === agendaOwnerFilter;
      return matchesTerm && matchesOwner && item.daysToAction <= 7;
    }).sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt) || first.displayName.localeCompare(second.displayName, "pt-BR"));
  }, [agendaOwnerFilter, agendaSearch, clients, overview.activities, overview.opportunities, overview.profiles]);
  const agendaOverdueCount = agendaItems.filter((item) => item.daysToAction < 0).length;
  const agendaTodayCount = agendaItems.filter((item) => item.daysToAction === 0).length;
  const agendaTomorrowCount = agendaItems.filter((item) => item.daysToAction === 1).length;
  const agendaUpcomingCount = agendaItems.filter((item) => item.daysToAction >= 2 && item.daysToAction <= 7).length;
  const sampleAgendaItems = useMemo(() => {
    const term = upper(agendaSearch);
    const clientsById = new Map(clients.map((client) => [client.id, client]));
    return overview.samples
      .map((sample) => {
        const client = clientsById.get(sample.clientId);
        const clientName = client?.tradeName || client?.legalName || "CLIENTE";
        return { ...sample, clientName, daysToDue: daysUntil(sample.deliveryDate) };
      })
      .filter((sample) => {
        const matchesTerm = !term || upper(`${sample.clientName} ${sample.productDescription}`).includes(term);
        const matchesOwner = agendaOwnerFilter === "ALL" || sample.responsibleProfileId === agendaOwnerFilter;
        return matchesTerm && matchesOwner && sample.daysToDue <= 7;
      })
      .sort((first, second) => first.deliveryDate.localeCompare(second.deliveryDate));
  }, [agendaOwnerFilter, agendaSearch, clients, overview.samples]);
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
      return isInsideClosedPeriod(item.closedAt || item.updatedAt || item.createdAt, pipelineClosedPeriod, pipelineClosedStart, pipelineClosedEnd);
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
        : "OPORTUNIDADE SALVA NO FUNIL E COM AGENDA PROGRAMADA.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleStageChange(
    opportunity: CrmOpportunity,
    stage: CrmOpportunityStage,
    selectedLostReason = "",
    automaticCycleConfirmation?: { value: number; input: AutomaticCycleConfirmation }
  ) {
    if (stage === "LOST" && !(selectedLostReason || opportunity.lostReason).trim()) {
      setLostStagePrompt(opportunity);
      setLostStageReason("");
      return;
    }
    const previousStage = opportunity.stage;
    if (stage === "WON" && previousStage !== "WON" && automaticCycleOpportunityIds.has(opportunity.id) && !automaticCycleConfirmation) {
      setAutomaticCycleWinPrompt({ opportunity });
      return;
    }
    const lostReason = stage === "LOST" ? selectedLostReason || opportunity.lostReason : opportunity.lostReason;
    const client = clients.find((item) => item.id === opportunity.clientId);
    const averageValue = Number(profileByClient.get(opportunity.clientId)?.averagePurchaseValue || 0);
    const previousOpportunityValue = Number(opportunity.estimatedValue || 0);
    const opportunityValue = automaticCycleConfirmation?.value ?? previousOpportunityValue;
    const differencePercent = averageValue > 0 ? Math.abs(opportunityValue - averageValue) / averageValue : 0;
    const shouldAlertPurchaseAverage = stage === "WON"
      && previousStage !== "WON"
      && averageValue > 0
      && differencePercent >= purchaseAverageAlertThreshold;
    const immediatePurchaseAverageAlert = shouldAlertPurchaseAverage ? {
      clientId: opportunity.clientId,
      clientName: client?.tradeName || client?.legalName || "CLIENTE",
      opportunityValue,
      averageValue,
      differencePercent,
    } : null;
    setSaving(true);
    clearFeedback();
    setOverview((current) => ({
      ...current,
      opportunities: current.opportunities.map((item) => item.id === opportunity.id ? { ...item, stage, estimatedValue: opportunityValue } : item),
    }));
    if (immediatePurchaseAverageAlert) setPurchaseAverageAlert(immediatePurchaseAverageAlert);
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
        estimatedValue: opportunityValue,
        expectedCloseDate: opportunity.expectedCloseDate,
        notes: opportunity.notes,
        lostReason,
        automaticCycleConfirmation: automaticCycleConfirmation?.input,
      });
      await refresh(true);
      await refreshOperationalLock();
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
        opportunities: current.opportunities.map((item) => item.id === opportunity.id ? { ...item, stage: previousStage, estimatedValue: previousOpportunityValue } : item),
      }));
      if (immediatePurchaseAverageAlert) setPurchaseAverageAlert(null);
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handlePostponeAgenda(clientId: string, activityId: string) {
    setPostponingAgendaId(activityId);
    clearFeedback();
    try {
      await postponeCrmAgenda(slug, clientId, activityId);
      await refresh(true);
      await refreshOperationalLock();
      setMessage("AGENDA ADIADA PARA O PROXIMO DIA UTIL.");
    } catch (postponeError) {
      setError(messageFrom(postponeError));
    } finally {
      setPostponingAgendaId("");
    }
  }

  async function handleRegisterOrder() {
    if (!selectedClient || !orderDraft.orderDate || !orderDraft.items.length) {
      setError("INFORME A DATA E PELO MENOS UM ITEM DO PEDIDO.");
      return;
    }
    setSaving(true);
    clearFeedback();
    try {
      const result = await registerCrmOrder(slug, {
        ...orderDraft,
        clientId: selectedClient.id,
      });
      await refresh(true);
      await refreshOperationalLock();
      setOrderDraft({
        ...emptyOrder,
        clientId: selectedClient.id,
        representativeProfileId: orderDraft.representativeProfileId,
        orderDate: localDateKey(),
      });
      setDetailEntryTab("resumo");
      setMessage(result.cycleScheduled
        ? "PEDIDO REGISTRADO. O PROXIMO CICLO DE COMPRA FOI AGENDADO."
        : "PEDIDO REGISTRADO. DEFINA A FREQUENCIA DE COMPRA PARA GERAR O PROXIMO CICLO.");
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseSample(sampleId: string) {
    setClosingSampleId(sampleId);
    clearFeedback();
    try {
      await closeClientSample(slug, sampleId);
      setOverview((current) => ({
        ...current,
        samples: current.samples.filter((sample) => sample.id !== sampleId),
      }));
      setMessage("AMOSTRA BAIXADA COM SUCESSO.");
    } catch (closeError) {
      setError(messageFrom(closeError));
    } finally {
      setClosingSampleId("");
    }
  }

  async function handleDial(clientId: string) {
    setDialingClientId(clientId);
    clearFeedback();
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("SESSAO NAO ENCONTRADA.");
      const response = await fetch("/api/integracoes/baldussi/discar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slug, clientId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.message || "NAO FOI POSSIVEL SOLICITAR A LIGACAO.");
      setMessage(`${payload.message || "DISCAGEM EFETUADA COM SUCESSO."} AGUARDE O RAMAL TOCAR.`);
    } catch (dialError) {
      setError(messageFrom(dialError));
    } finally {
      setDialingClientId("");
    }
  }

  async function handleWhatsappOpen(clientId: string, whatsappUrl: string) {
    setOpeningWhatsappClientId(clientId);
    clearFeedback();
    try {
      await logWhatsappOpened(slug, clientId);
      await refresh(true);
      setMessage("ABERTURA DO WHATSAPP REGISTRADA NA LINHA DO TEMPO.");
    } catch (whatsappError) {
      setError(messageFrom(whatsappError));
    } finally {
      setOpeningWhatsappClientId("");
      window.location.assign(whatsappUrl);
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

  function selectClient(clientId: string, entryTab?: CrmDetailEntryTab) {
    setSelectedClientId(clientId);
    if (entryTab) setDetailEntryTab(entryTab);
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

      {error && <div className="clients-feedback clients-feedback-error">{error}</div>}
      {message && <div className="clients-feedback clients-feedback-success">{message}</div>}
      {loading ? <div className="clients-empty crm-loading">CARREGANDO CENTRAL COMERCIAL...</div> : null}

      {!loading && view === "agenda" ? (
        <>
          <AgendaBoard
            items={agendaItems}
            search={agendaSearch}
            setSearch={setAgendaSearch}
            ownerFilter={agendaOwnerFilter}
            setOwnerFilter={setAgendaOwnerFilter}
            representatives={representatives}
            isManager={overview.isManager}
            onPostpone={handlePostponeAgenda}
            postponingAgendaId={postponingAgendaId}
            onOpenClient={(clientId) => {
              selectClient(clientId, "contato");
              onViewChange("carteira");
            }}
            onOpenDirectOpportunity={() => onViewChange("pipeline")}
          />
          <SampleAgendaBoard items={sampleAgendaItems} closingSampleId={closingSampleId} onClose={handleCloseSample} />
        </>
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
                  <SearchableSelect value={portfolioOwnerFilter === "ALL" ? "" : portfolioOwnerFilter} onChange={(value) => setPortfolioOwnerFilter(value || "ALL")} options={representatives.map((item) => ({ value: item.id, label: item.name }))} placeholder="TODA A EQUIPE" ariaLabel="FILTRO DE CONSULTOR" />
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
              orderDraft={orderDraft}
              setOrderDraft={setOrderDraft}
              scheduledActivity={scheduledActivity}
              scheduledAgendaAt={scheduledAgendaAt}
              productFichas={productFichas}
              lostReasons={lostReasons}
              onSaveProfile={handleSaveProfile}
              onSaveActivity={handleSaveActivity}
              onSaveOpportunity={handleSaveOpportunity}
              onRegisterOrder={handleRegisterOrder}
              onDial={handleDial}
              dialing={dialingClientId === selectedClient?.id}
              onOpenWhatsapp={handleWhatsappOpen}
              openingWhatsapp={openingWhatsappClientId === selectedClient?.id}
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
          onSelectClient={(clientId) => { selectClient(clientId, "resumo"); onViewChange("carteira"); }}
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

      {automaticCycleWinPrompt ? <AutomaticCycleWinModal
        opportunity={automaticCycleWinPrompt.opportunity}
        clientName={clients.find((client) => client.id === automaticCycleWinPrompt.opportunity.clientId)?.tradeName || clients.find((client) => client.id === automaticCycleWinPrompt.opportunity.clientId)?.legalName || "CLIENTE"}
        productFichas={productFichas}
        onCancel={() => setAutomaticCycleWinPrompt(null)}
        onConfirm={(value, input) => {
          const opportunity = automaticCycleWinPrompt.opportunity;
          setAutomaticCycleWinPrompt(null);
          void handleStageChange(opportunity, "WON", "", { value, input });
        }}
      /> : null}

      {purchaseAverageAlert ? <PurchaseAverageAlertModal
        alert={purchaseAverageAlert}
        onClose={() => setPurchaseAverageAlert(null)}
        onReview={() => {
          selectClient(purchaseAverageAlert.clientId, "resumo");
          onViewChange("carteira");
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
      <SearchableSelect value={value} onChange={onChange} options={reasons.map((reason) => ({ value: reason.name, label: reason.name }))} placeholder="SELECIONE..." ariaLabel="MOTIVO DA PERDA" autoFocus />
      <div><button type="button" onClick={onCancel}>CANCELAR</button><button type="button" disabled={!value} onClick={onConfirm}>CONFIRMAR PERDA</button></div>
    </section>
  </div>;
}

function AutomaticCycleWinModal({
  opportunity,
  clientName,
  productFichas,
  onCancel,
  onConfirm,
}: {
  opportunity: CrmOpportunity;
  clientName: string;
  productFichas: ProductFicha[];
  onCancel: () => void;
  onConfirm: (value: number, input: AutomaticCycleConfirmation) => void;
}) {
  const [mode, setMode] = useState<AutomaticCycleConfirmation["mode"]>("BASE_VALUE");
  const [customValue, setCustomValue] = useState(0);
  const [items, setItems] = useState<Array<{ productFichaId: string; quantity: number }>>([{ productFichaId: "", quantity: 0 }]);
  const availableProducts = productFichas.filter((product) => product.clientId === opportunity.clientId && product.status !== "INATIVO" && Number(productPriceSnapshot(product)?.price || product.price || 0) > 0);
  const resolvedItems = items.map((item) => {
    const product = availableProducts.find((candidate) => candidate.id === item.productFichaId);
    const snapshot = product ? productPriceSnapshot(product) : undefined;
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(snapshot?.price || product?.price || 0);
    const ipiPercent = Number(snapshot?.ipiPercent || 0);
    const baseQuantity = Number(snapshot?.quantity || 0);
    return { product, quantity, baseQuantity, total: quantity * unitPrice * (1 + ipiPercent / 100) };
  });
  const productTotal = resolvedItems.reduce((total, item) => total + item.total, 0);
  const hasRepeatedProduct = items.some((item, index) => item.productFichaId && items.findIndex((candidate) => candidate.productFichaId === item.productFichaId) !== index);
  const productsAreValid = items.length > 0 && !hasRepeatedProduct && resolvedItems.every((item) => item.product && item.quantity > 0 && item.baseQuantity > 0 && item.quantity >= item.baseQuantity);
  const confirmedValue = mode === "BASE_VALUE" ? Number(opportunity.estimatedValue || 0) : mode === "CUSTOM_VALUE" ? customValue : productTotal;
  const canConfirm = confirmedValue > 0 && (mode !== "PRODUCTS" || productsAreValid);

  return <div className="crm-lost-reason-overlay" role="presentation">
    <section className="crm-lost-reason-modal crm-cycle-win-modal" role="dialog" aria-modal="true" aria-label="CONFIRMAR VALOR DO CICLO AUTOMATICO">
      <span>CICLO AUTOMATICO</span>
      <h3>CONFIRMAR O VALOR GANHO</h3>
      <p><strong>{clientName}</strong> entrou no funil com base na compra media de <strong>{money(opportunity.estimatedValue)}</strong>.</p>
      <div className="crm-cycle-win-options">
        <button type="button" className={mode === "BASE_VALUE" ? "active" : ""} onClick={() => setMode("BASE_VALUE")}>CONFIRMAR VALOR BASE</button>
        <button type="button" className={mode === "PRODUCTS" ? "active" : ""} onClick={() => setMode("PRODUCTS")}>SELECIONAR ITENS</button>
        <button type="button" className={mode === "CUSTOM_VALUE" ? "active" : ""} onClick={() => setMode("CUSTOM_VALUE")}>INFORMAR OUTRO VALOR</button>
      </div>
      {mode === "PRODUCTS" ? <div className="crm-cycle-win-items">
        {items.map((item, index) => {
          const resolved = resolvedItems[index];
          const invalidLot = resolved.product && resolved.quantity > 0 && resolved.baseQuantity > 0 && resolved.quantity < resolved.baseQuantity;
          return <div className="crm-cycle-win-item" key={`${item.productFichaId}-${index}`}>
            <CrmSelect label={`ITEM ${index + 1}`} value={item.productFichaId} onChange={(productFichaId) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { productFichaId, quantity: orderQuantity(availableProducts.find((product) => product.id === productFichaId)) } : entry))} options={availableProducts.map((product) => ({ value: product.id, label: `${productLabel(product)} · ${money(productPriceSnapshot(product)?.price || product.price)}` }))} />
            <CrmInput label="QUANTIDADE" type="number" value={item.quantity || ""} onChange={(quantity) => setItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, quantity: Number(quantity || 0) } : entry))} />
            {items.length > 1 ? <button type="button" className="crm-cycle-remove-item" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /> REMOVER</button> : null}
            {invalidLot ? <small>A FICHA FOI FORMADA PARA NO MINIMO {resolved.baseQuantity} UNIDADES.</small> : null}
          </div>;
        })}
        {!availableProducts.length ? <p>NENHUMA FICHA COM PRECO ESTA DISPONIVEL PARA ESTE CLIENTE.</p> : null}
        {hasRepeatedProduct ? <p>NAO REPITA A MESMA FICHA. SOME AS QUANTIDADES EM UM UNICO ITEM.</p> : null}
        <button type="button" className="crm-cycle-add-item" onClick={() => setItems((current) => [...current, { productFichaId: "", quantity: 0 }])}><Plus size={14} /> ADICIONAR ITEM</button>
        <strong className="crm-cycle-win-total">TOTAL PREVISTO: {money(productTotal)}</strong>
      </div> : null}
      {mode === "CUSTOM_VALUE" ? <label className="crm-cycle-custom-value"><span>VALOR GANHO</span><CurrencyInput value={customValue || ""} onValueChange={(value) => setCustomValue(Number(value || 0))} /></label> : null}
      <div className="crm-cycle-win-actions"><button type="button" onClick={onCancel}>CANCELAR</button><button type="button" disabled={!canConfirm} onClick={() => onConfirm(confirmedValue, { mode, value: mode === "CUSTOM_VALUE" ? customValue : undefined, items: mode === "PRODUCTS" ? items : undefined })}>CONFIRMAR GANHO · {money(confirmedValue)}</button></div>
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

type AgendaItem = {
  id: string;
  client?: ClientRecord;
  displayName: string;
  ownerId: string;
  ownerName: string;
  activityId: string;
  kind: CrmAgendaKind;
  actionType: string;
  opportunityId: string;
  opportunityTitle: string;
  directQuote: boolean;
  scheduledAt: string;
  daysToAction: number;
};

function AgendaBoard({
  items,
  search,
  setSearch,
  ownerFilter,
  setOwnerFilter,
  representatives,
  isManager,
  onPostpone,
  postponingAgendaId,
  onOpenClient,
  onOpenDirectOpportunity,
}: {
  items: AgendaItem[];
  search: string;
  setSearch: (value: string) => void;
  ownerFilter: string;
  setOwnerFilter: (value: string) => void;
  representatives: RepresentativeOption[];
  isManager: boolean;
  onPostpone: (clientId: string, activityId: string) => void;
  postponingAgendaId: string;
  onOpenClient: (clientId: string) => void;
  onOpenDirectOpportunity: () => void;
}) {
  const [postponeMenuAgendaId, setPostponeMenuAgendaId] = useState("");
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
            <SearchableSelect value={ownerFilter === "ALL" ? "" : ownerFilter} onChange={(value) => setOwnerFilter(value || "ALL")} options={representatives.map((item) => ({ value: item.id, label: item.name }))} placeholder="TODA A EQUIPE" ariaLabel="FILTRO DE CONSULTOR" />
          ) : null}
        </div>
      </header>

      <div className="crm-agenda-groups">
        {groups.map((group) => (
          <section className={`crm-agenda-group crm-agenda-${group.tone}`} key={group.key}>
            <header><strong>{group.label}</strong><span>{group.items.length}</span></header>
            <div>
              {group.items.map((item) => {
                return (
                  <article className={`crm-agenda-item crm-agenda-item-${item.kind.toLowerCase()}`} key={item.id}>
                    <i className={`crm-dot crm-dot-${group.tone}`} />
                    <div className="crm-agenda-client">
                      <strong>{item.displayName}</strong>
                      <span>{item.ownerName || "SEM RESPONSAVEL"}</span>
                    </div>
                    <div className="crm-agenda-action">
                      <b>{agendaTaskLabel(item)}</b>
                      <span>{agendaTaskDueLabel(item)}</span>
                    </div>
                    <div className="crm-agenda-context">
                      <span className={`crm-agenda-kind crm-agenda-kind-${item.kind.toLowerCase()}`}>{agendaKindLabel(item)}</span>
                    </div>
                    <div className="crm-agenda-buttons">
                      <button type="button" onClick={() => item.client ? onOpenClient(item.client.id) : onOpenDirectOpportunity()}>ATENDER</button>
                      {group.key === "overdue" && item.activityId ? <div className="crm-agenda-postpone-menu">
                        <button type="button" className="crm-agenda-more-button" onClick={() => setPostponeMenuAgendaId((current) => current === item.id ? "" : item.id)} title="MAIS OPCOES" aria-label={`MAIS OPCOES PARA ${item.displayName}`} aria-expanded={postponeMenuAgendaId === item.id}>...</button>
                        {postponeMenuAgendaId === item.id ? <div className="crm-agenda-postpone-options"><button type="button" onClick={() => { setPostponeMenuAgendaId(""); onPostpone(item.client?.id || "", item.activityId); }} disabled={postponingAgendaId === item.activityId}>ADIAR PARA PROXIMO DIA UTIL</button></div> : null}
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

type SampleAgendaRow = CrmSampleAgendaItem & {
  clientName: string;
  daysToDue: number;
};

function SampleAgendaBoard({
  items,
  closingSampleId,
  onClose,
}: {
  items: SampleAgendaRow[];
  closingSampleId: string;
  onClose: (sampleId: string) => void;
}) {
  const groups = [
    { key: "overdue", label: "ATRASADAS", items: items.filter((item) => item.daysToDue < 0) },
    { key: "today", label: "PARA HOJE", items: items.filter((item) => item.daysToDue === 0) },
    { key: "tomorrow", label: "AMANHA", items: items.filter((item) => item.daysToDue === 1) },
    { key: "soon", label: "PROXIMOS 7 DIAS", items: items.filter((item) => item.daysToDue >= 2 && item.daysToDue <= 7) },
  ];

  return (
    <section className="sample-agenda">
      <header className="sample-agenda-header">
        <div>
          <span className="clients-eyebrow">CONTROLE OPERACIONAL</span>
          <h3>AGENDA DE AMOSTRAS</h3>
          <p>PRAZOS DE AMOSTRAS EM ABERTO. A BAIXA REGISTRA A DATA REAL DE CONCLUSAO.</p>
        </div>
        <b>{items.length} EM ABERTO</b>
      </header>

      <div className="sample-agenda-groups">
        {groups.map((group) => (
          <section className="sample-agenda-group" key={group.key}>
            <header><strong>{group.label}</strong><span>{group.items.length}</span></header>
            <div>
              {group.items.map((item) => (
                <article className="sample-agenda-item" key={item.id}>
                  <i className="sample-agenda-dot" />
                  <div className="sample-agenda-client"><strong>{item.clientName}</strong></div>
                  <div className="sample-agenda-date"><span>DATA PREVISTA</span><strong>{displayDate(item.deliveryDate)}</strong></div>
                  <button type="button" onClick={() => onClose(item.id)} disabled={closingSampleId === item.id}>{closingSampleId === item.id ? "BAIXANDO..." : "DAR BAIXA"}</button>
                </article>
              ))}
              {!group.items.length ? <p>NENHUMA AMOSTRA NESTA FAIXA.</p> : null}
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
  orderDraft,
  setOrderDraft,
  scheduledActivity,
  scheduledAgendaAt,
  productFichas,
  lostReasons,
  onSaveProfile,
  onSaveActivity,
  onSaveOpportunity,
  onRegisterOrder,
  onDial,
  dialing,
  onOpenWhatsapp,
  openingWhatsapp,
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
  orderDraft: CrmOrderInput;
  setOrderDraft: (value: CrmOrderInput) => void;
  scheduledActivity?: CrmOverview["activities"][number];
  scheduledAgendaAt: string;
  productFichas: ProductFicha[];
  lostReasons: GeneralOption[];
  onSaveProfile: () => void;
  onSaveActivity: () => void;
  onSaveOpportunity: () => void;
  onRegisterOrder: () => void;
  onDial: (clientId: string) => void;
  dialing: boolean;
  onOpenWhatsapp: (clientId: string, whatsappUrl: string) => void;
  openingWhatsapp: boolean;
  saving: boolean;
  operationalLockClientId: string;
  operationalLockRepresentativeId: string;
  operationalLockActionAt: string;
}) {
  const [detailTab, setDetailTab] = useState<"resumo" | "contato" | "ligacoes" | "negocio" | "pedido">("resumo");
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
  const phone = client.phone || client.whatsapp;
  const whatsappPhone = client.whatsapp || client.phone;
  const dialPhone = client.phone;
  const isUsingExistingAgenda = Boolean(opportunityDraft.linkedActivityId || opportunityDraft.reuseExistingAgenda);
  const isPreparingOpportunity = Boolean(opportunityDraft.id || opportunityDraft.title.trim());
  const scheduledActivityToLink = scheduledActivity && !isUsingExistingAgenda && isPreparingOpportunity ? scheduledActivity : undefined;
  const availableProducts = productFichas.filter((item) => item.clientId === client.id && item.status !== "INATIVO" && Number(item.price) > 0);
  const selectedProduct = availableProducts.find((item) => item.id === opportunityDraft.productFichaId);
  const activeOpportunities = opportunities.filter((item) => item.stage !== "WON" && item.stage !== "LOST");
  const orderPreviewItems = orderDraft.items.map((item) => {
    const product = availableProducts.find((candidate) => candidate.id === item.productFichaId);
    const snapshot = product ? productPriceSnapshot(product) : undefined;
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(snapshot?.price || product?.price || 0);
    const ipiPercent = Number(snapshot?.ipiPercent || 0);
    const baseQuantity = Number(snapshot?.quantity || 0);
    return { product, quantity, unitPrice, ipiPercent, baseQuantity, total: quantity * unitPrice * (1 + ipiPercent / 100) };
  });
  const orderPreviewTotal = orderPreviewItems.reduce((total, item) => total + item.total, 0);

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
      closedAt: opportunity.closedAt,
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
          {whatsappPhone ? <button type="button" onClick={() => onOpenWhatsapp(client.id, whatsAppLink(whatsappPhone, client.buyerName || client.tradeName || client.legalName))} disabled={openingWhatsapp}>{openingWhatsapp ? "ABRINDO..." : "ABRIR WHATSAPP"}</button> : null}
          {dialPhone ? <button type="button" className="crm-dial-button" onClick={() => onDial(client.id)} disabled={dialing}>{dialing ? "CHAMANDO..." : "LIGAR"}</button> : null}
          <span className={`crm-health crm-health-${calculateHealth(toProfile(profileDraft)).toLowerCase()}`}>{healthLabel(calculateHealth(toProfile(profileDraft)))}</span>
        </div>
      </header>

      {mustResolveOverdueAgenda ? (
        <div className="crm-required-summary">
          <strong>ATENDIMENTO ATRASADO EM {displayDateTime(operationalLockActionAt)}</strong>
          <span>REGISTRE O CONTATO OU ATUALIZE A OPORTUNIDADE PARA LIBERAR OS DEMAIS MODULOS.</span>
        </div>
      ) : null}

      <SectionNavigation
        label="ACOES DO CLIENTE"
        value={detailTab}
        onChange={setDetailTab}
        accent="#8f63f4"
        items={[
          { key: "contato", label: "REGISTRAR CONTATO", icon: PhoneCall },
          ...(!mustResolveOverdueAgenda ? [
            { key: "resumo" as const, label: "RESUMO", icon: ContactRound },
            { key: "ligacoes" as const, label: "LIGACOES", icon: PhoneCall },
            { key: "negocio" as const, label: "NOVA OPORTUNIDADE", icon: Target },
            { key: "pedido" as const, label: "REGISTRAR PEDIDO", icon: PackageCheck },
          ] : []),
        ]}
      />

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
            {scheduledAgendaAt ? <div className="crm-current-agenda"><span>PROXIMA AGENDA JA MARCADA</span><strong>{displayDateTime(scheduledAgendaAt)}</strong></div> : null}
            <label className="crm-textarea crm-span-2"><span>RESUMO DO CONTATO</span><textarea value={activityDraft.notes} onChange={(event) => setActivityDraft({ ...activityDraft, notes: upper(event.target.value) })} /></label>
          </div>
          <div className="crm-form-actions"><button type="button" onClick={onSaveActivity} disabled={saving || !activityDraft.nextActionType || !activityDraft.nextActionAt || (mustResolveOverdueAgenda && !activityDraft.notes.trim())}>REGISTRAR CONTATO</button></div>
          <Timeline activities={activities} telephonyCalls={telephonyCalls} opportunities={opportunities} />
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
            {opportunityDraft.stage === "WON" || opportunityDraft.stage === "LOST" ? <CrmInput label="DATA DO FECHAMENTO" type="date" value={opportunityDraft.closedAt || ""} onChange={(closedAt) => setOpportunityDraft({ ...opportunityDraft, closedAt })} /> : null}
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
            {scheduledActivityToLink ? <button type="button" className="crm-secondary-action" onClick={() => setOpportunityDraft({ ...opportunityDraft, linkedActivityId: scheduledActivityToLink.id, reuseExistingAgenda: true, nextActionType: scheduledActivityToLink.nextActionType || "FOLLOW_UP", nextActionAt: toLocalDateTime(scheduledActivityToLink.nextActionAt) })} disabled={saving}>VINCULAR AGENDA ABERTA</button> : null}
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

      {detailTab === "pedido" && !mustResolveOverdueAgenda ? (
        <div className="crm-entry-form">
          <div className="crm-profile-grid">
            <CrmInput label="DATA DO PEDIDO" type="date" value={orderDraft.orderDate} onChange={(orderDate) => setOrderDraft({ ...orderDraft, orderDate })} />
            <CrmSelect label="REPRESENTANTE" value={orderDraft.representativeProfileId} onChange={(representativeProfileId) => setOrderDraft({ ...orderDraft, representativeProfileId })} options={representatives.map((item) => ({ value: item.id, label: item.name }))} />
          </div>
          <section className="crm-order-items">
            <header>
              <div><span>ITENS DA VENDA</span><strong>USE A FICHA COM A FORMACAO DE PRECO APROVADA.</strong></div>
              <button type="button" className="crm-secondary-action" onClick={() => setOrderDraft({ ...orderDraft, items: [...orderDraft.items, { productFichaId: "", quantity: 0 }] })} disabled={saving}><Plus size={15} /> ADICIONAR ITEM</button>
            </header>
            {orderDraft.items.map((item, index) => {
              const preview = orderPreviewItems[index];
              const invalidLot = preview.product && preview.quantity > 0 && preview.baseQuantity > 0 && preview.quantity < preview.baseQuantity;
              return <article className="crm-order-item" key={`${item.productFichaId}-${index}`}>
                <CrmSelect label={`ITEM ${index + 1} · FICHA TECNICA`} value={item.productFichaId} onChange={(productFichaId) => setOrderDraft({ ...orderDraft, items: orderDraft.items.map((current, itemIndex) => itemIndex === index ? { ...current, productFichaId, quantity: productFichaId ? orderQuantity(availableProducts.find((product) => product.id === productFichaId)) : 0 } : current) })} options={availableProducts.map((product) => ({ value: product.id, label: `${productLabel(product)} · ${money(productPriceSnapshot(product)?.price || product.price)}` }))} />
                <CrmInput label="QUANTIDADE" type="number" value={item.quantity || ""} onChange={(value) => setOrderDraft({ ...orderDraft, items: orderDraft.items.map((current, itemIndex) => itemIndex === index ? { ...current, quantity: Number(value || 0) } : current) })} />
                <div className={`crm-order-item-summary${invalidLot ? " is-invalid" : ""}`}>
                  <span>{preview.product ? `LOTE DA FORMACAO: ${preview.baseQuantity || "NAO INFORMADO"}` : "SELECIONE UMA FICHA"}</span>
                  <strong>{preview.product ? `${money(preview.unitPrice)} / UN · ${money(preview.total)}` : "-"}</strong>
                  {invalidLot ? <small>QUANTIDADE ABAIXO DO LOTE. FACA UMA NOVA FORMACAO.</small> : null}
                </div>
                {orderDraft.items.length > 1 ? <button type="button" className="crm-order-remove" onClick={() => setOrderDraft({ ...orderDraft, items: orderDraft.items.filter((_, itemIndex) => itemIndex !== index) })} title="REMOVER ITEM" aria-label="REMOVER ITEM"><Trash2 size={16} /></button> : null}
              </article>;
            })}
          </section>
          <div className="crm-order-total"><span>TOTAL DO PEDIDO</span><strong>{money(orderPreviewTotal)}</strong></div>
          <div className="crm-profile-grid"><label className="crm-textarea crm-span-2"><span>OBSERVACOES</span><textarea value={orderDraft.notes} onChange={(event) => setOrderDraft({ ...orderDraft, notes: upper(event.target.value) })} /></label></div>
          <div className="crm-form-actions"><button type="button" onClick={onRegisterOrder} disabled={saving || !orderDraft.orderDate || orderPreviewItems.some((item) => !item.product || item.quantity <= 0 || (item.baseQuantity > 0 && item.quantity < item.baseQuantity))}>REGISTRAR PEDIDO DEFINITIVO</button></div>
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
          <SearchableSelect
            value={openClientFilter === "ALL" ? "" : openClientFilter}
            onChange={(value) => setOpenClientFilter(value || "ALL")}
            options={openClients.map((client) => ({ value: client.id, label: client.tradeName || client.legalName }))}
            placeholder="TODOS OS CLIENTES"
            ariaLabel="FILTRO DE CLIENTE"
          />
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
                    <SearchableSelect
                      ariaLabel="VINCULAR CLIENTE"
                      disabled={saving}
                      value=""
                      onChange={(value) => onLinkClient(item, value)}
                      placeholder="VINCULAR CLIENTE"
                      options={clients.map((client) => ({ value: client.id, label: client.tradeName || client.legalName }))}
                    />
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

function Timeline({ activities, telephonyCalls, opportunities }: { activities: CrmOverview["activities"]; telephonyCalls: CrmOverview["telephonyCalls"]; opportunities: CrmOpportunity[] }) {
  const [filter, setFilter] = useState<"MANUAL" | "WHATSAPP" | "CALL" | "SYSTEM" | "">("");
  const opportunitiesById = new Map(opportunities.map((item) => [item.id, item]));
  const rows = [
    ...activities.map((item) => {
      const opportunity = opportunitiesById.get(item.opportunityId);
      const isAgendaPostponement = item.subject.startsWith("AGENDA_ADIADA:");
      const isWhatsappOpened = item.subject === "WHATSAPP ABERTO";
      const isSystemEvent = item.subject.startsWith("SISTEMA:");
      return {
        id: item.id,
        date: item.occurredAt,
        title: isAgendaPostponement ? "AGENDA ADIADA" : isWhatsappOpened ? "WHATSAPP ABERTO" : isSystemEvent ? item.subject.replace(/^SISTEMA:\s*/, "") : opportunity ? `AGENDA · ${opportunity.title}` : `${activityLabel(item.activityType)} · ${outcomeLabel(item.outcome)}`,
        detail: item.notes || item.subject || "CONTATO REGISTRADO",
        type: isAgendaPostponement ? "AGENDA" : isWhatsappOpened ? "WHATSAPP" : isSystemEvent ? "SISTEMA" : "CONTATO",
        source: isSystemEvent ? "SYSTEM" : isWhatsappOpened ? "WHATSAPP" : "MANUAL",
      };
    }),
    ...telephonyCalls.map((call) => ({ id: call.id, date: call.startedAt, title: `LIGACAO · ${call.status}`, detail: `${call.representativeName || "RAMAL NAO IDENTIFICADO"} · RAMAL ${call.extension || "-"} · ${formatTimelinePhone(call.remotePhone)}`, type: "LIGACAO", source: "CALL" as const })),
    ...opportunities.map((item) => ({ id: item.id, date: item.updatedAt, title: item.title, detail: `${item.productReference ? `${item.productReference} · ` : ""}${stageOptions.find((stage) => stage.value === item.stage)?.label || item.stage} · ${money(item.estimatedValue)}`, type: "NEGOCIO", source: "MANUAL" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const visibleRows = rows.filter((row) => !filter || row.source === filter).slice(0, 12);
  return (
    <section className="crm-timeline">
      <header><h4>LINHA DO TEMPO</h4><div className="crm-timeline-filters"><button type="button" className={filter === "MANUAL" ? "active" : ""} onClick={() => setFilter((current) => current === "MANUAL" ? "" : "MANUAL")}>MANUAIS</button><button type="button" className={filter === "WHATSAPP" ? "active" : ""} onClick={() => setFilter((current) => current === "WHATSAPP" ? "" : "WHATSAPP")}>WHATSAPP</button><button type="button" className={filter === "CALL" ? "active" : ""} onClick={() => setFilter((current) => current === "CALL" ? "" : "CALL")}>LIGACOES</button><button type="button" className={filter === "SYSTEM" ? "active" : ""} onClick={() => setFilter((current) => current === "SYSTEM" ? "" : "SYSTEM")}>SISTEMA</button></div></header>
      {visibleRows.map((row) => <article key={`${row.type}-${row.id}`}><i /><div><span>{row.type} · {displayDateTime(row.date)}</span><strong>{row.title}</strong><p>{row.detail}</p></div></article>)}
      {!visibleRows.length ? <div className="clients-empty">NENHUM REGISTRO NESTE FILTRO.</div> : null}
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
  return <label className="crm-field"><span>{label}</span><SearchableSelect value={value} onChange={onChange} options={options} disabled={disabled} ariaLabel={label} /></label>;
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

function productPriceSnapshot(product: ProductFicha) {
  if (product.pricingData && Number(product.pricingData.price || 0) > 0) return product.pricingData;
  return [...(product.priceHistory ?? [])].reverse().find((snapshot) => Number(snapshot.price || 0) > 0);
}

function orderQuantity(product?: ProductFicha) {
  if (!product) return 0;
  return Number(productPriceSnapshot(product)?.quantity || 0) || opportunityQuantity(product);
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
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(`Olá ${portugueseName(name)}, tudo bem?`)}`;
}

function agendaTaskLabel(item: AgendaItem) {
  if (item.kind === "CYCLE") return "VERIFICAR NECESSIDADE DE COMPRA";
  if (item.kind === "OPPORTUNITY") return item.actionType === "FOLLOW_UP" ? "ACOMPANHAR OPORTUNIDADE" : item.actionType;
  return item.actionType === "FOLLOW_UP" ? "ACOMPANHAR" : item.actionType;
}

function agendaTaskDueLabel(item: AgendaItem) {
  if (item.daysToAction < 0) return `${Math.abs(item.daysToAction)} DIA(S) ATRASADO · ${displayDate(item.scheduledAt)}`;
  if (item.daysToAction === 0) return `HOJE · ${displayDate(item.scheduledAt)}`;
  if (item.daysToAction === 1) return `AMANHA · ${displayDate(item.scheduledAt)}`;
  return `EM ${item.daysToAction} DIA(S) · ${displayDate(item.scheduledAt)}`;
}

function agendaKindLabel(item: AgendaItem) {
  if (item.kind === "CYCLE") return "CICLO DE COMPRA";
  if (item.directQuote) return item.opportunityTitle || "ORCAMENTO DIRETO";
  if (item.kind === "OPPORTUNITY") return item.opportunityTitle ? `OPORTUNIDADE · ${item.opportunityTitle}` : "OPORTUNIDADE";
  return "ACOMPANHAMENTO";
}

function portugueseName(value: string) {
  const connectors = new Set(["da", "das", "de", "do", "dos", "e"]);
  return (value || "CLIENTE")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((word, index) => index > 0 && connectors.has(word) ? word : word.split("-").map(capitalizeNamePart).join("-"))
    .join(" ");
}

function capitalizeNamePart(value: string) {
  return value ? `${value.slice(0, 1).toLocaleUpperCase("pt-BR")}${value.slice(1)}` : "";
}

function healthLabel(value: CrmHealth) {
  return value === "RED" ? "ATENCAO" : value === "YELLOW" ? "PROXIMO" : value === "GREEN" ? "EM DIA" : "SEM AGENDA";
}

function formatTimelinePhone(value: string) {
  const digits = (value || "").replace(/\D/g, "").replace(/^55/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "NUMERO NAO INFORMADO";
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

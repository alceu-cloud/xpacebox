import type { SupabaseClient } from "@supabase/supabase-js";

type QuoteCrmInput = {
  tenantCompanyId: string;
  quoteId: string;
  quoteNumber: string;
  clientId: string;
  clientName: string;
  representativeProfileId: string;
  grandTotal: number;
  validUntil: string;
  createdBy: string;
  existingOpportunityId?: string;
};

export async function resolveQuoteRepresentative(
  admin: SupabaseClient,
  tenantCompanyId: string,
  clientId: string,
  fallbackProfileId: string
) {
  const { data: client, error: clientError } = await admin
    .from("clients")
    .select("representative_profile_id")
    .eq("id", clientId)
    .eq("tenant_company_id", tenantCompanyId)
    .eq("active", true)
    .maybeSingle();

  if (clientError) throw clientError;
  if (!client) throw new Error("CLIENTE INVALIDO PARA O ORCAMENTO.");
  if (client.representative_profile_id) return String(client.representative_profile_id);

  const { data: crmProfile, error: profileError } = await admin
    .from("crm_customer_profiles")
    .select("owner_profile_id")
    .eq("tenant_company_id", tenantCompanyId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (profileError) throw profileError;
  return String(crmProfile?.owner_profile_id || fallbackProfileId);
}

export async function syncQuoteWithCrm(admin: SupabaseClient, input: QuoteCrmInput) {
  const nextActionAt = nextBusinessMorning();
  const now = new Date().toISOString();
  const validityText = input.validUntil ? ` VALIDADE: ${displayDate(input.validUntil)}.` : "";

  const opportunityPayload = {
    representative_profile_id: input.representativeProfileId,
    title: `ORCAMENTO ${input.quoteNumber} - ${input.clientName}`,
    estimated_value: input.grandTotal,
    expected_close_date: input.validUntil || null,
    updated_at: now,
  };

  if (input.existingOpportunityId) {
    const { data: existingOpportunity, error: existingOpportunityError } = await admin
      .from("crm_opportunities")
      .select("id,notes")
      .eq("id", input.existingOpportunityId)
      .eq("tenant_company_id", input.tenantCompanyId)
      .eq("client_id", input.clientId)
      .is("quote_id", null)
      .not("stage", "in", "(WON,LOST)")
      .maybeSingle();
    if (existingOpportunityError) throw existingOpportunityError;
    if (!existingOpportunity) throw new Error("A OPORTUNIDADE ESCOLHIDA NAO ESTA MAIS DISPONIVEL PARA VINCULO.");

    const notes = [existingOpportunity.notes, `ORCAMENTO ${input.quoteNumber} VINCULADO.${validityText}`]
      .filter(Boolean)
      .join("\n");
    const { error: updateError } = await admin
      .from("crm_opportunities")
      .update({ ...opportunityPayload, quote_id: input.quoteId, stage: "QUOTE_SENT", notes, quote_linked_existing: true })
      .eq("id", existingOpportunity.id)
      .eq("tenant_company_id", input.tenantCompanyId);
    if (updateError) throw updateError;

    const { error: activityError } = await admin.from("crm_activities").insert({
      tenant_company_id: input.tenantCompanyId,
      client_id: input.clientId,
      opportunity_id: existingOpportunity.id,
      representative_profile_id: input.representativeProfileId,
      activity_type: "QUOTE",
      outcome: "FOLLOW_UP",
      subject: `ORCAMENTO ${input.quoteNumber} VINCULADO`,
      notes: `VALOR: ${money(input.grandTotal)}.${validityText}`,
      occurred_at: now,
      next_action_type: null,
      next_action_at: null,
      created_by: input.createdBy,
    });
    if (activityError) throw activityError;
    return;
  }

  const { data: existing, error: existingError } = await admin
    .from("crm_opportunities")
    .select("id, stage")
    .eq("tenant_company_id", input.tenantCompanyId)
    .eq("quote_id", input.quoteId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const closed = existing.stage === "WON" || existing.stage === "LOST";
    const { error } = await admin
      .from("crm_opportunities")
      .update({ ...opportunityPayload, ...(closed ? {} : { stage: "QUOTE_SENT" }) })
      .eq("id", existing.id)
      .eq("tenant_company_id", input.tenantCompanyId);
    if (error) throw error;
  } else {
    const { data: opportunity, error } = await admin.from("crm_opportunities").insert({
      tenant_company_id: input.tenantCompanyId,
      client_id: input.clientId || null,
      quote_id: input.quoteId,
      stage: "QUOTE_SENT",
      notes: `ORCAMENTO ENVIADO PELO SISTEMA.${validityText}`,
      created_by: input.createdBy,
      ...opportunityPayload,
    }).select("id").single();
    if (error) throw error;

    if (input.clientId) {
      const { error: activityError } = await admin.from("crm_activities").insert({
        tenant_company_id: input.tenantCompanyId,
        client_id: input.clientId,
        opportunity_id: opportunity.id,
        representative_profile_id: input.representativeProfileId,
        activity_type: "QUOTE",
        outcome: "FOLLOW_UP",
        subject: `ORCAMENTO ${input.quoteNumber} ENVIADO`,
        notes: `VALOR: ${money(input.grandTotal)}.${validityText}`,
        occurred_at: now,
        next_action_type: "FOLLOW_UP",
        next_action_at: nextActionAt,
        created_by: input.createdBy,
      });
      if (activityError) throw activityError;
    }
  }

  if (!input.clientId) return;

  const { data: profile, error: profileError } = await admin
    .from("crm_customer_profiles")
    .select("id, owner_profile_id")
    .eq("tenant_company_id", input.tenantCompanyId)
    .eq("client_id", input.clientId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (profile) {
    const { error } = await admin
      .from("crm_customer_profiles")
      .update({
        owner_profile_id: profile.owner_profile_id || input.representativeProfileId,
        next_contact_at: nextActionAt,
        updated_at: now,
      })
      .eq("id", profile.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("crm_customer_profiles").insert({
      tenant_company_id: input.tenantCompanyId,
      client_id: input.clientId,
      owner_profile_id: input.representativeProfileId,
      next_contact_at: nextActionAt,
      relationship_status: "ACTIVE",
      created_by: input.createdBy,
    });
    if (error) throw error;
  }
}

export async function syncExistingDirectQuotesWithCrm(
  admin: SupabaseClient,
  tenantCompanyId: string,
  createdBy: string
) {
  const { data: quotes, error: quotesError } = await admin
    .from("quotes")
    .select("id, quote_number, client_id, client_name, representative_profile_id, grand_total, valid_until")
    .eq("tenant_company_id", tenantCompanyId)
    .eq("kind", "DIRECT")
    .order("created_at", { ascending: false })
    .limit(300);
  if (quotesError) throw quotesError;

  const quoteIds = (quotes ?? []).map((quote) => quote.id).filter(Boolean);
  if (!quoteIds.length) return 0;

  const { data: existing, error: existingError } = await admin
    .from("crm_opportunities")
    .select("quote_id")
    .eq("tenant_company_id", tenantCompanyId)
    .in("quote_id", quoteIds);
  if (existingError) throw existingError;

  const existingQuoteIds = new Set((existing ?? []).map((row) => String(row.quote_id || "")));
  let created = 0;
  for (const quote of quotes ?? []) {
    if (!quote.id || existingQuoteIds.has(String(quote.id))) continue;
    await syncQuoteWithCrm(admin, {
      tenantCompanyId,
      quoteId: String(quote.id),
      quoteNumber: String(quote.quote_number),
      clientId: String(quote.client_id || ""),
      clientName: String(quote.client_name || "CLIENTE NAO CADASTRADO"),
      representativeProfileId: String(quote.representative_profile_id || createdBy),
      grandTotal: Number(quote.grand_total || 0),
      validUntil: String(quote.valid_until || ""),
      createdBy,
    });
    created += 1;
  }
  return created;
}

function nextBusinessMorning() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const cursor = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1, 12));

  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) cursor.setUTCDate(cursor.getUTCDate() + 1);
  return cursor.toISOString();
}

function displayDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

import type { EngineeringFormula, PaperCostParams, PaperType, PricingGoalsByCompany, PricingOperationalParams, PricingParamsByCompany, ProductFicha, ProductionTime, QuoteParametersByCompany, SalesGoals, SalesRepresentative, SpecificMaterial, Supplier } from "@/types/gerenciador";
import type { CfopOption, GeneralOption, PaymentCondition } from "@/types/cadastros-gerais";

export type ManagerSettings = {
  suppliers?: Supplier[];
  paperTypes?: PaperType[];
  materials?: SpecificMaterial[];
  engineeringFormulas?: EngineeringFormula[];
  paperCostParams?: PaperCostParams;
  pricingParams?: PricingParamsByCompany;
  pricingOperationalParams?: PricingOperationalParams;
  pricingGoalsByCompany?: PricingGoalsByCompany;
  productionTimes?: ProductionTime[];
  paymentConditions?: PaymentCondition[];
  cfops?: CfopOption[];
  taxRegimes?: GeneralOption[];
  fiscalProfiles?: GeneralOption[];
  fiscalBenefits?: GeneralOption[];
  lostReasons?: GeneralOption[];
  salesGoals?: SalesGoals;
  productFichas?: ProductFicha[];
  productColors?: string[];
  quoteParameters?: QuoteParametersByCompany;
};

async function authorizedFetch(path: string, init?: RequestInit) {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESSAO NAO ENCONTRADA.");

  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || "NAO FOI POSSIVEL SALVAR AS CONFIGURACOES.");
  return payload;
}

export async function loadManagerSettings(slug: string): Promise<ManagerSettings & { representatives: SalesRepresentative[] }> {
  const payload = await authorizedFetch(`/api/gerenciador?slug=${encodeURIComponent(slug)}`);
  return { ...(payload.settings ?? {}), representatives: payload.representatives ?? [] };
}

export async function saveManagerSetting<K extends keyof ManagerSettings>(slug: string, key: K, value: ManagerSettings[K]) {
  await authorizedFetch("/api/gerenciador", { method: "PATCH", body: JSON.stringify({ slug, key, value }) });
}

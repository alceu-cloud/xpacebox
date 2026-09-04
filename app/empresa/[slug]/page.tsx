"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useParams } from "next/navigation";

import ClientesEmpresa from "@/components/clientes/ClientesEmpresa";
import { useCrmOperationalLock } from "@/components/clientes/CrmOperationalLock";
import GerenciadorEmpresa, { ProductCatalogPanel } from "@/components/gerenciador/GerenciadorEmpresa";
import FinanceiroEmpresa from "@/components/financeiro/FinanceiroEmpresa";
import RelatoriosEmpresa from "@/components/relatorios/RelatoriosEmpresa";
import { loadClients } from "@/lib/clientes";
import { defaultPaperCostParams, defaultPricingGoalsByCompany, defaultPricingOperationalParams, defaultPricingParamsByCompany, defaultQuoteParametersByCompany, defaultSalesGoals, initialEngineeringFormulas, initialMaterials, initialPaperTypes, initialSuppliers, normalizePricingOperationalParams, normalizePricingParamsByCompany, normalizeSalesGoals } from "@/lib/gerenciador/data";
import { defaultProductionTimes } from "@/lib/gerenciador/impressora-data";
import { loadManagerSettings, saveManagerSetting, type ManagerSettings } from "@/lib/gerenciador/api";
import { calculateProductArea, evaluateEngineeringFormula, formulaUsesDimension, formulaUsesTopOverlap, getAccessoryQuantity, recalculateProductFichaAreas } from "@/lib/gerenciador/product-area";
import { initialCfops, initialFiscalBenefits, initialFiscalProfiles, initialLostReasons, initialPaymentConditions, initialTaxRegimes } from "@/lib/gerenciador/general-data";
import { calculatePriceAnalysis, calculatePriceForHourlyTarget, calculatePriceForMarginTarget, calculatePriceResult, calculateRequiredLotForHourlyTarget } from "@/lib/pricing/calculations";
import { isMaterialAvailableForUse } from "@/lib/gerenciador/materials";
import { supabase } from "@/lib/supabase";
import type { EngineeringFormula, PaperCostParams, PaperType, PricingGoals, PricingGoalsByCompany, PricingOperationalParams, PricingParams, PricingParamsByCompany, ProductFicha, ProductPriceSnapshot, ProductionTime, QuoteParametersByCompany, SalesGoals, SalesRepresentative, SpecificMaterial, Supplier } from "@/types/gerenciador";
import type { ClientRecord } from "@/types/clientes";
import type { CfopOption, PaymentCondition } from "@/types/cadastros-gerais";
import type { GeneralOption } from "@/types/cadastros-gerais";
import type { PricingQuotePrefill, QuoteItem } from "@/types/orcamentos";

type ModuloKey = "gerenciador" | "clientes" | "produtos" | "formacao-preco" | "financeiro" | "relatorios";

const modulos: Array<{
  key: ModuloKey;
  nome: string;
  descricao: string;
  cor: string;
  somenteGerencia?: boolean;
}> = [
  { key: "gerenciador", nome: "GERENCIADOR", descricao: "PAINEL ADMINISTRATIVO DA EMPRESA", cor: "#6f32d2", somenteGerencia: true },
  { key: "clientes", nome: "CLIENTES", descricao: "CADASTRO E GESTAO DE CLIENTES", cor: "#8f63f4" },
  { key: "produtos", nome: "PRODUTOS", descricao: "PRODUTOS, MATERIAIS E SERVICOS", cor: "#e63dae" },
  { key: "formacao-preco", nome: "FORMACAO DE PRECO", descricao: "CALCULOS, CUSTOS E MARGENS", cor: "#ff3b25" },
  { key: "financeiro", nome: "FINANCEIRO", descricao: "CONTROLE E INDICADORES FINANCEIROS", cor: "#e68019" },
  { key: "relatorios", nome: "RELATORIOS", descricao: "ANALISES E INFORMACOES GERENCIAIS", cor: "#c026d3" },
];

const etapasPreco = ["MATERIAIS", "TIPO DE CAIXA", "CONFIGURAR DIMENSOES", "LOTE & LOGISTICA", "EMPRESA", "VER PRECO"];

type PricingStep = (typeof etapasPreco)[number];
type PricingMode = "direct" | "engineering";
type EngineeringPricingStep = "CLIENTE / PRODUTO" | "LOTE & LOGISTICA" | "VER PRECO";
type BoxCategory = "maleta" | "corte-vinco" | "tabuleiro";
type BoxModelKey = "caixa-4-abas" | "caixa-4-abas-transpasse" | "corte-vinco-geral" | "caixa-sedex" | "tabuleiro";
type SellerCompanyKey = "dawos" | "carcat" | "gta";

const sellerCompanies: Array<{
  key: SellerCompanyKey;
  name: string;
  description: string;
  icon: "building" | "factory" | "bolt";
  taxProfile: {
    simples: number;
    icms: number;
    pisCofins: number;
    ipi: number;
    commission: number;
  };
}> = [
  { key: "dawos", name: "DAWOS", description: "DAWOS EMBALAGENS", icon: "building", taxProfile: { simples: 5, icms: 12, pisCofins: 3.65, ipi: 3.25, commission: 2 } },
  { key: "carcat", name: "CARCAT", description: "EMBALAGENS E CARTONAGEM", icon: "factory", taxProfile: { simples: 5, icms: 12, pisCofins: 3.65, ipi: 3.25, commission: 2 } },
  { key: "gta", name: "GTA", description: "INDUSTRIAL & LOGISTICA", icon: "bolt", taxProfile: { simples: 5, icms: 12, pisCofins: 3.65, ipi: 3.25, commission: 2 } },
];

const categoryOptions: Array<{
  key: BoxCategory;
  title: string;
  subtitle: string;
  image: "maleta" | "sedex" | "tabuleiro" | "transpasse";
}> = [
  { key: "maleta", title: "CAIXA MALETA", subtitle: "MODELOS RSC COMUNS", image: "maleta" },
  { key: "corte-vinco", title: "CORTE & VINCO", subtitle: "MODELOS ESPECIAIS", image: "sedex" },
  { key: "tabuleiro", title: "TABULEIRO", subtitle: "CHAPAS PLANAS (C x L)", image: "tabuleiro" },
];

const modelOptions: Record<BoxCategory, Array<{
  key: BoxModelKey;
  title: string;
  subtitle: string;
  formulaId: string;
  image: "maleta" | "sedex" | "tabuleiro" | "transpasse";
  dimensionMode: "full" | "hide-height" | "disabled-height";
}>> = {
  maleta: [
    { key: "caixa-4-abas", title: "CAIXA 4 ABAS", subtitle: "MODELO CLASSICO RSC", formulaId: "mn-b", image: "maleta", dimensionMode: "full" },
    { key: "caixa-4-abas-transpasse", title: "CAIXA 4 ABAS - TRANSPASSE TOTAL", subtitle: "ABAS COBREM TODO O TOPO E TODO O FUNDO", formulaId: "mt-b", image: "transpasse", dimensionMode: "full" },
  ],
  "corte-vinco": [
    { key: "corte-vinco-geral", title: "CORTE E VINCO GERAL", subtitle: "MODELO SEM ALTURA", formulaId: "cv-geral", image: "tabuleiro", dimensionMode: "disabled-height" },
    { key: "caixa-sedex", title: "CAIXA SEDEX", subtitle: "MODELO COM COMPRIMENTO, LARGURA E ALTURA", formulaId: "sedex-b", image: "sedex", dimensionMode: "full" },
  ],
  tabuleiro: [
    { key: "tabuleiro", title: "TABULEIRO", subtitle: "CHAPA PLANA SEM ALTURA", formulaId: "tab-b", image: "tabuleiro", dimensionMode: "disabled-height" },
  ],
};

export default function EmpresaPage() {
  const params = useParams();
  const { isBlocked: crmBlocked, lock: crmLock } = useCrmOperationalLock();
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [moduloAtivo, setModuloAtivo] = useState<ModuloKey | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [paperTypes, setPaperTypes] = useState<PaperType[]>(initialPaperTypes);
  const [materials, setMaterials] = useState<SpecificMaterial[]>(initialMaterials);
  const [engineeringFormulas, setEngineeringFormulas] = useState<EngineeringFormula[]>(initialEngineeringFormulas);
  const [paperCostParams, setPaperCostParams] = useState<PaperCostParams>(defaultPaperCostParams);
  const [pricingParamsByCompany, setPricingParamsByCompany] = useState<PricingParamsByCompany>(defaultPricingParamsByCompany);
  const [pricingOperationalParams, setPricingOperationalParams] = useState<PricingOperationalParams>(defaultPricingOperationalParams);
  const [pricingGoalsByCompany, setPricingGoalsByCompany] = useState<PricingGoalsByCompany>(defaultPricingGoalsByCompany);
  const [quoteParameters, setQuoteParameters] = useState<QuoteParametersByCompany>(defaultQuoteParametersByCompany);
  const [productionTimes, setProductionTimes] = useState<ProductionTime[]>(defaultProductionTimes);
  const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>(initialPaymentConditions);
  const [cfops, setCfops] = useState<CfopOption[]>(initialCfops);
  const [taxRegimes, setTaxRegimes] = useState<GeneralOption[]>(initialTaxRegimes);
  const [fiscalProfiles, setFiscalProfiles] = useState<GeneralOption[]>(initialFiscalProfiles);
  const [fiscalBenefits, setFiscalBenefits] = useState<GeneralOption[]>(initialFiscalBenefits);
  const [lostReasons, setLostReasons] = useState<GeneralOption[]>(initialLostReasons);
  const [salesGoals, setSalesGoals] = useState<SalesGoals>(defaultSalesGoals);
  const [salesRepresentatives, setSalesRepresentatives] = useState<SalesRepresentative[]>([]);
  const [productFichas, setProductFichas] = useState<ProductFicha[]>([]);
  const [productColors, setProductColors] = useState<string[]>(["BRANCO", "PRETO", "VERMELHO", "AZUL", "AMARELO"]);
  const [quotePrefill, setQuotePrefill] = useState<PricingQuotePrefill | null>(null);
  const [quoteContinuationOpen, setQuoteContinuationOpen] = useState(false);

  const slug = String(params.slug ?? "");

  useEffect(() => {
    async function carregarPermissao() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const { data: perfil } = await supabase
        .from("profiles")
        .select("platform_role")
        .eq("id", session.user.id)
        .single();

      const gerente =
        perfil?.platform_role === "platform_owner" ||
        perfil?.platform_role === "company_manager";

      setPodeGerenciar(gerente);
      if (!gerente && moduloAtivo === "gerenciador") setModuloAtivo(null);
    }

    carregarPermissao();
  }, [moduloAtivo]);

  useEffect(() => {
    let active = true;
    loadManagerSettings(slug)
      .then((settings) => {
        if (!active) return;
        if (settings.suppliers) setSuppliers(settings.suppliers);
        if (settings.paperTypes) setPaperTypes(settings.paperTypes);
        if (settings.materials) setMaterials(settings.materials);
        if (settings.engineeringFormulas) setEngineeringFormulas(settings.engineeringFormulas);
        if (settings.paperCostParams) setPaperCostParams(settings.paperCostParams);
        if (settings.pricingParams) setPricingParamsByCompany(normalizePricingParamsByCompany(settings.pricingParams));
        if (settings.pricingOperationalParams) setPricingOperationalParams(normalizePricingOperationalParams(settings.pricingOperationalParams));
        if (settings.pricingGoalsByCompany) setPricingGoalsByCompany(settings.pricingGoalsByCompany);
        if (settings.quoteParameters) setQuoteParameters(settings.quoteParameters);
        if (settings.productionTimes) setProductionTimes(settings.productionTimes);
        if (settings.paymentConditions) setPaymentConditions(settings.paymentConditions);
        if (settings.cfops) setCfops(settings.cfops);
        if (settings.taxRegimes) setTaxRegimes(settings.taxRegimes);
        if (settings.fiscalProfiles) setFiscalProfiles(settings.fiscalProfiles);
        if (settings.fiscalBenefits) setFiscalBenefits(settings.fiscalBenefits);
        if (settings.lostReasons) setLostReasons(settings.lostReasons);
        if (settings.salesGoals) setSalesGoals(normalizeSalesGoals(settings.salesGoals));
        setSalesRepresentatives(settings.representatives);
        if (settings.productFichas) setProductFichas(settings.productFichas);
        if (settings.productColors) setProductColors(settings.productColors);
      })
      .catch((error) => console.error("MANAGER SETTINGS LOAD ERROR", error));
    return () => {
      active = false;
    };
  }, [slug]);

  function persistManagerChange<K extends keyof ManagerSettings>(key: K, value: NonNullable<ManagerSettings[K]>, setter: (value: NonNullable<ManagerSettings[K]>) => void) {
    setter(value);
    void saveManagerSetting(slug, key, value).catch((error) => console.error("MANAGER SETTINGS SAVE ERROR", error));
  }

  function persistEngineeringFormulaChange(value: EngineeringFormula[]) {
    setEngineeringFormulas(value);
    setProductFichas((current) => recalculateProductFichaAreas(current, value));
    void saveManagerSetting(slug, "engineeringFormulas", value).catch((error) => console.error("MANAGER SETTINGS SAVE ERROR", error));
  }

  const modulosVisiveis = useMemo(
    () => modulos.filter((modulo) => !modulo.somenteGerencia || podeGerenciar),
    [podeGerenciar]
  );

  useEffect(() => {
    if (!crmBlocked) return;
    setModuloAtivo("clientes");
    setMenuAberto(false);
  }, [crmBlocked]);

  const modulosDisponiveis = crmBlocked
    ? modulosVisiveis.filter((modulo) => modulo.key === "clientes")
    : modulosVisiveis;
  const moduloEmExibicao: ModuloKey | null = crmBlocked ? "clientes" : moduloAtivo;

  const moduloSelecionado = modulos.find((modulo) => modulo.key === moduloEmExibicao);

  return (
    <main
      style={{
        ...paginaStyle,
        paddingLeft: menuAberto ? 322 : 72,
      }}
    >
      <div style={sidebarDockStyle}>
        <aside
          style={{
            ...sidebarStyle,
            transform: menuAberto ? "translateX(0)" : "translateX(-252px)",
          }}
          onMouseEnter={() => setMenuAberto(true)}
          onMouseLeave={() => setMenuAberto(false)}
        >
          <div style={sidebarContentStyle}>
            <div style={sidebarHeaderStyle}>
              <span style={sidebarEyebrowStyle}>MODULOS</span>
              <strong style={sidebarTitleStyle}>AMBIENTE DAWOS</strong>
            </div>

            <nav style={moduleListStyle}>
              {modulosDisponiveis.map((modulo) => {
                const ativo = modulo.key === moduloEmExibicao;
                return (
                  <button
                    key={modulo.key}
                    type="button"
                    onClick={() => setModuloAtivo(modulo.key)}
                    style={{
                      ...moduleButtonStyle,
                      ...(ativo ? activeModuleButtonStyle : {}),
                      borderColor: ativo ? `${modulo.cor}55` : "rgba(52,64,84,.12)",
                    }}
                  >
                    <span
                      style={{
                        ...moduleAccentStyle,
                        background: `linear-gradient(180deg, ${modulo.cor}, #e63dae, #ff3b25)`,
                      }}
                    />
                    <span style={moduleTextStyle}>
                      <strong style={moduleNameStyle}>{modulo.nome}</strong>
                      <small style={moduleDescriptionStyle}>{modulo.descricao}</small>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
          <div style={sidebarHandleStyle}>MODULOS</div>
        </aside>
      </div>

      <section style={workspaceStyle}>
        {!moduloSelecionado ? (
          <EmptyWorkspace />
        ) : (
          <div style={workspaceHeaderStyle}>
            <div>
              <span style={workspaceEyebrowStyle}>PAINEL SELECIONADO</span>
              <h1 style={workspaceTitleStyle}>{moduloSelecionado.nome}</h1>
              <p style={workspaceSubtitleStyle}>{moduloSelecionado.descricao}</p>
            </div>
          </div>
        )}

        {moduloEmExibicao === "gerenciador" ? (
          <GerenciadorEmpresa
            companySlug={slug}
            suppliers={suppliers}
            paperTypes={paperTypes}
            materials={materials}
            engineeringFormulas={engineeringFormulas}
            paperCostParams={paperCostParams}
            pricingParams={pricingParamsByCompany}
            pricingOperationalParams={pricingOperationalParams}
            pricingGoalsByCompany={pricingGoalsByCompany}
            quoteParameters={quoteParameters}
            productionTimes={productionTimes}
            paymentConditions={paymentConditions}
            cfops={cfops}
            onSuppliersChange={(value) => persistManagerChange("suppliers", value, setSuppliers)}
            onPaperTypesChange={(value) => persistManagerChange("paperTypes", value, setPaperTypes)}
            onMaterialsChange={(value) => persistManagerChange("materials", value, setMaterials)}
            onEngineeringFormulasChange={persistEngineeringFormulaChange}
            onPaperCostParamsChange={(value) => persistManagerChange("paperCostParams", value, setPaperCostParams)}
            onPricingParamsChange={(value) => persistManagerChange("pricingParams", value, setPricingParamsByCompany)}
            onPricingOperationalParamsChange={(value) => persistManagerChange("pricingOperationalParams", value, setPricingOperationalParams)}
            onPricingGoalsByCompanyChange={(value) => persistManagerChange("pricingGoalsByCompany", value, setPricingGoalsByCompany)}
            onQuoteParametersChange={(value) => persistManagerChange("quoteParameters", value, setQuoteParameters)}
            onProductionTimesChange={(value) => persistManagerChange("productionTimes", value, setProductionTimes)}
            onPaymentConditionsChange={(value) => persistManagerChange("paymentConditions", value, setPaymentConditions)}
            onCfopsChange={(value) => persistManagerChange("cfops", value, setCfops)}
            taxRegimes={taxRegimes}
            fiscalProfiles={fiscalProfiles}
            fiscalBenefits={fiscalBenefits}
            lostReasons={lostReasons}
            salesGoals={salesGoals}
            salesRepresentatives={salesRepresentatives}
            onTaxRegimesChange={(value) => persistManagerChange("taxRegimes", value, setTaxRegimes)}
            onFiscalProfilesChange={(value) => persistManagerChange("fiscalProfiles", value, setFiscalProfiles)}
            onFiscalBenefitsChange={(value) => persistManagerChange("fiscalBenefits", value, setFiscalBenefits)}
            onLostReasonsChange={(value) => persistManagerChange("lostReasons", value, setLostReasons)}
            onSalesGoalsChange={(value) => persistManagerChange("salesGoals", value, setSalesGoals)}
            productFichas={productFichas}
            productColors={productColors}
            onProductFichasChange={(value) => persistManagerChange("productFichas", value, setProductFichas)}
            onProductColorsChange={(value) => persistManagerChange("productColors", value, setProductColors)}
          />
        ) : moduloEmExibicao === "clientes" ? (
          <ClientesEmpresa slug={slug} paymentConditions={paymentConditions} cfops={cfops} taxRegimes={taxRegimes} fiscalProfiles={fiscalProfiles} fiscalBenefits={fiscalBenefits} lostReasons={lostReasons} productFichas={productFichas} forceCrm={crmBlocked} forcedClientId={crmLock?.clientId || ""} />
        ) : moduloEmExibicao === "produtos" ? (
          <ProductCatalogPanel
            companySlug={slug}
            fichas={productFichas}
            suppliers={suppliers}
            materials={materials}
            engineeringFormulas={engineeringFormulas}
            onChange={(value) => persistManagerChange("productFichas", value, setProductFichas)}
          />
        ) : moduloEmExibicao === "formacao-preco" ? (
          <PricingPreview
            companySlug={slug}
            suppliers={suppliers}
            paperTypes={paperTypes}
            materials={materials}
            engineeringFormulas={engineeringFormulas}
            paperCostParams={paperCostParams}
            pricingParamsByCompany={pricingParamsByCompany}
            pricingOperationalParams={pricingOperationalParams}
            pricingGoalsByCompany={pricingGoalsByCompany}
            productionTimes={productionTimes}
            productFichas={productFichas}
            onSendToQuote={(prefill) => {
              if (prefill.kind === "DIRECT") {
                setQuotePrefill((current) => current?.kind === "DIRECT"
                  ? { ...prefill, items: [...current.items, ...prefill.items].map((item, index) => ({ ...item, itemNumber: index + 1 })) }
                  : prefill);
                setQuoteContinuationOpen(true);
                return;
              }

              if (!prefill.fichaId) return;
              const nextFichas = productFichas.map((ficha) => {
                if (ficha.id !== prefill.fichaId) return ficha;
                const item = prefill.items[0];
                const snapshot = item.snapshot ?? {};
                const priceSnapshot: ProductPriceSnapshot = {
                  id: crypto.randomUUID(),
                  source: typeof snapshot.source === "string" ? snapshot.source : "FORMACAO DE PRECO",
                  price: item.unitPrice,
                  createdAt: new Date().toISOString(),
                  sellerCompany: prefill.sellerCompanyName,
                  mcPercent: typeof snapshot.mcPercent === "number" ? snapshot.mcPercent : undefined,
                  mcrHour: typeof snapshot.mcrHour === "number" ? snapshot.mcrHour : undefined,
                  pricePerKg: typeof snapshot.pricePerKg === "number" ? snapshot.pricePerKg : undefined,
                  setupMinutes: typeof snapshot.setupMinutes === "number" ? snapshot.setupMinutes : undefined,
                  boxesPerHour: typeof snapshot.boxesPerHour === "number" ? snapshot.boxesPerHour : undefined,
                  commissionPercent: typeof snapshot.commissionPercent === "number" ? snapshot.commissionPercent : undefined,
                  quantity: item.quantity,
                  materialCode: item.material,
                  paperType: typeof snapshot.paperType === "string" ? snapshot.paperType : undefined,
                  topOverlap: typeof snapshot.topOverlap === "number" ? snapshot.topOverlap : undefined,
                  areaM2: item.area,
                  mainAreaM2: typeof snapshot.mainAreaM2 === "number" ? snapshot.mainAreaM2 : undefined,
                  totalAreaM2: typeof snapshot.totalAreaM2 === "number" ? snapshot.totalAreaM2 : item.area,
                  weightKg: typeof snapshot.weightKg === "number" ? snapshot.weightKg : undefined,
                  totalOrder: item.total,
                };
                return {
                  ...ficha,
                  price: item.unitPrice,
                  materialId: typeof snapshot.materialId === "string" ? snapshot.materialId : ficha.materialId,
                  length: item.length,
                  width: item.width,
                  height: item.height,
                  company: prefill.sellerCompanyName,
                  areaM2: typeof snapshot.mainAreaM2 === "number" ? snapshot.mainAreaM2 : ficha.areaM2,
                  totalAreaM2: typeof snapshot.totalAreaM2 === "number" ? snapshot.totalAreaM2 : item.area,
                  pricingData: priceSnapshot,
                  priceHistory: [...(ficha.priceHistory ?? []), priceSnapshot],
                };
              });
              persistManagerChange("productFichas", nextFichas, setProductFichas);
              window.alert("PRECO E DADOS DA FORMACAO ENVIADOS PARA A FICHA TECNICA.");
            }}
          />
        ) : moduloEmExibicao === "financeiro" ? (
          <FinanceiroEmpresa
            companySlug={slug}
            productFichas={productFichas}
            materials={materials}
            engineeringFormulas={engineeringFormulas}
            prefill={quotePrefill}
            quoteParameters={quoteParameters}
            paymentConditions={paymentConditions}
            onStartDirectPricing={() => {
              setQuotePrefill(null);
              setModuloAtivo("formacao-preco");
            }}
          />
        ) : moduloEmExibicao === "relatorios" ? (
          <RelatoriosEmpresa slug={slug} />
        ) : moduloSelecionado ? (
          <ModulePlaceholder modulo={moduloSelecionado} />
        ) : (
          null
        )}
      </section>

      <QuoteContinuationModal
        open={quoteContinuationOpen}
        onContinue={() => setQuoteContinuationOpen(false)}
        onFinish={() => {
          setQuoteContinuationOpen(false);
          setModuloAtivo("financeiro");
        }}
      />
    </main>
  );
}

function QuoteContinuationModal({
  open,
  onContinue,
  onFinish,
}: {
  open: boolean;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueButtonRef.current?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onContinue();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onContinue]);

  if (!open) return null;

  return (
    <div style={quoteModalOverlayStyle} role="presentation">
      <style>{`@keyframes quote-success-pulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(230,61,174,.25); } 50% { transform: scale(1.06); box-shadow: 0 0 0 14px rgba(230,61,174,0); } }`}</style>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-continuation-title"
        aria-describedby="quote-continuation-description"
        style={quoteModalCardStyle}
      >
        <div style={quoteModalAccentStyle} />
        <div style={quoteModalSuccessIconStyle}>{"\u2713"}</div>
        <span style={quoteModalEyebrowStyle}>ITEM ADICIONADO</span>
        <h2 id="quote-continuation-title" style={quoteModalTitleStyle}>ITEM ENVIADO PARA O ORCAMENTO</h2>
        <p id="quote-continuation-description" style={quoteModalTextStyle}>
          DESEJA FORMAR MAIS UM PRECO PARA ESTE MESMO ORCAMENTO?
        </p>
        <div style={quoteModalActionsStyle}>
          <button ref={continueButtonRef} type="button" onClick={onContinue} style={quoteModalContinueButtonStyle}>
            + ADICIONAR OUTRO ITEM
          </button>
          <button type="button" onClick={onFinish} style={quoteModalFinishButtonStyle}>
            FINALIZAR ORCAMENTO
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <section style={emptyWorkspaceStyle}>
      <div style={arrowHintStyle}>{"<"}</div>
      <span style={emptyBadgeStyle}>MODULOS</span>
      <h1 style={emptyTitleStyle}>SELECIONE O MODULO QUE DESEJA TRABALHAR</h1>
      <p style={emptyTextStyle}>ABRA O MENU LATERAL E ESCOLHA O PAINEL PARA CONTINUAR.</p>
    </section>
  );
}

function PricingPreview({
  companySlug,
  suppliers,
  paperTypes,
  materials,
  engineeringFormulas,
  paperCostParams,
  pricingParamsByCompany,
  pricingOperationalParams,
  pricingGoalsByCompany,
  productionTimes,
  productFichas,
  onSendToQuote,
}: {
  companySlug: string;
  suppliers: Supplier[];
  paperTypes: PaperType[];
  materials: SpecificMaterial[];
  engineeringFormulas: EngineeringFormula[];
  paperCostParams: PaperCostParams;
  pricingParamsByCompany: PricingParamsByCompany;
  pricingOperationalParams: PricingOperationalParams;
  pricingGoalsByCompany: PricingGoalsByCompany;
  productionTimes: ProductionTime[];
  productFichas: ProductFicha[];
  onSendToQuote: (prefill: PricingQuotePrefill) => void;
}) {
  const [pricingMode, setPricingMode] = useState<PricingMode>("direct");
  const [activeStep, setActiveStep] = useState<PricingStep | EngineeringPricingStep>("MATERIAIS");
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [paperTypeId, setPaperTypeId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [category, setCategory] = useState<BoxCategory>("maleta");
  const [modelKey, setModelKey] = useState<BoxModelKey>("caixa-4-abas");
  const [dimensions, setDimensions] = useState({ length: "", width: "", height: "", topOverlap: "" });
  const lengthInputRef = useRef<HTMLInputElement | null>(null);
  const [lotQuantity, setLotQuantity] = useState(1000);
  const [sellerCompanyKey, setSellerCompanyKey] = useState<SellerCompanyKey>("dawos");
  const [simulatedMaterialId, setSimulatedMaterialId] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [engineeringClientId, setEngineeringClientId] = useState("");
  const [engineeringFichaId, setEngineeringFichaId] = useState("");
  const [engineeringClientSearch, setEngineeringClientSearch] = useState("");

  useEffect(() => {
    loadClients(companySlug).then(setClients).catch(() => setClients([]));
  }, [companySlug]);

  const availableMaterials = materials.filter((material) => isMaterialAvailableForUse(material));
  const supplier = suppliers.find((item) => item.id === supplierId) ?? suppliers[0];
  const materialsBySupplier = availableMaterials.filter((material) => material.supplier === supplier?.name);
  const paperTypesBySupplier = paperTypes.filter((paperType) =>
    materialsBySupplier.some((material) => material.paperType === paperType.code)
  );
  const selectedPaperTypeId = paperTypeId || paperTypesBySupplier[0]?.id || "";
  const selectedPaperType = paperTypesBySupplier.find((paperType) => paperType.id === selectedPaperTypeId) ?? paperTypesBySupplier[0];
  const materialsByPaperType = materialsBySupplier.filter((material) => material.paperType === selectedPaperType?.code);
  const selectedMaterialId = materialId || materialsByPaperType[0]?.id || "";
  const selectedMaterial = materialsByPaperType.find((material) => material.id === selectedMaterialId) ?? materialsByPaperType[0];
  const simulatedMaterial = simulatedMaterialId
    ? availableMaterials.find((material) => material.id === simulatedMaterialId)
    : undefined;
  const pricingMaterial = simulatedMaterial ?? selectedMaterial;
  const cheapestAlternatives = selectedMaterial
      ? availableMaterials
        .filter((material) => material.paperType === selectedMaterial.paperType && material.costIpi < selectedMaterial.costIpi)
        .sort((a, b) => a.costIpi - b.costIpi)
        .slice(0, 3)
    : [];
  const economicAlternative = cheapestAlternatives[0];
  const wave = pricingMaterial?.paperType.includes("BC") || pricingMaterial?.paperType.includes("BB") ? "BC" : "B";
  const currentModels = modelOptions[category];
  const selectedModel = currentModels.find((model) => model.key === modelKey) ?? currentModels[0];
  const modelFormula = findFormulaForModel(engineeringFormulas, selectedModel.formulaId, wave);
  const engineeringClientFichas = productFichas.filter((ficha) => ficha.clientId === engineeringClientId);
  const selectedEngineeringFicha = productFichas.find((ficha) => ficha.id === engineeringFichaId);
  const selectedEngineeringMaterial = selectedEngineeringFicha?.materialId
    ? availableMaterials.find((material) => material.id === selectedEngineeringFicha.materialId)
    : undefined;
  const selectedEngineeringFormula = selectedEngineeringFicha?.engineeringId
    ? engineeringFormulas.find((formula) => formula.id === selectedEngineeringFicha.engineeringId)
    : undefined;
  const selectedFormula = pricingMode === "engineering" && selectedEngineeringFormula
    ? selectedEngineeringFormula
    : modelFormula;
  const formulaRequiresTopOverlap = formulaUsesTopOverlap(selectedFormula);
  const formulaRequiresHeight = formulaUsesDimension(selectedFormula, "A");
  const selectedSellerCompany = sellerCompanies.find((company) => company.key === sellerCompanyKey) ?? sellerCompanies[0];
  const pricingParams = pricingParamsByCompany[sellerCompanyKey] ?? defaultPricingParamsByCompany.dawos;
  const numericDimensions = {
    C: Number(String(dimensions.length).replace(",", ".")) || 0,
    L: Number(String(dimensions.width).replace(",", ".")) || 0,
    A: (pricingMode === "engineering" ? formulaRequiresHeight : selectedModel.dimensionMode === "full")
      ? Number(String(dimensions.height).replace(",", ".")) || 0
      : 0,
    S: Number(String(dimensions.topOverlap).replace(",", ".")) || 0,
  };
  const sheetWidth = evaluateEngineeringFormula(selectedFormula.widthFormula, numericDimensions);
  const sheetLength = evaluateEngineeringFormula(selectedFormula.lengthFormula, numericDimensions);
  const sheetArea = sheetWidth && sheetLength ? (sheetWidth * sheetLength) / 1000000 : 0;
  const accessoriesArea = pricingMode === "engineering" && selectedEngineeringFicha
    ? selectedEngineeringFicha.accessories.reduce(
      (total, accessory) => total + calculateProductArea(accessory, engineeringFormulas) * getAccessoryQuantity(accessory),
      0
    )
    : 0;
  const pricingSheetArea = sheetArea + accessoriesArea;
  const boxWeight = pricingMaterial ? pricingSheetArea * parseDecimal(pricingMaterial.grammage) : 0;
  const maletaInvalid = category === "maleta" && numericDimensions.C > 0 && numericDimensions.L > 0 && numericDimensions.C < numericDimensions.L;
  const filteredEngineeringClients = clients.filter((client) => {
    const term = engineeringClientSearch.trim().toUpperCase();
    if (!term) return true;
    return `${client.clientCode} ${client.legalName} ${client.tradeName} ${client.cnpj}`.toUpperCase().includes(term);
  });

  function changePricingMode(nextMode: PricingMode) {
    setPricingMode(nextMode);
    setActiveStep(nextMode === "direct" ? "MATERIAIS" : "CLIENTE / PRODUTO");
  }

  function chooseCategory(nextCategory: BoxCategory) {
    setCategory(nextCategory);
    setModelKey(modelOptions[nextCategory][0].key);
  }

  function chooseSupplier(nextSupplierId: string) {
    const nextSupplier = suppliers.find((item) => item.id === nextSupplierId);
    const nextMaterials = availableMaterials.filter((material) => material.supplier === nextSupplier?.name);
    const nextPaperType = paperTypes.find((paperType) => nextMaterials.some((material) => material.paperType === paperType.code));
    const nextMaterial = nextMaterials.find((material) => material.paperType === nextPaperType?.code);

    setSupplierId(nextSupplierId);
    setPaperTypeId(nextPaperType?.id ?? "");
    setMaterialId(nextMaterial?.id ?? "");
    setSimulatedMaterialId(null);
  }

  function choosePaperType(nextPaperTypeId: string) {
    const nextPaperType = paperTypesBySupplier.find((paperType) => paperType.id === nextPaperTypeId);
    const nextMaterial = materialsBySupplier.find((material) => material.paperType === nextPaperType?.code);

    setPaperTypeId(nextPaperTypeId);
    setMaterialId(nextMaterial?.id ?? "");
    setSimulatedMaterialId(null);
  }

  function chooseMaterial(nextMaterialId: string) {
    setMaterialId(nextMaterialId);
    setSimulatedMaterialId(null);
  }

  function chooseEngineeringClient(nextClientId: string) {
    setEngineeringClientId(nextClientId);
    setEngineeringFichaId("");
  }

  function applyEngineeringFicha(ficha: ProductFicha) {
    const material = ficha.materialId ? availableMaterials.find((item) => item.id === ficha.materialId) : undefined;
    const formula = ficha.engineeringId ? engineeringFormulas.find((item) => item.id === ficha.engineeringId) : undefined;
    if (material) {
      const nextSupplier = suppliers.find((item) => item.name === material.supplier);
      const nextPaperType = paperTypes.find((item) => item.code === material.paperType);
      if (nextSupplier) setSupplierId(nextSupplier.id);
      if (nextPaperType) setPaperTypeId(nextPaperType.id);
      setMaterialId(material.id);
      setSimulatedMaterialId(null);
    }

    if (formula) {
      const formulaId = formula.id.toLowerCase();
      const formulaText = `${formula.style} ${formula.description} ${formula.category}`.toUpperCase();
      const isMaleta = formula.category.toUpperCase() === "MALETA" || formulaText.includes("MALETA");
      const isTabuleiro = formulaId.startsWith("tab-") || formulaText.includes("TABULEIRO");
      const isTranspasse = formulaId.startsWith("mt-") || formulaText.includes("TRANSPASSE");
      const nextCategory: BoxCategory = isMaleta ? "maleta" : isTabuleiro ? "tabuleiro" : "corte-vinco";
      const nextModel: BoxModelKey = isMaleta
        ? isTranspasse ? "caixa-4-abas-transpasse" : "caixa-4-abas"
        : formulaId.startsWith("sedex-")
          ? "caixa-sedex"
          : isTabuleiro
            ? "tabuleiro"
            : "corte-vinco-geral";
      setCategory(nextCategory);
      setModelKey(nextModel);
    }

    setDimensions({
      length: ficha.length ? String(ficha.length) : "",
      width: ficha.width ? String(ficha.width) : "",
      height: ficha.height ? String(ficha.height) : "",
      topOverlap: ficha.topOverlap ? String(ficha.topOverlap) : "",
    });
    const nextCompany = ficha.company.toLowerCase() as SellerCompanyKey;
    if (sellerCompanies.some((company) => company.key === nextCompany)) setSellerCompanyKey(nextCompany);
  }

  function chooseEngineeringFicha(nextFichaId: string) {
    setEngineeringFichaId(nextFichaId);
    const ficha = productFichas.find((item) => item.id === nextFichaId);
    if (ficha) applyEngineeringFicha(ficha);
  }

  return (
    <section style={pricingCardStyle}>
      <nav style={pricingModeStyle} aria-label="TIPO DE FORMACAO DE PRECO">
        <button type="button" onClick={() => changePricingMode("direct")} style={{ ...pricingModeButtonStyle, ...(pricingMode === "direct" ? activePricingModeStyle : {}) }}>PRECO DIRETO</button>
        <button type="button" onClick={() => changePricingMode("engineering")} style={{ ...pricingModeButtonStyle, ...(pricingMode === "engineering" ? activePricingModeStyle : {}) }}>PRECO ENGENHARIA</button>
      </nav>

      {pricingMode === "direct" && (
        <nav style={stepsStyle}>
          {etapasPreco.map((etapa) => (
            <button
              key={etapa}
              type="button"
              onClick={() => setActiveStep(etapa)}
              style={{
                ...stepButtonStyle,
                ...(etapa === activeStep ? activeStepButtonStyle : {}),
              }}
            >
              {etapa}
            </button>
          ))}
        </nav>
      )}

      {pricingMode === "engineering" && (
        <nav style={stepsStyle}>
          {(["CLIENTE / PRODUTO", "LOTE & LOGISTICA", "VER PRECO"] as EngineeringPricingStep[]).map((step) => (
            <button key={step} type="button" onClick={() => setActiveStep(step)} style={{ ...stepButtonStyle, ...(step === activeStep ? activeStepButtonStyle : {}) }}>
              {step}
            </button>
          ))}
        </nav>
      )}

      {pricingMode === "engineering" && activeStep === "CLIENTE / PRODUTO" && (
        <EngineeringProductStep
          clients={filteredEngineeringClients}
          clientSearch={engineeringClientSearch}
          selectedClientId={engineeringClientId}
          fichas={engineeringClientFichas}
          selectedFichaId={engineeringFichaId}
          selectedFicha={selectedEngineeringFicha}
          selectedMaterial={selectedEngineeringMaterial}
          selectedFormula={selectedEngineeringFormula}
          onClientSearch={setEngineeringClientSearch}
          onClientChange={chooseEngineeringClient}
          onFichaChange={chooseEngineeringFicha}
          onContinue={() => setActiveStep("LOTE & LOGISTICA")}
        />
      )}

      {activeStep === "MATERIAIS" && (
        <MaterialStep
          supplierId={supplierId}
          paperTypeId={selectedPaperTypeId}
          materialId={selectedMaterialId}
          paperTypes={paperTypesBySupplier}
          materials={materialsByPaperType}
          selectedMaterial={selectedMaterial}
          alternatives={cheapestAlternatives}
          suppliers={suppliers}
          allPaperTypes={paperTypes}
          onSupplierChange={chooseSupplier}
          onPaperTypeChange={choosePaperType}
          onMaterialChange={chooseMaterial}
        />
      )}

      {activeStep === "TIPO DE CAIXA" && (
        <>
          <div style={sectionLabelStyle}>ESCOLHA A CATEGORIA DA EMBALAGEM:</div>
          <div style={categoryGridStyle}>
            {categoryOptions.map((option) => (
              <OptionCard
                key={option.key}
                title={option.title}
                subtitle={option.subtitle}
                image={option.image}
                active={option.key === category}
                onClick={() => chooseCategory(option.key)}
              />
            ))}
          </div>

          <div style={sectionLabelStyle}>ESCOLHA O MODELO ESPECIFICO:</div>
          <div style={modelGridStyle}>
            {currentModels.map((model) => (
              <OptionCard
                key={model.key}
                title={model.title}
                subtitle={model.subtitle}
                image={model.image}
                active={model.key === modelKey}
                warm={model.key === modelKey && category === "maleta"}
                onClick={() => setModelKey(model.key)}
              />
            ))}
          </div>

          <FormulaSummary formula={selectedFormula} />
        </>
      )}

      {activeStep === "CONFIGURAR DIMENSOES" && (
        <section style={dimensionsPanelStyle}>
          <div style={dimensionHeroStyle}>
            <DimensionDrawing image={selectedModel.image} mode={selectedModel.dimensionMode} />
            <div style={dimensionControlsStyle}>
              <div>
                <span style={workspaceEyebrowStyle}>ENGENHARIA SELECIONADA</span>
                <h2 style={dimensionTitleStyle}>{selectedFormula.description}</h2>
                <p style={dimensionSubtitleStyle}>INFORME AS DIMENSOES INTERNAS PARA CALCULAR A CHAPA.</p>
              </div>

              <div style={dimensionGridStyle}>
                <DimensionInput
                  ref={lengthInputRef}
                  label="COMPRIMENTO (C)"
                  value={dimensions.length}
                  onChange={(value) => setDimensions((current) => ({ ...current, length: value }))}
                />
                <DimensionInput label="LARGURA (L)" value={dimensions.width} onChange={(value) => setDimensions((current) => ({ ...current, width: value }))} />
                {(pricingMode === "engineering" ? formulaRequiresHeight : selectedModel.dimensionMode !== "hide-height") && (
                  <DimensionInput
                    label="ALTURA (A)"
                    value={dimensions.height}
                    disabled={pricingMode !== "engineering" && selectedModel.dimensionMode === "disabled-height"}
                    onTab={(event) => {
                      if (!event.shiftKey) {
                        event.preventDefault();
                        lengthInputRef.current?.focus();
                      }
                    }}
                    onChange={(value) => setDimensions((current) => ({ ...current, height: value }))}
                  />
                )}
                {formulaRequiresTopOverlap ? <DimensionInput label="TRANSPASSE SUPERIOR (S) DA FICHA" value={dimensions.topOverlap} disabled onChange={() => undefined} /> : null}
              </div>
            </div>
          </div>

          {maletaInvalid && (
            <div style={dimensionAlertStyle}>ATENCAO: NA CAIXA MALETA, O COMPRIMENTO PRECISA SER IGUAL OU MAIOR QUE A LARGURA.</div>
          )}

          <div style={formulaResultGridStyle}>
            <FormulaResult label="FORMULA LARGURA" value={selectedFormula.widthFormula} />
            <FormulaResult label="FORMULA COMPRIMENTO" value={selectedFormula.lengthFormula} />
            <FormulaResult label="LARGURA DA CHAPA" value={sheetWidth ? `${formatNumber(sheetWidth)} MM` : "-"} />
            <FormulaResult label="COMPRIMENTO DA CHAPA" value={sheetLength ? `${formatNumber(sheetLength)} MM` : "-"} />
            <FormulaResult
              label="AREA DA CAIXA PRINCIPAL"
              value={sheetArea ? `${formatNumber(sheetArea, 4)} M2` : "-"}
              secondaryValue={sheetArea ? `${formatNumber(sheetArea * 1000, 0)} M2 (UND.INT.)` : undefined}
              highlight
            />
            {pricingMode === "engineering" && accessoriesArea > 0 ? <FormulaResult label="AREA TOTAL DO CONJUNTO" value={`${formatNumber(pricingSheetArea, 4)} M2`} secondaryValue={`${formatNumber(accessoriesArea, 4)} M2 EM ACESSORIOS`} highlight /> : null}
            <FormulaResult
              label={accessoriesArea > 0 ? "PESO DO CONJUNTO" : "PESO DA CAIXA"}
              value={boxWeight ? `${formatNumber(boxWeight, 3)} KG` : "-"}
              secondaryValue={boxWeight && pricingMaterial ? `${pricingMaterial.grammage} X AREA` : undefined}
              accent
            />
          </div>
        </section>
      )}

      {activeStep === "LOTE & LOGISTICA" && (
        <LotLogisticsStep quantity={lotQuantity} onQuantityChange={setLotQuantity} />
      )}

      {activeStep === "EMPRESA" && (
        <CompanyStep selectedCompany={selectedSellerCompany} pricingParams={pricingParams} onSelectCompany={setSellerCompanyKey} />
      )}

      {activeStep === "VER PRECO" && (
        <PriceSummaryStep
          sellerCompany={selectedSellerCompany}
          selectedModel={selectedModel}
          selectedFormula={selectedFormula}
          selectedMaterial={pricingMaterial}
          originalMaterial={selectedMaterial}
          economicAlternative={economicAlternative}
          economicSimulationActive={Boolean(simulatedMaterial)}
          onSimulateEconomicMaterial={() => economicAlternative && setSimulatedMaterialId(economicAlternative.id)}
          onRestoreOriginalMaterial={() => setSimulatedMaterialId(null)}
          dimensions={numericDimensions}
          sheetArea={pricingSheetArea}
          mainSheetArea={sheetArea}
          accessoriesArea={accessoriesArea}
          sheetWidth={sheetWidth}
          sheetLength={sheetLength}
          lotQuantity={lotQuantity}
          paperCostParams={paperCostParams}
          pricingParams={pricingParams}
          pricingOperationalParams={pricingOperationalParams}
          pricingGoals={pricingGoalsByCompany[sellerCompanyKey]}
          productionTimes={productionTimes}
          pricingMode={pricingMode}
          engineeringFicha={selectedEngineeringFicha}
          engineeringClient={clients.find((client) => client.id === engineeringClientId)}
          onSendToQuote={onSendToQuote}
        />
      )}
    </section>
  );
}

function OptionCard({
  title,
  subtitle,
  image,
  active,
  warm,
  onClick,
}: {
  title: string;
  subtitle: string;
  image: "maleta" | "sedex" | "tabuleiro" | "transpasse";
  active?: boolean;
  warm?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...optionCardStyle,
        ...(active ? activeOptionStyle : {}),
        ...(warm ? warmOptionStyle : {}),
      }}
    >
      <BoxIllustration type={image} />
      <strong style={optionTitleStyle}>{title}</strong>
      <small style={optionSubtitleStyle}>{subtitle}</small>
    </button>
  );
}

function EngineeringProductStep({
  clients,
  clientSearch,
  selectedClientId,
  fichas,
  selectedFichaId,
  selectedFicha,
  selectedMaterial,
  selectedFormula,
  onClientSearch,
  onClientChange,
  onFichaChange,
  onContinue,
}: {
  clients: ClientRecord[];
  clientSearch: string;
  selectedClientId: string;
  fichas: ProductFicha[];
  selectedFichaId: string;
  selectedFicha?: ProductFicha;
  selectedMaterial?: SpecificMaterial;
  selectedFormula?: EngineeringFormula;
  onClientSearch: (value: string) => void;
  onClientChange: (value: string) => void;
  onFichaChange: (value: string) => void;
  onContinue: () => void;
}) {
  const canContinue = Boolean(selectedFicha && selectedMaterial && selectedFormula);

  return (
    <section style={engineeringSelectionPanelStyle}>
      <div>
        <span style={workspaceEyebrowStyle}>FICHA TECNICA</span>
        <h2 style={engineeringSelectionTitleStyle}>CLIENTE / PRODUTO</h2>
        <p style={dimensionSubtitleStyle}>SELECIONE O CLIENTE E O PRODUTO PARA CARREGAR AUTOMATICAMENTE A FICHA TECNICA.</p>
      </div>

      <div style={engineeringSelectionGridStyle}>
        <label style={engineeringSelectionLabelStyle}>
          BUSCAR CLIENTE
          <input value={clientSearch} onChange={(event) => onClientSearch(event.target.value)} style={engineeringSelectionInputStyle} placeholder="NOME, CODIGO OU CNPJ" />
        </label>
        <label style={engineeringSelectionLabelStyle}>
          CLIENTE
          <select value={selectedClientId} onChange={(event) => onClientChange(event.target.value)} style={engineeringSelectionInputStyle}>
            <option value="">SELECIONE O CLIENTE</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.tradeName || client.legalName}</option>)}
          </select>
        </label>
        <label style={{ ...engineeringSelectionLabelStyle, gridColumn: "1 / -1" }}>
          PRODUTO / FICHA TECNICA
          <select value={selectedFichaId} onChange={(event) => onFichaChange(event.target.value)} style={engineeringSelectionInputStyle} disabled={!selectedClientId}>
            <option value="">{selectedClientId ? "SELECIONE O PRODUTO" : "SELECIONE PRIMEIRO O CLIENTE"}</option>
            {fichas.map((ficha) => <option key={ficha.id} value={ficha.id}>{ficha.ftNumber} - {ficha.reference}</option>)}
          </select>
        </label>
      </div>

      {selectedFicha && (
        <div style={engineeringFichaSummaryStyle}>
          <div><span>FT</span><strong>{selectedFicha.ftNumber}</strong></div>
          <div><span>REFERENCIA</span><strong>{selectedFicha.reference}</strong></div>
          <div><span>EMPRESA</span><strong>{selectedFicha.company}</strong></div>
          <div><span>ENGENHARIA</span><strong>{selectedFormula?.description ?? "NAO INFORMADA"}</strong></div>
          <div><span>DIMENSOES</span><strong>{selectedFicha.length} X {selectedFicha.width} X {selectedFicha.height} MM</strong></div>
          <div><span>MATERIAL</span><strong>{selectedMaterial?.code ?? "NAO VINCULADO"}</strong></div>
        </div>
      )}

      {selectedFicha && !selectedMaterial && <div style={engineeringSelectionAlertStyle}>ESTA FICHA AINDA NAO TEM MATERIAL VINCULADO. EDITE A FICHA TECNICA NO MODULO PRODUTOS PARA LIBERAR O PRECO POR ENGENHARIA.</div>}
      {selectedFicha && !selectedFormula && <div style={engineeringSelectionAlertStyle}>ESTA FICHA AINDA NAO TEM UMA ENGENHARIA VINCULADA.</div>}

      <div style={engineeringSelectionActionsStyle}>
        <button type="button" onClick={onContinue} disabled={!canContinue} style={{ ...engineeringContinueButtonStyle, opacity: canContinue ? 1 : 0.55, cursor: canContinue ? "pointer" : "not-allowed" }}>CONTINUAR PARA LOTE</button>
      </div>
    </section>
  );
}

function MaterialStep({
  supplierId,
  paperTypeId,
  materialId,
  paperTypes,
  materials,
  selectedMaterial,
  alternatives,
  suppliers,
  allPaperTypes,
  onSupplierChange,
  onPaperTypeChange,
  onMaterialChange,
}: {
  supplierId: string;
  paperTypeId: string;
  materialId: string;
  paperTypes: typeof initialPaperTypes;
  materials: typeof initialMaterials;
  selectedMaterial?: (typeof initialMaterials)[number];
  alternatives: typeof initialMaterials;
  suppliers: Supplier[];
  allPaperTypes: PaperType[];
  onSupplierChange: (value: string) => void;
  onPaperTypeChange: (value: string) => void;
  onMaterialChange: (value: string) => void;
}) {
  const selectedPaper = allPaperTypes.find((paperType) => paperType.id === paperTypeId);

  return (
    <section style={materialStepStyle}>
      <SelectField
        label="FORNECEDOR"
        value={supplierId}
        onChange={onSupplierChange}
        options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
      />
      <SelectField
        label="TIPO DE PAPELAO"
        value={paperTypeId}
        onChange={onPaperTypeChange}
        options={paperTypes.map((paperType) => ({ value: paperType.id, label: paperType.description }))}
      />
      <SelectField
        label="MATERIAL CADASTRADO (ESPECIFICACAO TECNICA)"
        value={materialId}
        onChange={onMaterialChange}
        options={materials.map((material) => ({ value: material.id, label: `${material.code} - (${formatCurrency(material.costIpi)}/M2)` }))}
      />

      <p style={materialHelpStyle}>OS MATERIAIS SAO LISTADOS CONFORME OS CADASTROS GERAIS DO FORNECEDOR E TIPO DE PAPELAO ESCOLHIDOS.</p>

      {selectedMaterial && (
        <MaterialSummary
          title="MATERIAL SELECIONADO"
          material={selectedMaterial}
          paperDescription={selectedPaper?.code ?? selectedMaterial.paperType}
        />
      )}

      {alternatives.length > 0 && selectedMaterial && (
        <AlternativeMaterialsSummary
          selectedMaterial={selectedMaterial}
          alternatives={alternatives}
        />
      )}
    </section>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label style={selectFieldStyle}>
      <span style={selectLabelStyle}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MaterialSummary({
  title,
  material,
  paperDescription,
  alternative,
  economy,
}: {
  title: string;
  material: (typeof initialMaterials)[number];
  paperDescription: string;
  alternative?: boolean;
  economy?: number;
}) {
  return (
    <div style={materialSummaryStyle}>
      <strong style={materialSummaryTitleStyle}>{alternative ? `💡 ${title}` : title}</strong>
      <div style={{ ...materialSummaryGridStyle, ...(alternative ? materialSummaryGridAlternativeStyle : {}) }}>
        <SummaryValue label="CODIGO" value={material.code} color={alternative ? "#6f32d2" : "#e68019"} />
        {alternative && <SummaryValue label="FORNECEDOR" value={material.supplier} />}
        <SummaryValue label="TIPO DE PAPELAO" value={paperDescription} />
        <SummaryValue label="GRAMATURA" value={material.grammage} color="#0087d7" />
        <SummaryValue label="RES. PRESSAO" value={material.pressure} color="#6f32d2" />
        <SummaryValue label="PRECO C/ IPI" value={formatCurrency(material.costIpi)} color="#00a651" suffix="POR M2" />
        {alternative && <span style={economyDividerStyle} />}
        {alternative && economy !== undefined && <SummaryValue label="ECONOMIA" value={formatCurrency(economy)} color="#e68019" suffix="POR M2" />}
      </div>
    </div>
  );
}

function AlternativeMaterialsSummary({
  selectedMaterial,
  alternatives,
}: {
  selectedMaterial: (typeof initialMaterials)[number];
  alternatives: typeof initialMaterials;
}) {
  return (
    <div style={materialSummaryStyle}>
      <strong style={materialSummaryTitleStyle}>💡 COMPARATIVOS MAIS ECONOMICOS DISPONIVEIS</strong>
      <div style={alternativesListStyle}>
        {alternatives.map((material, index) => {
          const economy = selectedMaterial.costIpi - material.costIpi;
          return (
            <div key={material.id} style={alternativeRowStyle}>
              <span style={alternativeRankStyle}>{index + 1}</span>
              <SummaryValue label="CODIGO" value={material.code} color="#6f32d2" />
              <SummaryValue label="FORNECEDOR" value={material.supplier} />
              <SummaryValue label="TIPO DE PAPELAO" value={material.paperType} />
              <SummaryValue label="GRAMATURA" value={material.grammage} color="#0087d7" />
              <SummaryValue label="RES. PRESSAO" value={material.pressure} color="#6f32d2" />
              <SummaryValue label="PRECO C/ IPI" value={formatCurrency(material.costIpi)} color="#00a651" suffix="POR M2" />
              <span style={economyDividerStyle} />
              <SummaryValue label="ECONOMIA" value={formatCurrency(Math.max(economy, 0))} color="#e68019" suffix="POR M2" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryValue({ label, value, color, suffix }: { label: string; value: string; color?: string; suffix?: string }) {
  return (
    <span style={summaryValueStyle}>
      <small style={summaryLabelStyle}>{label}</small>
      <strong style={{ ...summaryStrongStyle, color: color ?? "#141827" }}>{value}</strong>
      {suffix && <small style={summarySuffixStyle}>{suffix}</small>}
    </span>
  );
}

function FormulaSummary({ formula }: { formula: (typeof initialEngineeringFormulas)[number] }) {
  return (
    <div style={formulaSummaryStyle}>
      <span style={formulaBadgeStyle}>{formula.style}</span>
      <strong style={formulaSummaryTitleStyle}>{formula.description}</strong>
      <span style={formulaSummaryTextStyle}>LARGURA: {formula.widthFormula}</span>
      <span style={formulaSummaryTextStyle}>COMPRIMENTO: {formula.lengthFormula}</span>
    </div>
  );
}

const DimensionInput = forwardRef<HTMLInputElement, {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onTab?: (event: KeyboardEvent<HTMLInputElement>) => void;
}>(
  ({ label, value, disabled, onChange, onTab }, ref) => {
    return (
      <label style={{ ...dimensionFieldStyle, ...(disabled ? disabledDimensionFieldStyle : {}) }}>
        <span style={dimensionLabelStyle}>{label}</span>
        <input
          ref={ref}
          type="number"
          value={value}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Tab") onTab?.(event);
          }}
          onChange={(event) => onChange(event.target.value)}
          placeholder={disabled ? "NAO USADO" : "0"}
          style={dimensionInputStyle}
        />
      </label>
    );
  }
);

function LotLogisticsStep({
  quantity,
  onQuantityChange,
}: {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
}) {
  const normalized = Math.min(Math.max(quantity, 100), 50000);
  const scale = Math.min(100, Math.round((Math.log10(normalized) - 2) * 34));
  const bars = [0.24, 0.38, 0.52, 0.66, 0.8, 0.92, 1];

  function updateQuantity(value: string | number) {
    const parsed = Number(String(value).replace(/\D/g, "")) || 0;
    onQuantityChange(Math.min(Math.max(parsed, 1), 999999));
  }

  return (
    <section style={lotPanelStyle}>
      <div style={lotHeaderStyle}>
        <span style={workspaceEyebrowStyle}>LOTE SELECIONADO</span>
        <h2 style={lotTitleStyle}>QUANTIDADE DE CAIXAS</h2>
        <p style={lotSubtitleStyle}>ESSA QUANTIDADE VAI ENTRAR NO CALCULO DO PRECO UNITARIO.</p>
      </div>

      <div style={lotBodyStyle}>
        <div style={lotControlCardStyle}>
          <label style={lotLabelStyle}>QUANTIDADE DO LOTE (UNIDADES)</label>
          <div style={lotSliderRowStyle}>
            <input
              type="range"
              min={100}
              max={50000}
              step={100}
              value={normalized}
              onChange={(event) => updateQuantity(event.target.value)}
              style={lotRangeStyle}
            />
            <label style={lotQuantityBoxStyle}>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => updateQuantity(event.target.value)}
                style={lotQuantityInputStyle}
              />
              <span style={lotUnitStyle}>UNID.</span>
            </label>
          </div>
          <p style={lotHintStyle}>LOTES MAIORES DILUEM SETUP, PREPARACAO E OUTROS CUSTOS FIXOS.</p>
        </div>

        <div style={lotChartCardStyle}>
          <div style={lotChartHeaderStyle}>
            <span>ESCALA DO LOTE</span>
            <strong>{scale}%</strong>
          </div>
          <div style={lotBarsStyle}>
            {bars.map((bar, index) => (
              <span
                key={bar}
                style={{
                  ...lotBarStyle,
                  height: `${Math.max(18, 116 * bar)}px`,
                  opacity: scale / 100 >= index / bars.length ? 1 : 0.28,
                }}
              />
            ))}
          </div>
          <div style={lotChartFooterStyle}>
            <span>MENOR LOTE</span>
            <span>MAIOR LOTE</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompanyStep({
  selectedCompany,
  pricingParams,
  onSelectCompany,
}: {
  selectedCompany: (typeof sellerCompanies)[number];
  pricingParams: PricingParams;
  onSelectCompany: (company: SellerCompanyKey) => void;
}) {
  const activeConditions = selectedCompany.key === "dawos"
    ? [
        { label: "ICMS CLIENTE", value: `${formatNumber(pricingParams.clientIcms, 2)}%`, color: "#10b981" },
        { label: "COMISSAO PREVIA", value: `${formatNumber(pricingParams.commission, 2)}%`, color: "#0087d7" },
        { label: "FRETE", value: `${formatNumber(pricingParams.freight, 2)}%`, color: "#0ea5e9" },
        { label: "OUTROS", value: `${formatNumber(pricingParams.otherCosts, 2)}%`, color: "#8b36e8" },
        { label: "DEMAIS", value: `${formatNumber(pricingParams.additionalCosts, 2)}%`, color: "#ef4444" },
      ]
    : selectedCompany.key === "carcat"
      ? [
          { label: "SIMPLES", value: `${formatNumber(pricingParams.simplesTax, 2)}%`, color: "#e68019" },
          { label: "COMISSAO PREVIA", value: `${formatNumber(pricingParams.commission, 2)}%`, color: "#0087d7" },
          { label: "FRETE", value: `${formatNumber(pricingParams.freight, 2)}%`, color: "#0ea5e9" },
          { label: "OUTROS", value: `${formatNumber(pricingParams.otherCosts, 2)}%`, color: "#8b36e8" },
          { label: "CUSTO MP", value: "C/ IPI", color: "#e68019" },
        ]
      : [
          { label: "ICMS SAIDA", value: `${formatNumber(pricingParams.outputIcms, 2)}%`, color: "#10b981" },
          { label: "PIS/COFINS", value: `${formatNumber(pricingParams.outputPisCofins, 2)}%`, color: "#8b36e8" },
          { label: "IPI", value: `${formatNumber(pricingParams.outputIpi, 2)}%`, color: "#ff3b25" },
          { label: "COMISSAO PREVIA", value: `${formatNumber(pricingParams.commission, 2)}%`, color: "#0087d7" },
          { label: "FRETE", value: `${formatNumber(pricingParams.freight, 2)}%`, color: "#e68019" },
          { label: "OUTROS", value: `${formatNumber(pricingParams.otherCosts, 2)}%`, color: "#8b36e8" },
        ];

  return (
    <section style={companyPanelStyle}>
      <div style={companyHeaderStyle}>
        <span style={workspaceEyebrowStyle}>EMPRESA VENDEDORA</span>
        <h2 style={companyTitleStyle}>SELECIONE A EMPRESA PARA PRECIFICAR</h2>
        <p style={companySubtitleStyle}>CADA EMPRESA PODE TER IMPOSTOS E CONDICOES DIFERENTES PARA A FORMACAO DE PRECO.</p>
      </div>

      <div style={companyGridStyle}>
        {sellerCompanies.map((company) => (
          <button
            key={company.key}
            type="button"
            onClick={() => onSelectCompany(company.key)}
            style={{
              ...companyCardStyle,
              ...(company.key === selectedCompany.key ? activeCompanyCardStyle : {}),
            }}
          >
            <CompanyIcon type={company.icon} />
            <strong style={companyCardTitleStyle}>{company.name}</strong>
            <span style={companyCardTextStyle}>{company.description}</span>
          </button>
        ))}
      </div>

      <div style={companyTaxCardStyle}>
        <div>
          <span style={companyTaxEyebrowStyle}>CONDICOES ATIVAS</span>
          <strong style={companyTaxTitleStyle}>{selectedCompany.name}</strong>
        </div>
        <div style={companyTaxGridStyle}>
          {activeConditions.map((condition) => (
            <CompanyTaxItem key={condition.label} {...condition} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CompanyIcon({ type }: { type: "building" | "factory" | "bolt" }) {
  if (type === "bolt") {
    return (
      <span style={companyIconStyle}>
        <svg viewBox="0 0 64 64" aria-hidden="true" style={companyIconSvgStyle}>
          <path d="M36 5 14 36h16l-3 23 23-33H34z" fill="#ffd84d" stroke="#141827" strokeWidth="4" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (type === "factory") {
    return (
      <span style={companyIconStyle}>
        <svg viewBox="0 0 64 64" aria-hidden="true" style={companyIconSvgStyle}>
          <path d="M10 54V27l12 7V24l14 8V20l18 10v24z" fill="#ffb020" stroke="#141827" strokeWidth="4" strokeLinejoin="round" />
          <path d="M18 43h8M34 43h8M50 43h4" stroke="#0087d7" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
    );
  }

  return (
    <span style={companyIconStyle}>
      <svg viewBox="0 0 64 64" aria-hidden="true" style={companyIconSvgStyle}>
        <path d="M16 56V12h32v44" fill="#eaf7ff" stroke="#141827" strokeWidth="4" strokeLinejoin="round" />
        <path d="M24 22h6M36 22h6M24 32h6M36 32h6M24 42h6M36 42h6" stroke="#0087d7" strokeWidth="4" strokeLinecap="round" />
        <path d="M10 56h44" stroke="#141827" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function CompanyTaxItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={companyTaxItemStyle}>
      <small style={companyTaxLabelStyle}>{label}</small>
      <strong style={{ ...companyTaxValueStyle, color }}>{value}</strong>
    </span>
  );
}

function PriceSummaryStep({
  sellerCompany,
  selectedModel,
  selectedFormula,
  selectedMaterial,
  originalMaterial,
  economicAlternative,
  economicSimulationActive,
  onSimulateEconomicMaterial,
  onRestoreOriginalMaterial,
  dimensions,
  sheetArea,
  mainSheetArea,
  accessoriesArea,
  sheetWidth,
  sheetLength,
  lotQuantity,
  paperCostParams,
  pricingParams,
  pricingOperationalParams,
  pricingGoals,
  productionTimes,
  pricingMode,
  engineeringFicha,
  engineeringClient,
  onSendToQuote,
}: {
  sellerCompany: (typeof sellerCompanies)[number];
  selectedModel: (typeof modelOptions)[BoxCategory][number];
  selectedFormula: (typeof initialEngineeringFormulas)[number];
  selectedMaterial?: (typeof initialMaterials)[number];
  originalMaterial?: (typeof initialMaterials)[number];
  economicAlternative?: (typeof initialMaterials)[number];
  economicSimulationActive: boolean;
  onSimulateEconomicMaterial: () => void;
  onRestoreOriginalMaterial: () => void;
  dimensions: { C: number; L: number; A: number; S: number };
  sheetArea: number;
  mainSheetArea: number;
  accessoriesArea: number;
  sheetWidth: number;
  sheetLength: number;
  lotQuantity: number;
  paperCostParams: PaperCostParams;
  pricingParams: PricingParams;
  pricingOperationalParams: PricingOperationalParams;
  pricingGoals: PricingGoals;
  productionTimes: ProductionTime[];
  pricingMode: PricingMode;
  engineeringFicha?: ProductFicha;
  engineeringClient?: ClientRecord;
  onSendToQuote: (prefill: PricingQuotePrefill) => void;
}) {
  const [simulatorPrice, setSimulatorPrice] = useState(1.72);
  const [targetMcPercent, setTargetMcPercent] = useState(pricingParams.mcDefault);
  const calculatedMcrHour = pricingOperationalParams.monthlyAvailableHours > 0 && pricingOperationalParams.productivityPercent > 0
    ? pricingOperationalParams.monthlyFixedCostsDesiredProfit / (pricingOperationalParams.monthlyAvailableHours * (pricingOperationalParams.productivityPercent / 100))
    : pricingParams.mcrHour;
  const [targetMch, setTargetMch] = useState(Math.round(calculatedMcrHour));
  const [ignoreSetup, setIgnoreSetup] = useState(false);
  const [ignoreAdditionalCosts, setIgnoreAdditionalCosts] = useState(false);
  const [manualBoxesPerHour, setManualBoxesPerHour] = useState(0);
  const [sendMessage, setSendMessage] = useState("");
  useEffect(() => {
    setTargetMcPercent(pricingParams.mcDefault);
    setTargetMch(Math.round(calculatedMcrHour));
  }, [pricingParams.mcDefault, calculatedMcrHour]);
  useEffect(() => {
    setManualBoxesPerHour(0);
  }, [selectedMaterial?.id]);

  const analysis = calculatePriceAnalysis({
    sellerCompany,
    selectedMaterial,
    selectedFormula,
    sheetArea,
    lotQuantity,
    paperCostParams,
    pricingParams,
    pricingOperationalParams,
    productionTimes,
    ignoreSetup,
    ignoreAdditionalCosts,
    manualBoxesPerHour,
  });
  const simulatorA = calculatePriceResult(simulatorPrice, analysis);
  const simulatorBPrice = calculatePriceForMarginTarget(targetMcPercent, analysis);
  const simulatorB = calculatePriceResult(simulatorBPrice, analysis);
  const simulatorCHourlyTarget = calculatePriceForHourlyTarget(targetMch, analysis);
  const simulatorCPrice = simulatorCHourlyTarget.price;
  const simulatorC = simulatorCHourlyTarget.result;
  const requiredLot = calculateRequiredLotForHourlyTarget(simulatorPrice, analysis.mcrHour, analysis);
  const targetMcTone = getSimulatorTone(targetMcPercent, pricingGoals.mcPercent);
  const targetMchTone = getSimulatorTone(targetMch, pricingGoals.mcrHour);
  const dimensionsText = formulaUsesDimension(selectedFormula, "A")
    ? `${formatNumber(dimensions.C, 0)} X ${formatNumber(dimensions.L, 0)} X ${formatNumber(dimensions.A, 0)} MM`
    : `${formatNumber(dimensions.C, 0)} X ${formatNumber(dimensions.L, 0)} MM`;
  const dimensionsWithTopOverlapText = dimensions.S ? `${dimensionsText} · S ${formatNumber(dimensions.S, 0)} MM` : dimensionsText;

  const sendTargetLabel = pricingMode === "engineering" ? "ENVIAR PARA ENGENHARIA" : "ENVIAR PARA ORCAMENTO";

  function sendPriceToTarget(price: number, source: string) {
    if (pricingMode === "engineering" && !engineeringFicha) {
      setSendMessage("SELECIONE UMA FICHA TECNICA ANTES DE ENVIAR PARA A ENGENHARIA.");
      return;
    }

    const ipiPercent = sellerCompany.key === "gta" ? pricingParams.outputIpi : 0;
    const totalWithoutIpi = lotQuantity * price;
    const item: QuoteItem = {
      itemNumber: 1,
      ftNumber: engineeringFicha?.ftNumber ?? "",
      description: engineeringFicha?.reference || selectedFormula.description,
      length: dimensions.C,
      width: dimensions.L,
      height: dimensions.A,
      area: sheetArea,
      quality: selectedMaterial?.paperType ?? "",
      boxType: selectedFormula.description,
      material: selectedMaterial?.code ?? "",
      quantity: lotQuantity,
      unitPrice: price,
      ipiPercent,
      ipiValue: totalWithoutIpi * ipiPercent / 100,
      total: totalWithoutIpi * (1 + ipiPercent / 100),
      snapshot: {
        source,
        createdAt: new Date().toISOString(),
        materialId: selectedMaterial?.id,
        materialCode: selectedMaterial?.code,
        paperType: selectedMaterial?.paperType,
        engineeringId: engineeringFicha?.engineeringId,
        topOverlap: dimensions.S || undefined,
        mainAreaM2: mainSheetArea,
        totalAreaM2: sheetArea,
        sellerCompanyKey: sellerCompany.key,
        mcPercent: source === "PADRAO" ? analysis.mcDefault : source === "SIMULADOR A" ? simulatorA.mcPercent : source === "SIMULADOR B" ? simulatorB.mcPercent : simulatorC.mcPercent,
        mcrHour: source === "PADRAO" ? analysis.mchStandard : source === "SIMULADOR A" ? simulatorA.mch : source === "SIMULADOR B" ? simulatorB.mch : simulatorC.mch,
        pricePerKg: source === "PADRAO" ? analysis.pricePerKg : source === "SIMULADOR A" ? simulatorA.pricePerKg : source === "SIMULADOR B" ? simulatorB.pricePerKg : simulatorC.pricePerKg,
        commissionPercent: source === "PADRAO" ? analysis.commissionPercent : source === "SIMULADOR A" ? simulatorA.commissionPercent : source === "SIMULADOR B" ? simulatorB.commissionPercent : simulatorC.commissionPercent,
        boxesPerHour: analysis.boxesPerHour,
        setupMinutes: analysis.setupMinutes,
        totalMinutes: analysis.totalMinutes,
        weightKg: analysis.unitWeightKg,
        totalOrder: totalWithoutIpi * (1 + ipiPercent / 100),
      },
    };

    onSendToQuote({
      kind: pricingMode === "engineering" ? "ENGINEERING" : "DIRECT",
      sellerCompanyName: sellerCompany.name,
      sellerCompanySlug: sellerCompany.key,
      fichaId: engineeringFicha?.id,
      clientId: engineeringClient?.id,
      clientName: engineeringClient?.tradeName || engineeringClient?.legalName,
      buyerName: engineeringClient?.buyerName,
      phone: engineeringClient?.phone || engineeringClient?.whatsapp,
      email: engineeringClient?.purchaseEmail || engineeringClient?.invoiceEmail,
      clientCnpj: engineeringClient?.cnpj,
      address: engineeringClient ? [engineeringClient.street, engineeringClient.streetNumber, engineeringClient.district, engineeringClient.city, engineeringClient.state, engineeringClient.postalCode].filter(Boolean).join(", ") : undefined,
      representativeName: engineeringClient?.representativeName,
      items: [item],
    });

    if (pricingMode === "engineering") {
      setSendMessage("PRECO ENVIADO PARA A FICHA TECNICA. A ENGENHARIA FOI ATUALIZADA.");
    }
  }

  if (!selectedMaterial || !sheetArea || !sheetWidth || !sheetLength) {
    return (
      <section style={priceSummaryPanelStyle}>
        <span style={workspaceEyebrowStyle}>FORMACAO DE PRECO</span>
        <h2 style={priceSummaryTitleStyle}>FALTAM DADOS PARA CALCULAR</h2>
        <p style={priceSummarySubtitleStyle}>CONFIRA MATERIAL, DIMENSOES E LOTE ANTES DE VER O PRECO.</p>
      </section>
    );
  }

  return (
    <section style={priceSummaryPanelStyle}>
      <span style={priceBadgeStyle}>FORMACAO DE PRECO</span>
      <h2 style={priceSummaryTitleStyle}>ANALISE DE MARGEM DE CONTRIBUICAO</h2>
      <p style={priceSummarySubtitleStyle}>{sellerCompany.description}</p>
      {sendMessage && <div style={pricingSendMessageStyle}>{sendMessage}</div>}

      {analysis.requiresManualProductionRate && (
        <section style={{
          ...missingProductionStyle,
          ...(analysis.productionDataReady ? missingProductionReadyStyle : {}),
        }}>
          <div style={missingProductionCopyStyle}>
            <span style={missingProductionEyebrowStyle}>
              {analysis.productionDataReady ? "CAPACIDADE PROVISORIA APLICADA" : "TEMPO DE PRODUCAO NAO ENCONTRADO"}
            </span>
            <h3 style={missingProductionTitleStyle}>ESTE PAPEL AINDA NAO POSSUI TEMPOS DISPONIVEIS NO BANCO DE DADOS</h3>
            <p style={missingProductionTextStyle}>
              PARA ESTA COTACAO, O SISTEMA CONSIDERA UM SET-UP PROVISORIO DE 15 MINUTOS. INFORME QUANTAS CAIXAS POR HORA A ENGENHARIA ESTIMA PARA ESTA CAIXA.
            </p>
          </div>

          <label style={manualCapacityFieldStyle}>
            <span style={manualCapacityLabelStyle}>CAPACIDADE ESTIMADA PELA ENGENHARIA</span>
            <span style={manualCapacityInputRowStyle}>
              <input
                type="number"
                min="1"
                step="1"
                value={manualBoxesPerHour || ""}
                onChange={(event) => setManualBoxesPerHour(Math.max(0, Math.round(Number(event.target.value) || 0)))}
                placeholder="EX.: 900"
                aria-label="CAPACIDADE ESTIMADA EM CAIXAS POR HORA"
                style={manualCapacityInputStyle}
              />
              <strong style={manualCapacitySuffixStyle}>CX/H</strong>
            </span>
            <small style={manualCapacityHelpStyle}>USADO SOMENTE NESTA COTACAO</small>
          </label>
        </section>
      )}

      <div style={priceOverviewStyle}>
        <div style={priceOverviewMainStyle}>
          <PriceInfoRow label="EMPRESA VENDEDORA" value={sellerCompany.name} />
          <PriceInfoRow label="MODELO ESCOLHIDO" value={selectedFormula.description} />
          <PriceInfoRow label="DIMENSOES" value={dimensionsWithTopOverlapText} />
          <PriceInfoRow label="MATERIAL" value={selectedMaterial.code} />
          <PriceInfoRow label={accessoriesArea > 0 ? "AREA DA CAIXA PRINCIPAL" : "AREA DA CHAPA"} value={`${formatNumber(mainSheetArea, 4)} M2 (${formatNumber(mainSheetArea * 1000, 0)} M2 UND.INT.)`} />
          {accessoriesArea > 0 && <PriceInfoRow label="AREA DOS ACESSORIOS" value={`${formatNumber(accessoriesArea, 4)} M2`} />}
          {accessoriesArea > 0 && <PriceInfoRow label="AREA TOTAL PARA PRECO" value={`${formatNumber(sheetArea, 4)} M2 (${formatNumber(sheetArea * 1000, 0)} M2 UND.INT.)`} />}
          <PriceInfoRow label="PESO UNITARIO / TOTAL LOTE" value={`${formatNumber(analysis.unitWeightKg, 3)} KG (${formatNumber(analysis.totalWeightKg, 1)} KG)`} />
          <PriceInfoRow label="QUANTIDADE DO LOTE" value={`${lotQuantity.toLocaleString("pt-BR")} UNIDS`} />
        </div>

        <aside style={productionOverviewStyle}>
          <span style={productionOverviewEyebrowStyle}>DADOS DE PRODUCAO UTILIZADOS</span>

          <div style={productionMetricRowStyle}>
            <span style={productionMetricLabelStyle}>SET-UP USADO</span>
            <strong style={{ ...productionMetricValueStyle, color: ignoreSetup ? "#e6007e" : "#e68019" }}>
              {formatNumber(analysis.setupMinutes, 2)} MIN
            </strong>
          </div>

          <div style={productionToggleRowStyle}>
            <label style={compactProductionToggleStyle}>
              <input
                type="checkbox"
                checked={ignoreSetup}
                onChange={(event) => setIgnoreSetup(event.target.checked)}
                style={zeroSetupCheckboxStyle}
              />
              <span>ZERAR SET-UP</span>
            </label>

            {sellerCompany.key === "dawos" && (
              <label style={compactProductionToggleStyle}>
                <input
                  type="checkbox"
                  checked={ignoreAdditionalCosts}
                  onChange={(event) => setIgnoreAdditionalCosts(event.target.checked)}
                  style={additionalCostsCheckboxStyle}
                />
                <span>NAO CONSIDERAR DC</span>
              </label>
            )}
          </div>

          {ignoreSetup && (
            <span style={configuredSetupNoteStyle}>
              VALOR DA TABELA: {formatNumber(analysis.configuredSetupMinutes, 2)} MIN
            </span>
          )}

          {analysis.additionalCostsIgnored && (
            <span style={configuredAdditionalCostsNoteStyle}>
              DEMAIS CUSTOS DESCONSIDERADOS: {formatNumber(analysis.configuredAdditionalCosts, 2)}%
            </span>
          )}

          {analysis.productionTimeSource === "similar" && (
            <span style={configuredSetupNoteStyle}>
              REFERENCIA SIMILAR: {analysis.productionReferenceMaterial}
            </span>
          )}

          {analysis.requiresManualProductionRate && (
            <span style={configuredSetupNoteStyle}>SET-UP PROVISORIO PARA ESTA COTACAO</span>
          )}

          <div style={productionDividerStyle} />

          <div style={productionMetricRowStyle}>
            <span style={productionMetricLabelStyle}>CAPACIDADE UTILIZADA</span>
            <strong style={{ ...productionMetricValueStyle, color: "#0087d7" }}>
              {analysis.productionDataReady ? `${formatNumber(analysis.boxesPerHour, 0)} CX/H` : "AGUARDANDO CX/H"}
            </strong>
          </div>

          {analysis.productionCapacitySimulated && analysis.tableBoxesPerHour > 0 && (
            <span style={configuredSetupNoteStyle}>
              VALOR DA TABELA: {formatNumber(analysis.tableBoxesPerHour, 0)} CX/H
            </span>
          )}

          <label style={productionCapacityOverrideStyle}>
            <span style={productionCapacityOverrideLabelStyle}>SIMULAR QUANTIDADE</span>
            <span style={productionCapacityOverrideInputRowStyle}>
              <input
                type="number"
                min="1"
                step="1"
                value={manualBoxesPerHour || ""}
                onChange={(event) => setManualBoxesPerHour(Math.max(0, Math.round(Number(event.target.value) || 0)))}
                placeholder={analysis.tableBoxesPerHour > 0 ? formatNumber(analysis.tableBoxesPerHour, 0) : "EX.: 900"}
                aria-label="SIMULAR QUANTIDADE EM CAIXAS POR HORA"
                style={productionCapacityOverrideInputStyle}
              />
              <strong style={productionCapacityOverrideSuffixStyle}>CX/H</strong>
            </span>
          </label>
        </aside>

        {(economicAlternative || economicSimulationActive) && originalMaterial && (
          <EconomicMaterialCard
            originalMaterial={originalMaterial}
            activeMaterial={selectedMaterial}
            alternativeMaterial={economicAlternative}
            active={economicSimulationActive}
            onSimulate={onSimulateEconomicMaterial}
            onRestore={onRestoreOriginalMaterial}
          />
        )}
      </div>

      <div style={priceStandardPanelStyle}>
        <div style={priceStandardHeaderStyle}>
          <div>
            <strong style={priceStandardTitleStyle}>PRECO PADRAO - MC% CONFIGURADA: {formatNumber(analysis.mcDefault, 0)}%</strong>
            <span style={priceExpensesBadgeStyle}>DESPESAS: {formatNumber(analysis.expensesPercent, 2)}%</span>
          </div>
          <button type="button" onClick={() => sendPriceToTarget(analysis.standardPrice, "PADRAO")} style={pricingActionButtonStyle}>{sendTargetLabel}</button>
        </div>

        <div style={priceAnalysisGridStyle}>
          <div style={priceHighlightStackStyle}>
            <PriceHighlight label={`PRECO PADRAO PELA MC% (${formatNumber(analysis.mcDefault, 0)}%)`} value={formatCurrency(analysis.standardPrice)} tone="pink" />
            <PriceHighlight label={`PRECO SUGERIDO PELA MC HORA (${formatCurrency(analysis.mcrHour)}/H)`} value={analysis.productionDataReady ? formatCurrency(simulatorCPrice) : "AGUARDANDO CX/H"} tone="blue" />
            <PriceMetric label="MC H" value={analysis.productionDataReady ? `${formatCurrency(analysis.mchStandard)}/H` : "AGUARDANDO CX/H"} />
            <PriceMetric label="PRECO R$/KG" value={`${formatCurrency(analysis.pricePerKg)}/KG`} />
          </div>

          <div style={priceDetailsCardStyle}>
            <PriceDetail label="CUSTO MP (C/ IPI):" value={formatCurrency(analysis.materialCostWithIpi)} color="#e68019" />
            <PriceDetail label="CUSTO MP (S/ NOTA):" value={formatCurrency(analysis.materialCostNoInvoice)} color="#6f32d2" />
            <PriceDetail label="MARGEM R$ (UNITARIA):" value={formatCurrency(analysis.marginValue)} color="#00a651" />
            <PriceDetail label="PRECO LIQUIDO (R$):" value={formatCurrency(analysis.netPrice)} color="#0087d7" />
            <PriceDetail label="COMISSAO APLICADA (%):" value={`${formatNumber(analysis.commissionPercent, 2)}%`} color="#0087d7" />
            <PriceDetail label="COMISSAO A RECEBER (R$):" value={formatCurrency(analysis.commissionValue)} color="#00a651" />
            <PriceDetail label="TOTAL DO PEDIDO:" value={formatCurrency(analysis.totalOrder)} color="#00a651" large />
          </div>
        </div>
      </div>

      <div style={simulatorPanelStyle}>
        <div style={simulatorHeaderStyle}>
          <div>
            <span style={simulatorEyebrowStyle}>SIMULADOR A</span>
            <h3 style={simulatorTitleStyle}>INFORME O PRECO, VEJA A MARGEM</h3>
          </div>
          <div style={simulatorHeaderActionsStyle}>
            <span style={simulatorExpensesStyle}>DESPESAS: {formatNumber(analysis.expensesPercent, 2)}%</span>
            <button type="button" onClick={() => sendPriceToTarget(simulatorPrice, "SIMULADOR A")} style={pricingActionButtonStyle}>{sendTargetLabel}</button>
          </div>
        </div>

        <div style={simulatorGridStyle}>
          <label style={simulatorInputCardStyle}>
            <span style={simulatorInputLabelStyle}>PRECO UNITARIO</span>
            <span style={simulatorInputRowStyle}>
              <strong>R$</strong>
              <input
                type="number"
                min="0"
                step="0.01"
                value={simulatorPrice || ""}
                onChange={(event) => setSimulatorPrice(Number(event.target.value) || 0)}
                placeholder="0,00"
                style={simulatorInputStyle}
              />
            </span>
          </label>

          <SimulatorResultCard label="MARGEM MC%" value={`${formatNumber(simulatorA.mcPercent, 2)}%`} tone={getSimulatorTone(simulatorA.mcPercent, pricingGoals.mcPercent)} />
          <SimulatorResultCard label="MC/HORA" value={analysis.productionDataReady ? `${formatCurrency(simulatorA.mch)}/H` : "AGUARDANDO CX/H"} tone={getSimulatorTone(simulatorA.mch, pricingGoals.mcrHour)} />
          <SimulatorResultCard label="PRECO R$/KG" value={`${formatCurrency(simulatorA.pricePerKg)}/KG`} tone={getSimulatorTone(simulatorA.pricePerKg, pricingGoals.pricePerKg)} />
        </div>

        <SimulatorFinancialDetails result={simulatorA} analysis={analysis} />

        <div style={requiredLotStyle}>
          <div>
            <span style={requiredLotEyebrowStyle}>LOTE PARA ATINGIR {formatCurrency(analysis.mcrHour)}/H</span>
            <p style={requiredLotTextStyle}>QUANTIDADE NECESSARIA COM O PRECO INFORMADO DE {formatCurrency(simulatorPrice)}.</p>
          </div>
          {!analysis.productionDataReady ? (
            <div style={requiredLotImpossibleStyle}>
              <strong>AGUARDANDO CAPACIDADE</strong>
              <span>INFORME AS CAIXAS POR HORA ACIMA</span>
            </div>
          ) : requiredLot.independentOfLot && requiredLot.attainable ? (
            <div style={requiredLotNoSetupStyle}>
              <strong>META ATINGIDA EM QUALQUER LOTE</strong>
              <span>O SET-UP ESTA ZERADO</span>
            </div>
          ) : requiredLot.attainable && requiredLot.quantity ? (
            <strong style={requiredLotValueStyle}>{requiredLot.quantity.toLocaleString("pt-BR")} UNIDS</strong>
          ) : (
            <div style={requiredLotImpossibleStyle}>
              <strong>META INATINGIVEL NESTE PRECO</strong>
              <span>MAXIMO TEORICO: {formatCurrency(requiredLot.maximumMch)}/H</span>
            </div>
          )}
        </div>
      </div>

      <div style={simulatorPanelStyle}>
        <div style={simulatorHeaderStyle}>
          <div>
            <span style={simulatorEyebrowStyle}>SIMULADOR B</span>
            <h3 style={simulatorTitleStyle}>INFORME A MC%, VEJA O PRECO</h3>
          </div>
          <div style={simulatorHeaderActionsStyle}>
            <span style={simulatorExpensesStyle}>DESPESAS: {formatNumber(analysis.expensesPercent, 2)}%</span>
            <button type="button" onClick={() => sendPriceToTarget(simulatorBPrice, "SIMULADOR B")} style={pricingActionButtonStyle}>{sendTargetLabel}</button>
          </div>
        </div>

        <div style={inverseSimulatorGridStyle}>
          <label style={{ ...inverseInputCardStyle, ...simulatorToneStyles[targetMcTone] }}>
            <span style={{ ...simulatorInputLabelStyle, color: simulatorToneStyles[targetMcTone].color }}>MC% DESEJADA</span>
            <span style={{ ...simulatorInputRowStyle, color: simulatorToneStyles[targetMcTone].color }}>
              <input
                type="number"
                min="0"
                max="99.9"
                step="0.1"
                value={targetMcPercent || ""}
                onChange={(event) => setTargetMcPercent(Number(event.target.value) || 0)}
                style={simulatorInputStyle}
              />
              <strong>%</strong>
            </span>
            <span style={{ ...inverseResultLabelStyle, color: simulatorToneStyles[targetMcTone].color }}>PRECO UNITARIO</span>
            <strong style={{ ...inverseResultValueStyle, color: simulatorToneStyles[targetMcTone].color }}>{formatCurrency(simulatorBPrice)}</strong>
          </label>

          <SimulatorResultCard label="MC/HORA" value={analysis.productionDataReady ? `${formatCurrency(simulatorB.mch)}/H` : "AGUARDANDO CX/H"} tone={getSimulatorTone(simulatorB.mch, pricingGoals.mcrHour)} />
          <SimulatorResultCard label="PRECO R$/KG" value={`${formatCurrency(simulatorB.pricePerKg)}/KG`} tone={getSimulatorTone(simulatorB.pricePerKg, pricingGoals.pricePerKg)} />
        </div>

        <SimulatorFinancialDetails result={simulatorB} analysis={analysis} />
      </div>

      <div style={simulatorPanelStyle}>
        <div style={simulatorHeaderStyle}>
          <div>
            <span style={simulatorEyebrowStyle}>SIMULADOR C</span>
            <h3 style={simulatorTitleStyle}>INFORME A MC R$/HORA, VEJA O PRECO E A MARGEM</h3>
          </div>
          <div style={simulatorHeaderActionsStyle}>
            <span style={simulatorExpensesStyle}>DESPESAS: {formatNumber(analysis.expensesPercent, 2)}%</span>
            <button type="button" onClick={() => sendPriceToTarget(simulatorCPrice, "SIMULADOR C")} style={pricingActionButtonStyle}>{sendTargetLabel}</button>
          </div>
        </div>

        <div style={inverseSimulatorGridStyle}>
          <label style={{ ...inverseInputCardStyle, ...simulatorToneStyles[targetMchTone] }}>
            <span style={{ ...simulatorInputLabelStyle, color: simulatorToneStyles[targetMchTone].color }}>MC R$/HORA DESEJADA</span>
            <span style={{ ...simulatorInputRowStyle, color: simulatorToneStyles[targetMchTone].color }}>
              <strong>R$</strong>
              <input
                type="number"
                min="0"
                step="1"
                value={targetMch || ""}
                onChange={(event) => setTargetMch(Math.max(0, Math.round(Number(event.target.value) || 0)))}
                style={simulatorInputStyle}
              />
              <strong>/H</strong>
            </span>
            <span style={{ ...inverseResultLabelStyle, color: simulatorToneStyles[targetMchTone].color }}>PRECO UNITARIO</span>
            <strong style={{ ...inverseResultValueStyle, color: simulatorToneStyles[targetMchTone].color }}>{analysis.productionDataReady ? formatCurrency(simulatorCPrice) : "AGUARDANDO CX/H"}</strong>
          </label>

          <SimulatorResultCard label="MARGEM MC%" value={analysis.productionDataReady ? `${formatNumber(simulatorC.mcPercent, 2)}%` : "AGUARDANDO CX/H"} tone={getSimulatorTone(simulatorC.mcPercent, pricingGoals.mcPercent)} />
          <SimulatorResultCard label="PRECO R$/KG" value={analysis.productionDataReady ? `${formatCurrency(simulatorC.pricePerKg)}/KG` : "AGUARDANDO CX/H"} tone={getSimulatorTone(simulatorC.pricePerKg, pricingGoals.pricePerKg)} />
        </div>

        {analysis.productionDataReady ? (
          <SimulatorFinancialDetails result={simulatorC} analysis={analysis} />
        ) : (
          <div style={simulatorPendingStyle}>INFORME A CAPACIDADE ESTIMADA EM CAIXAS POR HORA PARA LIBERAR O SIMULADOR C.</div>
        )}
      </div>
    </section>
  );
}

function PriceInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={priceInfoRowStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EconomicMaterialCard({
  originalMaterial,
  activeMaterial,
  alternativeMaterial,
  active,
  onSimulate,
  onRestore,
}: {
  originalMaterial: (typeof initialMaterials)[number];
  activeMaterial?: (typeof initialMaterials)[number];
  alternativeMaterial?: (typeof initialMaterials)[number];
  active: boolean;
  onSimulate: () => void;
  onRestore: () => void;
}) {
  const material = active ? activeMaterial : alternativeMaterial;
  if (!material) return null;

  const economy = Math.max(originalMaterial.costIpi - material.costIpi, 0);

  return (
    <section style={{ ...economicMaterialCardStyle, ...(active ? economicMaterialCardActiveStyle : {}) }}>
      <div style={economicMaterialHeaderStyle}>
        <span style={economicMaterialEyebrowStyle}>
          {active ? "SIMULACAO ECONOMICA ATIVA" : "ALTERNATIVA MAIS ECONOMICA"}
        </span>
        <strong style={economicMaterialCodeStyle}>{material.code}</strong>
      </div>

      <div style={economicMaterialMetricsStyle}>
        <span style={economicMaterialMetricStyle}>
          <small style={economicMaterialLabelStyle}>FORNECEDOR</small>
          <strong>{material.supplier}</strong>
        </span>
        <span style={economicMaterialMetricStyle}>
          <small style={economicMaterialLabelStyle}>PRECO C/ IPI</small>
          <strong style={{ color: "#00a651" }}>{formatCurrency(material.costIpi)}/M2</strong>
        </span>
        <span style={economicMaterialMetricStyle}>
          <small style={economicMaterialLabelStyle}>ECONOMIA</small>
          <strong style={{ color: "#e68019" }}>{formatCurrency(economy)}/M2</strong>
        </span>
      </div>

      <button
        type="button"
        onClick={active ? onRestore : onSimulate}
        style={{ ...economicMaterialButtonStyle, ...(active ? economicMaterialRestoreButtonStyle : {}) }}
      >
        {active ? "VOLTAR AO MATERIAL ORIGINAL" : "SIMULAR COM ESTE MATERIAL"}
      </button>
    </section>
  );
}

function PriceHighlight({ label, value, tone }: { label: string; value: string; tone: "pink" | "blue" }) {
  return (
    <div style={tone === "pink" ? priceHighlightPinkStyle : priceHighlightBlueStyle}>
      <span style={priceHighlightLabelStyle}>{label}</span>
      <strong style={priceHighlightValueStyle}>{value}</strong>
    </div>
  );
}

function PriceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={priceMetricStyle}>
      <span>{label}</span>
      <strong style={priceMetricValueStyle}>{value}</strong>
    </div>
  );
}

type SimulatorTone = "red" | "yellow" | "green";

function getSimulatorTone(value: number, range: PricingGoals["mcPercent"]): SimulatorTone {
  if (value <= range.redMax) return "red";
  if (value < range.greenMin) return "yellow";
  return "green";
}

function SimulatorResultCard({ label, value, tone }: { label: string; value: string; tone: SimulatorTone }) {
  const toneStyle = simulatorToneStyles[tone];

  return (
    <div style={{ ...simulatorResultCardStyle, ...toneStyle }}>
      <span style={{ ...simulatorResultLabelStyle, color: toneStyle.color }}>{label}</span>
      <strong style={{ ...simulatorResultValueStyle, color: toneStyle.color }}>{value}</strong>
    </div>
  );
}

function SimulatorFinancialDetails({
  result,
  analysis,
}: {
  result: ReturnType<typeof calculatePriceResult>;
  analysis: ReturnType<typeof calculatePriceAnalysis>;
}) {
  return (
    <div style={simulatorDetailsStyle}>
      <PriceDetail label="MC R$ (UNITARIA):" value={formatCurrency(result.marginValue)} color="#00a651" />
      <PriceDetail label={`CUSTO MP USADO (${analysis.pricingMaterialCostLabel}):`} value={formatCurrency(analysis.pricingMaterialCost)} color="#6f32d2" />
      <PriceDetail label="PRECO LIQUIDO (R$):" value={formatCurrency(result.netPrice)} color="#0087d7" />
      <PriceDetail label="COMISSAO APLICADA (%):" value={`${formatNumber(result.commissionPercent, 2)}%`} color="#0087d7" />
      <PriceDetail label="COMISSAO A RECEBER (R$):" value={formatCurrency(result.commissionValue)} color="#00a651" />
      <PriceDetail label="TOTAL DO PEDIDO:" value={formatCurrency(result.totalOrder)} color="#00a651" />
      <PriceDetail label="TEMPO TOTAL DO LOTE:" value={analysis.productionDataReady ? `${formatNumber(analysis.totalMinutes, 2)} MIN` : "AGUARDANDO CX/H"} color="#e68019" />
    </div>
  );
}

function PriceDetail({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div style={priceDetailStyle}>
      <span>{label}</span>
      <strong style={{ color, fontSize: large ? 25 : 21 }}>{value}</strong>
    </div>
  );
}

function DimensionDrawing({
  image,
  mode,
}: {
  image: "maleta" | "sedex" | "tabuleiro" | "transpasse";
  mode: "full" | "hide-height" | "disabled-height";
}) {
  const showHeight = mode !== "hide-height";

  return (
    <div style={dimensionDrawingStyle}>
      <svg viewBox="0 0 280 240" aria-hidden="true" style={dimensionSvgStyle}>
        <defs>
          <linearGradient id={`kraft-front-${image}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#e8bd78" />
            <stop offset="100%" stopColor="#c79244" />
          </linearGradient>
          <linearGradient id={`kraft-side-${image}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#d9a961" />
            <stop offset="100%" stopColor="#b57c31" />
          </linearGradient>
          <linearGradient id={`kraft-top-${image}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0ce94" />
            <stop offset="100%" stopColor="#d8aa62" />
          </linearGradient>
        </defs>
        {image === "tabuleiro" || mode === "disabled-height" ? (
          <>
            <polygon points="44,122 205,72 242,122 80,184" fill={`url(#kraft-top-${image})`} stroke="#8b6a38" strokeWidth="2.5" />
            <polyline points="44,122 80,184 242,122" fill="none" stroke="#684a23" strokeWidth="2" opacity=".55" />
            <DimensionArrow x1={78} y1={202} x2={236} y2={142} label="C" />
            <DimensionArrow x1={28} y1={118} x2={66} y2={180} label="L" />
          </>
        ) : image === "sedex" ? (
          <>
            <polygon points="58,102 150,70 222,104 130,142" fill={`url(#kraft-top-${image})`} stroke="#65451f" strokeWidth="2.5" />
            <polygon points="58,102 130,142 130,190 58,150" fill={`url(#kraft-side-${image})`} stroke="#65451f" strokeWidth="2.5" />
            <polygon points="130,142 222,104 222,150 130,190" fill={`url(#kraft-front-${image})`} stroke="#65451f" strokeWidth="2.5" />
            <path d="M72 100 C86 54 130 38 150 70 L58 102 Z" fill="#d19a50" stroke="#65451f" strokeWidth="2.5" />
            <path d="M150 70 L218 36 C238 54 248 84 222 104 Z" fill="#e8bd78" stroke="#65451f" strokeWidth="2.5" />
            <path d="M82 84 L130 110 L202 82" fill="none" stroke="#7a5527" strokeWidth="2" opacity=".6" />
            <DimensionArrow x1={92} y1={208} x2={220} y2={154} label="C" />
            <DimensionArrow x1={48} y1={166} x2={118} y2={204} label="L" />
            <DimensionArrow x1={36} y1={102} x2={36} y2={152} label="A" />
          </>
        ) : (
          <>
            <polygon points="58,100 136,70 222,104 144,140" fill={`url(#kraft-top-${image})`} stroke="#65451f" strokeWidth="2.5" />
            <polygon points="58,100 144,140 144,190 58,148" fill={`url(#kraft-side-${image})`} stroke="#65451f" strokeWidth="2.5" />
            <polygon points="144,140 222,104 222,152 144,190" fill={`url(#kraft-front-${image})`} stroke="#65451f" strokeWidth="2.5" />
            <polygon points="58,100 36,56 116,28 136,70" fill="#d7a358" stroke="#65451f" strokeWidth="2.5" />
            <polygon points="136,70 190,34 250,70 222,104" fill="#eac17e" stroke="#65451f" strokeWidth="2.5" />
            <polygon points="58,100 96,118 138,92 104,78" fill="#c78e43" stroke="#65451f" strokeWidth="2.5" opacity={image === "transpasse" ? ".95" : ".82"} />
            <polygon points="144,140 190,114 236,132 192,162" fill="#d3a05a" stroke="#65451f" strokeWidth="2.5" opacity={image === "transpasse" ? ".98" : ".78"} />
            {image === "transpasse" && <path d="M72 82 L224 146" fill="none" stroke="#7a5527" strokeWidth="3" opacity=".55" />}
            <DimensionArrow x1={90} y1={208} x2={222} y2={158} label="C" />
            <DimensionArrow x1={48} y1={166} x2={132} y2={204} label="L" />
            {showHeight && <DimensionArrow x1={34} y1={100} x2={34} y2={150} label="A" />}
          </>
        )}
      </svg>
      <div style={dimensionLegendStyle}>
        <span>COMPRIMENTO (C)</span>
        <span>LARGURA (L)</span>
        {showHeight ? <span>ALTURA (A)</span> : <span>SEM ALTURA</span>}
      </div>
    </div>
  );
}

function DimensionArrow({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label: string }) {
  const labelX = (x1 + x2) / 2;
  const labelY = (y1 + y2) / 2 - 8;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6f32d2" strokeWidth="3" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="4" fill="#6f32d2" />
      <circle cx={x2} cy={y2} r="4" fill="#6f32d2" />
      <text x={labelX} y={labelY} textAnchor="middle" fill="#141827" fontSize="20" fontWeight="900">
        {label}
      </text>
    </g>
  );
}

function FormulaResult({
  label,
  value,
  secondaryValue,
  highlight,
  accent,
}: {
  label: string;
  value: string;
  secondaryValue?: string;
  highlight?: boolean;
  accent?: boolean;
}) {
  return (
    <div style={{ ...formulaResultStyle, ...(highlight ? formulaResultHighlightStyle : {}), ...(accent ? formulaResultAccentStyle : {}) }}>
      <span style={formulaResultLabelStyle}>{label}</span>
      <strong style={formulaResultValueStyle}>{value}</strong>
      {secondaryValue && <strong style={formulaResultSecondaryValueStyle}>{secondaryValue}</strong>}
    </div>
  );
}

function findFormulaForModel(formulas: EngineeringFormula[], formulaId: string, wave: "B" | "BC") {
  const base = formulas.find((formula) => formula.id === formulaId);
  if (!base) return formulas[0] ?? initialEngineeringFormulas[0];

  if (base.category === "MALETA") {
    const targetId = wave === "BC" ? formulaId.replace("-b", "-bc") : formulaId.replace("-bc", "-b");
    return formulas.find((formula) => formula.id === targetId) ?? base;
  }

  if (base.style.startsWith("SEDEX")) {
    return formulas.find((formula) => formula.id === (wave === "BC" ? "sedex-bc" : "sedex-b")) ?? base;
  }

  if (base.style.startsWith("TAB")) {
    return formulas.find((formula) => formula.id === (wave === "BC" ? "tab-bc" : "tab-b")) ?? base;
  }

  return base;
}

function parseDecimal(value: string) {
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function BoxIllustration({ type }: { type: "maleta" | "sedex" | "tabuleiro" | "transpasse" }) {
  const lines =
    type === "sedex"
      ? [
          "M38 34 L88 14 L84 42 L34 62 Z",
          "M34 62 L84 42 L84 82 L34 102 Z",
          "M84 42 L126 58 L126 96 L84 82 Z",
        ]
      : type === "tabuleiro"
        ? [
            "M34 34 L76 18 L118 34 L76 50 Z",
            "M34 34 L34 74 L76 92 L76 50 Z",
            "M118 34 L118 74 L76 92 L76 50 Z",
            "M48 42 L48 80",
            "M104 42 L104 80",
          ]
        : type === "transpasse"
          ? [
              "M30 38 L78 16 L126 38 L78 60 Z",
              "M30 38 L30 84 L78 108 L78 60 Z",
              "M126 38 L126 84 L78 108 L78 60 Z",
              "M16 28 L78 2 L140 28",
              "M16 28 L30 38",
              "M140 28 L126 38",
            ]
          : [
              "M36 38 L78 16 L120 38 L78 60 Z",
              "M36 38 L36 84 L78 108 L78 60 Z",
              "M120 38 L120 84 L78 108 L78 60 Z",
              "M58 26 L100 48",
              "M58 74 L78 84 L100 74",
            ];

  return (
    <span style={optionImageStyle}>
      <svg viewBox="0 0 156 124" aria-hidden="true" style={optionSvgStyle}>
        {lines.map((path) => (
          <path key={path} d={path} fill="none" stroke="#e68019" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <path d="M38 108 C56 118 102 118 120 108" fill="none" stroke="rgba(111,50,210,.35)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function ModulePlaceholder({ modulo }: { modulo: (typeof modulos)[number] }) {
  return (
    <section style={placeholderStyle}>
      <span
        style={{
          ...placeholderIconStyle,
          background: `linear-gradient(135deg, ${modulo.cor}, #e63dae, #ff3b25)`,
        }}
      >
        {modulo.nome.slice(0, 2)}
      </span>
      <h2 style={placeholderTitleStyle}>{modulo.nome}</h2>
      <p style={placeholderTextStyle}>ESTE MODULO VAI SER CONSTRUIDO AQUI, NO CARD CENTRAL, SEGUINDO O MESMO PADRAO VISUAL.</p>
    </section>
  );
}

const paginaStyle = {
  width: "100%",
  display: "block",
  position: "relative" as const,
  transition: "padding-left .22s ease",
  boxSizing: "border-box" as const,
};

const sidebarDockStyle = {
  width: 294,
  position: "fixed" as const,
  top: 168,
  bottom: 10,
  left: 0,
  zIndex: 12,
  display: "flex",
  alignItems: "center",
  pointerEvents: "none" as const,
};

const sidebarStyle = {
  width: 294,
  display: "flex",
  alignItems: "stretch",
  maxHeight: "calc(100vh - 38px)",
  transition: "transform .22s ease",
  filter: "drop-shadow(0 22px 42px rgba(39,36,67,.14))",
  pointerEvents: "auto" as const,
};

const sidebarContentStyle = {
  width: 252,
  maxHeight: "calc(100vh - 38px)",
  overflowY: "auto" as const,
  scrollbarWidth: "thin" as const,
  borderRadius: 24,
  border: "1px solid rgba(111,50,210,.18)",
  background: "rgba(255,255,255,.92)",
  padding: 18,
  boxSizing: "border-box" as const,
};

const sidebarHandleStyle = {
  width: 42,
  minHeight: 232,
  marginTop: 0,
  borderRadius: "0 16px 16px 0",
  background: "linear-gradient(180deg,#8b36e8,#e63dae,#ff3b25)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: "1px",
  writingMode: "vertical-rl" as const,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const sidebarHeaderStyle = { display: "grid", gap: 8, padding: "6px 6px 16px" };
const sidebarEyebrowStyle = { color: "#6f32d2", fontSize: 13, fontWeight: 900, letterSpacing: 3 };
const sidebarTitleStyle = { color: "#141827", fontSize: 21, fontWeight: 900 };
const moduleListStyle = { display: "grid", gap: 11 };
const moduleButtonStyle = {
  minHeight: 78,
  padding: 0,
  borderRadius: 16,
  border: "1px solid rgba(52,64,84,.12)",
  background: "rgba(255,255,255,.72)",
  color: "#141827",
  display: "grid",
  gridTemplateColumns: "8px 1fr",
  overflow: "hidden",
  cursor: "pointer",
  textAlign: "left" as const,
};
const activeModuleButtonStyle = { background: "linear-gradient(145deg,rgba(111,50,210,.08),rgba(255,59,37,.06)),#fff", boxShadow: "0 14px 30px rgba(39,36,67,.10)" };
const moduleAccentStyle = { width: "100%", height: "100%" };
const moduleTextStyle = { display: "grid", alignContent: "center", gap: 7, padding: "0 18px" };
const moduleNameStyle = { fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const moduleDescriptionStyle = { color: "#667085", fontSize: 11, fontWeight: 900, lineHeight: 1.25, letterSpacing: 1 };

const workspaceStyle = {
  minHeight: 640,
  borderRadius: 28,
  border: "1px solid rgba(52,64,84,.18)",
  background: "rgba(255,255,255,.86)",
  boxShadow: "0 24px 60px rgba(39,36,67,.10)",
  padding: 34,
  boxSizing: "border-box" as const,
};
const workspaceHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, marginBottom: 30 };
const workspaceEyebrowStyle = { color: "#6f32d2", fontSize: 13, fontWeight: 900, letterSpacing: 3 };
const workspaceTitleStyle = { margin: "8px 0 0", color: "#141827", fontSize: 40, fontWeight: 900 };
const workspaceSubtitleStyle = { margin: "8px 0 0", color: "#667085", fontSize: 18, fontWeight: 800, letterSpacing: 1 };
const emptyWorkspaceStyle = { minHeight: 520, display: "grid", placeItems: "center", alignContent: "center", gap: 16, position: "relative" as const };
const arrowHintStyle = { position: "absolute" as const, left: -20, top: 82, color: "#e6007e", fontSize: 64, fontWeight: 900, animation: "none" };
const emptyBadgeStyle = { minHeight: 42, padding: "0 22px", display: "inline-grid", placeItems: "center", borderRadius: 999, background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)", color: "#fff", fontSize: 15, fontWeight: 900, letterSpacing: 2 };
const emptyTitleStyle = { maxWidth: 760, margin: 0, color: "#141827", fontSize: 42, fontWeight: 900, textAlign: "center" as const };
const emptyTextStyle = { margin: 0, color: "#667085", fontSize: 18, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };

const pricingCardStyle = { width: "90%", maxWidth: "none", margin: "0 auto", padding: 36, borderRadius: 24, border: "1px solid rgba(52,64,84,.18)", background: "#fff", boxShadow: "0 20px 46px rgba(39,36,67,.08)" };
const pricingIntroStyle = { marginBottom: 28 };
const pricingTitleStyle = { margin: 0, color: "#141827", fontSize: 30, fontWeight: 900 };
const pricingSubtitleStyle = { margin: "12px 0 0", color: "#344054", fontSize: 17, fontWeight: 800 };
const stepsStyle = { display: "grid", gridTemplateColumns: "repeat(6,1fr)", alignItems: "center", gap: 8, borderRadius: 999, padding: 8, background: "#eef2f7", border: "1px solid rgba(52,64,84,.12)", boxShadow: "inset 0 1px 5px rgba(39,36,67,.08)", marginBottom: 34 };
const stepButtonStyle = { minHeight: 66, width: "100%", minWidth: 0, border: "none", borderRadius: 999, background: "transparent", color: "#667085", fontSize: 16, fontWeight: 900, letterSpacing: 1, lineHeight: 1.25, whiteSpace: "normal" as const, textAlign: "center" as const, cursor: "pointer" };
const activeStepButtonStyle = { background: "linear-gradient(135deg,#8b36e8,#6f32d2)", color: "#fff", boxShadow: "0 12px 24px rgba(111,50,210,.24)" };
const sectionLabelStyle = { margin: "22px 0 14px", color: "#141827", fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const categoryGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 };
const modelGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(260px,1fr))", gap: 18, maxWidth: 760 };
const optionCardStyle = { minHeight: 184, borderRadius: 16, border: "1px solid rgba(52,64,84,.18)", background: "#fff", display: "grid", placeItems: "center", alignContent: "center", gap: 8, color: "#141827", cursor: "pointer", padding: 18 };
const activeOptionStyle = { border: "1px solid #e6007e", background: "rgba(255,0,135,.04)", boxShadow: "0 18px 36px rgba(230,0,126,.12)" };
const warmOptionStyle = { border: "1px solid #e68019", background: "rgba(230,128,25,.06)" };
const optionImageStyle = { width: 132, height: 92, display: "grid", placeItems: "center" };
const optionSvgStyle = { width: "100%", height: "100%", display: "block", filter: "drop-shadow(0 12px 18px rgba(230,128,25,.16))" };
const optionTitleStyle = { fontSize: 18, fontWeight: 900, textAlign: "center" as const };
const optionSubtitleStyle = { color: "#667085", fontSize: 13, fontWeight: 800, textAlign: "center" as const, letterSpacing: 1 };

const formulaSummaryStyle = {
  marginTop: 26,
  padding: "18px 22px",
  borderRadius: 18,
  border: "1px solid rgba(111,50,210,.16)",
  background: "linear-gradient(135deg,rgba(111,50,210,.06),rgba(230,61,174,.04),rgba(255,59,37,.04))",
  display: "grid",
  gridTemplateColumns: "auto 1fr 1.4fr 1.4fr",
  alignItems: "center",
  gap: 16,
};
const formulaBadgeStyle = {
  minHeight: 44,
  padding: "0 16px",
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg,#8b36e8,#ff3b25)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
};
const formulaSummaryTitleStyle = { color: "#141827", fontSize: 21, fontWeight: 900 };
const formulaSummaryTextStyle = { color: "#667085", fontSize: 18, fontWeight: 900, textAlign: "center" as const };
const dimensionsPanelStyle = {
  display: "grid",
  gap: 24,
  padding: 28,
  borderRadius: 20,
  border: "1px solid rgba(230,0,126,.22)",
  background: "rgba(255,255,255,.88)",
};
const dimensionHeroStyle = { display: "grid", gridTemplateColumns: "330px 1fr", gap: 28, alignItems: "stretch" };
const dimensionControlsStyle = { display: "grid", gap: 22, alignContent: "start" };
const dimensionDrawingStyle = {
  minHeight: 304,
  borderRadius: 20,
  border: "1px solid rgba(230,128,25,.22)",
  background: "linear-gradient(145deg,rgba(255,250,244,.92),rgba(255,255,255,.92))",
  display: "grid",
  alignContent: "center",
  justifyItems: "center",
  gap: 12,
  padding: 22,
  boxShadow: "0 18px 36px rgba(230,128,25,.08)",
};
const dimensionSvgStyle = { width: "100%", maxWidth: 280, height: 240, display: "block", filter: "drop-shadow(0 14px 20px rgba(230,128,25,.16))" };
const dimensionLegendStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(3,1fr)",
  gap: 8,
  color: "#667085",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 1,
  textAlign: "center" as const,
};
const dimensionTitleStyle = { margin: "8px 0 0", color: "#141827", fontSize: 34, fontWeight: 900 };
const dimensionSubtitleStyle = { margin: "8px 0 0", color: "#667085", fontSize: 18, fontWeight: 900 };
const dimensionGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 };
const dimensionFieldStyle = {
  minHeight: 116,
  padding: 18,
  borderRadius: 16,
  border: "1px solid rgba(52,64,84,.16)",
  background: "#fff",
  display: "grid",
  alignContent: "center",
  gap: 10,
};
const disabledDimensionFieldStyle = { opacity: 0.42, background: "#f2f4f7" };
const dimensionLabelStyle = { color: "#344054", fontSize: 17, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };
const dimensionInputStyle = {
  width: "100%",
  height: 54,
  borderRadius: 12,
  border: "1px solid rgba(52,64,84,.18)",
  background: "#fff",
  color: "#141827",
  fontSize: 28,
  fontWeight: 900,
  textAlign: "center" as const,
  outline: "none",
};
const dimensionAlertStyle = {
  minHeight: 52,
  padding: "14px 18px",
  borderRadius: 14,
  border: "1px solid rgba(255,59,37,.28)",
  background: "rgba(255,59,37,.08)",
  color: "#ff3b25",
  fontSize: 15,
  fontWeight: 900,
  display: "grid",
  placeItems: "center",
  textAlign: "center" as const,
};
const formulaResultGridStyle = { display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14 };
const formulaResultStyle = {
  minHeight: 112,
  padding: 16,
  borderRadius: 16,
  border: "1px solid rgba(52,64,84,.14)",
  background: "#fff",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 10,
  textAlign: "center" as const,
};
const formulaResultHighlightStyle = { border: "1px solid rgba(0,166,81,.28)", background: "rgba(0,166,81,.06)" };
const formulaResultAccentStyle = { border: "1px solid rgba(0,135,215,.28)", background: "rgba(0,135,215,.06)" };
const formulaResultLabelStyle = { color: "#667085", fontSize: 14, fontWeight: 900, letterSpacing: 1 };
const formulaResultValueStyle = { color: "#141827", fontSize: 19, fontWeight: 900, lineHeight: 1.25 };
const formulaResultSecondaryValueStyle = { color: "#6f32d2", fontSize: 18, fontWeight: 900, lineHeight: 1.15 };
const lotPanelStyle = {
  display: "grid",
  gap: 26,
  padding: 30,
  borderRadius: 22,
  border: "1px solid rgba(230,0,126,.22)",
  background: "rgba(255,255,255,.88)",
};
const lotHeaderStyle = { display: "grid", gap: 8 };
const lotTitleStyle = { margin: 0, color: "#141827", fontSize: 34, fontWeight: 900 };
const lotSubtitleStyle = { margin: 0, color: "#667085", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const lotBodyStyle = { display: "grid", gridTemplateColumns: "1.35fr .65fr", gap: 24, alignItems: "stretch" };
const lotControlCardStyle = {
  minHeight: 230,
  borderRadius: 20,
  border: "1px solid rgba(52,64,84,.14)",
  background: "#fff",
  padding: 26,
  display: "grid",
  alignContent: "center",
  gap: 26,
  boxShadow: "0 18px 36px rgba(39,36,67,.06)",
};
const lotLabelStyle = { color: "#141827", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const lotSliderRowStyle = { display: "grid", gridTemplateColumns: "1fr 190px", gap: 24, alignItems: "center" };
const lotRangeStyle = { width: "100%", accentColor: "#e68019", cursor: "pointer" };
const lotQuantityBoxStyle = {
  height: 70,
  borderRadius: 16,
  border: "1px solid rgba(52,64,84,.18)",
  background: "linear-gradient(180deg,#fff,#fbfcff)",
  display: "grid",
  gridTemplateColumns: "1fr 64px",
  alignItems: "center",
  overflow: "hidden",
};
const lotQuantityInputStyle = {
  width: "100%",
  height: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#141827",
  fontSize: 28,
  fontWeight: 900,
  textAlign: "center" as const,
};
const lotUnitStyle = { height: "100%", display: "grid", placeItems: "center", color: "#667085", fontSize: 14, fontWeight: 900, borderLeft: "1px solid rgba(52,64,84,.12)" };
const lotHintStyle = { margin: 0, color: "#667085", fontSize: 15, fontWeight: 900, letterSpacing: 1 };
const lotChartCardStyle = {
  minHeight: 230,
  borderRadius: 20,
  border: "1px solid rgba(111,50,210,.18)",
  background: "linear-gradient(145deg,rgba(111,50,210,.06),rgba(255,255,255,.92),rgba(230,128,25,.08))",
  padding: 24,
  display: "grid",
  gap: 18,
  alignContent: "center",
};
const lotChartHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#6f32d2", fontSize: 15, fontWeight: 900, letterSpacing: 1 };
const lotBarsStyle = { height: 132, display: "flex", alignItems: "end", justifyContent: "center", gap: 10 };
const lotBarStyle = {
  width: 24,
  borderRadius: "10px 10px 4px 4px",
  background: "linear-gradient(180deg,#8b36e8,#e63dae,#ff3b25)",
  boxShadow: "0 10px 18px rgba(230,61,174,.16)",
};
const lotChartFooterStyle = { display: "flex", justifyContent: "space-between", color: "#667085", fontSize: 12, fontWeight: 900, letterSpacing: 1 };
const companyPanelStyle = {
  display: "grid",
  gap: 28,
  padding: 30,
  borderRadius: 22,
  border: "1px solid rgba(230,0,126,.22)",
  background: "rgba(255,255,255,.88)",
};
const companyHeaderStyle = { display: "grid", gap: 8 };
const companyTitleStyle = { margin: 0, color: "#141827", fontSize: 34, fontWeight: 900 };
const companySubtitleStyle = { margin: 0, color: "#667085", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const companyGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 };
const companyCardStyle = {
  minHeight: 172,
  borderRadius: 18,
  border: "1px solid rgba(52,64,84,.18)",
  background: "#fff",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 10,
  padding: 20,
  color: "#141827",
  cursor: "pointer",
  boxShadow: "0 16px 32px rgba(39,36,67,.06)",
};
const activeCompanyCardStyle = { border: "1px solid #e6007e", background: "rgba(255,0,135,.04)", boxShadow: "0 20px 40px rgba(230,0,126,.12)" };
const companyIconStyle = { width: 54, height: 54, display: "grid", placeItems: "center" };
const companyIconSvgStyle = { width: "100%", height: "100%", display: "block", filter: "drop-shadow(0 10px 14px rgba(39,36,67,.10))" };
const companyCardTitleStyle = { fontSize: 20, fontWeight: 900, textAlign: "center" as const };
const companyCardTextStyle = { color: "#667085", fontSize: 13, fontWeight: 900, textAlign: "center" as const, letterSpacing: 1 };
const companyTaxCardStyle = {
  borderRadius: 18,
  border: "1px solid rgba(111,50,210,.18)",
  background: "linear-gradient(145deg,rgba(111,50,210,.05),rgba(255,255,255,.92),rgba(230,128,25,.06))",
  padding: 24,
  display: "grid",
  gridTemplateColumns: "260px 1fr",
  gap: 24,
  alignItems: "center",
};
const companyTaxEyebrowStyle = { display: "block", color: "#6f32d2", fontSize: 13, fontWeight: 900, letterSpacing: 3, marginBottom: 8 };
const companyTaxTitleStyle = { color: "#141827", fontSize: 28, fontWeight: 900 };
const companyTaxGridStyle = { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12 };
const companyTaxItemStyle = { minHeight: 88, borderRadius: 14, border: "1px solid rgba(52,64,84,.12)", background: "rgba(255,255,255,.78)", display: "grid", placeItems: "center", alignContent: "center", gap: 8, textAlign: "center" as const };
const companyTaxLabelStyle = { color: "#667085", fontSize: 13, fontWeight: 900, letterSpacing: 1 };
const companyTaxValueStyle = { fontSize: 22, fontWeight: 900 };
const priceSummaryPanelStyle = {
  display: "grid",
  gap: 24,
  padding: 30,
  borderRadius: 22,
  border: "1px solid rgba(230,0,126,.22)",
  background: "rgba(255,255,255,.9)",
};
const priceBadgeStyle = {
  width: "fit-content",
  padding: "8px 18px",
  borderRadius: 999,
  border: "1px solid rgba(230,0,126,.28)",
  background: "rgba(255,0,135,.06)",
  color: "#e6007e",
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: 2,
};
const priceSummaryTitleStyle = { margin: 0, color: "#141827", fontSize: 34, fontWeight: 900 };
const priceSummarySubtitleStyle = { margin: "-10px 0 0", color: "#667085", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const priceOverviewStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1.35fr) minmax(330px,.65fr)",
  gap: 34,
  padding: "24px 0 10px",
  borderTop: "1px solid rgba(52,64,84,.10)",
};
const priceOverviewMainStyle = { display: "grid", gap: 14, alignContent: "start" };
const economicMaterialCardStyle = {
  gridColumn: "1 / -1",
  marginTop: 6,
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(230,0,126,.24)",
  background: "linear-gradient(135deg,rgba(255,247,252,.98),rgba(255,255,255,.96))",
  display: "grid",
  gridTemplateColumns: "minmax(190px,.8fr) minmax(360px,1.4fr) minmax(220px,.7fr)",
  alignItems: "center",
  gap: 18,
};
const economicMaterialCardActiveStyle = {
  border: "1px solid rgba(0,166,81,.30)",
  background: "linear-gradient(135deg,rgba(240,253,244,.98),rgba(255,255,255,.96))",
};
const economicMaterialHeaderStyle = { display: "grid", gap: 7 };
const economicMaterialEyebrowStyle = { color: "#e6007e", fontSize: 12, fontWeight: 900, letterSpacing: 1.3 };
const economicMaterialCodeStyle = { color: "#6f32d2", fontSize: 21, fontWeight: 900 };
const economicMaterialMetricsStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14 };
const economicMaterialMetricStyle = { display: "grid", gap: 5, color: "#141827", fontSize: 16, fontWeight: 900 };
const economicMaterialLabelStyle = { color: "#667085", fontSize: 11, fontWeight: 900, letterSpacing: 1 };
const economicMaterialButtonStyle = {
  minHeight: 46,
  padding: "10px 16px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(100deg,#8b2ee8,#e6007e,#ff4b2b)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(230,0,126,.16)",
};
const economicMaterialRestoreButtonStyle = { background: "#fff", color: "#6f32d2", border: "1px solid rgba(111,50,210,.28)", boxShadow: "none" };
const priceInfoRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(250px,.8fr) 1fr",
  alignItems: "center",
  gap: 18,
  color: "#667085",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: 1,
};
const productionOverviewStyle = {
  minWidth: 0,
  borderLeft: "1px solid rgba(111,50,210,.18)",
  paddingLeft: 30,
  display: "grid",
  alignContent: "start",
  gap: 18,
};
const missingProductionStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
  gap: 24,
  alignItems: "center",
  padding: 24,
  borderRadius: 16,
  border: "1px solid rgba(230,128,25,.38)",
  background: "linear-gradient(135deg,rgba(255,247,237,.96),rgba(255,237,213,.72))",
  boxShadow: "0 16px 34px rgba(230,128,25,.08)",
};
const missingProductionReadyStyle = {
  border: "1px solid rgba(0,166,81,.30)",
  background: "linear-gradient(135deg,rgba(240,253,244,.96),rgba(220,252,231,.72))",
};
const missingProductionCopyStyle = { display: "grid", gap: 9 };
const missingProductionEyebrowStyle = { color: "#c45f00", fontSize: 15, fontWeight: 900, letterSpacing: 2 };
const missingProductionTitleStyle = { margin: 0, color: "#141827", fontSize: 23, fontWeight: 900, lineHeight: 1.25 };
const missingProductionTextStyle = { margin: 0, color: "#667085", fontSize: 16, fontWeight: 800, lineHeight: 1.55, letterSpacing: 0.5 };
const manualCapacityFieldStyle = {
  minHeight: 148,
  padding: 18,
  borderRadius: 14,
  border: "1px solid rgba(52,64,84,.14)",
  background: "rgba(255,255,255,.82)",
  display: "grid",
  alignContent: "center",
  gap: 10,
};
const manualCapacityLabelStyle = { color: "#141827", fontSize: 17, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };
const manualCapacityInputRowStyle = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 82px", alignItems: "center", overflow: "hidden", borderRadius: 12, border: "1px solid rgba(230,128,25,.34)", background: "#fff" };
const manualCapacityInputStyle = { width: "100%", height: 58, border: "none", outline: "none", background: "transparent", color: "#141827", fontSize: 26, fontWeight: 900, textAlign: "center" as const };
const manualCapacitySuffixStyle = { height: "100%", display: "grid", placeItems: "center", borderLeft: "1px solid rgba(230,128,25,.22)", color: "#c45f00", fontSize: 18, fontWeight: 900 };
const manualCapacityHelpStyle = { color: "#667085", fontSize: 12, fontWeight: 900, letterSpacing: 1.2, textAlign: "center" as const };
const productionOverviewEyebrowStyle = { color: "#6f32d2", fontSize: 15, fontWeight: 900, letterSpacing: 1.4 };
const productionMetricRowStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 };
const productionMetricLabelStyle = { color: "#667085", fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const productionMetricValueStyle = { fontSize: 23, fontWeight: 900, whiteSpace: "nowrap" as const };
const zeroSetupToggleStyle = {
  width: "fit-content",
  display: "flex",
  alignItems: "center",
  gap: 11,
  color: "#141827",
  fontSize: 17,
  fontWeight: 900,
  letterSpacing: 1,
  cursor: "pointer",
};
const productionToggleRowStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", alignItems: "center", gap: 12 };
const compactProductionToggleStyle = {
  ...zeroSetupToggleStyle,
  width: "100%",
  gap: 7,
  fontSize: 12,
  letterSpacing: 0.4,
  whiteSpace: "nowrap" as const,
};
const zeroSetupCheckboxStyle = { width: 23, height: 23, margin: 0, accentColor: "#e6007e", cursor: "pointer" };
const additionalCostsCheckboxStyle = { ...zeroSetupCheckboxStyle, accentColor: "#6f32d2" };
const configuredSetupNoteStyle = { marginTop: -10, color: "#9b59d0", fontSize: 13, fontWeight: 900, letterSpacing: 1 };
const configuredAdditionalCostsNoteStyle = { ...configuredSetupNoteStyle, color: "#6f32d2" };
const productionDividerStyle = { height: 1, background: "rgba(230,0,126,.12)" };
const productionCapacityOverrideStyle = {
  display: "grid",
  gap: 8,
  padding: "14px 14px 15px",
  borderRadius: 14,
  border: "1px solid rgba(0,135,215,.20)",
  background: "linear-gradient(135deg,rgba(240,249,255,.92),rgba(255,255,255,.96))",
};
const productionCapacityOverrideLabelStyle = {
  color: "#667085",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 1,
};
const productionCapacityOverrideInputRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 64px",
  alignItems: "center",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid rgba(0,135,215,.28)",
  background: "#fff",
};
const productionCapacityOverrideInputStyle = {
  width: "100%",
  height: 44,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#0087d7",
  fontSize: 20,
  fontWeight: 900,
  textAlign: "center" as const,
};
const productionCapacityOverrideSuffixStyle = {
  height: "100%",
  display: "grid",
  placeItems: "center",
  borderLeft: "1px solid rgba(0,135,215,.18)",
  color: "#0087d7",
  fontSize: 13,
  fontWeight: 900,
};
const priceStandardPanelStyle = {
  borderRadius: 20,
  border: "1px solid rgba(0,166,81,.22)",
  background: "rgba(0,166,81,.045)",
  padding: 24,
  display: "grid",
  gap: 22,
};
const priceStandardHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" };
const priceStandardTitleStyle = { color: "#00a651", fontSize: 20, fontWeight: 900, letterSpacing: 1 };
const priceExpensesBadgeStyle = { color: "#00a651", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const priceAnalysisGridStyle = { display: "grid", gridTemplateColumns: "minmax(320px,.82fr) 1fr", gap: 24, alignItems: "stretch" };
const priceHighlightStackStyle = { display: "grid", gap: 14 };
const priceHighlightPinkStyle = {
  minHeight: 92,
  borderRadius: 18,
  border: "1px solid rgba(230,0,126,.28)",
  background: "linear-gradient(135deg,#ffe0ed,#ffd0e3)",
  color: "#be185d",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 8,
  textAlign: "center" as const,
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: 1,
};
const priceHighlightBlueStyle = {
  ...priceHighlightPinkStyle,
  border: "1px solid rgba(0,135,215,.24)",
  background: "linear-gradient(135deg,#e0f2fe,#bae6fd)",
  color: "#0087d7",
};
const priceHighlightLabelStyle = { fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const priceHighlightValueStyle = { fontSize: 34, fontWeight: 900, lineHeight: 1 };
const priceMetricStyle = {
  minHeight: 62,
  borderRadius: 16,
  border: "1px solid rgba(230,0,126,.28)",
  background: "linear-gradient(135deg,#ffe0ed,#ffd0e3)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: "0 22px",
  color: "#be185d",
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: 1,
};
const priceMetricValueStyle = { fontSize: 24, fontWeight: 900 };
const priceDetailsCardStyle = {
  borderRadius: 18,
  border: "1px solid rgba(230,0,126,.24)",
  background: "rgba(255,255,255,.76)",
  padding: "18px 24px",
  display: "grid",
};
const priceDetailStyle = {
  minHeight: 54,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  borderBottom: "1px solid rgba(230,0,126,.12)",
  color: "#141827",
  fontSize: 21,
  fontWeight: 900,
  letterSpacing: 1,
};
const simulatorPanelStyle = {
  borderRadius: 20,
  border: "1px solid rgba(111,50,210,.28)",
  background: "linear-gradient(145deg,rgba(111,50,210,.045),rgba(255,255,255,.94),rgba(230,0,126,.045))",
  padding: 24,
  display: "grid",
  gap: 22,
};
const simulatorHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 18 };
const simulatorHeaderActionsStyle = { display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 8 };
const simulatorEyebrowStyle = { color: "#6f32d2", fontSize: 17, fontWeight: 900, letterSpacing: 2 };
const simulatorTitleStyle = { margin: "7px 0 0", color: "#141827", fontSize: 25, fontWeight: 900 };
const simulatorExpensesStyle = { color: "#e68019", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const pricingActionButtonStyle = { minHeight: 38, padding: "0 14px", border: "1px solid rgba(230,61,174,.28)", borderRadius: 10, color: "#d60078", background: "#fff", fontSize: 11, fontWeight: 900, letterSpacing: .8, cursor: "pointer" };
const pricingSendMessageStyle = { margin: "14px 0", padding: "11px 14px", borderRadius: 10, background: "rgba(0,156,75,.08)", color: "#008f48", fontSize: 13, fontWeight: 900 };
const simulatorGridStyle = { display: "grid", gridTemplateColumns: "1.15fr repeat(3,1fr)", gap: 16 };
const simulatorInputCardStyle = {
  minHeight: 116,
  borderRadius: 17,
  border: "1px solid rgba(230,0,126,.28)",
  background: "linear-gradient(135deg,#ffe2ee,#ffd5e6)",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 10,
  padding: 16,
};
const simulatorInputLabelStyle = { color: "#be185d", fontSize: 19, fontWeight: 900, letterSpacing: 1 };
const simulatorInputRowStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#be185d", fontSize: 22, fontWeight: 900 };
const simulatorInputStyle = {
  width: 128,
  height: 54,
  borderRadius: 12,
  border: "1px solid rgba(111,50,210,.42)",
  background: "#fff",
  color: "#6f32d2",
  outline: "none",
  textAlign: "center" as const,
  fontSize: 28,
  fontWeight: 900,
};
const simulatorResultCardStyle = {
  minHeight: 116,
  borderRadius: 17,
  border: "1px solid rgba(111,50,210,.18)",
  background: "rgba(255,255,255,.86)",
  display: "grid",
  placeItems: "center",
  alignContent: "center",
  gap: 10,
  padding: 16,
  textAlign: "center" as const,
};
const simulatorResultLabelStyle = { color: "#667085", fontSize: 19, fontWeight: 900, letterSpacing: 1 };
const simulatorResultValueStyle = { color: "#6f32d2", fontSize: 28, fontWeight: 900 };
const simulatorToneStyles: Record<SimulatorTone, { border: string; background: string; color: string; boxShadow: string }> = {
  red: {
    border: "1px solid rgba(239,68,68,.34)",
    background: "linear-gradient(145deg,#fff1f2,#fee2e2)",
    color: "#c62828",
    boxShadow: "0 14px 30px rgba(239,68,68,.10)",
  },
  yellow: {
    border: "1px solid rgba(234,179,8,.38)",
    background: "linear-gradient(145deg,#fffdf0,#fef9c3)",
    color: "#a16207",
    boxShadow: "0 14px 30px rgba(234,179,8,.10)",
  },
  green: {
    border: "1px solid rgba(22,163,74,.34)",
    background: "linear-gradient(145deg,#f0fdf4,#dcfce7)",
    color: "#15803d",
    boxShadow: "0 14px 30px rgba(22,163,74,.10)",
  },
};
const inverseSimulatorGridStyle = { display: "grid", gridTemplateColumns: "1.35fr repeat(2,1fr)", gap: 16, alignItems: "stretch" };
const inverseInputCardStyle = {
  ...simulatorInputCardStyle,
  minHeight: 172,
  gridTemplateColumns: "1fr auto",
  columnGap: 18,
};
const inverseResultLabelStyle = { marginTop: 4, color: "#be185d", fontSize: 19, fontWeight: 900, letterSpacing: 1 };
const inverseResultValueStyle = { color: "#be185d", fontSize: 31, fontWeight: 900, lineHeight: 1 };
const simulatorDetailsStyle = {
  borderRadius: 16,
  border: "1px solid rgba(230,0,126,.18)",
  background: "rgba(255,255,255,.72)",
  padding: "10px 20px",
  display: "grid",
  gridTemplateColumns: "repeat(2,1fr)",
  columnGap: 32,
};
const simulatorPendingStyle = {
  minHeight: 76,
  borderRadius: 14,
  border: "1px solid rgba(230,128,25,.28)",
  background: "rgba(255,247,237,.86)",
  color: "#c45f00",
  padding: 18,
  display: "grid",
  placeItems: "center",
  textAlign: "center" as const,
  fontSize: 17,
  fontWeight: 900,
  letterSpacing: 1,
};
const requiredLotStyle = {
  minHeight: 96,
  borderRadius: 16,
  border: "1px solid rgba(230,128,25,.30)",
  background: "linear-gradient(135deg,rgba(255,247,237,.94),rgba(255,237,213,.72))",
  padding: "18px 22px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
};
const requiredLotEyebrowStyle = { color: "#c45f00", fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const requiredLotTextStyle = { margin: "8px 0 0", color: "#667085", fontSize: 15, fontWeight: 900, letterSpacing: 1 };
const requiredLotValueStyle = { color: "#00a651", fontSize: 29, fontWeight: 900, whiteSpace: "nowrap" as const };
const requiredLotNoSetupStyle = { display: "grid", gap: 7, color: "#00a651", textAlign: "right" as const, fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const requiredLotImpossibleStyle = { display: "grid", gap: 7, color: "#dc2626", textAlign: "right" as const, fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const materialStepStyle = { display: "grid", gap: 18 };
const pricingModeStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 10,
  padding: 7,
  marginBottom: 18,
  borderRadius: 18,
  border: "1px solid rgba(111,50,210,.18)",
  background: "#f3f5fa",
};
const pricingModeButtonStyle = {
  minHeight: 52,
  border: "1px solid transparent",
  borderRadius: 14,
  background: "transparent",
  color: "#667085",
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: 1,
  cursor: "pointer",
};
const activePricingModeStyle = {
  background: "linear-gradient(135deg,#8b36e8,#6f32d2)",
  color: "#fff",
  boxShadow: "0 10px 22px rgba(111,50,210,.22)",
};
const engineeringSelectionPanelStyle = {
  display: "grid",
  gap: 22,
  padding: 26,
  borderRadius: 18,
  border: "1px solid rgba(230,0,126,.26)",
  background: "linear-gradient(145deg,rgba(255,0,135,.035),rgba(255,255,255,.82))",
};
const engineeringSelectionTitleStyle = { margin: "8px 0 0", color: "#141827", fontSize: 30, fontWeight: 900 };
const engineeringSelectionGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 18 };
const engineeringSelectionLabelStyle = { display: "grid", gap: 9, color: "#141827", fontSize: 16, fontWeight: 900, letterSpacing: 1 };
const engineeringSelectionInputStyle = {
  minHeight: 56,
  borderRadius: 13,
  border: "1px solid rgba(52,64,84,.18)",
  background: "#fff",
  color: "#141827",
  padding: "0 16px",
  fontSize: 18,
  fontWeight: 800,
  outline: "none",
};
const engineeringFichaSummaryStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3,minmax(0,1fr))",
  gap: 14,
  padding: 18,
  borderRadius: 15,
  border: "1px solid rgba(111,50,210,.18)",
  background: "rgba(255,255,255,.82)",
};
const engineeringFichaSummaryItemStyle = { display: "grid", gap: 6 };
const engineeringSelectionAlertStyle = { padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(220,38,38,.24)", background: "#fff1f2", color: "#c62828", fontSize: 14, fontWeight: 900, letterSpacing: 1 };
const engineeringSelectionActionsStyle = { display: "flex", justifyContent: "flex-end" };
const engineeringContinueButtonStyle = { minHeight: 50, padding: "0 22px", border: 0, borderRadius: 13, background: "linear-gradient(135deg,#8b36e8,#ff3b25)", color: "#fff", fontSize: 16, fontWeight: 900, letterSpacing: 1 };
const selectFieldStyle = { display: "grid", gap: 10 };
const selectLabelStyle = { color: "#141827", fontSize: 17, fontWeight: 900, letterSpacing: 1 };
const selectStyle = {
  width: "100%",
  minHeight: 58,
  borderRadius: 14,
  border: "1px solid rgba(52,64,84,.18)",
  background: "#fff",
  color: "#141827",
  padding: "0 18px",
  fontSize: 20,
  fontWeight: 900,
  outline: "none",
};
const materialHelpStyle = { margin: "-2px 0 8px", color: "#667085", fontSize: 15, fontWeight: 800, letterSpacing: 1 };
const materialSummaryStyle = {
  padding: 20,
  borderRadius: 16,
  border: "1px solid rgba(230,0,126,.28)",
  background: "rgba(255,0,135,.035)",
  display: "grid",
  gap: 18,
};
const materialSummaryTitleStyle = { color: "#e6007e", fontSize: 17, fontWeight: 900, letterSpacing: 2 };
const materialSummaryGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 18, alignItems: "center" };
const materialSummaryGridAlternativeStyle = { gridTemplateColumns: "repeat(6,1fr) 8px 1fr" };
const alternativesListStyle = { display: "grid", gap: 14 };
const alternativeRowStyle = {
  display: "grid",
  gridTemplateColumns: "44px repeat(6,1fr) 8px 1fr",
  gap: 14,
  alignItems: "center",
  padding: "16px 0",
  borderTop: "1px solid rgba(230,0,126,.14)",
};
const alternativeRankStyle = {
  width: 38,
  height: 38,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)",
  color: "#fff",
  fontSize: 18,
  fontWeight: 900,
};
const summaryValueStyle = { display: "grid", gap: 8, alignContent: "center", justifyItems: "center", textAlign: "center" as const };
const summaryLabelStyle = { color: "#667085", fontSize: 16, fontWeight: 900, letterSpacing: 2 };
const summaryStrongStyle = { color: "#141827", fontSize: 24, fontWeight: 900 };
const summarySuffixStyle = { color: "#667085", fontSize: 13, fontWeight: 900, letterSpacing: 1 };
const economyDividerStyle = {
  width: 8,
  minHeight: 76,
  borderRadius: 999,
  background: "linear-gradient(180deg,#8b36e8,#e63dae,#ff3b25)",
  justifySelf: "center",
  boxShadow: "0 10px 22px rgba(230,61,174,.18)",
};

const quoteModalOverlayStyle = {
  position: "fixed" as const,
  inset: 0,
  zIndex: 1000,
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "rgba(20,24,39,.46)",
  backdropFilter: "blur(7px)",
};
const quoteModalCardStyle = {
  position: "relative" as const,
  width: "min(620px,100%)",
  overflow: "hidden",
  borderRadius: 24,
  border: "1px solid rgba(230,61,174,.28)",
  background: "linear-gradient(145deg,#ffffff 0%,#fff8fc 58%,#fff5ee 100%)",
  boxShadow: "0 28px 80px rgba(20,24,39,.30)",
  padding: "42px 40px 36px",
  display: "grid",
  justifyItems: "center",
  textAlign: "center" as const,
};
const quoteModalAccentStyle = {
  position: "absolute" as const,
  inset: "0 0 auto",
  height: 7,
  background: "linear-gradient(90deg,#8b36e8,#e63dae,#ff3b25,#e68019)",
};
const quoteModalSuccessIconStyle = {
  width: 72,
  height: 72,
  borderRadius: 20,
  display: "grid",
  placeItems: "center",
  marginBottom: 22,
  background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)",
  color: "#fff",
  fontSize: 36,
  fontWeight: 900,
  animation: "quote-success-pulse 1.8s ease-in-out infinite",
};
const quoteModalEyebrowStyle = {
  color: "#8b36e8",
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: 2,
};
const quoteModalTitleStyle = {
  margin: "10px 0 0",
  color: "#141827",
  fontSize: 27,
  fontWeight: 900,
  letterSpacing: 0,
};
const quoteModalTextStyle = {
  maxWidth: 470,
  margin: "15px 0 0",
  color: "#667085",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.5,
  letterSpacing: 0,
};
const quoteModalActionsStyle = {
  width: "100%",
  marginTop: 30,
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 13,
};
const quoteModalContinueButtonStyle = {
  minHeight: 56,
  borderRadius: 14,
  border: 0,
  background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)",
  color: "#fff",
  boxShadow: "0 14px 28px rgba(230,61,174,.20)",
  padding: "0 18px",
  fontSize: 15,
  fontWeight: 900,
  letterSpacing: 0,
  cursor: "pointer",
};
const quoteModalFinishButtonStyle = {
  minHeight: 56,
  borderRadius: 14,
  border: "1px solid rgba(111,50,210,.24)",
  background: "#fff",
  color: "#6f32d2",
  padding: "0 18px",
  fontSize: 15,
  fontWeight: 900,
  letterSpacing: 0,
  cursor: "pointer",
};

const placeholderStyle = { minHeight: 430, display: "grid", placeItems: "center", alignContent: "center", gap: 16, borderRadius: 22, border: "1px solid rgba(52,64,84,.12)", background: "rgba(255,255,255,.72)" };
const placeholderIconStyle = { width: 84, height: 84, borderRadius: 22, display: "grid", placeItems: "center", color: "#fff", fontSize: 28, fontWeight: 900 };
const placeholderTitleStyle = { margin: 0, color: "#141827", fontSize: 34, fontWeight: 900 };
const placeholderTextStyle = { maxWidth: 520, margin: 0, color: "#667085", fontSize: 18, fontWeight: 800, textAlign: "center" as const, lineHeight: 1.45 };

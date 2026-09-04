"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import CurrencyInput from "@/components/ui/CurrencyInput";
import BaldussiIntegrationPanel from "@/components/integracoes/BaldussiIntegrationPanel";

import {
  defaultQuoteParametersByCompany,
  defaultPricingParamsByCompany,
  defaultPricingGoalsByCompany,
  defaultPaperCostParams,
  defaultPricingOperationalParams,
  initialEngineeringFormulas,
  initialMaterials,
  initialPaperTypes,
  initialSuppliers,
  reminderFormulas,
} from "@/lib/gerenciador/data";
import { defaultProductionTimes } from "@/lib/gerenciador/impressora-data";
import { initialCfops, initialFiscalBenefits, initialFiscalProfiles, initialLostReasons, initialPaymentConditions, initialTaxRegimes } from "@/lib/gerenciador/general-data";
import { loadClients } from "@/lib/clientes";
import { calculateProductArea, formulaUsesTopOverlap } from "@/lib/gerenciador/product-area";
import { isMaterialAvailableForUse, isSpecialMaterialActive } from "@/lib/gerenciador/materials";
import type { EngineeringFormula, PaperCostParams, PaperType, PricingGoalCompany, PricingGoals, PricingGoalsByCompany, PricingOperationalParams, PricingParams, PricingParamsByCompany, ProductChangeLog, ProductComponent, ProductFicha, ProductPriceSnapshot, ProductionTime, QuoteCompanyKey, QuoteParametersByCompany, SalesGoals, SalesRepresentative, SpecificMaterial, Supplier } from "@/types/gerenciador";
import type { CfopOption, GeneralOption, PaymentCondition } from "@/types/cadastros-gerais";
import type { ClientRecord } from "@/types/clientes";

type Tab = "fornecedores" | "papeis" | "materiais" | "engenharia" | "cores" | "custo" | "parametros" | "metas" | "orcamento" | "integracoes" | "tempos" | "lembretes";
type ManagerSection = "embalagem" | "fornecedores" | "produtos" | "empresa" | "gerais";
type Mode = "create" | "edit";

const tabs: Array<{ key: Tab; label: string; disabled?: boolean }> = [
  { key: "fornecedores", label: "FORNECEDORES" },
  { key: "papeis", label: "TIPOS DE PAPELAO" },
  { key: "materiais", label: "MATERIAIS ESPECIFICOS" },
  { key: "engenharia", label: "ENGENHARIA DA CAIXA" },
  { key: "cores", label: "CORES" },
  { key: "custo", label: "CUSTO DE PAPEL" },
  { key: "parametros", label: "PARAMETROS DE PRECO" },
  { key: "metas", label: "METAS" },
  { key: "orcamento", label: "PARAMETROS DE ORCAMENTO" },
  { key: "integracoes", label: "INTEGRACOES" },
  { key: "tempos", label: "TEMPOS DE PRODUCAO" },
  { key: "lembretes", label: "LEMBRETES & FORMULAS" },
];

const sectionTabs: Record<Exclude<ManagerSection, "gerais">, Tab[]> = {
  embalagem: ["papeis", "materiais", "tempos", "lembretes"],
  fornecedores: ["fornecedores", "custo"],
  produtos: ["engenharia", "cores"],
  empresa: ["parametros", "metas", "orcamento", "integracoes"],
};

const emptySupplier: Supplier = { id: "", name: "" };
const emptyPaper: PaperType = { id: "", code: "", description: "" };
const emptyMaterial: SpecificMaterial = {
  id: "",
  code: "",
  name: "",
  supplier: "",
  paperType: "",
  grammage: "",
  pressure: "",
  costIpi: 0,
  specialCondition: false,
  specialValidUntil: "",
  specialNotes: "",
};
const emptyEngineering: EngineeringFormula = {
  id: "",
  style: "",
  description: "",
  category: "",
  wave: "",
  widthFormula: "",
  lengthFormula: "",
};
type GerenciadorEmpresaProps = {
  companySlug?: string;
  suppliers?: Supplier[];
  paperTypes?: PaperType[];
  materials?: SpecificMaterial[];
  engineeringFormulas?: EngineeringFormula[];
  paperCostParams?: PaperCostParams;
  pricingParams?: PricingParamsByCompany;
  pricingOperationalParams?: PricingOperationalParams;
  pricingGoalsByCompany?: PricingGoalsByCompany;
  quoteParameters?: QuoteParametersByCompany;
  productionTimes?: ProductionTime[];
  paymentConditions?: PaymentCondition[];
  cfops?: CfopOption[];
  taxRegimes?: GeneralOption[];
  fiscalProfiles?: GeneralOption[];
  fiscalBenefits?: GeneralOption[];
  lostReasons?: GeneralOption[];
  salesGoals?: SalesGoals;
  salesRepresentatives?: SalesRepresentative[];
  productFichas?: ProductFicha[];
  productColors?: string[];
  onSuppliersChange?: (suppliers: Supplier[]) => void;
  onPaperTypesChange?: (paperTypes: PaperType[]) => void;
  onMaterialsChange?: (materials: SpecificMaterial[]) => void;
  onEngineeringFormulasChange?: (formulas: EngineeringFormula[]) => void;
  onPaperCostParamsChange?: (params: PaperCostParams) => void;
  onPricingParamsChange?: (params: PricingParamsByCompany) => void;
  onPricingOperationalParamsChange?: (params: PricingOperationalParams) => void;
  onPricingGoalsByCompanyChange?: (goals: PricingGoalsByCompany) => void;
  onQuoteParametersChange?: (params: QuoteParametersByCompany) => void;
  onProductionTimesChange?: (times: ProductionTime[]) => void;
  onPaymentConditionsChange?: (conditions: PaymentCondition[]) => void;
  onCfopsChange?: (cfops: CfopOption[]) => void;
  onTaxRegimesChange?: (items: GeneralOption[]) => void;
  onFiscalProfilesChange?: (items: GeneralOption[]) => void;
  onFiscalBenefitsChange?: (items: GeneralOption[]) => void;
  onLostReasonsChange?: (items: GeneralOption[]) => void;
  onSalesGoalsChange?: (goals: SalesGoals) => void;
  onProductFichasChange?: (items: ProductFicha[]) => void;
  onProductColorsChange?: (items: string[]) => void;
};

export default function GerenciadorEmpresa({
  companySlug,
  suppliers: controlledSuppliers,
  paperTypes: controlledPaperTypes,
  materials: controlledMaterials,
  engineeringFormulas: controlledEngineeringFormulas,
  paperCostParams: controlledPaperCostParams,
  pricingParams: controlledPricingParams,
  pricingOperationalParams: controlledPricingOperationalParams,
  pricingGoalsByCompany: controlledPricingGoalsByCompany,
  quoteParameters: controlledQuoteParameters,
  productionTimes: controlledProductionTimes,
  paymentConditions: controlledPaymentConditions,
  cfops: controlledCfops,
  taxRegimes: controlledTaxRegimes,
  fiscalProfiles: controlledFiscalProfiles,
  fiscalBenefits: controlledFiscalBenefits,
  lostReasons: controlledLostReasons,
  salesGoals: controlledSalesGoals,
  salesRepresentatives = [],
  productFichas: controlledProductFichas,
  productColors: controlledProductColors,
  onSuppliersChange,
  onPaperTypesChange,
  onMaterialsChange,
  onEngineeringFormulasChange,
  onPaperCostParamsChange,
  onPricingParamsChange,
  onPricingOperationalParamsChange,
  onPricingGoalsByCompanyChange,
  onQuoteParametersChange,
  onProductionTimesChange,
  onPaymentConditionsChange,
  onCfopsChange,
  onTaxRegimesChange,
  onFiscalProfilesChange,
  onFiscalBenefitsChange,
  onLostReasonsChange,
  onSalesGoalsChange,
  onProductFichasChange,
  onProductColorsChange,
}: GerenciadorEmpresaProps = {}) {
  const [activeTab, setActiveTab] = useState<Tab>("papeis");
  const [managerSection, setManagerSection] = useState<ManagerSection>("embalagem");
  const [localProductFichas, setLocalProductFichas] = useState<ProductFicha[]>(controlledProductFichas ?? []);
  const [localProductColors, setLocalProductColors] = useState<string[]>(controlledProductColors ?? ["BRANCO", "PRETO", "VERMELHO", "AZUL", "AMARELO"]);
  const [localSuppliers, setLocalSuppliers] = useState(initialSuppliers);
  const [localPaperTypes, setLocalPaperTypes] = useState(initialPaperTypes);
  const [localMaterials, setLocalMaterials] = useState(initialMaterials);
  const [localEngineeringFormulas, setLocalEngineeringFormulas] = useState(initialEngineeringFormulas);
  const [localPaperCostParams, setLocalPaperCostParams] = useState(defaultPaperCostParams);
  const [localPricingParams, setLocalPricingParams] = useState(defaultPricingParamsByCompany);
  const [localPricingOperationalParams, setLocalPricingOperationalParams] = useState(defaultPricingOperationalParams);
  const [localPricingGoalsByCompany, setLocalPricingGoalsByCompany] = useState(defaultPricingGoalsByCompany);
  const [localQuoteParameters, setLocalQuoteParameters] = useState(defaultQuoteParametersByCompany);
  const [localProductionTimes, setLocalProductionTimes] = useState(defaultProductionTimes);
  const [localPaymentConditions, setLocalPaymentConditions] = useState(initialPaymentConditions);
  const [localCfops, setLocalCfops] = useState(initialCfops);
  const [localTaxRegimes, setLocalTaxRegimes] = useState(initialTaxRegimes);
  const [localFiscalProfiles, setLocalFiscalProfiles] = useState(initialFiscalProfiles);
  const [localFiscalBenefits, setLocalFiscalBenefits] = useState(initialFiscalBenefits);
  const [localLostReasons, setLocalLostReasons] = useState(initialLostReasons);
  const [localSalesGoals, setLocalSalesGoals] = useState<SalesGoals>({ byRepresentative: {} });
  const [productionFilter, setProductionFilter] = useState("");
  const [materialSupplierFilter, setMaterialSupplierFilter] = useState("ALL");
  const [form, setForm] = useState<null | { type: Tab; mode: Mode; id?: string }>(null);
  const [supplierDraft, setSupplierDraft] = useState(emptySupplier);
  const [paperDraft, setPaperDraft] = useState(emptyPaper);
  const [materialDraft, setMaterialDraft] = useState(emptyMaterial);
  const [engineeringDraft, setEngineeringDraft] = useState(emptyEngineering);

  const suppliers = controlledSuppliers ?? localSuppliers;
  const paperTypes = controlledPaperTypes ?? localPaperTypes;
  const materials = controlledMaterials ?? localMaterials;
  const engineeringFormulas = controlledEngineeringFormulas ?? localEngineeringFormulas;
  const productFichas = controlledProductFichas ?? localProductFichas;
  const productColors = controlledProductColors ?? localProductColors;
  const paperCostParams = controlledPaperCostParams ?? localPaperCostParams;
  const pricingParams = controlledPricingParams ?? localPricingParams;
  const pricingOperationalParams = controlledPricingOperationalParams ?? localPricingOperationalParams;
  const pricingGoalsByCompany = controlledPricingGoalsByCompany ?? localPricingGoalsByCompany;
  const quoteParameters = controlledQuoteParameters ?? localQuoteParameters;
  const productionTimes = controlledProductionTimes ?? localProductionTimes;
  const paymentConditions = controlledPaymentConditions ?? localPaymentConditions;
  const cfops = controlledCfops ?? localCfops;
  const taxRegimes = controlledTaxRegimes ?? localTaxRegimes;
  const fiscalProfiles = controlledFiscalProfiles ?? localFiscalProfiles;
  const fiscalBenefits = controlledFiscalBenefits ?? localFiscalBenefits;
  const lostReasons = controlledLostReasons ?? localLostReasons;
  const salesGoals = controlledSalesGoals ?? localSalesGoals;
  const setSuppliers = onSuppliersChange ?? setLocalSuppliers;
  const setPaperTypes = onPaperTypesChange ?? setLocalPaperTypes;
  const setMaterials = onMaterialsChange ?? setLocalMaterials;
  const setEngineeringFormulas = onEngineeringFormulasChange ?? setLocalEngineeringFormulas;
  const setPaperCostParams = onPaperCostParamsChange ?? setLocalPaperCostParams;
  const setPricingParams = onPricingParamsChange ?? setLocalPricingParams;
  const setPricingOperationalParams = onPricingOperationalParamsChange ?? setLocalPricingOperationalParams;
  const setPricingGoalsByCompany = onPricingGoalsByCompanyChange ?? setLocalPricingGoalsByCompany;
  const setQuoteParameters = onQuoteParametersChange ?? setLocalQuoteParameters;
  const setProductionTimes = onProductionTimesChange ?? setLocalProductionTimes;
  const setPaymentConditions = onPaymentConditionsChange ?? setLocalPaymentConditions;
  const setCfops = onCfopsChange ?? setLocalCfops;
  const setTaxRegimes = onTaxRegimesChange ?? setLocalTaxRegimes;
  const setFiscalProfiles = onFiscalProfilesChange ?? setLocalFiscalProfiles;
  const setFiscalBenefits = onFiscalBenefitsChange ?? setLocalFiscalBenefits;
  const setLostReasons = onLostReasonsChange ?? setLocalLostReasons;
  const setSalesGoals = onSalesGoalsChange ?? setLocalSalesGoals;

  const activeTitle = useMemo(() => {
    if (activeTab === "fornecedores") return "GERENCIADOR DE FORNECEDORES";
    if (activeTab === "papeis") return "GERENCIADOR DE TIPOS DE PAPELAO";
    if (activeTab === "materiais") return "BANCO DE MATERIAIS ESPECIFICOS";
    if (activeTab === "engenharia") return "ENGENHARIA DE FORMULAS DE CAIXAS";
    if (activeTab === "cores") return "CADASTRO DE CORES";
    if (activeTab === "custo") return "CUSTO DE PAPEL";
    if (activeTab === "parametros") return "PARAMETROS DE PRECIFICACAO";
    if (activeTab === "metas") return "METAS DE DESEMPENHO COMERCIAL";
    if (activeTab === "orcamento") return "PARAMETROS DE ORCAMENTO";
    if (activeTab === "integracoes") return "INTEGRACOES DA EMPRESA";
    if (activeTab === "tempos") return "TABELA DE TEMPOS DE PRODUCAO";
    return "LEMBRETES & FORMULAS";
  }, [activeTab]);

  const materialsBySupplier = useMemo(() => {
    return materials.filter((material) => !material.specialCondition).reduce<Record<string, SpecificMaterial[]>>((groups, material) => {
      const supplier = material.supplier || "SEM FORNECEDOR";
      groups[supplier] = groups[supplier] ? [...groups[supplier], material] : [material];
      return groups;
    }, {});
  }, [materials]);
  const specialMaterialsBySupplier = useMemo(() => {
    return materials.filter((material) => material.specialCondition).reduce<Record<string, SpecificMaterial[]>>((groups, material) => {
      const supplier = material.supplier || "SEM FORNECEDOR";
      groups[supplier] = groups[supplier] ? [...groups[supplier], material] : [material];
      return groups;
    }, {});
  }, [materials]);
  const materialSuppliers = useMemo(() => Array.from(new Set(materials.map((material) => material.supplier || "SEM FORNECEDOR"))).sort((a, b) => a.localeCompare(b, "pt-BR")), [materials]);
  const filteredMaterials = useMemo(
    () => materialSupplierFilter === "ALL" ? materials : materials.filter((material) => (material.supplier || "SEM FORNECEDOR") === materialSupplierFilter),
    [materialSupplierFilter, materials]
  );

  const filteredProductionTimes = useMemo(() => {
    const term = productionFilter.trim().toUpperCase();
    if (!term) return productionTimes;
    return productionTimes.filter((time) => `${time.paperType} ${time.materialCode}`.includes(term));
  }, [productionFilter, productionTimes]);

  const managerSwitcher = (
    <nav style={managerSwitcherStyle} aria-label="AREAS DO GERENCIADOR">
      {([
        ["embalagem", "CONFIGURACOES DAS EMBALAGENS", "papeis"],
        ["fornecedores", "CONFIGURACOES DOS FORNECEDORES", "fornecedores"],
        ["produtos", "CADASTROS DE PRODUTOS", "engenharia"],
        ["empresa", "CONFIGURACOES DA EMPRESA", "parametros"],
        ["gerais", "CADASTROS GERAIS", "papeis"],
      ] as Array<[ManagerSection, string, Tab]>).map(([section, label, tab]) => (
        <button
          key={section}
          type="button"
          onClick={() => {
            setManagerSection(section);
            if (section !== "gerais") setActiveTab(tab);
          }}
          style={{ ...managerSwitchButtonStyle, ...(managerSection === section ? activeManagerSwitchStyle : {}) }}
        >
          {label}
        </button>
      ))}
    </nav>
  );

  if (managerSection === "gerais") {
    return (
      <main style={pageStyle}>
        <section style={shellStyle}>
          {managerSwitcher}
          <div style={introStyle}>
            <h2 style={sectionTitleStyle}>CADASTROS GERAIS</h2>
            <p style={sectionSubtitleStyle}>OPCOES COMPARTILHADAS USADAS NO CADASTRO DE CLIENTES.</p>
          </div>
          <GeneralRegistriesPanel
            companySlug={companySlug}
            paymentConditions={paymentConditions}
            cfops={cfops}
            taxRegimes={taxRegimes}
            fiscalProfiles={fiscalProfiles}
            fiscalBenefits={fiscalBenefits}
            lostReasons={lostReasons}
            onPaymentConditionsChange={setPaymentConditions}
            onCfopsChange={setCfops}
            onTaxRegimesChange={setTaxRegimes}
            onFiscalProfilesChange={setFiscalProfiles}
            onFiscalBenefitsChange={setFiscalBenefits}
            onLostReasonsChange={setLostReasons}
          />
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        {managerSwitcher}
        <div style={introStyle}>
          <h2 style={sectionTitleStyle}>
            {managerSection === "embalagem" && "CONFIGURACOES DAS EMBALAGENS"}
            {managerSection === "fornecedores" && "CONFIGURACOES DOS FORNECEDORES"}
            {managerSection === "produtos" && "CADASTROS DE PRODUTOS"}
            {managerSection === "empresa" && "CONFIGURACOES DA EMPRESA"}
          </h2>
          <p style={sectionSubtitleStyle}>
            {managerSection === "embalagem" && "TIPOS DE PAPELAO, MATERIAIS, TEMPOS E FORMULAS DE APOIO."}
            {managerSection === "fornecedores" && "FORNECEDORES E CUSTOS DE COMPRA DO PAPELAO."}
            {managerSection === "produtos" && "ENGENHARIAS E FORMULAS USADAS NOS PRODUTOS."}
            {managerSection === "empresa" && "PARAMETROS DE PRECO, METAS E DADOS DOS ORCAMENTOS."}
          </p>
        </div>

        <nav style={tabsStyle}>
          {tabs.filter((tab) => sectionTabs[managerSection as Exclude<ManagerSection, "gerais">]?.includes(tab.key)).map((tab) => (
            <button
              key={tab.key}
              type="button"
              disabled={tab.disabled}
              onClick={() => {
                if (!tab.disabled) {
                  setActiveTab(tab.key as Tab);
                  setForm(null);
                }
              }}
              style={{
                ...tabButtonStyle,
                ...(activeTab === tab.key ? activeTabButtonStyle : {}),
                opacity: tab.disabled ? 0.62 : 1,
                cursor: tab.disabled ? "default" : "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {form?.type === "fornecedores" && (
          <FormPanel title={form.mode === "create" ? "CADASTRAR NOVO FORNECEDOR" : "EDITAR FORNECEDOR"}>
            <label style={wideLabelStyle}>
              NOME DO FORNECEDOR
              <input
                value={supplierDraft.name}
                onChange={(event) => setSupplierDraft({ ...supplierDraft, name: event.target.value })}
                placeholder="EX: TROMBINI"
                style={inputStyle}
              />
            </label>
            <Actions onCancel={() => setForm(null)} onSave={saveSupplier} />
          </FormPanel>
        )}

        {form?.type === "papeis" && (
          <FormPanel title={form.mode === "create" ? "CADASTRAR NOVO TIPO DE PAPELAO" : "EDITAR TIPO DE PAPELAO"}>
            <div style={twoColumnsStyle}>
              <label style={wideLabelStyle}>
                CODIGO / SIGLA
                <input
                  value={paperDraft.code}
                  onChange={(event) => setPaperDraft({ ...paperDraft, code: event.target.value })}
                  placeholder="EX: OSRR-B"
                  style={inputStyle}
                />
              </label>
              <label style={wideLabelStyle}>
                DESCRICAO
                <input
                  value={paperDraft.description}
                  onChange={(event) => setPaperDraft({ ...paperDraft, description: event.target.value })}
                  placeholder="EX: ONDA SIMPLES - RECICLADO"
                  style={inputStyle}
                />
              </label>
            </div>
            <Actions onCancel={() => setForm(null)} onSave={savePaper} />
          </FormPanel>
        )}

        {form?.type === "materiais" && (
          <FormPanel title={form.mode === "create" ? "CADASTRAR NOVO MATERIAL ESPECIFICO" : "EDITAR MATERIAL ESPECIFICO"}>
            <div style={twoColumnsStyle}>
              <TextField label="CODIGO DO MATERIAL" value={materialDraft.code} onChange={(code) => setMaterialDraft({ ...materialDraft, code })} placeholder="EX: MAT-OSRR-B-TR" />
              <TextField label="NOME ESPECIFICACAO" value={materialDraft.name} onChange={(name) => setMaterialDraft({ ...materialDraft, name })} placeholder="EX: OSRR-B RECICLADO STANDARD 280G" />
              <SelectField label="FORNECEDOR" value={materialDraft.supplier} onChange={(supplier) => setMaterialDraft({ ...materialDraft, supplier })} options={suppliers.map((supplier) => supplier.name)} placeholder="SELECIONE O FORNECEDOR" />
              <SelectField label="TIPO DE PAPELAO" value={materialDraft.paperType} onChange={(paperType) => setMaterialDraft({ ...materialDraft, paperType })} options={paperTypes.map((paper) => paper.code)} placeholder="SELECIONE O TIPO DE PAPELAO" />
              <TextField label="GRAMATURA (KG/M2)" value={materialDraft.grammage} onChange={(grammage) => setMaterialDraft({ ...materialDraft, grammage })} placeholder="0,630 KG/M2" />
              <TextField label="COLUNA / RES. PRESSAO (KG/COL)" value={materialDraft.pressure} onChange={(pressure) => setMaterialDraft({ ...materialDraft, pressure })} placeholder="8,00 KG/COL" />
            </div>
            <label style={wideLabelStyle}>
              CUSTO BASE (M2) (PRECO COM IPI)
              <CurrencyInput value={materialDraft.costIpi || ""} onValueChange={(costIpi) => setMaterialDraft({ ...materialDraft, costIpi: costIpi || 0 })} style={inputStyle} />
            </label>
            <label style={specialConditionToggleStyle}>
              <input type="checkbox" checked={Boolean(materialDraft.specialCondition)} onChange={(event) => setMaterialDraft({ ...materialDraft, specialCondition: event.target.checked, specialValidUntil: event.target.checked ? materialDraft.specialValidUntil : "", specialNotes: event.target.checked ? materialDraft.specialNotes : "" })} />
              <span>CONDICAO ESPECIAL DE PRECO</span>
            </label>
            {materialDraft.specialCondition ? (
              <div style={twoColumnsStyle}>
                <label style={wideLabelStyle}>VALIDADE DA CONDICAO<input type="date" value={materialDraft.specialValidUntil || ""} onChange={(event) => setMaterialDraft({ ...materialDraft, specialValidUntil: event.target.value })} style={inputStyle} /></label>
                <label style={wideLabelStyle}>OBSERVACAO<input value={materialDraft.specialNotes || ""} onChange={(event) => setMaterialDraft({ ...materialDraft, specialNotes: event.target.value })} placeholder="EX: NEGOCIACAO COM FORNECEDOR" style={inputStyle} /></label>
              </div>
            ) : null}
            <Actions onCancel={() => setForm(null)} onSave={saveMaterial} />
          </FormPanel>
        )}

        {form?.type === "engenharia" && (
          <FormPanel title={form.mode === "create" ? "CADASTRAR NOVA FORMULA" : "EDITAR FORMULA"}>
            <div style={twoColumnsStyle}>
              <TextField label="ESTILO" value={engineeringDraft.style} onChange={(style) => setEngineeringDraft({ ...engineeringDraft, style })} placeholder="EX: MN-B" />
              <TextField label="DESCRICAO" value={engineeringDraft.description} onChange={(description) => setEngineeringDraft({ ...engineeringDraft, description })} placeholder="EX: MALETA NORMAL - B" />
              <TextField label="CATEGORIA" value={engineeringDraft.category} onChange={(category) => setEngineeringDraft({ ...engineeringDraft, category })} placeholder="EX: MALETA" />
              <TextField label="ONDA" value={engineeringDraft.wave} onChange={(wave) => setEngineeringDraft({ ...engineeringDraft, wave })} placeholder="EX: B / BC" />
              <TextField label="FORMULA LARGURA" value={engineeringDraft.widthFormula} onChange={(widthFormula) => setEngineeringDraft({ ...engineeringDraft, widthFormula })} placeholder="EX: (L/2)+3 + A+6 + (L/2)+3" />
              <TextField label="FORMULA COMPRIMENTO" value={engineeringDraft.lengthFormula} onChange={(lengthFormula) => setEngineeringDraft({ ...engineeringDraft, lengthFormula })} placeholder="EX: C+3 + L+3 + C+3 + L+3 + 30" />
            </div>
            <Actions onCancel={() => setForm(null)} onSave={saveEngineering} />
          </FormPanel>
        )}

        <Panel
          title={activeTitle}
          description={
            activeTab === "fornecedores"
              ? "CADASTRO DE FORNECEDORES ATIVOS PARA O SUPRIMENTO DE PAPELAO."
              : activeTab === "papeis"
                ? "CADASTRO DE FAMILIAS E CLASSIFICACOES DE ONDAS/PAPEIS."
                : activeTab === "materiais"
                  ? "CADASTRO DETALHADO DE INSUMOS POR FORNECEDOR, INTERLIGANDO A PRECIFICACAO DA FABRICA."
                  : activeTab === "engenharia"
                    ? "CONFIGURE AS FORMULAS MATEMATICAS DE CHAPA PARA CADA ESTILO E TIPO DE ONDA."
                    : activeTab === "custo"
                      ? "TABELA CALCULADA AUTOMATICAMENTE A PARTIR DOS PRECOS DE COMPRA CADASTRADOS."
                      : activeTab === "parametros"
                        ? "CONFIGURE OS PERCENTUAIS USADOS NA FORMACAO DE PRECO."
                        : activeTab === "metas"
                          ? "DEFINA AS FAIXAS DE DESEMPENHO EXIBIDAS NOS SIMULADORES DE PRECO."
                        : activeTab === "orcamento"
                          ? "CADASTRE AS INFORMACOES, LOGOS E OBSERVACOES EXIBIDAS NOS ORCAMENTOS."
                        : activeTab === "tempos"
                          ? "TABELA COMPLETA DE TEMPOS DE IMPRESSAO POR TIPO DE PAPELAO, MATERIAL ESPECIFICO E FAIXAS DE PESO."
                          : "CONSULTE AS REGRAS, VARIAVEIS E OBSERVACOES USADAS PELO SISTEMA."
          }
          actionLabel={
            activeTab === "fornecedores"
              ? "+ NOVO FORNECEDOR"
              : activeTab === "papeis"
                ? "+ NOVO TIPO DE PAPELAO"
                : activeTab === "materiais"
                  ? "+ NOVO MATERIAL"
                  : activeTab === "engenharia"
                    ? "+ NOVA FORMULA"
                    : undefined
          }
          onAction={openCreate}
        >
          {activeTab === "fornecedores" && (
            <Table headers={["NOME DO FORNECEDOR", "ACOES"]}>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td style={supplierNameCellStyle}>{supplier.name}</td>
                  <td style={supplierActionCellStyle}>
                    <EditButton onClick={() => openSupplierEdit(supplier)} />
                    <DeleteButton onClick={() => setSuppliers(suppliers.filter((item) => item.id !== supplier.id))} />
                  </td>
                </tr>
              ))}
            </Table>
          )}

          {activeTab === "papeis" && (
            <Table headers={["CODIGO / SIGLA", "DESCRICAO", "ACOES"]}>
              {paperTypes.map((paper) => (
                <tr key={paper.id}>
                  <td style={strongCellStyle}>{paper.code}</td>
                  <td style={centerCellStyle}>{paper.description}</td>
                  <td style={actionCellStyle}>
                    <EditButton onClick={() => openPaperEdit(paper)} />
                    <DeleteButton onClick={() => setPaperTypes(paperTypes.filter((item) => item.id !== paper.id))} />
                  </td>
                </tr>
              ))}
            </Table>
          )}

          {activeTab === "materiais" && (
            <>
              <div style={materialFilterToolbarStyle}>
                <label style={materialFilterLabelStyle}>FORNECEDOR
                  <select value={materialSupplierFilter} onChange={(event) => setMaterialSupplierFilter(event.target.value)} style={materialFilterSelectStyle}>
                    <option value="ALL">TODOS OS FORNECEDORES</option>
                    {materialSuppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                  </select>
                </label>
                <span style={materialFilterResultStyle}>{filteredMaterials.length} MATERIAL(IS)</span>
              </div>
              <Table headers={["CODIGO", "MATERIAL", "TIPO", "FORNECEDOR", "GRAMATURA", "RES. PRESSAO", "PRECO C/ IPI", "CONDICAO", "ACOES"]}>
              {filteredMaterials.map((material) => (
                <tr key={material.id} style={material.specialCondition ? specialMaterialRowStyle : undefined}>
                  <td style={strongCellStyle}>{material.code}</td>
                  <td style={centerCellStyle}>{material.name}</td>
                  <td style={centerCellStyle}><span style={tagStyle}>{material.paperType}</span></td>
                  <td style={centerCellStyle}>{material.supplier}</td>
                  <td style={centerCellStyle}>{material.grammage}</td>
                  <td style={centerCellStyle}>{material.pressure}</td>
                  <td style={priceCellStyle}>
                    {material.costIpi.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    <small style={priceHintStyle}>PRECO C/ IPI</small>
                  </td>
                  <td style={centerCellStyle}>
                    {material.specialCondition ? <span style={specialMaterialTagStyle}>{isSpecialMaterialActive(material) ? `ESPECIAL ATE ${displayDate(material.specialValidUntil || "")}` : "ESPECIAL VENCIDA"}</span> : "PADRAO"}
                  </td>
                  <td style={actionCellStyle}>
                    <EditButton onClick={() => openMaterialEdit(material)} />
                    <DeleteButton onClick={() => setMaterials(materials.filter((item) => item.id !== material.id))} />
                  </td>
                </tr>
              ))}
              </Table>
            </>
          )}

          {activeTab === "engenharia" && (
            <Table headers={["ESTILO", "DESCRICAO", "CATEGORIA", "ONDA", "FORMULA LARGURA", "FORMULA COMPRIMENTO", "ACOES"]}>
              {engineeringFormulas.map((formula) => (
                <tr key={formula.id}>
                  <td style={strongCellStyle}>{formula.style}</td>
                  <td style={centerCellStyle}>{formula.description}</td>
                  <td style={centerCellStyle}>{formula.category}</td>
                  <td style={centerCellStyle}><span style={tagStyle}>{formula.wave}</span></td>
                  <td style={formulaCellStyle}>{formula.widthFormula}</td>
                  <td style={formulaCellStyle}>{formula.lengthFormula}</td>
                  <td style={actionCellStyle}>
                    <EditButton onClick={() => openEngineeringEdit(formula)} />
                    <DeleteButton onClick={() => setEngineeringFormulas(engineeringFormulas.filter((item) => item.id !== formula.id))} />
                  </td>
                </tr>
              ))}
            </Table>
          )}

          {activeTab === "cores" && (
            <ProductColorsPanel colors={productColors} onChange={setProductColors} />
          )}

          {activeTab === "custo" && (
            <>
              <div style={costControlsStyle}>
                <NumberField label="IPI (%)" value={paperCostParams.ipi} onChange={(ipi) => setPaperCostParams({ ...paperCostParams, ipi })} />
                <NumberField label="ICMS (%)" value={paperCostParams.icms} onChange={(icms) => setPaperCostParams({ ...paperCostParams, icms })} />
                <NumberField label="PIS/COFINS (%)" value={paperCostParams.pisCofins} onChange={(pisCofins) => setPaperCostParams({ ...paperCostParams, pisCofins })} />
                <button type="button" onClick={() => setPaperCostParams({ ...paperCostParams })} style={orangeButtonStyle}>RECALCULAR</button>
              </div>
              <Table headers={["CODIGO", "FORNECEDOR", "PRECO C/ IPI", "COMPRA S/ IPI", "COMPRA NO L/P", "PIS/COFINS (R$)", "COMPRA NO REAL", "R$/KG S/ IPI", "CUSTO S/ NOTA"]}>
                {Object.entries(materialsBySupplier).map(([supplier, items]) => (
                  <Fragment key={supplier}>
                    <tr key={`${supplier}-grupo`}>
                      <td colSpan={9} style={groupCellStyle}>{supplier}</td>
                    </tr>
                    {items.map((material) => {
                      const cost = calculatePaperCost(material, paperCostParams);
                      return (
                        <tr key={material.id}>
                          <td style={strongCellStyle}>{material.code}</td>
                          <td style={centerCellStyle}>{material.supplier}</td>
                          <td style={moneyCellStyle}>
                            <CurrencyInput
                              value={material.costIpi || ""}
                              onValueChange={(costIpi) => updateMaterialCost(material.id, costIpi || 0)}
                              style={costPriceInputStyle}
                            />
                          </td>
                          <td style={moneyCellStyle}>{formatMoney(cost.purchaseWithoutIpi)}</td>
                          <td style={moneyCellStyle}>{formatMoney(cost.purchaseLp)}</td>
                          <td style={moneyCellStyle}>{formatMoney(cost.pisCofinsValue)}</td>
                          <td style={moneyCellStyle}>{formatMoney(cost.realPurchase)}</td>
                          <td style={moneyCellStyle}>{formatMoney(cost.kgWithoutIpi)}</td>
                          <td style={moneyCellStyle}>{formatMoney(cost.costWithoutInvoice)}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </Table>
              {Object.keys(specialMaterialsBySupplier).length ? (
                <section style={specialCostSectionStyle}>
                  <h3 style={specialCostTitleStyle}>CONDICOES ESPECIAIS</h3>
                  <Table headers={["CODIGO", "FORNECEDOR", "PRECO C/ IPI", "VALIDADE", "STATUS", "COMPRA S/ IPI", "COMPRA NO REAL", "CUSTO S/ NOTA"]}>
                    {Object.entries(specialMaterialsBySupplier).map(([supplier, items]) => (
                      <Fragment key={`${supplier}-especial`}>
                        <tr key={`${supplier}-especial-grupo`}>
                          <td colSpan={8} style={specialGroupCellStyle}>{supplier}</td>
                        </tr>
                        {items.map((material) => {
                          const cost = calculatePaperCost(material, paperCostParams);
                          const active = isSpecialMaterialActive(material);
                          return (
                            <tr key={material.id} style={active ? specialMaterialRowStyle : expiredSpecialMaterialRowStyle}>
                              <td style={strongCellStyle}>{material.code}</td>
                              <td style={centerCellStyle}>{material.supplier}</td>
                              <td style={moneyCellStyle}><CurrencyInput value={material.costIpi || ""} onValueChange={(costIpi) => updateMaterialCost(material.id, costIpi || 0)} style={costPriceInputStyle} /></td>
                              <td style={centerCellStyle}>{displayDate(material.specialValidUntil || "")}</td>
                              <td style={centerCellStyle}><span style={active ? specialMaterialTagStyle : expiredSpecialMaterialTagStyle}>{active ? "ATIVA" : "VENCIDA"}</span></td>
                              <td style={moneyCellStyle}>{formatMoney(cost.purchaseWithoutIpi)}</td>
                              <td style={moneyCellStyle}>{formatMoney(cost.realPurchase)}</td>
                              <td style={moneyCellStyle}>{formatMoney(cost.costWithoutInvoice)}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </Table>
                </section>
              ) : null}
            </>
          )}

          {activeTab === "parametros" && (
            <PricingParamsPanel
              params={pricingParams}
              operationalParams={pricingOperationalParams}
              onChange={setPricingParams}
              onOperationalParamsChange={setPricingOperationalParams}
            />
          )}

          {activeTab === "metas" && (
            <PricingGoalsPanel goalsByCompany={pricingGoalsByCompany} onChange={setPricingGoalsByCompany} salesGoals={salesGoals} salesRepresentatives={salesRepresentatives} onSalesGoalsChange={setSalesGoals} />
          )}

          {activeTab === "orcamento" && (
            <QuoteParametersPanel values={quoteParameters} onChange={setQuoteParameters} />
          )}

          {activeTab === "integracoes" && (
            <BaldussiIntegrationPanel companySlug={companySlug} />
          )}

          {activeTab === "tempos" && (
            <>
              <div style={timeToolbarStyle}>
                <input
                  value={productionFilter}
                  onChange={(event) => setProductionFilter(event.target.value)}
                  placeholder="FILTRAR POR PAPEL / MATERIAL"
                  style={filterInputStyle}
                />
                <button type="button" onClick={() => setProductionTimes(defaultProductionTimes)} style={cancelButtonStyle}>RESTAURAR PADRAO</button>
                <button
                  type="button"
                  onClick={() => setProductionTimes([...productionTimes])}
                  style={orangeButtonStyle}
                >
                  SALVAR ALTERACOES
                </button>
              </div>
              <Table headers={["SETOR", "TIPO DE PAPELAO", "MATERIAL / CODIGO", "PESO MIN (KG)", "PESO MAX (KG)", "SET-UP (MINUTOS)", "PRODUCAO (CAIXAS/HORA)"]}>
                {filteredProductionTimes.map((time) => (
                  <tr key={time.id}>
                    <td style={pinkCellStyle}>{time.sector}</td>
                    <td style={blueCellStyle}>{time.paperType}</td>
                    <td style={greenCellStyle}>{time.materialCode}</td>
                    <td style={centerCellStyle}>{formatWeight(time.minWeight)}</td>
                    <td style={centerCellStyle}>{formatWeight(time.maxWeight)}</td>
                    <td style={centerCellStyle}>
                      <input
                        type="number"
                        step="0.01"
                        value={time.setupMinutes}
                        onChange={(event) => updateProductionTime(time.id, "setupMinutes", Number(event.target.value) || 0)}
                        style={timeInputStyle}
                      />
                    </td>
                    <td style={centerCellStyle}>
                      <input
                        type="number"
                        step="1"
                        value={time.boxesPerHour}
                        onChange={(event) => updateProductionTime(time.id, "boxesPerHour", Number(event.target.value) || 0)}
                        style={timeInputGreenStyle}
                      />
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}

          {activeTab === "lembretes" && (
            <div style={remindersGridStyle}>
              {reminderFormulas.map((section) => (
                <article key={section.id} style={reminderCardStyle}>
                  <h4 style={reminderTitleStyle}>{section.title}</h4>
                  <p style={panelTextStyle}>{section.description}</p>
                  <ul style={reminderListStyle}>
                    {section.items.map((item) => (
                      <li key={item} style={reminderItemStyle}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </main>
  );

  function openCreate() {
    if (activeTab === "fornecedores") {
      setSupplierDraft(emptySupplier);
      setForm({ type: "fornecedores", mode: "create" });
    }
    if (activeTab === "papeis") {
      setPaperDraft(emptyPaper);
      setForm({ type: "papeis", mode: "create" });
    }
    if (activeTab === "materiais") {
      setMaterialDraft(emptyMaterial);
      setForm({ type: "materiais", mode: "create" });
    }
    if (activeTab === "engenharia") {
      setEngineeringDraft(emptyEngineering);
      setForm({ type: "engenharia", mode: "create" });
    }
  }

  function openSupplierEdit(supplier: Supplier) {
    setSupplierDraft(supplier);
    setForm({ type: "fornecedores", mode: "edit", id: supplier.id });
  }

  function openPaperEdit(paper: PaperType) {
    setPaperDraft(paper);
    setForm({ type: "papeis", mode: "edit", id: paper.id });
  }

  function openMaterialEdit(material: SpecificMaterial) {
    setMaterialDraft(material);
    setForm({ type: "materiais", mode: "edit", id: material.id });
  }

  function openEngineeringEdit(formula: EngineeringFormula) {
    setEngineeringDraft(formula);
    setForm({ type: "engenharia", mode: "edit", id: formula.id });
  }

  function saveSupplier() {
    const name = supplierDraft.name.trim().toUpperCase();
    if (!name) return;
    const next = { id: form?.id ?? crypto.randomUUID(), name };
    setSuppliers(form?.mode === "edit" ? suppliers.map((item) => (item.id === form.id ? next : item)) : [...suppliers, next]);
    setForm(null);
  }

  function savePaper() {
    const code = paperDraft.code.trim().toUpperCase();
    const description = paperDraft.description.trim().toUpperCase();
    if (!code || !description) return;
    const next = { id: form?.id ?? crypto.randomUUID(), code, description };
    setPaperTypes(form?.mode === "edit" ? paperTypes.map((item) => (item.id === form.id ? next : item)) : [...paperTypes, next]);
    setForm(null);
  }

  function saveMaterial() {
    const code = materialDraft.code.trim().toUpperCase();
    if (!code) return;
    if (materialDraft.specialCondition && !materialDraft.specialValidUntil) {
      window.alert("INFORME A VALIDADE DA CONDICAO ESPECIAL.");
      return;
    }
    const next = {
      ...materialDraft,
      id: form?.id ?? crypto.randomUUID(),
      code,
      name: materialDraft.name.trim().toUpperCase(),
      supplier: materialDraft.supplier.trim().toUpperCase(),
      paperType: materialDraft.paperType.trim().toUpperCase(),
      grammage: materialDraft.grammage.trim().toUpperCase(),
      pressure: materialDraft.pressure.trim().toUpperCase(),
      specialCondition: Boolean(materialDraft.specialCondition),
      specialValidUntil: materialDraft.specialCondition ? materialDraft.specialValidUntil || "" : "",
      specialNotes: materialDraft.specialCondition ? materialDraft.specialNotes?.trim().toUpperCase() || "" : "",
    };
    setMaterials(form?.mode === "edit" ? materials.map((item) => (item.id === form.id ? next : item)) : [...materials, next]);
    setForm(null);
  }

  function updateMaterialCost(materialId: string, costIpi: number) {
    const value = Math.max(0, Number(costIpi || 0));
    setMaterials(materials.map((material) => material.id === materialId ? { ...material, costIpi: value } : material));
  }

  function saveEngineering() {
    const style = engineeringDraft.style.trim().toUpperCase();
    const description = engineeringDraft.description.trim().toUpperCase();
    if (!style || !description) return;
    const next = {
      id: form?.id ?? crypto.randomUUID(),
      style,
      description,
      category: engineeringDraft.category.trim().toUpperCase(),
      wave: engineeringDraft.wave.trim().toUpperCase(),
      widthFormula: engineeringDraft.widthFormula.trim(),
      lengthFormula: engineeringDraft.lengthFormula.trim(),
    };
    setEngineeringFormulas(form?.mode === "edit" ? engineeringFormulas.map((item) => (item.id === form.id ? next : item)) : [...engineeringFormulas, next]);
    setForm(null);
  }

  function updateProductionTime(id: string, field: "setupMinutes" | "boxesPerHour", value: number) {
    setProductionTimes(productionTimes.map((time) => (time.id === id ? { ...time, [field]: value } : time)));
  }

  function setProductFichas(value: ProductFicha[]) {
    if (onProductFichasChange) onProductFichasChange(value);
    else setLocalProductFichas(value);
  }

  function setProductColors(value: string[]) {
    if (onProductColorsChange) onProductColorsChange(value);
    else setLocalProductColors(value);
  }
}

const productCompanies = ["DAWOS", "CARCAT", "GTA"];

function emptyProductComponent(): ProductComponent {
  return {
    id: crypto.randomUUID(), reference: "", price: 0, revision: "1", company: "", clientId: "", materialId: "", laudo: "NAO", palete: "NAO", tieCount: 0,
    status: "DESENVOLVIMENTO", length: 0, width: 0, height: 0, topOverlap: 0, bottomOverlap: 0, knifeWidth: 0, knifeWidthBoxes: 1,
    knifeLength: 0, knifeLengthBoxes: 1, supplierQuality: "", color1: "", color2: "", engineeringId: "", observations: "", areaM2: 0,
  };
}

function getMaterialWave(paperType: string) {
  const code = paperType.trim().toUpperCase();
  const suffix = code.match(/-([A-Z]+)$/)?.[1];
  if (suffix) return suffix;
  if (code.includes("BB")) return "BB";
  if (code.includes("C")) return "C";
  if (code.includes("T")) return "T";
  return "";
}

function nextFichaNumber(fichas: ProductFicha[]) {
  const highestNumber = fichas.reduce((highest, ficha) => {
    const match = ficha.ftNumber.match(/(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `FT-${String(highestNumber + 1).padStart(4, "0")}`;
}

function normalizeProductSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

function productClientName(client?: ClientRecord) {
  return (client?.tradeName || client?.legalName || "").toLocaleUpperCase("pt-BR");
}

function hasSameProductSpecification(first: ProductFicha, second: ProductFicha) {
  const requiredValues = [second.materialId, second.engineeringId, second.length, second.width, second.height];
  if (!requiredValues[0] || !requiredValues[1] || requiredValues.slice(2).some((value) => Number(value) <= 0)) return false;

  return first.materialId === second.materialId
    && first.engineeringId === second.engineeringId
    && Number(first.length) === Number(second.length)
    && Number(first.width) === Number(second.width)
    && Number(first.height) === Number(second.height)
    && Number(first.topOverlap || 0) === Number(second.topOverlap || 0);
}

const productChangeFields: Array<keyof ProductComponent> = [
  "reference", "price", "clientId", "company", "materialId", "laudo", "palete", "tieCount", "status",
  "length", "width", "height", "topOverlap", "bottomOverlap", "knifeWidth", "knifeWidthBoxes", "knifeLength",
  "knifeLengthBoxes", "supplierQuality", "color1", "color2", "engineeringId", "observations", "areaM2",
];

const productChangeLabels: Partial<Record<keyof ProductComponent, string>> = {
  reference: "REFERENCIA", price: "PRECO", clientId: "CLIENTE", company: "EMPRESA", materialId: "MATERIAL",
  laudo: "LAUDO", palete: "PALETE", tieCount: "NUMERO DE AMARRADOS", status: "STATUS", length: "COMPRIMENTO",
  width: "LARGURA", height: "ALTURA", topOverlap: "TRANSPASSE SUPERIOR", bottomOverlap: "TRANSPASSE INFERIOR",
  knifeWidth: "LARGURA DA FACA", knifeWidthBoxes: "CAIXAS NA LARGURA", knifeLength: "COMPRIMENTO DA FACA",
  knifeLengthBoxes: "CAIXAS NO COMPRIMENTO", supplierQuality: "QUALIDADE", color1: "COR 1", color2: "COR 2",
  engineeringId: "ENGENHARIA", observations: "OBSERVACOES", areaM2: "AREA CALCULADA",
};

export function ProductCatalogPanel({
  companySlug, fichas, suppliers = initialSuppliers, materials = initialMaterials, engineeringFormulas, onChange,
}: {
  companySlug?: string;
  fichas: ProductFicha[];
  suppliers?: Supplier[];
  materials?: SpecificMaterial[];
  engineeringFormulas: EngineeringFormula[];
  onChange: (items: ProductFicha[]) => void;
}) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductFicha | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [fichaSearch, setFichaSearch] = useState("");
  const [supplierSelection, setSupplierSelection] = useState<Record<string, string>>({});
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [productPanel, setProductPanel] = useState<"dados" | "arte" | "historico" | "alteracoes" | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!companySlug) return;
    loadClients(companySlug).then(setClients).catch(() => setClients([]));
  }, [companySlug]);

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const filteredFichas = useMemo(() => {
    const clientTerm = normalizeProductSearch(clientSearch);
    const fichaTerm = normalizeProductSearch(fichaSearch);
    return fichas.filter((ficha) => {
      const client = clientsById.get(ficha.clientId);
      const clientText = normalizeProductSearch(`${client?.tradeName ?? ""} ${client?.legalName ?? ""} ${client?.cnpj ?? ""} ${client?.clientCode ?? ""}`);
      const fichaText = normalizeProductSearch(`${ficha.ftNumber} ${ficha.reference}`);
      return (!clientTerm || clientText.includes(clientTerm)) && (!fichaTerm || fichaText.includes(fichaTerm));
    });
  }, [clientSearch, clientsById, fichaSearch, fichas]);

  function startCreate() {
    setEditingId(null);
    setViewOnly(false);
    setDraft({ ...emptyProductComponent(), ftNumber: nextFichaNumber(fichas), accessories: [] });
    setSupplierSelection({});
    setProductMenuOpen(false);
    setProductPanel(null);
    setSelectedHistoryId(null);
  }

  function openFicha(item: ProductFicha) {
    setEditingId(item.id);
    setViewOnly(true);
    setDraft({ ...item, accessories: item.accessories.map((accessory) => ({ ...accessory })) });
    setProductMenuOpen(false);
    setProductPanel(null);
    setSelectedHistoryId(null);
    const selection: Record<string, string> = {};
    [item, ...item.accessories].forEach((component) => {
      const material = materials.find((candidate) => candidate.id === component.materialId);
      if (material?.supplier) selection[component.id] = material.supplier;
    });
    setSupplierSelection(selection);
  }

  function closeFicha() {
    setDraft(null);
    setEditingId(null);
    setViewOnly(false);
    setSupplierSelection({});
    setProductMenuOpen(false);
    setProductPanel(null);
    setSelectedHistoryId(null);
  }

  function updateMain<K extends keyof ProductFicha>(key: K, value: ProductFicha[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function updateClient(update: (key: keyof ProductComponent, value: ProductComponent[keyof ProductComponent]) => void, clientId: string) {
    const client = clientsById.get(clientId);
    update("clientId", clientId);
    update("company", client?.sellerCompanyName?.trim().toLocaleUpperCase("pt-BR") ?? "");
  }

  function updateAccessory(id: string, key: keyof ProductComponent, value: ProductComponent[keyof ProductComponent]) {
    setDraft((current) => current ? { ...current, accessories: current.accessories.map((item) => item.id === id ? { ...item, [key]: value } as ProductComponent : item) } : current);
  }

  function describeChangeValue(key: keyof ProductComponent, value: ProductComponent[keyof ProductComponent]) {
    if (key === "clientId") return productClientName(clientsById.get(String(value))) || "NAO INFORMADO";
    if (key === "materialId") {
      const material = materials.find((item) => item.id === value);
      return material ? `${material.code} - ${material.name || material.supplier}` : "NAO INFORMADO";
    }
    if (key === "engineeringId") {
      const formula = engineeringFormulas.find((item) => item.id === value);
      return formula ? `${formula.style} - ${formula.description}` : "NAO INFORMADO";
    }
    if (key === "price") return `R$ ${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (key === "areaM2") return `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} M2`;
    if (typeof value === "number") return value.toLocaleString("pt-BR");
    return String(value ?? "").trim() || "NAO INFORMADO";
  }

  function collectComponentChanges(previous: ProductComponent, next: ProductComponent, prefix: string) {
    const changes: ProductChangeLog["changes"] = [];
    for (const field of productChangeFields) {
      const previousValue = previous[field];
      const nextValue = next[field];
      if (field === "areaM2" && previousValue === undefined) continue;
      if (previousValue === nextValue) continue;
      changes.push({
        label: `${prefix} - ${productChangeLabels[field] ?? field.toUpperCase()}`,
        previousValue: describeChangeValue(field, previousValue),
        nextValue: describeChangeValue(field, nextValue),
      });
    }
    return changes;
  }

  function collectFichaChanges(previous: ProductFicha, next: ProductFicha) {
    const changes = collectComponentChanges(previous, next, "CAIXA PRINCIPAL");
    const previousAccessories = new Map(previous.accessories.map((accessory) => [accessory.id, accessory]));
    const nextAccessoryIds = new Set(next.accessories.map((accessory) => accessory.id));

    next.accessories.forEach((accessory, index) => {
      const previousAccessory = previousAccessories.get(accessory.id);
      const prefix = `ACESSORIO ${index + 1}`;
      if (!previousAccessory) {
        changes.push({ label: prefix, previousValue: "", nextValue: `ADICIONADO: ${accessory.reference || "SEM REFERENCIA"}` });
        return;
      }
      changes.push(...collectComponentChanges(previousAccessory, accessory, prefix));
    });

    previous.accessories.forEach((accessory, index) => {
      if (!nextAccessoryIds.has(accessory.id)) {
        changes.push({ label: `ACESSORIO ${index + 1}`, previousValue: accessory.reference || "SEM REFERENCIA", nextValue: "REMOVIDO" });
      }
    });
    return changes;
  }

  function save() {
    if (!draft?.ftNumber.trim() || !draft.reference.trim() || !draft.clientId) return;
    const componentMissingTopOverlap = [draft, ...draft.accessories].find((item) => {
      const formula = engineeringFormulas.find((candidate) => candidate.id === item.engineeringId);
      return formulaUsesTopOverlap(formula) && Number(item.topOverlap || 0) <= 0;
    });
    if (componentMissingTopOverlap) {
      window.alert(`INFORME O TRANSPASSE SUPERIOR (S) PARA ${componentMissingTopOverlap === draft ? "A CAIXA PRINCIPAL" : "O ACESSORIO"}.`);
      return;
    }
    const matchingFicha = fichas.find((item) => item.id !== draft.id && hasSameProductSpecification(item, draft));
    if (matchingFicha) {
      const clientName = productClientName(clientsById.get(matchingFicha.clientId)) || "CLIENTE NAO INFORMADO";
      const shouldContinue = window.confirm(`JA EXISTE UMA FICHA COM O MESMO MATERIAL, TIPO DE CAIXA E MEDIDAS.\n\n${matchingFicha.ftNumber} - ${matchingFicha.reference}\nCLIENTE: ${clientName}\n\nDESEJA SALVAR MESMO ASSIM?`);
      if (!shouldContinue) return;
    }
    const baseNext = {
      ...draft,
      ftNumber: draft.ftNumber.trim().toUpperCase(),
      reference: draft.reference.trim().toUpperCase(),
      areaM2: calculateProductArea(draft, engineeringFormulas),
      accessories: draft.accessories.map((accessory) => ({ ...accessory, areaM2: calculateProductArea(accessory, engineeringFormulas) })),
    };
    const previous = editingId ? fichas.find((item) => item.id === editingId) : undefined;
    const changes = previous ? collectFichaChanges(previous, baseNext) : [{ label: "FICHA TECNICA", previousValue: "", nextValue: "CADASTRO INICIAL" }];
    const revision = previous && changes.length === 0
      ? previous.revision || "1"
      : String((previous ? Math.max(Number(previous.revision) || 1, 1) : 0) + 1);
    const next = {
      ...baseNext,
      revision,
      accessories: baseNext.accessories.map((accessory) => ({ ...accessory, revision })),
      changeHistory: changes.length === 0 ? previous?.changeHistory ?? [] : [...(previous?.changeHistory ?? []), { id: crypto.randomUUID(), revision, changedAt: new Date().toISOString(), changes }],
    };
    onChange(editingId ? fichas.map((item) => item.id === editingId ? next : item) : [...fichas, next]);
    setDraft(null);
    setEditingId(null);
    setViewOnly(false);
    setSupplierSelection({});
    setProductMenuOpen(false);
    setProductPanel(null);
    setSelectedHistoryId(null);
  }

  function selectProductPanel(panel: "dados" | "arte" | "historico" | "alteracoes") {
    setProductPanel(panel);
    setProductMenuOpen(false);
    if (panel !== "historico") setSelectedHistoryId(null);
  }

  function removeHistorySnapshot(snapshotId: string) {
    if (!draft) return;
    const nextDraft = {
      ...draft,
      priceHistory: (draft.priceHistory ?? []).filter((snapshot) => snapshot.id !== snapshotId),
    };
    setDraft(nextDraft);
    setSelectedHistoryId((current) => current === snapshotId ? null : current);
    if (editingId) {
      onChange(fichas.map((item) => item.id === editingId ? nextDraft : item));
    }
  }

  function formatSnapshotDate(value?: string) {
    if (!value) return "NAO INFORMADO";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "NAO INFORMADO" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function PriceSnapshotDetails({ snapshot }: { snapshot?: ProductPriceSnapshot }) {
    if (!snapshot) return <div style={productPanelEmptyStyle}>NENHUMA FORMACAO DE PRECO FOI VINCULADA A ESTA FICHA AINDA.</div>;
    const details = [
      ["PRECO UNITARIO", formatCurrencyValue(snapshot.price)],
      ["MC%", formatPercentValue(snapshot.mcPercent)],
      ["MC/HORA", formatCurrencyValue(snapshot.mcrHour, "/H")],
      ["PRECO R$/KG", formatCurrencyValue(snapshot.pricePerKg, "/KG")],
      ["SET-UP", formatNumberValue(snapshot.setupMinutes, " MIN")],
      ["CAIXAS POR HORA", formatNumberValue(snapshot.boxesPerHour, " CX/H")],
      ["COMISSAO", formatPercentValue(snapshot.commissionPercent)],
      ["QUANTIDADE", formatNumberValue(snapshot.quantity, " UNIDS")],
      ["MATERIAL", snapshot.materialCode || "NAO INFORMADO"],
      ["TIPO DE PAPELAO", snapshot.paperType || "NAO INFORMADO"],
      ...(Number(snapshot.topOverlap || 0) > 0 ? [["TRANSPASSE SUPERIOR (S)", formatNumberValue(snapshot.topOverlap, " MM")]] : []),
      ["AREA", formatNumberValue(snapshot.areaM2, " M2")],
      ["PESO UNITARIO", formatNumberValue(snapshot.weightKg, " KG")],
      ["EMPRESA", snapshot.sellerCompany || "NAO INFORMADO"],
      ["DATA DO PRECO", formatSnapshotDate(snapshot.createdAt)],
    ];
    return <div style={productPricingDetailsGridStyle}>{details.map(([label, value]) => <div key={label} style={productPricingDetailStyle}><small>{label}</small><strong>{value}</strong></div>)}</div>;
  }

  function formatCurrencyValue(value?: number, suffix = "") {
    return typeof value === "number" && Number.isFinite(value) ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}` : "NAO INFORMADO";
  }

  function formatPercentValue(value?: number) {
    return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "NAO INFORMADO";
  }

  function formatNumberValue(value?: number, suffix = "") {
    return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}` : "NAO INFORMADO";
  }

  function renderFields(item: ProductComponent, update: (key: keyof ProductComponent, value: ProductComponent[keyof ProductComponent]) => void, prefix: string) {
    const materialSupplier = materials.find((material) => material.id === item.materialId)?.supplier ?? "";
    const selectedSupplier = supplierSelection[item.id] ?? materialSupplier;
    const filteredMaterials = selectedSupplier
      ? materials.filter((material) => material.supplier === selectedSupplier && isMaterialAvailableForUse(material))
      : [];
    const selectedMaterial = materials.find((material) => material.id === item.materialId);
    const selectedWave = selectedMaterial ? getMaterialWave(selectedMaterial.paperType) : "";
    const filteredEngineeringFormulas = selectedWave
      ? engineeringFormulas.filter((formula) => formula.wave.split("/").map((wave) => wave.trim().toUpperCase()).includes(selectedWave))
      : [];
    const selectedEngineeringFormula = engineeringFormulas.find((formula) => formula.id === item.engineeringId);
    const requiresTopOverlap = formulaUsesTopOverlap(selectedEngineeringFormula);
    const calculatedArea = calculateProductArea(item, engineeringFormulas);
    const supplierNames = suppliers.map((supplier) => supplier.name).filter(Boolean);
    return (
      <div style={productFieldsStyle}>
        <label style={productLabelStyle}>REFERENCIA<input value={item.reference} onChange={(event) => update("reference", event.target.value)} style={productInputStyle} placeholder="DESCRICAO DA EMBALAGEM" /></label>
        <label style={productLabelStyle}>PRECO (R$)<CurrencyInput value={item.price || ""} onValueChange={(price) => update("price", price || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>REVISAO<input value={item.revision || "1"} readOnly style={{ ...productInputStyle, background: "#f2f4f7", color: "#667085", cursor: "default" }} /></label>
        <label style={productLabelStyle}>CLIENTE<select value={item.clientId} onChange={(event) => updateClient(update, event.target.value)} style={productInputStyle}><option value="">SELECIONE O CLIENTE</option>{clients.map((client) => <option key={client.id} value={client.id}>{productClientName(client)}</option>)}</select></label>
        <label style={productLabelStyle}>EMPRESA<select value={item.company} disabled style={productInputStyle}><option value="">SELECIONE O CLIENTE</option>{productCompanies.map((company) => <option key={company}>{company}</option>)}</select></label>
        <label style={productLabelStyle}>FORNECEDOR<select value={selectedSupplier} onChange={(event) => { const value = event.target.value; setSupplierSelection((current) => ({ ...current, [item.id]: value })); update("materialId", ""); update("engineeringId", ""); }} style={productInputStyle}><option value="">SELECIONE O FORNECEDOR</option>{supplierNames.map((supplier) => <option key={`${prefix}-supplier-${supplier}`} value={supplier}>{supplier}</option>)}</select></label>
        <label style={productLabelStyle}>MATERIAL<select value={item.materialId ?? ""} onChange={(event) => { const value = event.target.value; const material = materials.find((candidate) => candidate.id === value); if (material?.supplier) setSupplierSelection((current) => ({ ...current, [item.id]: material.supplier })); update("materialId", value); update("engineeringId", ""); }} style={productInputStyle} disabled={!selectedSupplier}><option value="">{selectedSupplier ? "SELECIONE O MATERIAL" : "SELECIONE O FORNECEDOR PRIMEIRO"}</option>{filteredMaterials.map((material) => <option key={material.id} value={material.id}>{material.code} - {material.name || material.supplier}</option>)}</select></label>
        <label style={productLabelStyle}>COMPRIMENTO (MM)<input type="number" value={item.length || ""} onChange={(event) => update("length", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>LARGURA (MM)<input type="number" value={item.width || ""} onChange={(event) => update("width", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>ALTURA (MM)<input type="number" value={item.height || ""} onChange={(event) => update("height", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>ENGENHARIA<select value={item.engineeringId} onChange={(event) => update("engineeringId", event.target.value)} style={productInputStyle} disabled={!selectedMaterial}><option value="">{selectedMaterial ? `SELECIONE A ENGENHARIA PARA ONDA ${selectedWave}` : "SELECIONE O MATERIAL PRIMEIRO"}</option>{filteredEngineeringFormulas.map((formula) => <option key={formula.id} value={formula.id}>{formula.style} - {formula.description}</option>)}</select></label>
        {requiresTopOverlap ? <label style={productLabelStyle}>TRANSPASSE SUPERIOR (S) (MM)<input type="number" min="0" value={item.topOverlap || ""} onChange={(event) => update("topOverlap", Number(event.target.value) || 0)} style={productInputStyle} /></label> : null}
        <label style={{ ...productLabelStyle, gridColumn: "1 / -1" }}>OBSERVACOES<textarea value={item.observations} onChange={(event) => update("observations", event.target.value)} style={{ ...productInputStyle, minHeight: 82, paddingTop: 14, resize: "vertical" }} /></label>
        <label style={productLabelStyle}>AREA CALCULADA (M2)<input value={calculatedArea ? calculatedArea.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : ""} readOnly style={productInputStyle} /></label>
      </div>
    );
  }

  return (
    <>
      {draft ? (
        <FormPanel title={viewOnly ? "VISUALIZAR FICHA TECNICA" : editingId ? "EDITAR FICHA TECNICA" : "CADASTRAR NOVA FICHA TECNICA"}>
          <div style={productFichaTopbarStyle}>
            <label style={{ ...wideLabelStyle, flex: "1 1 360px" }}>NUMERO DA FT<input value={draft.ftNumber} readOnly style={{ ...inputStyle, background: "#f5f1ff", color: "#7c3aed", fontWeight: 800 }} /></label>
            {viewOnly && <div style={productFichaTopActionsStyle}><button type="button" onClick={closeFicha} style={cancelButtonStyle}>SAIR</button><button type="button" onClick={() => setViewOnly(false)} style={editButtonStyle}>EDITAR</button></div>}
          </div>
          <div style={productColumnsStyle}>
            <section style={productSideStyle}>
              <div style={productSideHeaderStyle}>
                <h3 style={{ ...productSideTitleStyle, marginBottom: 0 }}>CAIXA PRINCIPAL</h3>
                <div style={productOptionsWrapStyle}>
                  <button type="button" onClick={() => setProductMenuOpen((current) => !current)} style={productOptionsButtonStyle} aria-expanded={productMenuOpen}>OPCOES DA CAIXA <span aria-hidden="true">{productMenuOpen ? "▲" : "▼"}</span></button>
                  {productMenuOpen && <div style={productOptionsMenuStyle}>
                    <button type="button" onClick={() => selectProductPanel("dados")} style={productOptionButtonStyle}>DADOS DA FORMACAO DE PRECO</button>
                    <button type="button" onClick={() => selectProductPanel("arte")} style={productOptionButtonStyle}>ARTE</button>
                    <button type="button" onClick={() => selectProductPanel("historico")} style={productOptionButtonStyle}>HISTORICO DE PRECOS</button>
                    <button type="button" onClick={() => selectProductPanel("alteracoes")} style={productOptionButtonStyle}>ALTERACOES</button>
                  </div>}
                </div>
              </div>
              {productPanel === "dados" && <section style={productInfoPanelStyle}><div style={productInfoPanelHeaderStyle}><strong>DADOS DA FORMACAO DE PRECO</strong><span>ULTIMA FORMACAO ENVIADA PARA ESTA FICHA</span></div><PriceSnapshotDetails snapshot={draft.pricingData} /></section>}
              {productPanel === "arte" && <section style={productInfoPanelStyle}><div style={productInfoPanelHeaderStyle}><strong>ARTE</strong><span>ESTE ESPACO FICARA DISPONIVEL PARA A ARTE DO PRODUTO.</span></div><div style={productPanelEmptyStyle}>MODULO DE ARTE EM PREPARACAO.</div></section>}
              {productPanel === "historico" && <section style={productInfoPanelStyle}><div style={productInfoPanelHeaderStyle}><strong>HISTORICO DE PRECOS</strong><span>SELECIONE UM PRECO PARA VER A CONFIGURACAO USADA.</span></div>{(draft.priceHistory ?? []).length === 0 ? <div style={productPanelEmptyStyle}>NENHUM HISTORICO DE PRECO REGISTRADO.</div> : <div style={productHistoryLayoutStyle}><div style={productHistoryListStyle}>{(draft.priceHistory ?? []).map((snapshot) => <div key={snapshot.id} style={productHistoryItemWrapStyle}><button type="button" onClick={() => setSelectedHistoryId((current) => current === snapshot.id ? null : snapshot.id)} style={{ ...productHistoryItemStyle, ...(selectedHistoryId === snapshot.id ? productHistoryItemActiveStyle : {}) }} aria-expanded={selectedHistoryId === snapshot.id}><strong>{formatCurrencyValue(snapshot.price)}</strong><span>{snapshot.source}</span><small>{formatSnapshotDate(snapshot.createdAt)}</small></button><button type="button" onClick={() => removeHistorySnapshot(snapshot.id)} style={productHistoryDeleteStyle} aria-label={`EXCLUIR HISTORICO DE ${formatCurrencyValue(snapshot.price)}`} title="EXCLUIR DO HISTORICO">X</button></div>)}</div>{selectedHistoryId && <PriceSnapshotDetails snapshot={(draft.priceHistory ?? []).find((snapshot) => snapshot.id === selectedHistoryId)} />}</div>}</section>}
              {productPanel === "alteracoes" && <section style={productInfoPanelStyle}><div style={productInfoPanelHeaderStyle}><strong>HISTORICO DE ALTERACOES</strong><span>REVISOES E CAMPOS ALTERADOS NESTA FICHA.</span></div>{(draft.changeHistory ?? []).length === 0 ? <div style={productPanelEmptyStyle}>NENHUMA ALTERACAO REGISTRADA AINDA.</div> : <div style={productChangeListStyle}>{[...(draft.changeHistory ?? [])].reverse().map((entry) => <article key={entry.id} style={productChangeEntryStyle}><div style={productChangeEntryHeaderStyle}><strong>REVISAO {entry.revision}</strong><small>{formatSnapshotDate(entry.changedAt)}</small></div><div style={productChangeDetailsStyle}>{entry.changes.map((change, index) => <div key={`${entry.id}-${index}`} style={productChangeDetailStyle}><strong>{change.label}</strong><span>{change.previousValue ? `${change.previousValue} > ${change.nextValue}` : change.nextValue}</span></div>)}</div></article>)}</div>}</section>}
              <fieldset disabled={viewOnly} style={productReadOnlyFieldsetStyle}>{renderFields(draft, (key, value) => updateMain(key as keyof ProductFicha, value as ProductFicha[keyof ProductFicha]), "main")}</fieldset>
            </section>
            <section style={productSideStyle}><h3 style={productSideTitleStyle}>ACESSORIOS</h3>{draft.accessories.map((accessory, index) => <article key={accessory.id} style={accessoryStyle}><div style={accessoryHeaderStyle}><strong>ACESSORIO {index + 1}</strong>{!viewOnly && <button type="button" onClick={() => setDraft({ ...draft, accessories: draft.accessories.filter((item) => item.id !== accessory.id) })} style={removeAccessoryStyle}>REMOVER</button>}</div><fieldset disabled={viewOnly} style={productReadOnlyFieldsetStyle}>{renderFields(accessory, (key, value) => updateAccessory(accessory.id, key, value), `accessory-${index}`)}</fieldset></article>)}{!viewOnly && <button type="button" onClick={() => setDraft({ ...draft, accessories: [...draft.accessories, { ...emptyProductComponent(), revision: draft.revision || "1", clientId: draft.clientId, company: draft.company }] })} style={secondaryActionStyle}>+ ADICIONAR ACESSORIO</button>}</section>
          </div>
          {!viewOnly && <div style={formActionsStyle}><button type="button" onClick={closeFicha} style={cancelButtonStyle}>CANCELAR</button><button type="button" onClick={save} style={orangeButtonStyle}>SALVAR FICHA</button></div>}
        </FormPanel>
      ) : (
        <Panel title="FICHAS TECNICAS DE PRODUTOS" description="CADASTRE A CAIXA PRINCIPAL E OS ACESSORIOS VINCULADOS A CADA FT." actionLabel="+ NOVA FICHA TECNICA" onAction={startCreate}>
          <div style={productSearchBarStyle}>
            <label style={productSearchFieldStyle}>BUSCAR POR CLIENTE<input type="search" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="NOME, FANTASIA, CODIGO OU CNPJ" style={productInputStyle} /></label>
            <label style={productSearchFieldStyle}>BUSCAR POR FICHA<input type="search" value={fichaSearch} onChange={(event) => setFichaSearch(event.target.value)} placeholder="NUMERO DA FT OU REFERENCIA" style={productInputStyle} /></label>
            <div style={productSearchSummaryStyle}><strong>{filteredFichas.length}</strong><span>FICHA(S) ENCONTRADA(S)</span>{(clientSearch || fichaSearch) && <button type="button" onClick={() => { setClientSearch(""); setFichaSearch(""); }} style={productSearchClearStyle} title="LIMPAR BUSCAS" aria-label="LIMPAR BUSCAS">X</button>}</div>
          </div>
          {fichas.length === 0 ? <div style={emptyListStyle}>NENHUMA FICHA TECNICA CADASTRADA.</div> : filteredFichas.length === 0 ? <div style={emptyListStyle}>NENHUMA FICHA ENCONTRADA PARA OS FILTROS INFORMADOS.</div> : filteredFichas.map((ficha) => { const client = clientsById.get(ficha.clientId); const clientName = productClientName(client) || "CLIENTE NAO INFORMADO"; return <article key={ficha.id} style={fichaRowStyle}><div><strong style={fichaNumberStyle}>{ficha.ftNumber}</strong><span style={fichaReferenceStyle}>{ficha.reference}</span><small style={fichaClientStyle}>{clientName}</small><small style={fichaMetaStyle}>{ficha.company} · {ficha.accessories.length} ACESSORIO(S)</small></div><div style={fichaActionsStyle}><button type="button" onClick={() => openFicha(ficha)} style={editButtonStyle}>ABRIR</button><button type="button" onClick={() => onChange(fichas.filter((item) => item.id !== ficha.id))} style={deleteButtonStyle}>EXCLUIR</button></div></article>; })}
        </Panel>
      )}
    </>
  );
}

function ProductColorsPanel({ colors, onChange }: { colors: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState("");
  return <Panel title="CADASTRO DE CORES" description="CORES DISPONIVEIS PARA AS FICHAS TECNICAS DE PRODUTOS." onAction={() => undefined}>
    <div style={colorAddStyle}><input value={draft} onChange={(event) => setDraft(event.target.value)} style={{ ...productInputStyle, width: 220 }} placeholder="NOVA COR" /><button type="button" onClick={() => { const value = draft.trim().toUpperCase(); if (value && !colors.includes(value)) { onChange([...colors, value]); setDraft(""); } }} style={orangeButtonStyle}>+ ADICIONAR</button></div>
    <div style={colorListStyle}>{colors.map((color) => <div key={color} style={colorItemStyle}><span>{color}</span><button type="button" onClick={() => onChange(colors.filter((item) => item !== color))} style={deleteButtonStyle}>EXCLUIR</button></div>)}</div>
  </Panel>;
}

function GeneralRegistriesPanel({
  companySlug,
  paymentConditions,
  cfops,
  taxRegimes,
  fiscalProfiles,
  fiscalBenefits,
  lostReasons,
  onPaymentConditionsChange,
  onCfopsChange,
  onTaxRegimesChange,
  onFiscalProfilesChange,
  onFiscalBenefitsChange,
  onLostReasonsChange,
}: {
  companySlug?: string;
  paymentConditions: PaymentCondition[];
  cfops: CfopOption[];
  taxRegimes: GeneralOption[];
  fiscalProfiles: GeneralOption[];
  fiscalBenefits: GeneralOption[];
  lostReasons: GeneralOption[];
  onPaymentConditionsChange: (items: PaymentCondition[]) => void;
  onCfopsChange: (items: CfopOption[]) => void;
  onTaxRegimesChange: (items: GeneralOption[]) => void;
  onFiscalProfilesChange: (items: GeneralOption[]) => void;
  onFiscalBenefitsChange: (items: GeneralOption[]) => void;
  onLostReasonsChange: (items: GeneralOption[]) => void;
}) {
  const [generalSection, setGeneralSection] = useState<"cadastros" | "limites">("cadastros");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [loadingClients, setLoadingClients] = useState(false);
  const [paymentForm, setPaymentForm] = useState<{ mode: Mode; id?: string; name: string } | null>(null);
  const [cfopForm, setCfopForm] = useState<{ mode: Mode; id?: string; code: string; description: string } | null>(null);

  useEffect(() => {
    if (generalSection !== "limites" || !companySlug) return;
    let active = true;
    setLoadingClients(true);
    loadClients(companySlug).then((items) => {
      if (active) setClients(items);
    }).catch(() => {
      if (active) setClients([]);
    }).finally(() => {
      if (active) setLoadingClients(false);
    });
    return () => { active = false; };
  }, [companySlug, generalSection]);

  const matchingClients = clients.filter((client) => `${client.clientCode} ${client.tradeName} ${client.legalName} ${client.cnpj}`.toUpperCase().includes(clientSearch.trim().toUpperCase()));
  const searchedClient = clientSearch.trim() ? matchingClients[0] : undefined;

  function savePayment() {
    if (!paymentForm?.name.trim()) return;
    const name = paymentForm.name.trim().toUpperCase();
    if (paymentForm.mode === "edit" && paymentForm.id) {
      onPaymentConditionsChange(paymentConditions.map((item) => item.id === paymentForm.id ? { ...item, name } : item));
    } else {
      onPaymentConditionsChange([...paymentConditions, { id: `payment-${Date.now()}`, name }]);
    }
    setPaymentForm(null);
  }

  function saveCfop() {
    if (!cfopForm?.code.trim() || !cfopForm.description.trim()) return;
    const next = { code: cfopForm.code.trim(), description: cfopForm.description.trim().toUpperCase() };
    if (cfopForm.mode === "edit" && cfopForm.id) {
      onCfopsChange(cfops.map((item) => item.id === cfopForm.id ? { ...item, ...next } : item));
    } else {
      onCfopsChange([...cfops, { id: `cfop-${Date.now()}`, ...next }]);
    }
    setCfopForm(null);
  }

  return (
    <div>
      <nav style={generalSubTabsStyle} aria-label="CADASTROS GERAIS">
        <button type="button" onClick={() => setGeneralSection("cadastros")} style={{ ...generalSubTabStyle, ...(generalSection === "cadastros" ? activeGeneralSubTabStyle : {}) }}>CADASTROS</button>
        <button type="button" onClick={() => setGeneralSection("limites")} style={{ ...generalSubTabStyle, ...(generalSection === "limites" ? activeGeneralSubTabStyle : {}) }}>LIMITES</button>
      </nav>
      {generalSection === "limites" ? (
        <section style={generalRegistryPanelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h3 style={panelTitleStyle}>LIMITE DE COMPRA</h3>
              <p style={panelTextStyle}>CONSULTE O LIMITE E OS VALORES EM ABERTO DE CADA CLIENTE.</p>
            </div>
          </div>
          <label style={wideLabelStyle}>
            BUSCAR CLIENTE
            <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="NOME, CODIGO OU CNPJ" style={inputStyle} />
          </label>
          {loadingClients ? <div style={limitEmptyStyle}>CARREGANDO CLIENTES...</div> : searchedClient ? (
            <div style={limitReportStyle}>
              <h4 style={limitClientTitleStyle}>{searchedClient.tradeName || searchedClient.legalName}</h4>
              <div style={limitReportGridStyle}>
                <LimitMetric label="LIMITE DE COMPRA" value={searchedClient.purchaseLimit ? formatGeneralMoney(Number(searchedClient.purchaseLimit)) : "NAO INFORMADO"} color="#16a34a" />
                <LimitMetric label="PEDIDOS SEM FATURAMENTO" value="R$ 0,00" color="#e68019" />
                <LimitMetric label="FATURAMENTO EM ABERTO" value="R$ 0,00" color="#7c3aed" />
                <LimitMetric label="ORCAMENTOS EM ABERTO" value="0" color="#e6007e" />
              </div>
            </div>
          ) : <div style={limitEmptyStyle}>BUSQUE UM CLIENTE PARA VER O RESUMO.</div>}
        </section>
      ) : (
      <div style={generalRegistriesGridStyle}>
      <section style={generalRegistryPanelStyle}>
        {paymentForm && (
          <FormPanel title={paymentForm.mode === "create" ? "CADASTRAR CONDICAO DE PAGAMENTO" : "EDITAR CONDICAO DE PAGAMENTO"}>
            <label style={wideLabelStyle}>
              CONDICAO DE PAGAMENTO
              <input value={paymentForm.name} onChange={(event) => setPaymentForm({ ...paymentForm, name: event.target.value })} placeholder="EX: 28 DIAS" style={inputStyle} />
            </label>
            <Actions onCancel={() => setPaymentForm(null)} onSave={savePayment} />
          </FormPanel>
        )}
        <div style={panelHeaderStyle}>
          <div>
            <h3 style={panelTitleStyle}>CONDICOES DE PAGAMENTO</h3>
            <p style={panelTextStyle}>OPCOES DISPONIVEIS PARA O CADASTRO DE CLIENTES.</p>
          </div>
          <button type="button" style={orangeButtonStyle} onClick={() => setPaymentForm({ mode: "create", name: "" })}>+ NOVA CONDICAO</button>
        </div>
        <Table headers={["CONDICAO", "ACOES"]}>
          {paymentConditions.map((item) => (
            <tr key={item.id}>
              <td style={supplierNameCellStyle}>{item.name}</td>
              <td style={supplierActionCellStyle}>
                <EditButton onClick={() => setPaymentForm({ mode: "edit", id: item.id, name: item.name })} />
                <DeleteButton onClick={() => onPaymentConditionsChange(paymentConditions.filter((entry) => entry.id !== item.id))} />
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section style={generalRegistryPanelStyle}>
        {cfopForm && (
          <FormPanel title={cfopForm.mode === "create" ? "CADASTRAR NOVO CFOP" : "EDITAR CFOP"}>
            <div style={twoColumnsStyle}>
              <TextField label="CODIGO CFOP" value={cfopForm.code} onChange={(code) => setCfopForm({ ...cfopForm, code })} placeholder="EX: 5101" />
              <TextField label="DESCRICAO" value={cfopForm.description} onChange={(description) => setCfopForm({ ...cfopForm, description })} placeholder="EX: VENDA DE PRODUCAO" />
            </div>
            <Actions onCancel={() => setCfopForm(null)} onSave={saveCfop} />
          </FormPanel>
        )}
        <div style={panelHeaderStyle}>
          <div>
            <h3 style={panelTitleStyle}>CFOP</h3>
            <p style={panelTextStyle}>CODIGOS FISCAIS MAIS USADOS NO CADASTRO DE CLIENTES.</p>
          </div>
          <button type="button" style={orangeButtonStyle} onClick={() => setCfopForm({ mode: "create", code: "", description: "" })}>+ NOVO CFOP</button>
        </div>
        <Table headers={["CODIGO", "DESCRICAO", "ACOES"]}>
          {cfops.map((item) => (
            <tr key={item.id}>
              <td style={strongCellStyle}>{item.code}</td>
              <td style={centerCellStyle}>{item.description}</td>
              <td style={actionCellStyle}>
                <EditButton onClick={() => setCfopForm({ mode: "edit", id: item.id, code: item.code, description: item.description })} />
                <DeleteButton onClick={() => onCfopsChange(cfops.filter((entry) => entry.id !== item.id))} />
              </td>
            </tr>
          ))}
        </Table>
      </section>
      <SimpleGeneralRegistry title="REGIME TRIBUTARIO" description="REGIMES DISPONIVEIS PARA CLASSIFICAR O CLIENTE." addLabel="+ NOVO REGIME" items={taxRegimes} onChange={onTaxRegimesChange} />
      <SimpleGeneralRegistry title="PERFIL FISCAL" description="PERFIS FISCAIS USADOS NO ATENDIMENTO AO CLIENTE." addLabel="+ NOVO PERFIL" items={fiscalProfiles} onChange={onFiscalProfilesChange} />
      <SimpleGeneralRegistry title="BENEFICIO FISCAL ESPECIFICO" description="BENEFICIOS QUE PODEM SER ASSOCIADOS AO CLIENTE." addLabel="+ NOVO BENEFICIO" items={fiscalBenefits} onChange={onFiscalBenefitsChange} />
      <SimpleGeneralRegistry title="MOTIVOS DE PERDA NO CRM" description="OPCOES OBRIGATORIAS QUANDO UMA OPORTUNIDADE E MARCADA COMO PERDIDA." addLabel="+ NOVO MOTIVO" items={lostReasons} onChange={onLostReasonsChange} />
      </div>
      )}
    </div>
  );
}

function SimpleGeneralRegistry({ title, description, addLabel, items, onChange }: { title: string; description: string; addLabel: string; items: GeneralOption[]; onChange: (items: GeneralOption[]) => void }) {
  const [draft, setDraft] = useState<{ mode: Mode; id?: string; name: string } | null>(null);
  function save() {
    if (!draft?.name.trim()) return;
    const name = draft.name.trim().toUpperCase();
    if (draft.mode === "edit" && draft.id) onChange(items.map((item) => item.id === draft.id ? { ...item, name } : item));
    else onChange([...items, { id: `option-${Date.now()}`, name }]);
    setDraft(null);
  }
  return <section style={generalRegistryPanelStyle}>
    {draft && <FormPanel title={draft.mode === "create" ? `CADASTRAR ${title}` : `EDITAR ${title}`}><label style={wideLabelStyle}>DESCRICAO<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="INFORME O NOME" style={inputStyle} /></label><Actions onCancel={() => setDraft(null)} onSave={save} /></FormPanel>}
    <div style={panelHeaderStyle}><div><h3 style={panelTitleStyle}>{title}</h3><p style={panelTextStyle}>{description}</p></div><button type="button" style={orangeButtonStyle} onClick={() => setDraft({ mode: "create", name: "" })}>{addLabel}</button></div>
    <Table headers={["DESCRICAO", "ACOES"]}>{items.map((item) => <tr key={item.id}><td style={supplierNameCellStyle}>{item.name}</td><td style={supplierActionCellStyle}><EditButton onClick={() => setDraft({ mode: "edit", id: item.id, name: item.name })} /><DeleteButton onClick={() => onChange(items.filter((entry) => entry.id !== item.id))} /></td></tr>)}</Table>
  </section>;
}

function LimitMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return <div style={{ ...limitMetricStyle, borderTopColor: color }}><span>{label}</span><strong style={{ color }}>{value}</strong></div>;
}

function PricingParamsPanel({
  params,
  operationalParams,
  onChange,
  onOperationalParamsChange,
}: {
  params: PricingParamsByCompany;
  operationalParams: PricingOperationalParams;
  onChange: (params: PricingParamsByCompany) => void;
  onOperationalParamsChange: (params: PricingOperationalParams) => void;
}) {
  const [company, setCompany] = useState<PricingGoalCompany>("dawos");
  const companyParams = params[company] ?? defaultPricingParamsByCompany[company];
  const operationalTotal = company === "dawos"
    ? companyParams.commission + companyParams.freight + companyParams.otherCosts + companyParams.clientIcms + companyParams.additionalCosts
    : company === "carcat"
      ? companyParams.simplesTax + companyParams.commission + companyParams.freight + companyParams.otherCosts
      : companyParams.outputIcms + companyParams.outputPisCofins + companyParams.outputIpi + companyParams.commission + companyParams.freight;
  const productiveHours = operationalParams.monthlyAvailableHours * (operationalParams.productivityPercent / 100);
  const minimumMcrHour = productiveHours > 0 ? operationalParams.monthlyMcTarget / productiveHours : 0;
  const targetMcrHour = productiveHours > 0 ? operationalParams.monthlyFixedCostsDesiredProfit / productiveHours : 0;

  function updateCompanyParams(nextParams: PricingParams) {
    onChange({ ...params, [company]: nextParams });
  }

  return (
    <div style={goalsPanelStyle}>
      <section style={pricingPanelStyle}>
        <div style={pricingPanelHeaderStyle}>
          <h4 style={subPanelTitleStyle}>META MC/HORA COMUM AS 3 EMPRESAS</h4>
          <span style={greenBadgeStyle}>MC MINIMA: R$ {minimumMcrHour.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/H · META: R$ {targetMcrHour.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/H</span>
        </div>
        <div style={pricingOperationalFieldsStyle}>
          <ParamField label="META MC TOTAL MENSAL (R$)" value={operationalParams.monthlyMcTarget} color="#16a34a" wide onChange={(monthlyMcTarget) => onOperationalParamsChange({ ...operationalParams, monthlyMcTarget })} />
          <ParamField label="CF + DF + LD MENSAL (R$)" value={operationalParams.monthlyFixedCostsDesiredProfit} color="#e6007e" wide onChange={(monthlyFixedCostsDesiredProfit) => onOperationalParamsChange({ ...operationalParams, monthlyFixedCostsDesiredProfit })} />
          <ParamField label="HORAS DISPONIVEIS NO MES" value={operationalParams.monthlyAvailableHours} color="#0284c7" onChange={(monthlyAvailableHours) => onOperationalParamsChange({ ...operationalParams, monthlyAvailableHours })} />
          <ParamField label="PRODUTIVIDADE (%)" value={operationalParams.productivityPercent} color="#f59e0b" onChange={(productivityPercent) => onOperationalParamsChange({ ...operationalParams, productivityPercent })} />
        </div>
      </section>
      <div style={goalCompanyTabsStyle}>
        {(["dawos", "carcat", "gta"] as PricingGoalCompany[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCompany(key)}
            style={{ ...goalCompanyButtonStyle, ...(company === key ? goalCompanyButtonActiveStyle : {}) }}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={goalsNoticeStyle}>
        PARAMETROS EXCLUSIVOS DA {company.toUpperCase()}. SOMENTE OS CAMPOS USADOS NAS FORMULAS DESTA EMPRESA SAO EXIBIDOS.
      </div>
      <div style={pricingGridStyle}>
        <section style={pricingHighlightStyle}>
          <HighlightParamField label="MC% PADRAO" value={companyParams.mcDefault} suffix="%" color="#16a34a" onChange={(mcDefault) => updateCompanyParams({ ...companyParams, mcDefault })} />
          <div style={dividerStyle} />
          <label style={highlightParamLabelStyle}>
            MCR$ HORA PADRAO
            <strong style={{ color: "#0284c7", fontSize: 27 }}>R$ {targetMcrHour.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/H</strong>
          </label>
        </section>

        <section style={pricingPanelStyle}>
          <div style={pricingPanelHeaderStyle}>
            <h4 style={subPanelTitleStyle}>CUSTOS OPERACIONAIS (%)</h4>
            <span style={greenBadgeStyle}>SOMA TOTAL DAS DESPESAS: {formatPercent(operationalTotal)}</span>
          </div>
          <div style={pricingFieldsStyle}>
            <ParamField label="COMISSAO PREVIA (%)" value={companyParams.commission} color="#ff5a00" onChange={(commission) => updateCompanyParams({ ...companyParams, commission })} />
            <ParamField label="FRETE (%)" value={companyParams.freight} color="#0ea5e9" onChange={(freight) => updateCompanyParams({ ...companyParams, freight })} />
            {company !== "gta" && <ParamField label="OUTROS CUSTOS (%)" value={companyParams.otherCosts} color="#8b5cf6" onChange={(otherCosts) => updateCompanyParams({ ...companyParams, otherCosts })} />}
            {company === "dawos" && <>
              <ParamField label="ICMS DO CLIENTE (%)" value={companyParams.clientIcms} color="#14b8a6" onChange={(clientIcms) => updateCompanyParams({ ...companyParams, clientIcms })} />
              <ParamField label="DEMAIS CUSTOS (%)" value={companyParams.additionalCosts} color="#ef4444" onChange={(additionalCosts) => updateCompanyParams({ ...companyParams, additionalCosts })} />
            </>}
            {company === "carcat" &&
              <ParamField label="IMPOSTO NO SIMPLES (%)" value={companyParams.simplesTax} color="#eab308" onChange={(simplesTax) => updateCompanyParams({ ...companyParams, simplesTax })} />}
            {company === "gta" && <>
              <ParamField label="ICMS SAIDA LP/LC (%)" value={companyParams.outputIcms} color="#38bdf8" onChange={(outputIcms) => updateCompanyParams({ ...companyParams, outputIcms })} />
              <ParamField label="PIS / COFINS LP/LC (%)" value={companyParams.outputPisCofins} color="#f59e0b" onChange={(outputPisCofins) => updateCompanyParams({ ...companyParams, outputPisCofins })} />
              <ParamField label="IPI SAIDA/ENTRADA (%)" value={companyParams.outputIpi} color="#a78bfa" onChange={(outputIpi) => updateCompanyParams({ ...companyParams, outputIpi })} />
            </>}
          </div>
        </section>
      </div>
    </div>
  );
}

function PricingGoalsPanel({
  goalsByCompany,
  onChange,
  salesGoals,
  salesRepresentatives,
  onSalesGoalsChange,
}: {
  goalsByCompany: PricingGoalsByCompany;
  onChange: (goals: PricingGoalsByCompany) => void;
  salesGoals: SalesGoals;
  salesRepresentatives: SalesRepresentative[];
  onSalesGoalsChange: (goals: SalesGoals) => void;
}) {
  const [company, setCompany] = useState<PricingGoalCompany>("dawos");
  const goals = goalsByCompany[company];

  function updateCompanyGoals(nextGoals: PricingGoals) {
    onChange({ ...goalsByCompany, [company]: nextGoals });
  }

  return (
    <div style={goalsPanelStyle}>
      <section style={pricingPanelStyle}>
        <div style={pricingPanelHeaderStyle}>
          <h4 style={subPanelTitleStyle}>METAS DE FATURAMENTO POR VENDEDOR</h4>
          <span style={greenBadgeStyle}>SOMA DAWOS, CARCAT E GTA NO RELATORIO META X REALIZADO</span>
        </div>
        <div style={pricingOperationalFieldsStyle}>
          {salesRepresentatives.map((representative) => <ParamField key={representative.id} label={`META MENSAL · ${representative.name}`} value={salesGoals.byRepresentative[representative.id] || 0} color="#16a34a" wide onChange={(value) => onSalesGoalsChange({ byRepresentative: { ...salesGoals.byRepresentative, [representative.id]: value } })} />)}
          {!salesRepresentatives.length ? <div style={goalsNoticeStyle}>NENHUM VENDEDOR ATIVO VINCULADO A ESTA EMPRESA.</div> : null}
        </div>
      </section>
      <div style={goalCompanyTabsStyle}>
        {(["dawos", "carcat", "gta"] as PricingGoalCompany[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCompany(key)}
            style={{
              ...goalCompanyButtonStyle,
              ...(company === key ? goalCompanyButtonActiveStyle : {}),
            }}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={goalsNoticeStyle}>
        FAIXAS DE PRECIFICACAO DA {company.toUpperCase()}. AS CORES SAO APLICADAS SOMENTE AOS RESULTADOS DOS SIMULADORES A, B E C.
      </div>
      <div style={goalsGridStyle}>
        <GoalRangeCard
          title="MARGEM MC%"
          suffix="%"
          range={goals.mcPercent}
          onChange={(mcPercent) => updateCompanyGoals({ ...goals, mcPercent })}
        />
        <GoalRangeCard
          title="MC R$/HORA"
          prefix="R$"
          suffix="/H"
          range={goals.mcrHour}
          onChange={(mcrHour) => updateCompanyGoals({ ...goals, mcrHour })}
        />
        <GoalRangeCard
          title="PRECO R$/KG"
          prefix="R$"
          suffix="/KG"
          range={goals.pricePerKg}
          onChange={(pricePerKg) => updateCompanyGoals({ ...goals, pricePerKg })}
        />
      </div>
    </div>
  );
}

function QuoteParametersPanel({
  values,
  onChange,
}: {
  values: QuoteParametersByCompany;
  onChange: (values: QuoteParametersByCompany) => void;
}) {
  const [company, setCompany] = useState<QuoteCompanyKey>("dawos");
  const params = {
    ...defaultQuoteParametersByCompany[company],
    ...(values[company] ?? {}),
  };

  function update<K extends keyof typeof params>(field: K, value: (typeof params)[K]) {
    onChange({
      ...values,
      [company]: { ...params, [field]: value },
    });
  }

  function selectLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("SELECIONE UM ARQUIVO DE IMAGEM.");
      return;
    }
    if (file.size > 900_000) {
      window.alert("A LOGO DEVE TER NO MAXIMO 900 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  return (
    <div style={quoteParametersStyle}>
      <div style={goalCompanyTabsStyle}>
        {(["dawos", "carcat", "gta"] as QuoteCompanyKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCompany(key)}
            style={{
              ...goalCompanyButtonStyle,
              ...(company === key ? goalCompanyButtonActiveStyle : {}),
            }}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={quoteParametersGridStyle}>
        <section style={quoteLogoPanelStyle}>
          <span style={quoteFieldTitleStyle}>LOGO DA EMPRESA</span>
          <div style={quoteLogoPreviewStyle}>
            {params.logo ? (
              <img src={params.logo} alt={`LOGO ${params.name}`} style={quoteLogoImageStyle} />
            ) : (
              <strong style={quoteLogoFallbackStyle}>{company.toUpperCase()}</strong>
            )}
          </div>
          <label style={quoteFileButtonStyle}>
            ESCOLHER IMAGEM
            <input
              type="file"
              accept="image/*"
              onChange={(event) => selectLogo(event.target.files?.[0])}
              style={hiddenFileInputStyle}
            />
          </label>
          {params.logo && (
            <button type="button" onClick={() => update("logo", "")} style={removeLogoButtonStyle}>
              REMOVER LOGO
            </button>
          )}
        </section>

        <section style={quoteFieldsPanelStyle}>
          <div style={twoColumnsStyle}>
            <label style={wideLabelStyle}>
              NOME DA EMPRESA
              <input value={params.name} onChange={(event) => update("name", event.target.value.toUpperCase())} style={inputStyle} />
            </label>
            <label style={wideLabelStyle}>
              TELEFONE
              <input value={params.phone} onChange={(event) => update("phone", formatPhone(event.target.value))} style={inputStyle} inputMode="tel" />
            </label>
            <label style={{ ...wideLabelStyle, gridColumn: "1 / -1" }}>
              ENDERECO COMPLETO
              <input value={params.address} onChange={(event) => update("address", event.target.value.toUpperCase())} style={inputStyle} />
            </label>
            <label style={wideLabelStyle}>
              E-MAIL
              <input value={params.email} onChange={(event) => update("email", event.target.value.toLowerCase())} style={{ ...inputStyle, textTransform: "none" }} />
            </label>
            <label style={wideLabelStyle}>
              SITE
              <input value={params.site} onChange={(event) => update("site", event.target.value.toLowerCase())} style={{ ...inputStyle, textTransform: "none" }} />
            </label>
            <label style={wideLabelStyle}>
              VALIDADE DO ORCAMENTO (DIAS)
              <input
                type="number"
                min={1}
                value={params.validityDays}
                onChange={(event) => update("validityDays", Math.max(1, Number(event.target.value) || 1))}
                style={inputStyle}
              />
            </label>
            <label style={{ ...wideLabelStyle, gridColumn: "1 / -1" }}>
              ENDERECO OU CAMINHO DA LOGO
              <input value={params.logo.startsWith("data:") ? "IMAGEM SELECIONADA" : params.logo} onChange={(event) => update("logo", event.target.value)} disabled={params.logo.startsWith("data:")} placeholder="EX: /companies/dawos-logo.jpg" style={inputStyle} />
            </label>
            <label style={{ ...wideLabelStyle, gridColumn: "1 / -1" }}>
              OBSERVACOES TECNICAS PADRAO
              <textarea
                value={params.technicalNotes}
                onChange={(event) => update("technicalNotes", event.target.value.toUpperCase())}
                placeholder="INFORMACOES EXIBIDAS NO RODAPE DO ORCAMENTO"
                style={{ ...inputStyle, minHeight: 112, paddingTop: 14, resize: "vertical" }}
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

function GoalRangeCard({
  title,
  prefix,
  suffix,
  range,
  onChange,
}: {
  title: string;
  prefix?: string;
  suffix: string;
  range: PricingGoals["mcPercent"];
  onChange: (range: PricingGoals["mcPercent"]) => void;
}) {
  return (
    <section style={goalCardStyle}>
      <h4 style={goalTitleStyle}>{title}</h4>
      <div style={goalRangesStyle}>
        <label style={{ ...goalRangeStyle, ...goalRedStyle }}>
          <span>VERMELHO ATE</span>
          <span style={goalInputRowStyle}>
            {prefix && <strong>{prefix}</strong>}
            <input
              type="number"
              min="0"
              step="0.1"
              value={range.redMax}
              onChange={(event) => onChange({ ...range, redMax: Number(event.target.value) || 0 })}
              style={goalInputStyle}
            />
            <strong>{suffix}</strong>
          </span>
        </label>
        <div style={{ ...goalRangeStyle, ...goalYellowStyle }}>
          <span>AMARELO</span>
          <strong>ACIMA DE {formatGoalNumber(range.redMax)} ATE ABAIXO DE {formatGoalNumber(range.greenMin)}</strong>
        </div>
        <label style={{ ...goalRangeStyle, ...goalGreenStyle }}>
          <span>VERDE A PARTIR DE</span>
          <span style={goalInputRowStyle}>
            {prefix && <strong>{prefix}</strong>}
            <input
              type="number"
              min="0"
              step="0.1"
              value={range.greenMin}
              onChange={(event) => onChange({ ...range, greenMin: Number(event.target.value) || 0 })}
              style={goalInputStyle}
            />
            <strong>{suffix}</strong>
          </span>
        </label>
      </div>
    </section>
  );
}

function ParamField({ label, value, color, onChange, prefix, suffix, wide = false }: { label: string; value: number; color: string; onChange: (value: number) => void; prefix?: string; suffix?: string; wide?: boolean }) {
  return (
    <label style={paramLabelStyle}>
      {label}
      <span style={paramInlineStyle}>
        {prefix && <strong style={{ ...paramAffixStyle, color }}>{prefix}</strong>}
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          style={{ ...paramInputStyle, ...(wide ? { width: 230 } : {}), color, borderColor: `${color}55` }}
        />
        {suffix && <strong style={{ ...paramAffixStyle, color }}>{suffix}</strong>}
      </span>
    </label>
  );
}

function HighlightParamField({ label, value, color, onChange, prefix, suffix }: { label: string; value: number; color: string; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
  return (
    <label style={highlightParamLabelStyle}>
      {label}
      <span style={highlightParamInlineStyle}>
        <strong style={{ ...highlightParamAffixStyle, color }}>{prefix ?? ""}</strong>
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          style={{ ...paramInputStyle, color, borderColor: `${color}55` }}
        />
        <strong style={{ ...highlightParamAffixStyle, color }}>{suffix ?? ""}</strong>
      </span>
    </label>
  );
}

function Panel({ title, description, actionLabel, onAction, children }: { title: string; description: string; actionLabel?: string; onAction: () => void; children: React.ReactNode }) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h3 style={panelTitleStyle}>{title}</h3>
          <p style={panelTextStyle}>{description}</p>
        </div>
        {actionLabel && <button type="button" onClick={onAction} style={orangeButtonStyle}>{actionLabel}</button>}
      </div>
      {children}
    </section>
  );
}

function FormPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const editing = title.startsWith("EDITAR");
  return (
    <section style={{
      ...formPanelStyle,
      borderColor: editing ? "rgba(234, 179, 8, .62)" : "rgba(22, 163, 74, .42)",
      background: editing ? "rgba(255, 251, 235, .82)" : "rgba(240, 253, 244, .76)",
    }}>
      <h3 style={panelTitleStyle}>{title}</h3>
      <div style={formBodyStyle}>{children}</div>
    </section>
  );
}

function Actions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div style={formActionsStyle}>
      <button type="button" onClick={onCancel} style={cancelButtonStyle}>CANCELAR</button>
      <button type="button" onClick={onSave} style={orangeButtonStyle}>SALVAR</button>
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={tableWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>{headers.map((header) => <th key={header} style={thStyle}>{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label style={wideLabelStyle}>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );
}

function SelectField({ label, value, placeholder, options, onChange }: { label: string; value: string; placeholder: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label style={wideLabelStyle}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label style={costLabelStyle}>
      {label}
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        style={costInputStyle}
      />
    </label>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} style={editButtonStyle}>EDITAR</button>;
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} style={deleteButtonStyle}>EXCLUIR</button>;
}

function calculatePaperCost(material: SpecificMaterial, params: PaperCostParams) {
  const ipiRate = params.ipi / 100;
  const icmsRate = params.icms / 100;
  const pisCofinsRate = params.pisCofins / 100;
  const grammage = parseBrazilianNumber(material.grammage);
  const purchaseWithoutIpi = material.costIpi / (1 + ipiRate);
  const purchaseLp = purchaseWithoutIpi * (1 - icmsRate);
  const pisCofinsValue = purchaseWithoutIpi * pisCofinsRate;
  const realPurchase = purchaseLp - pisCofinsValue;
  const kgWithoutIpi = grammage > 0 ? purchaseWithoutIpi / grammage : 0;
  const costWithoutInvoice = purchaseLp + (material.costIpi - purchaseWithoutIpi);

  return {
    purchaseWithoutIpi,
    purchaseLp,
    pisCofinsValue,
    realPurchase,
    kgWithoutIpi,
    costWithoutInvoice,
  };
}

function parseBrazilianNumber(value: string) {
  const match = value.match(/[\d,.]+/);
  if (!match) return 0;
  return Number(match[0].replace(/\./g, "").replace(",", ".")) || 0;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 8) {
    return `(${area}) ${number.slice(0, 4)}${number.length > 4 ? `-${number.slice(4)}` : ""}`;
  }
  return `(${area}) ${number.slice(0, 5)}-${number.slice(5)}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function displayDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function formatGeneralMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWeight(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`;
}

function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatGoalNumber(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const pageStyle = { color: "#141827" };
const shellStyle = { width: "100%", maxWidth: 2120, margin: "0 auto", padding: "44px 52px", borderRadius: 26, border: "1px solid rgba(52,64,84,.22)", background: "rgba(255,255,255,.94)", boxShadow: "0 28px 72px rgba(39,36,67,.12)", boxSizing: "border-box" as const, overflow: "hidden" };
const managerSwitcherStyle = { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8, padding: 8, marginBottom: 34, borderRadius: 999, background: "#eef2f7", border: "1px solid rgba(52,64,84,.12)", boxShadow: "inset 0 1px 5px rgba(39,36,67,.08)" };
const managerSwitchButtonStyle = { minHeight: 64, padding: "0 14px", border: "none", borderRadius: 999, background: "transparent", color: "#667085", fontSize: 15, fontWeight: 900, letterSpacing: 1, lineHeight: 1.2, cursor: "pointer" };
const activeManagerSwitchStyle = { color: "#fff", background: "linear-gradient(135deg,#8b36e8,#6f32d2)", boxShadow: "0 12px 24px rgba(111,50,210,.24)" };
const generalRegistriesGridStyle = { display: "grid", gap: 28 };
const generalRegistryPanelStyle = { border: "1px solid rgba(255,0,135,.32)", borderRadius: 22, background: "rgba(255,247,252,.62)", padding: 34, marginTop: 0 };
const generalSubTabsStyle = { display: "inline-grid", gridTemplateColumns: "repeat(2,minmax(190px,1fr))", gap: 8, padding: 7, marginBottom: 28, borderRadius: 999, background: "#eef2f7", border: "1px solid rgba(52,64,84,.12)" };
const generalSubTabStyle = { minHeight: 52, padding: "0 28px", border: "none", borderRadius: 999, background: "transparent", color: "#667085", fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: "pointer" };
const activeGeneralSubTabStyle = { color: "#fff", background: "linear-gradient(135deg,#8b36e8,#6f32d2)", boxShadow: "0 10px 20px rgba(111,50,210,.2)" };
const limitReportStyle = { marginTop: 28, padding: 26, border: "1px solid rgba(255,0,135,.24)", borderRadius: 18, background: "rgba(255,255,255,.8)" };
const limitClientTitleStyle = { margin: "0 0 22px", color: "#141827", fontSize: 25, fontWeight: 900 };
const limitReportGridStyle = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 16 };
const limitMetricStyle = { display: "grid", gap: 10, minHeight: 90, padding: 18, border: "1px solid rgba(52,64,84,.12)", borderTop: "4px solid", borderRadius: 12, background: "#fff", boxSizing: "border-box" as const };
const limitEmptyStyle = { marginTop: 24, padding: 28, border: "1px dashed rgba(111,50,210,.3)", borderRadius: 14, color: "#667085", fontSize: 17, fontWeight: 800, textAlign: "center" as const };
const introStyle = { marginBottom: 32 };
const sectionTitleStyle = { margin: 0, fontSize: 32, color: "#141827", fontWeight: 900 };
const sectionSubtitleStyle = { margin: "12px 0 0", fontSize: 18, color: "#344054", fontWeight: 800 };
const tabsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", alignItems: "center", gap: 8, borderRadius: 999, padding: 8, background: "#eef2f7", border: "1px solid rgba(52,64,84,.12)", boxShadow: "inset 0 1px 5px rgba(39,36,67,.08)", marginBottom: 38 };
const tabButtonStyle = { minHeight: 66, width: "100%", minWidth: 0, padding: "0 12px", border: "none", borderRadius: 999, background: "transparent", color: "#667085", fontSize: 15, fontWeight: 900, letterSpacing: 1, lineHeight: 1.2, display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center" as const, whiteSpace: "normal" as const, cursor: "pointer" };
const activeTabButtonStyle = { color: "#fff", background: "linear-gradient(135deg,#8b36e8,#6f32d2)", boxShadow: "0 12px 24px rgba(111,50,210,.24)" };
const panelStyle = { border: "1px solid rgba(255,0,135,.32)", borderRadius: 22, background: "rgba(255,247,252,.62)", padding: 34, marginTop: 28 };
const formPanelStyle = { ...panelStyle, background: "rgba(255,250,253,.74)" };
const panelHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 22, marginBottom: 24, flexWrap: "wrap" as const };
const panelTitleStyle = { margin: 0, color: "#e6007e", fontSize: 29, fontWeight: 900, letterSpacing: 1 };
const panelTextStyle = { margin: "14px 0 0", color: "#667085", fontSize: 16, fontWeight: 800 };
const orangeButtonStyle = { minHeight: 52, padding: "0 28px", border: "none", borderRadius: 12, background: "linear-gradient(180deg,#ff5a00,#df7b00)", color: "#fff", fontSize: 17, fontWeight: 900, cursor: "pointer", boxShadow: "0 14px 26px rgba(223,123,0,.24)" };
const tableWrapStyle = { overflowX: "hidden" as const, border: "1px solid rgba(255,0,135,.22)", borderRadius: 14, background: "#fff" };
const tableStyle = { width: "100%", minWidth: "100%", tableLayout: "fixed" as const, borderCollapse: "collapse" as const };
const thStyle = { padding: "18px 14px", textAlign: "center" as const, background: "rgba(255,0,135,.08)", color: "#d60072", fontSize: 17, fontWeight: 900, letterSpacing: 1, borderBottom: "1px solid rgba(255,0,135,.22)", whiteSpace: "normal" as const, overflowWrap: "anywhere" as const };
const strongCellStyle = { padding: "18px 14px", borderBottom: "1px solid rgba(255,0,135,.10)", color: "#141827", fontWeight: 900, fontSize: 19, textAlign: "center" as const, whiteSpace: "normal" as const, overflowWrap: "anywhere" as const };
const centerCellStyle = { ...strongCellStyle, textAlign: "center" as const };
const actionCellStyle = { ...strongCellStyle, textAlign: "center" as const, whiteSpace: "nowrap" as const };
const supplierNameCellStyle = { ...strongCellStyle, textAlign: "left" as const, paddingLeft: 28 };
const supplierActionCellStyle = { ...actionCellStyle, textAlign: "right" as const, paddingRight: 28 };
const editButtonStyle = { minHeight: 40, padding: "0 18px", border: "none", borderRadius: 8, background: "#7c3aed", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer", marginRight: 12 };
const deleteButtonStyle = { ...editButtonStyle, marginRight: 0, background: "#ff4b4b" };
const tagStyle = { display: "inline-flex", padding: "3px 7px", background: "rgba(255,128,0,.12)", color: "#e68019", border: "1px solid rgba(230,128,25,.24)", borderRadius: 3 };
const priceCellStyle = { ...centerCellStyle, color: "#22c55e" };
const priceHintStyle = { display: "block", color: "#667085", fontSize: 12, marginTop: 4 };
const formulaCellStyle = { ...centerCellStyle, fontFamily: "monospace", fontSize: 18, lineHeight: 1.35 };
const moneyCellStyle = { ...centerCellStyle, minWidth: 150 };
const costPriceInputStyle = { width: 118, minHeight: 36, padding: "0 9px", textAlign: "right" as const, fontWeight: 900 };
const specialConditionToggleStyle = { display: "flex", alignItems: "center", gap: 10, marginTop: 18, color: "#a21caf", fontSize: 16, fontWeight: 900, cursor: "pointer" };
const specialMaterialRowStyle = { background: "#fff3fb" };
const expiredSpecialMaterialRowStyle = { background: "#f3f4f6", opacity: 0.7 };
const specialMaterialTagStyle = { display: "inline-flex", padding: "5px 8px", borderRadius: 8, background: "#fce7f3", color: "#be185d", fontSize: 11, fontWeight: 900 };
const expiredSpecialMaterialTagStyle = { display: "inline-flex", padding: "5px 8px", borderRadius: 8, background: "#e5e7eb", color: "#6b7280", fontSize: 11, fontWeight: 900 };
const specialCostSectionStyle = { marginTop: 28, paddingTop: 26, borderTop: "2px solid rgba(190,24,93,.2)" };
const specialCostTitleStyle = { margin: "0 0 18px", color: "#a21caf", fontSize: 19, fontWeight: 900, letterSpacing: 1 };
const specialGroupCellStyle = { padding: "18px 20px", background: "#fce7f3", color: "#9d174d", fontSize: 18, fontWeight: 900, borderBottom: "1px solid rgba(190,24,93,.16)" };
const groupCellStyle = { padding: "18px 20px", background: "rgba(230,128,25,.08)", color: "#141827", fontSize: 18, fontWeight: 900, borderBottom: "1px solid rgba(255,0,135,.10)" };
const costControlsStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr)) auto", alignItems: "end", gap: 22, marginBottom: 28, padding: 24, border: "1px solid rgba(52,64,84,.12)", borderRadius: 16, background: "rgba(255,255,255,.72)" };
const costLabelStyle = { display: "grid", gap: 10, color: "#344054", fontSize: 16, fontWeight: 900, textAlign: "center" as const };
const costInputStyle = { height: 58, borderRadius: 12, border: "1px solid rgba(52,64,84,.18)", background: "#fff", color: "#141827", padding: "0 18px", fontSize: 20, fontWeight: 900, outline: "none", boxSizing: "border-box" as const, textAlign: "center" as const };
const pricingGridStyle = { display: "grid", gridTemplateColumns: "minmax(390px,.7fr) minmax(780px,1.3fr)", gap: 28, alignItems: "stretch" };
const pricingHighlightStyle = { display: "grid", alignContent: "center", justifyItems: "center", gap: 34, padding: 34, borderRadius: 18, border: "1px solid rgba(34,197,94,.28)", background: "rgba(240,253,244,.64)", minHeight: 360, textAlign: "center" as const };
const pricingPanelStyle = { padding: 34, borderRadius: 18, border: "1px solid rgba(52,64,84,.14)", background: "rgba(255,255,255,.72)" };
const pricingPanelHeaderStyle = { display: "grid", justifyItems: "center", gap: 12, marginBottom: 28, textAlign: "center" as const };
const subPanelTitleStyle = { margin: 0, color: "#e68019", fontSize: 18, fontWeight: 900, letterSpacing: 1 };
const greenBadgeStyle = { color: "#22c55e", fontSize: 15, fontWeight: 900 };
const pricingFieldsStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(190px,1fr))", gap: 24, alignItems: "center" };
const pricingOperationalFieldsStyle = { display: "grid", gridTemplateColumns: "repeat(4,minmax(190px,1fr))", gap: 24, alignItems: "center" };
const paramLabelStyle = { display: "grid", justifyItems: "center", gap: 12, color: "#667085", fontSize: 18, fontWeight: 900, textAlign: "center" as const };
const paramInlineStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 };
const paramInputStyle = { width: 126, height: 64, borderRadius: 12, border: "1px solid rgba(52,64,84,.18)", background: "#fff", textAlign: "center" as const, fontSize: 25, fontWeight: 900, outline: "none", boxShadow: "0 10px 24px rgba(39,36,67,.06)" };
const paramAffixStyle = { fontSize: 20, fontWeight: 900 };
const highlightParamLabelStyle = { ...paramLabelStyle, width: 260 };
const highlightParamInlineStyle = { display: "grid", gridTemplateColumns: "42px 126px 42px", alignItems: "center", justifyContent: "center", gap: 10 };
const highlightParamAffixStyle = { fontSize: 20, fontWeight: 900, textAlign: "center" as const };
const dividerStyle = { height: 1, background: "linear-gradient(90deg,transparent,rgba(255,0,135,.28),transparent)" };
const goalsPanelStyle = { display: "grid", gap: 22 };
const goalCompanyTabsStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 10, padding: 7, borderRadius: 999, border: "1px solid rgba(52,64,84,.12)", background: "#eef2f7" };
const goalCompanyButtonStyle = { minHeight: 52, border: "none", borderRadius: 999, background: "transparent", color: "#667085", fontSize: 17, fontWeight: 900, letterSpacing: 1, cursor: "pointer" };
const goalCompanyButtonActiveStyle = { color: "#fff", background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)", boxShadow: "0 12px 24px rgba(230,61,174,.20)" };
const quoteParametersStyle = { display: "grid", gap: 22 };
const quoteParametersGridStyle = { display: "grid", gridTemplateColumns: "minmax(280px,.65fr) minmax(620px,1.35fr)", gap: 24, alignItems: "stretch" };
const quoteLogoPanelStyle = { minHeight: 390, padding: 28, borderRadius: 18, border: "1px solid rgba(111,50,210,.18)", background: "linear-gradient(145deg,rgba(247,242,255,.9),rgba(255,247,251,.94))", display: "grid", alignContent: "center", justifyItems: "center", gap: 18 };
const quoteFieldTitleStyle = { margin: 0, color: "#6f32d2", fontSize: 17, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };
const quoteLogoPreviewStyle = { width: "100%", minHeight: 190, padding: 20, borderRadius: 14, border: "1px solid rgba(52,64,84,.12)", background: "#fff", display: "grid", placeItems: "center", overflow: "hidden" };
const quoteLogoImageStyle = { display: "block", width: "100%", maxWidth: 270, maxHeight: 150, objectFit: "contain" as const };
const quoteLogoFallbackStyle = { color: "#667085", fontSize: 28, fontWeight: 900, letterSpacing: 2 };
const quoteFileButtonStyle = { minHeight: 48, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 20px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#8b36e8,#e63dae,#ff3b25)", color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: .7, cursor: "pointer" };
const hiddenFileInputStyle = { position: "absolute" as const, width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" as const, border: 0 };
const removeLogoButtonStyle = { minHeight: 42, padding: "0 18px", borderRadius: 10, border: "1px solid rgba(255,75,75,.26)", background: "#fff1f2", color: "#e11d48", fontSize: 13, fontWeight: 900, cursor: "pointer" };
const quoteFieldsPanelStyle = { padding: 26, borderRadius: 18, border: "1px solid rgba(52,64,84,.14)", background: "rgba(255,255,255,.82)", display: "grid", alignContent: "start", gap: 20 };
const goalsNoticeStyle = { minHeight: 48, display: "grid", placeItems: "center", padding: "0 18px", borderRadius: 12, border: "1px solid rgba(111,50,210,.16)", background: "rgba(111,50,210,.05)", color: "#6f32d2", fontSize: 15, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };
const goalsGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(260px,1fr))", gap: 20 };
const goalCardStyle = { padding: 22, borderRadius: 16, border: "1px solid rgba(52,64,84,.14)", background: "rgba(255,255,255,.84)", display: "grid", gap: 16, boxShadow: "0 16px 34px rgba(39,36,67,.07)" };
const goalTitleStyle = { margin: 0, color: "#141827", fontSize: 22, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };
const goalRangesStyle = { display: "grid", gap: 12 };
const goalRangeStyle = { minHeight: 94, padding: 14, borderRadius: 13, border: "1px solid", display: "grid", placeItems: "center", alignContent: "center", gap: 9, color: "#141827", fontSize: 14, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const, boxSizing: "border-box" as const };
const goalRedStyle = { borderColor: "rgba(239,68,68,.30)", background: "rgba(254,226,226,.70)", color: "#c62828" };
const goalYellowStyle = { borderColor: "rgba(234,179,8,.34)", background: "rgba(254,249,195,.72)", color: "#a16207" };
const goalGreenStyle = { borderColor: "rgba(22,163,74,.30)", background: "rgba(220,252,231,.72)", color: "#15803d" };
const goalInputRowStyle = { display: "flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 17 };
const goalInputStyle = { width: 112, height: 48, borderRadius: 10, border: "1px solid currentColor", background: "rgba(255,255,255,.92)", color: "inherit", textAlign: "center" as const, fontSize: 21, fontWeight: 900, outline: "none" };
const timeToolbarStyle = { display: "flex", gap: 14, alignItems: "center", marginBottom: 24, flexWrap: "wrap" as const };
const filterInputStyle = { minWidth: 310, height: 50, borderRadius: 10, border: "1px solid rgba(52,64,84,.18)", background: "#fff", color: "#141827", padding: "0 18px", fontSize: 16, fontWeight: 800, outline: "none", boxSizing: "border-box" as const };
const materialFilterToolbarStyle = { display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" as const };
const materialFilterLabelStyle = { display: "grid", gap: 7, color: "#6f32d2", fontSize: 11, fontWeight: 900, letterSpacing: 1 };
const materialFilterSelectStyle = { minWidth: 300, height: 44, borderRadius: 7, border: "1px solid rgba(111,50,210,.24)", background: "#fff", color: "#141827", padding: "0 12px", fontSize: 13, fontWeight: 800, outline: "none" };
const materialFilterResultStyle = { minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 13px", borderRadius: 7, background: "rgba(111,50,210,.08)", color: "#6f32d2", fontSize: 12, fontWeight: 900, letterSpacing: .7 };
const timeInputStyle = { width: 110, height: 48, borderRadius: 9, border: "1px solid rgba(14,165,233,.28)", color: "#0284c7", background: "#fff", textAlign: "center" as const, fontSize: 18, fontWeight: 900, outline: "none" };
const timeInputGreenStyle = { ...timeInputStyle, border: "1px solid rgba(34,197,94,.30)", color: "#16a34a" };
const pinkCellStyle = { ...centerCellStyle, color: "#e6007e", fontSize: 22 };
const blueCellStyle = { ...centerCellStyle, color: "#0284c7", fontSize: 21 };
const greenCellStyle = { ...centerCellStyle, color: "#16a34a", fontSize: 21 };
const remindersGridStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(260px,1fr))", gap: 22 };
const reminderCardStyle = { padding: 26, borderRadius: 18, border: "1px solid rgba(255,0,135,.22)", background: "rgba(255,255,255,.76)", boxShadow: "0 18px 38px rgba(39,36,67,.08)" };
const reminderTitleStyle = { margin: 0, color: "#e6007e", fontSize: 22, fontWeight: 900, letterSpacing: 1 };
const reminderListStyle = { display: "grid", gap: 12, margin: "22px 0 0", paddingLeft: 22 };
const reminderItemStyle = { color: "#344054", fontSize: 17, fontWeight: 800, lineHeight: 1.5 };
const formBodyStyle = { display: "grid", gap: 24, marginTop: 26 };
const twoColumnsStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(320px,1fr))", gap: 26 };
const wideLabelStyle = { display: "grid", gap: 12, color: "#141827", fontSize: 17, fontWeight: 900 };
const inputStyle = { width: "100%", height: 66, borderRadius: 13, border: "1px solid rgba(52,64,84,.18)", background: "#fff", color: "#141827", padding: "0 22px", fontSize: 20, fontWeight: 800, outline: "none", boxSizing: "border-box" as const };
const formActionsStyle = { display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 4 };
const cancelButtonStyle = { minHeight: 52, padding: "0 26px", borderRadius: 12, border: "1px solid rgba(52,64,84,.16)", background: "#fff", color: "#141827", fontSize: 16, fontWeight: 900, cursor: "pointer" };
const productColumnsStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 24, alignItems: "start" };
const productSideStyle = { padding: 22, borderRadius: 16, border: "1px solid rgba(255,0,135,.20)", background: "rgba(255,248,252,.72)" };
const productSideTitleStyle = { margin: "0 0 20px", color: "#e6007e", fontSize: 22, fontWeight: 900, letterSpacing: 1, textAlign: "center" as const };
const productSideHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 20, flexWrap: "wrap" as const };
const productOptionsWrapStyle = { position: "relative" as const, marginLeft: "auto" };
const productOptionsButtonStyle = { border: "1px solid rgba(111,50,210,.28)", background: "#f5f1ff", color: "#6f32d2", borderRadius: 10, minHeight: 40, padding: "0 14px", fontSize: 11, fontWeight: 900, letterSpacing: .7, cursor: "pointer" };
const productOptionsMenuStyle = { position: "absolute" as const, zIndex: 5, top: "calc(100% + 7px)", right: 0, width: 240, padding: 7, display: "grid", gap: 5, border: "1px solid rgba(111,50,210,.2)", borderRadius: 12, background: "#fff", boxShadow: "0 18px 40px rgba(20,24,39,.16)" };
const productOptionButtonStyle = { border: 0, borderRadius: 8, background: "transparent", color: "#344054", padding: "11px 12px", textAlign: "left" as const, fontSize: 11, fontWeight: 900, letterSpacing: .55, cursor: "pointer" };
const productInfoPanelStyle = { margin: "0 0 20px", padding: 16, borderRadius: 13, border: "1px solid rgba(230,0,126,.22)", background: "linear-gradient(135deg, rgba(255,244,250,.98), rgba(247,242,255,.9))" };
const productInfoPanelHeaderStyle = { display: "grid", gap: 5, marginBottom: 14, color: "#e6007e", fontSize: 13, fontWeight: 900, letterSpacing: .8 };
const productPricingDetailsGridStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 };
const productPricingDetailStyle = { display: "grid", gap: 5, minHeight: 53, padding: "9px 11px", borderRadius: 9, border: "1px solid rgba(111,50,210,.12)", background: "rgba(255,255,255,.75)" };
const productPanelEmptyStyle = { padding: "16px 12px", borderRadius: 9, background: "rgba(255,255,255,.72)", color: "#667085", fontSize: 11, fontWeight: 800, letterSpacing: .45 };
const productHistoryLayoutStyle = { display: "grid", gap: 14, alignItems: "start" };
const productHistoryListStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 9, maxHeight: 270, overflowY: "auto" as const, padding: "2px" };
const productHistoryItemWrapStyle = { position: "relative" as const, minWidth: 0 };
const productHistoryItemStyle = { width: "100%", minHeight: 82, display: "grid", alignContent: "center", gap: 4, padding: "12px 34px 12px 13px", border: "1px solid rgba(111,50,210,.14)", borderRadius: 9, background: "#fff", color: "#344054", textAlign: "left" as const, cursor: "pointer" };
const productHistoryItemActiveStyle = { borderColor: "#e6007e", boxShadow: "0 0 0 2px rgba(230,0,126,.1)" };
const productHistoryDeleteStyle = { position: "absolute" as const, top: 7, right: 7, width: 24, height: 24, display: "grid", placeItems: "center", padding: 0, border: "1px solid rgba(255,61,70,.24)", borderRadius: "50%", background: "#fff1f2", color: "#ff3d46", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const productChangeListStyle = { display: "grid", gap: 10, maxHeight: 320, overflowY: "auto" as const, padding: "2px" };
const productChangeEntryStyle = { display: "grid", gap: 10, padding: "13px 14px", border: "1px solid rgba(111,50,210,.15)", borderRadius: 9, background: "#fff" };
const productChangeEntryHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: "#6f32d2", fontSize: 12, fontWeight: 900 };
const productChangeDetailsStyle = { display: "grid", gap: 7 };
const productChangeDetailStyle = { display: "grid", gap: 3, color: "#475467", fontSize: 11, fontWeight: 800, lineHeight: 1.4 };
const productFieldsStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 15 };
const productLabelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 13, fontWeight: 900, letterSpacing: .7 };
const productInputStyle = { width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid rgba(52,64,84,.18)", background: "#fff", color: "#141827", padding: "0 13px", fontSize: 15, fontWeight: 800, outline: "none", boxSizing: "border-box" as const };
const productFichaTopbarStyle = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16 };
const productFichaTopActionsStyle = { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, paddingBottom: 1 };
const productReadOnlyFieldsetStyle = { minWidth: 0, margin: 0, padding: 0, border: "none" };
const productSearchBarStyle = { display: "flex", alignItems: "flex-end", flexWrap: "wrap" as const, gap: 14, marginBottom: 20, padding: 18, borderRadius: 12, border: "1px solid rgba(111,50,210,.16)", background: "linear-gradient(135deg, rgba(247,242,255,.86), rgba(255,247,251,.92))" };
const productSearchFieldStyle = { ...productLabelStyle, flex: "1 1 320px" };
const productSearchSummaryStyle = { position: "relative" as const, minWidth: 170, minHeight: 46, display: "grid", alignContent: "center", justifyItems: "center", gap: 2, padding: "0 42px 0 16px", borderRadius: 10, border: "1px solid rgba(230,0,126,.18)", background: "#fff", color: "#667085", fontSize: 10, fontWeight: 900, letterSpacing: .6 };
const productSearchClearStyle = { position: "absolute" as const, top: "50%", right: 10, transform: "translateY(-50%)", width: 26, height: 26, display: "grid", placeItems: "center", padding: 0, border: "1px solid rgba(255,61,70,.22)", borderRadius: "50%", background: "#fff1f2", color: "#ff3d46", fontSize: 11, fontWeight: 900, cursor: "pointer" };
const accessoryStyle = { padding: 16, marginBottom: 16, borderRadius: 13, border: "1px solid rgba(111,50,210,.20)", background: "rgba(255,255,255,.82)" };
const accessoryHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, color: "#6f32d2", fontSize: 14, letterSpacing: 1 };
const removeAccessoryStyle = { border: "none", background: "transparent", color: "#ff4b4b", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryActionStyle = { minHeight: 48, width: "100%", borderRadius: 11, border: "1px solid rgba(111,50,210,.25)", background: "rgba(111,50,210,.06)", color: "#6f32d2", fontSize: 14, fontWeight: 900, cursor: "pointer" };
const emptyListStyle = { padding: 44, borderRadius: 14, border: "1px dashed rgba(111,50,210,.30)", color: "#667085", fontSize: 17, fontWeight: 800, textAlign: "center" as const };
const fichaRowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 22, padding: "22px 24px", borderBottom: "1px solid rgba(255,0,135,.12)", background: "rgba(255,255,255,.72)" };
const fichaNumberStyle = { display: "block", color: "#6f32d2", fontSize: 20, fontWeight: 900 };
const fichaReferenceStyle = { display: "block", marginTop: 5, color: "#141827", fontSize: 17, fontWeight: 900 };
const fichaClientStyle = { display: "block", marginTop: 8, color: "#e6007e", fontSize: 14, fontWeight: 900 };
const fichaMetaStyle = { display: "block", marginTop: 7, color: "#667085", fontSize: 13, fontWeight: 800 };
const fichaActionsStyle = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const };
const colorAddStyle = { display: "flex", alignItems: "center", gap: 10 };
const colorListStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 14 };
const colorItemStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderRadius: 12, border: "1px solid rgba(255,0,135,.18)", background: "rgba(255,248,252,.74)", color: "#141827", fontSize: 16, fontWeight: 900 };


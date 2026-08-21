"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import {
  defaultPricingParams,
  defaultPricingGoalsByCompany,
  defaultPaperCostParams,
  initialEngineeringFormulas,
  initialMaterials,
  initialPaperTypes,
  initialSuppliers,
  reminderFormulas,
} from "@/lib/gerenciador/data";
import { defaultProductionTimes } from "@/lib/gerenciador/impressora-data";
import { initialCfops, initialFiscalBenefits, initialFiscalProfiles, initialPaymentConditions, initialTaxRegimes } from "@/lib/gerenciador/general-data";
import { loadClients } from "@/lib/clientes";
import type { EngineeringFormula, PaperCostParams, PaperType, PricingGoalCompany, PricingGoals, PricingGoalsByCompany, PricingParams, ProductComponent, ProductFicha, ProductionTime, SpecificMaterial, Supplier } from "@/types/gerenciador";
import type { CfopOption, GeneralOption, PaymentCondition } from "@/types/cadastros-gerais";
import type { ClientRecord } from "@/types/clientes";

type Tab = "fornecedores" | "papeis" | "materiais" | "engenharia" | "cores" | "custo" | "parametros" | "metas" | "tempos" | "lembretes";
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
  { key: "tempos", label: "TEMPOS DE PRODUCAO" },
  { key: "lembretes", label: "LEMBRETES & FORMULAS" },
];

const sectionTabs: Record<Exclude<ManagerSection, "gerais">, Tab[]> = {
  embalagem: ["papeis", "materiais", "tempos", "lembretes"],
  fornecedores: ["fornecedores", "custo"],
  produtos: ["engenharia", "cores"],
  empresa: ["parametros", "metas"],
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
  pricingParams?: PricingParams;
  pricingGoalsByCompany?: PricingGoalsByCompany;
  productionTimes?: ProductionTime[];
  paymentConditions?: PaymentCondition[];
  cfops?: CfopOption[];
  taxRegimes?: GeneralOption[];
  fiscalProfiles?: GeneralOption[];
  fiscalBenefits?: GeneralOption[];
  productFichas?: ProductFicha[];
  productColors?: string[];
  onSuppliersChange?: (suppliers: Supplier[]) => void;
  onPaperTypesChange?: (paperTypes: PaperType[]) => void;
  onMaterialsChange?: (materials: SpecificMaterial[]) => void;
  onEngineeringFormulasChange?: (formulas: EngineeringFormula[]) => void;
  onPaperCostParamsChange?: (params: PaperCostParams) => void;
  onPricingParamsChange?: (params: PricingParams) => void;
  onPricingGoalsByCompanyChange?: (goals: PricingGoalsByCompany) => void;
  onProductionTimesChange?: (times: ProductionTime[]) => void;
  onPaymentConditionsChange?: (conditions: PaymentCondition[]) => void;
  onCfopsChange?: (cfops: CfopOption[]) => void;
  onTaxRegimesChange?: (items: GeneralOption[]) => void;
  onFiscalProfilesChange?: (items: GeneralOption[]) => void;
  onFiscalBenefitsChange?: (items: GeneralOption[]) => void;
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
  pricingGoalsByCompany: controlledPricingGoalsByCompany,
  productionTimes: controlledProductionTimes,
  paymentConditions: controlledPaymentConditions,
  cfops: controlledCfops,
  taxRegimes: controlledTaxRegimes,
  fiscalProfiles: controlledFiscalProfiles,
  fiscalBenefits: controlledFiscalBenefits,
  productFichas: controlledProductFichas,
  productColors: controlledProductColors,
  onSuppliersChange,
  onPaperTypesChange,
  onMaterialsChange,
  onEngineeringFormulasChange,
  onPaperCostParamsChange,
  onPricingParamsChange,
  onPricingGoalsByCompanyChange,
  onProductionTimesChange,
  onPaymentConditionsChange,
  onCfopsChange,
  onTaxRegimesChange,
  onFiscalProfilesChange,
  onFiscalBenefitsChange,
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
  const [localPricingParams, setLocalPricingParams] = useState(defaultPricingParams);
  const [localPricingGoalsByCompany, setLocalPricingGoalsByCompany] = useState(defaultPricingGoalsByCompany);
  const [localProductionTimes, setLocalProductionTimes] = useState(defaultProductionTimes);
  const [localPaymentConditions, setLocalPaymentConditions] = useState(initialPaymentConditions);
  const [localCfops, setLocalCfops] = useState(initialCfops);
  const [localTaxRegimes, setLocalTaxRegimes] = useState(initialTaxRegimes);
  const [localFiscalProfiles, setLocalFiscalProfiles] = useState(initialFiscalProfiles);
  const [localFiscalBenefits, setLocalFiscalBenefits] = useState(initialFiscalBenefits);
  const [productionFilter, setProductionFilter] = useState("");
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
  const pricingGoalsByCompany = controlledPricingGoalsByCompany ?? localPricingGoalsByCompany;
  const productionTimes = controlledProductionTimes ?? localProductionTimes;
  const paymentConditions = controlledPaymentConditions ?? localPaymentConditions;
  const cfops = controlledCfops ?? localCfops;
  const taxRegimes = controlledTaxRegimes ?? localTaxRegimes;
  const fiscalProfiles = controlledFiscalProfiles ?? localFiscalProfiles;
  const fiscalBenefits = controlledFiscalBenefits ?? localFiscalBenefits;
  const setSuppliers = onSuppliersChange ?? setLocalSuppliers;
  const setPaperTypes = onPaperTypesChange ?? setLocalPaperTypes;
  const setMaterials = onMaterialsChange ?? setLocalMaterials;
  const setEngineeringFormulas = onEngineeringFormulasChange ?? setLocalEngineeringFormulas;
  const setPaperCostParams = onPaperCostParamsChange ?? setLocalPaperCostParams;
  const setPricingParams = onPricingParamsChange ?? setLocalPricingParams;
  const setPricingGoalsByCompany = onPricingGoalsByCompanyChange ?? setLocalPricingGoalsByCompany;
  const setProductionTimes = onProductionTimesChange ?? setLocalProductionTimes;
  const setPaymentConditions = onPaymentConditionsChange ?? setLocalPaymentConditions;
  const setCfops = onCfopsChange ?? setLocalCfops;
  const setTaxRegimes = onTaxRegimesChange ?? setLocalTaxRegimes;
  const setFiscalProfiles = onFiscalProfilesChange ?? setLocalFiscalProfiles;
  const setFiscalBenefits = onFiscalBenefitsChange ?? setLocalFiscalBenefits;

  const activeTitle = useMemo(() => {
    if (activeTab === "fornecedores") return "GERENCIADOR DE FORNECEDORES";
    if (activeTab === "papeis") return "GERENCIADOR DE TIPOS DE PAPELAO";
    if (activeTab === "materiais") return "BANCO DE MATERIAIS ESPECIFICOS";
    if (activeTab === "engenharia") return "ENGENHARIA DE FORMULAS DE CAIXAS";
    if (activeTab === "cores") return "CADASTRO DE CORES";
    if (activeTab === "custo") return "CUSTO DE PAPEL";
    if (activeTab === "parametros") return "PARAMETROS DE PRECIFICACAO - DAWOS";
    if (activeTab === "metas") return "METAS DE DESEMPENHO - DAWOS";
    if (activeTab === "tempos") return "TABELA DE TEMPOS DE PRODUCAO";
    return "LEMBRETES & FORMULAS";
  }, [activeTab]);

  const materialsBySupplier = useMemo(() => {
    return materials.reduce<Record<string, SpecificMaterial[]>>((groups, material) => {
      const supplier = material.supplier || "SEM FORNECEDOR";
      groups[supplier] = groups[supplier] ? [...groups[supplier], material] : [material];
      return groups;
    }, {});
  }, [materials]);

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
            onPaymentConditionsChange={setPaymentConditions}
            onCfopsChange={setCfops}
            onTaxRegimesChange={setTaxRegimes}
            onFiscalProfilesChange={setFiscalProfiles}
            onFiscalBenefitsChange={setFiscalBenefits}
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
            {managerSection === "empresa" && "PARAMETROS E METAS USADOS NA OPERACAO DA EMPRESA."}
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
              <input
                type="number"
                step="0.01"
                value={materialDraft.costIpi || ""}
                onChange={(event) => setMaterialDraft({ ...materialDraft, costIpi: Number(event.target.value) || 0 })}
                placeholder="EX: 3.20"
                style={inputStyle}
              />
            </label>
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
            <Table headers={["CODIGO", "MATERIAL", "TIPO", "FORNECEDOR", "GRAMATURA", "RES. PRESSAO", "PRECO C/ IPI", "ACOES"]}>
              {materials.map((material) => (
                <tr key={material.id}>
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
                  <td style={actionCellStyle}>
                    <EditButton onClick={() => openMaterialEdit(material)} />
                    <DeleteButton onClick={() => setMaterials(materials.filter((item) => item.id !== material.id))} />
                  </td>
                </tr>
              ))}
            </Table>
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
                          <td style={moneyCellStyle}>{formatMoney(material.costIpi)}</td>
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
            </>
          )}

          {activeTab === "parametros" && (
            <PricingParamsPanel params={pricingParams} onChange={setPricingParams} />
          )}

          {activeTab === "metas" && (
            <PricingGoalsPanel goalsByCompany={pricingGoalsByCompany} onChange={setPricingGoalsByCompany} />
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
    const next = {
      ...materialDraft,
      id: form?.id ?? crypto.randomUUID(),
      code,
      name: materialDraft.name.trim().toUpperCase(),
      supplier: materialDraft.supplier.trim().toUpperCase(),
      paperType: materialDraft.paperType.trim().toUpperCase(),
      grammage: materialDraft.grammage.trim().toUpperCase(),
      pressure: materialDraft.pressure.trim().toUpperCase(),
    };
    setMaterials(form?.mode === "edit" ? materials.map((item) => (item.id === form.id ? next : item)) : [...materials, next]);
    setForm(null);
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
const productStatuses: ProductComponent["status"][] = ["INATIVO", "DESENVOLVIMENTO", "PRE-CALCULO", "PRODUTO FINAL"];

function emptyProductComponent(): ProductComponent {
  return {
    id: crypto.randomUUID(), reference: "", price: 0, revision: "", company: "DAWOS", clientId: "", materialId: "", laudo: "NAO", palete: "NAO", tieCount: 0,
    status: "DESENVOLVIMENTO", length: 0, width: 0, height: 0, topOverlap: 0, bottomOverlap: 0, knifeWidth: 0, knifeWidthBoxes: 1,
    knifeLength: 0, knifeLengthBoxes: 1, supplierQuality: "", color1: "", color2: "", engineeringId: "", observations: "",
  };
}

export function ProductCatalogPanel({
  companySlug, fichas, colors, materials = initialMaterials, engineeringFormulas, onChange, onColorsChange,
}: {
  companySlug?: string;
  fichas: ProductFicha[];
  colors: string[];
  materials?: SpecificMaterial[];
  engineeringFormulas: EngineeringFormula[];
  onChange: (items: ProductFicha[]) => void;
  onColorsChange: (items: string[]) => void;
}) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductFicha | null>(null);

  useEffect(() => {
    if (!companySlug) return;
    loadClients(companySlug).then(setClients).catch(() => setClients([]));
  }, [companySlug]);

  function startCreate() {
    setEditingId(null);
    setDraft({ ...emptyProductComponent(), ftNumber: "", accessories: [] });
  }

  function startEdit(item: ProductFicha) {
    setEditingId(item.id);
    setDraft({ ...item, accessories: item.accessories.map((accessory) => ({ ...accessory })) });
  }

  function updateMain<K extends keyof ProductFicha>(key: K, value: ProductFicha[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function updateAccessory(id: string, key: keyof ProductComponent, value: ProductComponent[keyof ProductComponent]) {
    setDraft((current) => current ? { ...current, accessories: current.accessories.map((item) => item.id === id ? { ...item, [key]: value } as ProductComponent : item) } : current);
  }

  function save() {
    if (!draft?.ftNumber.trim() || !draft.reference.trim() || !draft.clientId) return;
    const next = { ...draft, ftNumber: draft.ftNumber.trim().toUpperCase(), reference: draft.reference.trim().toUpperCase() };
    onChange(editingId ? fichas.map((item) => item.id === editingId ? next : item) : [...fichas, next]);
    setDraft(null);
    setEditingId(null);
  }

  function renderFields(item: ProductComponent, update: (key: keyof ProductComponent, value: ProductComponent[keyof ProductComponent]) => void, prefix: string) {
    return (
      <div style={productFieldsStyle}>
        <label style={productLabelStyle}>REFERENCIA<input value={item.reference} onChange={(event) => update("reference", event.target.value)} style={productInputStyle} placeholder="DESCRICAO DA EMBALAGEM" /></label>
        <label style={productLabelStyle}>PRECO (R$)<input type="number" min="0" step="0.01" value={item.price || ""} onChange={(event) => update("price", Number(event.target.value) || 0)} style={productInputStyle} placeholder="0,00" /></label>
        <label style={productLabelStyle}>REVISAO<input value={item.revision} onChange={(event) => update("revision", event.target.value)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>EMPRESA<select value={item.company} onChange={(event) => update("company", event.target.value)} style={productInputStyle}>{productCompanies.map((company) => <option key={company}>{company}</option>)}</select></label>
        <label style={productLabelStyle}>CLIENTE<select value={item.clientId} onChange={(event) => update("clientId", event.target.value)} style={productInputStyle}><option value="">SELECIONE O CLIENTE</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.tradeName || client.legalName}</option>)}</select></label>
        <label style={productLabelStyle}>MATERIAL<select value={item.materialId ?? ""} onChange={(event) => update("materialId", event.target.value)} style={productInputStyle}><option value="">SELECIONE O MATERIAL</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.code} - {material.supplier}</option>)}</select></label>
        <label style={productLabelStyle}>LAUDO<select value={item.laudo} onChange={(event) => update("laudo", event.target.value as ProductComponent["laudo"])} style={productInputStyle}><option>NAO</option><option>SIM</option></select></label>
        <label style={productLabelStyle}>PALETE<select value={item.palete} onChange={(event) => update("palete", event.target.value as ProductComponent["palete"])} style={productInputStyle}><option>NAO</option><option>SIM</option></select></label>
        <label style={productLabelStyle}>NUMERO DE AMARRADOS<input type="number" min="0" value={item.tieCount} onChange={(event) => update("tieCount", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>STATUS<select value={item.status} onChange={(event) => update("status", event.target.value as ProductComponent["status"])} style={productInputStyle}>{productStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label style={productLabelStyle}>COMPRIMENTO (MM)<input type="number" value={item.length || ""} onChange={(event) => update("length", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>LARGURA (MM)<input type="number" value={item.width || ""} onChange={(event) => update("width", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>ALTURA (MM)<input type="number" value={item.height || ""} onChange={(event) => update("height", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>TRANSPASSE SUPERIOR<input type="number" value={item.topOverlap || ""} onChange={(event) => update("topOverlap", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>TRANSPASSE INFERIOR<input type="number" value={item.bottomOverlap || ""} onChange={(event) => update("bottomOverlap", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>LARGURA DA FACA<input type="number" value={item.knifeWidth || ""} onChange={(event) => update("knifeWidth", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>CAIXAS NA LARGURA<input type="number" min="1" value={item.knifeWidthBoxes || ""} onChange={(event) => update("knifeWidthBoxes", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>COMPRIMENTO DA FACA<input type="number" value={item.knifeLength || ""} onChange={(event) => update("knifeLength", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>CAIXAS NO COMPRIMENTO<input type="number" min="1" value={item.knifeLengthBoxes || ""} onChange={(event) => update("knifeLengthBoxes", Number(event.target.value) || 0)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>QUALIDADE DO FORNECEDOR<input value={item.supplierQuality} onChange={(event) => update("supplierQuality", event.target.value)} style={productInputStyle} /></label>
        <label style={productLabelStyle}>COR 1<select value={item.color1} onChange={(event) => update("color1", event.target.value)} style={productInputStyle}><option value="">SELECIONE</option>{colors.map((color) => <option key={`${prefix}-1-${color}`}>{color}</option>)}</select></label>
        <label style={productLabelStyle}>COR 2<select value={item.color2} onChange={(event) => update("color2", event.target.value)} style={productInputStyle}><option value="">SELECIONE</option>{colors.map((color) => <option key={`${prefix}-2-${color}`}>{color}</option>)}</select></label>
        <label style={productLabelStyle}>ENGENHARIA<select value={item.engineeringId} onChange={(event) => update("engineeringId", event.target.value)} style={productInputStyle}><option value="">SELECIONE</option>{engineeringFormulas.map((formula) => <option key={formula.id} value={formula.id}>{formula.style} - {formula.description}</option>)}</select></label>
        <label style={{ ...productLabelStyle, gridColumn: "1 / -1" }}>OBSERVACOES<textarea value={item.observations} onChange={(event) => update("observations", event.target.value)} style={{ ...productInputStyle, minHeight: 82, paddingTop: 14, resize: "vertical" }} /></label>
      </div>
    );
  }

  return (
    <>
      {draft ? (
        <FormPanel title={editingId ? "EDITAR FICHA TECNICA" : "CADASTRAR NOVA FICHA TECNICA"}>
          <label style={wideLabelStyle}>NUMERO DA FT<input value={draft.ftNumber} onChange={(event) => updateMain("ftNumber", event.target.value)} style={inputStyle} placeholder="EX: FT-0001" /></label>
          <div style={productColumnsStyle}>
            <section style={productSideStyle}><h3 style={productSideTitleStyle}>CAIXA PRINCIPAL</h3>{renderFields(draft, (key, value) => updateMain(key as keyof ProductFicha, value as ProductFicha[keyof ProductFicha]), "main")}</section>
            <section style={productSideStyle}><h3 style={productSideTitleStyle}>ACESSORIOS</h3>{draft.accessories.map((accessory, index) => <article key={accessory.id} style={accessoryStyle}><div style={accessoryHeaderStyle}><strong>ACESSORIO {index + 1}</strong><button type="button" onClick={() => setDraft({ ...draft, accessories: draft.accessories.filter((item) => item.id !== accessory.id) })} style={removeAccessoryStyle}>REMOVER</button></div>{renderFields(accessory, (key, value) => updateAccessory(accessory.id, key, value), `accessory-${index}`)}</article>)}<button type="button" onClick={() => setDraft({ ...draft, accessories: [...draft.accessories, emptyProductComponent()] })} style={secondaryActionStyle}>+ ADICIONAR ACESSORIO</button></section>
          </div>
          <div style={formActionsStyle}><button type="button" onClick={() => setDraft(null)} style={cancelButtonStyle}>CANCELAR</button><button type="button" onClick={save} style={orangeButtonStyle}>SALVAR FICHA</button></div>
        </FormPanel>
      ) : (
        <Panel title="FICHAS TECNICAS DE PRODUTOS" description="CADASTRE A CAIXA PRINCIPAL E OS ACESSORIOS VINCULADOS A CADA FT." actionLabel="+ NOVA FICHA TECNICA" onAction={startCreate}>
          {fichas.length === 0 ? <div style={emptyListStyle}>NENHUMA FICHA TECNICA CADASTRADA.</div> : fichas.map((ficha) => <article key={ficha.id} style={fichaRowStyle}><div><strong style={fichaNumberStyle}>{ficha.ftNumber}</strong><span style={fichaReferenceStyle}>{ficha.reference}</span><small style={fichaMetaStyle}>{ficha.company} · {ficha.accessories.length} ACESSORIO(S) · {ficha.status}</small></div><div><button type="button" onClick={() => startEdit(ficha)} style={editButtonStyle}>EDITAR</button><button type="button" onClick={() => onChange(fichas.filter((item) => item.id !== ficha.id))} style={deleteButtonStyle}>EXCLUIR</button></div></article>)}
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
  onPaymentConditionsChange,
  onCfopsChange,
  onTaxRegimesChange,
  onFiscalProfilesChange,
  onFiscalBenefitsChange,
}: {
  companySlug?: string;
  paymentConditions: PaymentCondition[];
  cfops: CfopOption[];
  taxRegimes: GeneralOption[];
  fiscalProfiles: GeneralOption[];
  fiscalBenefits: GeneralOption[];
  onPaymentConditionsChange: (items: PaymentCondition[]) => void;
  onCfopsChange: (items: CfopOption[]) => void;
  onTaxRegimesChange: (items: GeneralOption[]) => void;
  onFiscalProfilesChange: (items: GeneralOption[]) => void;
  onFiscalBenefitsChange: (items: GeneralOption[]) => void;
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

function PricingParamsPanel({ params, onChange }: { params: PricingParams; onChange: (params: PricingParams) => void }) {
  const operationalTotal = params.commission + params.freight + params.otherCosts + params.clientIcms + params.additionalCosts;

  return (
    <div style={pricingGridStyle}>
      <section style={pricingHighlightStyle}>
        <HighlightParamField label="MC% PADRAO" value={params.mcDefault} suffix="%" color="#16a34a" onChange={(mcDefault) => onChange({ ...params, mcDefault })} />
        <div style={dividerStyle} />
        <HighlightParamField label="MCR$ HORA PADRAO" value={params.mcrHour} prefix="R$" suffix="/H" color="#0284c7" onChange={(mcrHour) => onChange({ ...params, mcrHour })} />
      </section>

      <section style={pricingPanelStyle}>
        <div style={pricingPanelHeaderStyle}>
          <h4 style={subPanelTitleStyle}>CUSTOS OPERACIONAIS (%)</h4>
          <span style={greenBadgeStyle}>SOMA TOTAL DAS DESPESAS: {formatPercent(operationalTotal)}</span>
        </div>
        <div style={pricingFieldsStyle}>
          <ParamField label="COMISSAO PREVIA (%)" value={params.commission} color="#ff5a00" onChange={(commission) => onChange({ ...params, commission })} />
          <ParamField label="IMPOSTO NO SIMPLES (%)" value={params.simplesTax} color="#eab308" onChange={(simplesTax) => onChange({ ...params, simplesTax })} />
          <ParamField label="FRETE (%)" value={params.freight} color="#0ea5e9" onChange={(freight) => onChange({ ...params, freight })} />
          <ParamField label="OUTROS CUSTOS (%)" value={params.otherCosts} color="#8b5cf6" onChange={(otherCosts) => onChange({ ...params, otherCosts })} />
          <ParamField label="ICMS DAWOS (%)" value={params.icmsDawos} color="#10b981" onChange={(icmsDawos) => onChange({ ...params, icmsDawos })} />
          <ParamField label="ICMS DO CLIENTE (%)" value={params.clientIcms} color="#14b8a6" onChange={(clientIcms) => onChange({ ...params, clientIcms })} />
          <ParamField label="DEMAIS CUSTOS (%)" value={params.additionalCosts} color="#ef4444" onChange={(additionalCosts) => onChange({ ...params, additionalCosts })} />
          <ParamField label="ICMS SAIDA LP/LC (%)" value={params.outputIcms} color="#38bdf8" onChange={(outputIcms) => onChange({ ...params, outputIcms })} />
          <ParamField label="PIS / COFINS LP/LC (%)" value={params.outputPisCofins} color="#f59e0b" onChange={(outputPisCofins) => onChange({ ...params, outputPisCofins })} />
          <ParamField label="IPI SAIDA/ENTRADA (%)" value={params.outputIpi} color="#a78bfa" onChange={(outputIpi) => onChange({ ...params, outputIpi })} />
        </div>
      </section>
    </div>
  );
}

function PricingGoalsPanel({
  goalsByCompany,
  onChange,
}: {
  goalsByCompany: PricingGoalsByCompany;
  onChange: (goals: PricingGoalsByCompany) => void;
}) {
  const [company, setCompany] = useState<PricingGoalCompany>("dawos");
  const goals = goalsByCompany[company];

  function updateCompanyGoals(nextGoals: PricingGoals) {
    onChange({ ...goalsByCompany, [company]: nextGoals });
  }

  return (
    <div style={goalsPanelStyle}>
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
        FAIXAS DA {company.toUpperCase()}. AS CORES SAO APLICADAS SOMENTE AOS RESULTADOS DOS SIMULADORES A, B E C.
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

function ParamField({ label, value, color, onChange, prefix, suffix }: { label: string; value: number; color: string; onChange: (value: number) => void; prefix?: string; suffix?: string }) {
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
          style={{ ...paramInputStyle, color, borderColor: `${color}55` }}
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

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 });
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
const productFieldsStyle = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 15 };
const productLabelStyle = { display: "grid", gap: 7, color: "#344054", fontSize: 13, fontWeight: 900, letterSpacing: .7 };
const productInputStyle = { width: "100%", minHeight: 46, borderRadius: 10, border: "1px solid rgba(52,64,84,.18)", background: "#fff", color: "#141827", padding: "0 13px", fontSize: 15, fontWeight: 800, outline: "none", boxSizing: "border-box" as const };
const accessoryStyle = { padding: 16, marginBottom: 16, borderRadius: 13, border: "1px solid rgba(111,50,210,.20)", background: "rgba(255,255,255,.82)" };
const accessoryHeaderStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, color: "#6f32d2", fontSize: 14, letterSpacing: 1 };
const removeAccessoryStyle = { border: "none", background: "transparent", color: "#ff4b4b", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryActionStyle = { minHeight: 48, width: "100%", borderRadius: 11, border: "1px solid rgba(111,50,210,.25)", background: "rgba(111,50,210,.06)", color: "#6f32d2", fontSize: 14, fontWeight: 900, cursor: "pointer" };
const emptyListStyle = { padding: 44, borderRadius: 14, border: "1px dashed rgba(111,50,210,.30)", color: "#667085", fontSize: 17, fontWeight: 800, textAlign: "center" as const };
const fichaRowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 22, padding: "22px 24px", borderBottom: "1px solid rgba(255,0,135,.12)", background: "rgba(255,255,255,.72)" };
const fichaNumberStyle = { display: "block", color: "#6f32d2", fontSize: 20, fontWeight: 900 };
const fichaReferenceStyle = { display: "block", marginTop: 5, color: "#141827", fontSize: 17, fontWeight: 900 };
const fichaMetaStyle = { display: "block", marginTop: 7, color: "#667085", fontSize: 13, fontWeight: 800 };
const colorAddStyle = { display: "flex", alignItems: "center", gap: 10 };
const colorListStyle = { display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 14 };
const colorItemStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderRadius: 12, border: "1px solid rgba(255,0,135,.18)", background: "rgba(255,248,252,.74)", color: "#141827", fontSize: 16, fontWeight: 900 };


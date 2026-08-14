"use client";

import { Fragment, useMemo, useState } from "react";

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
import type { EngineeringFormula, PaperCostParams, PaperType, PricingGoalCompany, PricingGoals, PricingGoalsByCompany, PricingParams, ProductionTime, SpecificMaterial, Supplier } from "@/types/gerenciador";

type Tab = "fornecedores" | "papeis" | "materiais" | "engenharia" | "custo" | "parametros" | "metas" | "tempos" | "lembretes";
type Mode = "create" | "edit";

const tabs: Array<{ key: Tab; label: string; disabled?: boolean }> = [
  { key: "fornecedores", label: "FORNECEDORES" },
  { key: "papeis", label: "TIPOS DE PAPELAO" },
  { key: "materiais", label: "MATERIAIS ESPECIFICOS" },
  { key: "engenharia", label: "ENGENHARIA DA CAIXA" },
  { key: "custo", label: "CUSTO DE PAPEL" },
  { key: "parametros", label: "PARAMETROS DE PRECO" },
  { key: "metas", label: "METAS" },
  { key: "tempos", label: "TEMPOS DE PRODUCAO" },
  { key: "lembretes", label: "LEMBRETES & FORMULAS" },
];

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
  suppliers?: Supplier[];
  paperTypes?: PaperType[];
  materials?: SpecificMaterial[];
  engineeringFormulas?: EngineeringFormula[];
  paperCostParams?: PaperCostParams;
  pricingParams?: PricingParams;
  pricingGoalsByCompany?: PricingGoalsByCompany;
  productionTimes?: ProductionTime[];
  onSuppliersChange?: (suppliers: Supplier[]) => void;
  onPaperTypesChange?: (paperTypes: PaperType[]) => void;
  onMaterialsChange?: (materials: SpecificMaterial[]) => void;
  onEngineeringFormulasChange?: (formulas: EngineeringFormula[]) => void;
  onPaperCostParamsChange?: (params: PaperCostParams) => void;
  onPricingParamsChange?: (params: PricingParams) => void;
  onPricingGoalsByCompanyChange?: (goals: PricingGoalsByCompany) => void;
  onProductionTimesChange?: (times: ProductionTime[]) => void;
};

export default function GerenciadorEmpresa({
  suppliers: controlledSuppliers,
  paperTypes: controlledPaperTypes,
  materials: controlledMaterials,
  engineeringFormulas: controlledEngineeringFormulas,
  paperCostParams: controlledPaperCostParams,
  pricingParams: controlledPricingParams,
  pricingGoalsByCompany: controlledPricingGoalsByCompany,
  productionTimes: controlledProductionTimes,
  onSuppliersChange,
  onPaperTypesChange,
  onMaterialsChange,
  onEngineeringFormulasChange,
  onPaperCostParamsChange,
  onPricingParamsChange,
  onPricingGoalsByCompanyChange,
  onProductionTimesChange,
}: GerenciadorEmpresaProps = {}) {
  const [activeTab, setActiveTab] = useState<Tab>("fornecedores");
  const [localSuppliers, setLocalSuppliers] = useState(initialSuppliers);
  const [localPaperTypes, setLocalPaperTypes] = useState(initialPaperTypes);
  const [localMaterials, setLocalMaterials] = useState(initialMaterials);
  const [localEngineeringFormulas, setLocalEngineeringFormulas] = useState(initialEngineeringFormulas);
  const [localPaperCostParams, setLocalPaperCostParams] = useState(defaultPaperCostParams);
  const [localPricingParams, setLocalPricingParams] = useState(defaultPricingParams);
  const [localPricingGoalsByCompany, setLocalPricingGoalsByCompany] = useState(defaultPricingGoalsByCompany);
  const [localProductionTimes, setLocalProductionTimes] = useState(defaultProductionTimes);
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
  const paperCostParams = controlledPaperCostParams ?? localPaperCostParams;
  const pricingParams = controlledPricingParams ?? localPricingParams;
  const pricingGoalsByCompany = controlledPricingGoalsByCompany ?? localPricingGoalsByCompany;
  const productionTimes = controlledProductionTimes ?? localProductionTimes;
  const setSuppliers = onSuppliersChange ?? setLocalSuppliers;
  const setPaperTypes = onPaperTypesChange ?? setLocalPaperTypes;
  const setMaterials = onMaterialsChange ?? setLocalMaterials;
  const setEngineeringFormulas = onEngineeringFormulasChange ?? setLocalEngineeringFormulas;
  const setPaperCostParams = onPaperCostParamsChange ?? setLocalPaperCostParams;
  const setPricingParams = onPricingParamsChange ?? setLocalPricingParams;
  const setPricingGoalsByCompany = onPricingGoalsByCompanyChange ?? setLocalPricingGoalsByCompany;
  const setProductionTimes = onProductionTimesChange ?? setLocalProductionTimes;

  const activeTitle = useMemo(() => {
    if (activeTab === "fornecedores") return "GERENCIADOR DE FORNECEDORES";
    if (activeTab === "papeis") return "GERENCIADOR DE TIPOS DE PAPELAO";
    if (activeTab === "materiais") return "BANCO DE MATERIAIS ESPECIFICOS";
    if (activeTab === "engenharia") return "ENGENHARIA DE FORMULAS DE CAIXAS";
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

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <div style={introStyle}>
          <h2 style={sectionTitleStyle}>1. CONFIGURACOES DA EMBALAGEM</h2>
          <p style={sectionSubtitleStyle}>SELECIONE AS ESPECIFICACOES FISICAS E O MATERIAL DESEJADO.</p>
        </div>

        <nav style={tabsStyle}>
          {tabs.map((tab) => (
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
          <ParamField label="COMISSAO (%)" value={params.commission} color="#ff5a00" onChange={(commission) => onChange({ ...params, commission })} />
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
  return (
    <section style={formPanelStyle}>
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
const introStyle = { marginBottom: 32 };
const sectionTitleStyle = { margin: 0, fontSize: 32, color: "#141827", fontWeight: 900 };
const sectionSubtitleStyle = { margin: "12px 0 0", fontSize: 18, color: "#344054", fontWeight: 800 };
const tabsStyle = { display: "grid", gridTemplateColumns: "repeat(9,1fr)", alignItems: "center", gap: 8, borderRadius: 999, padding: 8, background: "#eef2f7", border: "1px solid rgba(52,64,84,.12)", boxShadow: "inset 0 1px 5px rgba(39,36,67,.08)", marginBottom: 38 };
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


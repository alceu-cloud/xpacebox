import type { EngineeringFormula, ProductComponent, ProductFicha } from "@/types/gerenciador";

type FormulaDimensions = {
  C: number;
  L: number;
  A: number;
  S: number;
};

export function formulaUsesDimension(formula: EngineeringFormula | undefined, dimension: keyof FormulaDimensions) {
  if (!formula) return false;
  return new RegExp(dimension, "i").test(`${formula.widthFormula}${formula.lengthFormula}`);
}

export function formulaUsesTopOverlap(formula?: EngineeringFormula) {
  return formulaUsesDimension(formula, "S");
}

export function evaluateEngineeringFormula(formula: string, values: FormulaDimensions) {
  const normalized = formula
    .replaceAll(",", ".")
    .replace(/[CLAS]/gi, (variable) => String(values[variable.toUpperCase() as keyof FormulaDimensions]));

  if (!/^[\d+\-*/().\s]+$/.test(normalized)) return 0;

  try {
    const result = Number(Function(`"use strict"; return (${normalized});`)());
    return Number.isFinite(result) && result > 0 ? result : 0;
  } catch {
    return 0;
  }
}

export function calculateProductArea(item: ProductComponent, formulas: EngineeringFormula[]) {
  const formula = formulas.find((candidate) => candidate.id === item.engineeringId);
  if (!formula) return 0;

  const dimensions: FormulaDimensions = {
    C: Number(item.length) || 0,
    L: Number(item.width) || 0,
    A: Number(item.height) || 0,
    S: Number(item.topOverlap) || 0,
  };
  const requiredDimensions = new Set(`${formula.widthFormula}${formula.lengthFormula}`.toUpperCase().match(/[CLAS]/g) ?? []);
  if ([...requiredDimensions].some((dimension) => !dimensions[dimension as keyof FormulaDimensions])) return 0;

  const sheetWidth = evaluateEngineeringFormula(formula.widthFormula, dimensions);
  const sheetLength = evaluateEngineeringFormula(formula.lengthFormula, dimensions);
  return sheetWidth && sheetLength ? (sheetWidth * sheetLength) / 1_000_000 : 0;
}

export function getAccessoryQuantity(item: ProductComponent) {
  const quantity = Math.trunc(Number(item.quantityPerBox));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

export function calculateProductFichaTotalArea(ficha: ProductFicha) {
  const mainArea = Number(ficha.areaM2) || 0;
  const accessoriesArea = ficha.accessories.reduce(
    (total, accessory) => total + (Number(accessory.areaM2) || 0) * getAccessoryQuantity(accessory),
    0
  );
  return mainArea + accessoriesArea;
}

function recalculateComponentArea(component: ProductComponent, formulas: EngineeringFormula[]) {
  if (!component.engineeringId) return component;
  const areaM2 = calculateProductArea(component, formulas);
  return component.areaM2 === areaM2 ? component : { ...component, areaM2 };
}

export function recalculateProductFichaAreas(fichas: ProductFicha[], formulas: EngineeringFormula[]): ProductFicha[] {
  return fichas.map((ficha) => {
    const areaM2 = ficha.engineeringId ? calculateProductArea(ficha, formulas) : ficha.areaM2;
    const accessories = ficha.accessories.map((accessory) => recalculateComponentArea(accessory, formulas));
    const accessoriesChanged = accessories.some((accessory, index) => accessory !== ficha.accessories[index]);
    const totalAreaM2 = calculateProductFichaTotalArea({ ...ficha, areaM2, accessories });
    const mainChanged = ficha.areaM2 !== areaM2;
    const totalChanged = ficha.totalAreaM2 !== totalAreaM2;

    if (!mainChanged && !accessoriesChanged && !totalChanged) return ficha;
    return { ...ficha, areaM2, totalAreaM2, accessories };
  });
}

import type { SpecificMaterial } from "@/types/gerenciador";

export function isSpecialMaterialActive(material: SpecificMaterial, today = saoPauloDate()) {
  return Boolean(material.specialCondition && material.specialValidUntil && material.specialValidUntil >= today);
}

export function isMaterialAvailableForUse(material: SpecificMaterial, today = saoPauloDate()) {
  return !material.specialCondition || isSpecialMaterialActive(material, today);
}

export function sortMaterialsByWaveAndCode(materials: SpecificMaterial[]) {
  return [...materials].sort((first, second) => {
    const firstWave = materialWave(first);
    const secondWave = materialWave(second);
    const waveOrder = preferredWaveOrder(firstWave) - preferredWaveOrder(secondWave);
    if (waveOrder) return waveOrder;
    if (firstWave !== secondWave) return firstWave.localeCompare(secondWave, "pt-BR", { numeric: true, sensitivity: "base" });
    return first.code.localeCompare(second.code, "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

function materialWave(material: SpecificMaterial) {
  for (const value of [material.paperType, material.code]) {
    const normalized = value.trim().toUpperCase();
    const suffix = normalized.match(/-([A-Z]+)$/)?.[1];
    if (suffix) return suffix;
  }
  return "SEM TIPO";
}

function preferredWaveOrder(wave: string) {
  if (wave === "B") return 0;
  if (wave === "BC") return 1;
  return 2;
}

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

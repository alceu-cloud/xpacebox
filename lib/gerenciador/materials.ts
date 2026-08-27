import type { SpecificMaterial } from "@/types/gerenciador";

export function isSpecialMaterialActive(material: SpecificMaterial, today = saoPauloDate()) {
  return Boolean(material.specialCondition && material.specialValidUntil && material.specialValidUntil >= today);
}

export function isMaterialAvailableForUse(material: SpecificMaterial, today = saoPauloDate()) {
  return !material.specialCondition || isSpecialMaterialActive(material, today);
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

import { CommercialError } from "./commercial";
export const paymentMethods = ["PIX", "BOLETO", "CREDIT_CARD"] as const;
export type PaymentMethod = typeof paymentMethods[number];
export function validateBillingPreferences(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CommercialError("PREFERÊNCIAS INVÁLIDAS.");
  const value = input as Record<string, unknown>;
  // Never accept raw card data, user-supplied tokens, prices or tenant identifiers.
  if (Object.keys(value).some(key => !["paymentMethod", "addons"].includes(key))) throw new CommercialError("ENVIE APENAS FORMA DE PAGAMENTO E ADICIONAIS. NÃO ENVIE DADOS DE CARTÃO.");
  if (!paymentMethods.includes(value.paymentMethod as PaymentMethod)) throw new CommercialError("ESCOLHA PIX, BOLETO OU CARTÃO.");
  if (!Array.isArray(value.addons) || value.addons.some(code => code !== "WHATSAPP") || new Set(value.addons).size !== value.addons.length) throw new CommercialError("ADICIONAIS INVÁLIDOS.");
  return { paymentMethod: value.paymentMethod as PaymentMethod, addons: value.addons as "WHATSAPP"[] };
}

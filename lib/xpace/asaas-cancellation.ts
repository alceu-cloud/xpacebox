export type ProviderPayment = { id: string; status?: string; deleted?: boolean; value?: number; externalReference?: string };
type Request = <T>(path: string, method: "GET" | "DELETE") => Promise<T>;
const paidStatuses = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);

// Read before every attempt. A timeout or 404 is not proof of deletion.
export async function cancelPendingPayment(id: string, request: Request): Promise<ProviderPayment> {
  const path = `/payments/${encodeURIComponent(id)}`;
  let payment = await request<ProviderPayment>(path, "GET");
  if (payment.id !== id) throw new Error("A COBRANÇA RETORNADA NÃO CORRESPONDE AO ID SOLICITADO.");
  if (payment.deleted || paidStatuses.has(payment.status ?? "")) return payment;
  if (!["PENDING", "OVERDUE"].includes(payment.status ?? "")) throw new Error(`COBRANÇA EM ${payment.status || "ESTADO DESCONHECIDO"}: REVISÃO NECESSÁRIA ANTES DE CANCELAR.`);
  try {
    const removed = await request<{ id: string; deleted: boolean }>(path, "DELETE");
    if (removed.id !== id || !removed.deleted) throw new Error("O ASAAS NÃO CONFIRMOU O CANCELAMENTO.");
    return { ...payment, deleted: true };
  } catch (error) {
    // The provider may have accepted DELETE before the connection failed,
    // or payment may have won the race with cancellation.
    payment = await request<ProviderPayment>(path, "GET");
    if (payment.id === id && (payment.deleted || paidStatuses.has(payment.status ?? ""))) return payment;
    throw error;
  }
}

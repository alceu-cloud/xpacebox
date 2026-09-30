// Reprogramming does not forgive lateness: agenda and e-mail use the first
// known promise for the CURRENT stage, while the working forecast is separate.
export function sampleDeadlineControl(row: Record<string, unknown>) {
  const status = String(row.status || "REQUESTED");
  const production = ["REQUESTED", "IN_PRODUCTION"].includes(status);
  const delivery = status === "READY";
  const active = production || delivery || status === "SENT";
  const stage = production ? "PRODUCAO" as const : delivery ? "ENTREGA" as const : "APROVACAO" as const;
  const currentDueDate = !active ? "" : String(production ? row.production_due_date || row.delivery_date || "" : delivery ? row.customer_delivery_date || "" : row.approval_due_date || "");
  const original = production ? row.original_production_due_date : delivery ? row.original_customer_delivery_date : row.original_approval_due_date;
  return { stage, dueDate: active ? String(original || currentDueDate) : "", currentDueDate,
    label: production ? "PRAZO ORIGINAL PARA FICAR PRONTA" : delivery ? "PRAZO ORIGINAL PARA ENTREGAR AO CLIENTE" : "PRAZO ORIGINAL PARA APROVACAO DO CLIENTE" };
}

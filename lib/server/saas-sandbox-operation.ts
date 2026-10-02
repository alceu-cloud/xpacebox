import "server-only";
import { createHash } from "crypto";
import { CommercialError } from "@/lib/saas/commercial";
import { createSaasAsaasSandboxClient } from "@/lib/server/saas-asaas-sandbox";
import type { requireCompanyAccess } from "@/lib/server/company-access";
import type { XPayRegistration } from "@/lib/server/xpay-asaas";
type Access = Awaited<ReturnType<typeof requireCompanyAccess>>;
type TestOperation = { kind: "CREATE_SUBACCOUNT"; registration: XPayRegistration } | { kind: "CREATE_SUBSCRIPTION"; customerId: string; monthlyCents: number; dueOn: string; reference: string };
// No public endpoint/cron calls this helper. A future authorized test runner must
// pass server-validated access and verify company-to-customer binding/quoted total.
// The only client available here is hardcoded to api-sandbox.asaas.com.
export async function runSaasSandboxOperation(access: Access, ownerCompanyId: string, operation: TestOperation) {
  if (access.profile.platform_role !== "platform_owner" || access.company.id === ownerCompanyId) throw new CommercialError("TESTE RESERVADO À PLATAFORMA E A OUTRA EMPRESA.",403);
  // Opt-in is checked before journaling anything. No legacy/production-key fallback.
  const client = createSaasAsaasSandboxClient(process.env.SAAS_ASAAS_PARENT_SANDBOX_API_KEY || "");
  const fingerprint = createHash("sha256").update(JSON.stringify(operation)).digest("hex");
  const {data: lease,error} = await access.admin.rpc("saas_begin_sandbox_operation", { p_company: access.company.id, p_actor: access.user.id, p_kind: operation.kind, p_fingerprint: fingerprint });
  if (error || !lease) throw new CommercialError("NÃO FOI POSSÍVEL RESERVAR O TESTE. NADA ENVIADO AO ASAAS.",409);
  if (!lease.acquired) {
    if (lease.status === "SUCCEEDED") return { operationId: lease.id, status: "SUCCEEDED" as const, replayed: true };
    throw new CommercialError("TESTE EM ANDAMENTO OU SEM CONFIRMAÇÃO. CONFERIR O ASAAS SEM REPETIR.",409);
  }
  try {
    const result = operation.kind === "CREATE_SUBACCOUNT"
      ? await client.createChild(access.company.id,ownerCompanyId,operation.registration)
      : await client.simulateSubscription(access.company.id,ownerCompanyId,operation);
    // Returned account API key is already encrypted. Persist private mappings
    // before reporting success; never return credentials/result to the browser.
    const saved = await access.admin.rpc("saas_finish_sandbox_operation", { p_id: lease.id, p_lease: lease.leaseKey, p_status: "SUCCEEDED", p_result: result });
    if (saved.error) throw new Error("RESULT_PERSISTENCE_UNCERTAIN");
    return { operationId: lease.id, status: "SUCCEEDED" as const, replayed: false };
  } catch {
    try {
      await access.admin.rpc("saas_finish_sandbox_operation", { p_id: lease.id, p_lease: lease.leaseKey, p_status: "UNKNOWN", p_result: null });
    } catch { /* Keep RUNNING fenced; the expired lease becomes UNKNOWN, never retried. */ }
    throw new CommercialError("RESULTADO DO TESTE PRECISA DE CONFERÊNCIA. NÃO REPETIR AUTOMATICAMENTE.",409);
  }
}

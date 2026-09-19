import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { processPaymentCancellations } from "@/lib/server/xpace-payment-cancellations";

export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const access = await requireCompanyAccess(request, "xpace");
    const { contractId } = await request.json() as { contractId?: string };
    if (!contractId) return NextResponse.json({ success: false, message: "INFORME O CONTRATO." }, { status: 400 });
    // Claim is tenant-scoped and processes only previously requested cancellations.
    const cancellations = await processPaymentCancellations(access.admin, access.company.id, contractId);
    return NextResponse.json({ success: true, cancellations });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("XPAY CANCELLATION RETRY ERROR", error);
    return NextResponse.json({ success: false, message: "CANCELAMENTO REGISTRADO. A CONFIRMAÇÃO NO ASAAS SERÁ TENTADA NOVAMENTE." }, { status: 500 });
  }
}

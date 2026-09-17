import { NextResponse } from "next/server";

export async function POST() {
  // Kept only to give older clients a clear response. Closing is now allowed
  // exclusively after the delivery and approval stages in /transicao.
  return NextResponse.json({
    success: false,
    message: "USE O FLUXO DE ETAPAS PARA MARCAR A AMOSTRA COMO PRONTA, ENTREGUE E APROVADA.",
  }, { status: 409 });
}

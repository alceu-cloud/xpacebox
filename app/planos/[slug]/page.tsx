import PlansPayments from "@/components/saas/PlansPayments";
import BuildRevision from "@/components/BuildRevision";
export default async function PlansPaymentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main><nav style={{ padding: "16px" }}><a href="/">Voltar à plataforma</a></nav><PlansPayments companySlug={slug} /><BuildRevision className="saas-build-revision" /></main>;
}

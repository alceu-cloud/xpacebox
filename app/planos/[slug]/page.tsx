import PlansPayments from "@/components/saas/PlansPayments";
import BuildRevision from "@/components/BuildRevision";
import CommercialPageHeader from "@/components/saas/CommercialPageHeader";
export default async function PlansPaymentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main><CommercialPageHeader companySlug={slug} /><PlansPayments companySlug={slug} /><BuildRevision className="saas-build-revision" /></main>;
}

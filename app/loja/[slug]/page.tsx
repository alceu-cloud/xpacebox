import CommercialStore from "@/components/saas/CommercialStore";
import BuildRevision from "@/components/BuildRevision";
import CommercialPageHeader from "@/components/saas/CommercialPageHeader";

export default async function CommercialStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main><CommercialPageHeader companySlug={slug} /><CommercialStore companySlug={slug} /><BuildRevision className="saas-build-revision" /></main>;
}

import CommercialStore from "@/components/saas/CommercialStore";
import BuildRevision from "@/components/BuildRevision";

export default async function CommercialStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <main><nav style={{ padding: "16px" }}><a href="/">Voltar à plataforma</a></nav><CommercialStore companySlug={slug} /><BuildRevision className="saas-build-revision" /></main>;
}

import "server-only";

import { createSupabaseAdmin } from "@/lib/server/supabase-admin";

type ContractEnrollment = {
  tenant_company_id: string;
  student_id: string;
  class_group_id: string | null;
  starts_on: string;
};

export async function ensureContractEnrollment(admin: ReturnType<typeof createSupabaseAdmin>, contract: ContractEnrollment) {
  if (!contract.class_group_id) return;
  const { error } = await admin.from("xpace_class_enrollments").upsert({
    tenant_company_id: contract.tenant_company_id,
    class_group_id: contract.class_group_id,
    student_id: contract.student_id,
    starts_on: contract.starts_on,
    created_by: null,
  }, { onConflict: "class_group_id,student_id,starts_on", ignoreDuplicates: true });
  if (error) throw error;
}

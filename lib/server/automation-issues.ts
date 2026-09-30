import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { NotificationCategory } from "@/lib/notifications";

// Only fixed descriptions supplied by our code, never raw provider messages,
// tokens, recipients, webhook payloads or user content, reach this panel.
export async function recordAutomationResult(input: { companyId: string; automation: string; scopeKey: string; category: Exclude<NotificationCategory, "EXPERIMENTAL" | "CRM">; summary: string; failed: boolean }) {
  try {
    const admin = createSupabaseAdmin(), now = new Date().toISOString();
    if (input.failed) {
      const { error } = await admin.from("company_automation_issues").upsert({ tenant_company_id: input.companyId, automation: input.automation, scope_key: input.scopeKey, category: input.category, summary: input.summary, last_failed_at: now, resolved_at: null }, { onConflict: "tenant_company_id,automation,scope_key" });
      if (error) throw error;
    } else {
      const { error } = await admin.from("company_automation_issues").update({ resolved_at: now }).eq("tenant_company_id", input.companyId).eq("automation", input.automation).eq("scope_key", input.scopeKey).is("resolved_at", null);
      if (error) throw error;
    }
  } catch { console.error("AUTOMATION MONITOR RECORD FAILED", { automation: input.automation }); }
}
export async function recordCronResult(slug: string, automation: string, failed: boolean, category: "FINANCEIRO" | "EMAIL", summary: string) {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from("companies").select("id").eq("slug", slug).eq("active", true).maybeSingle();
    if (error) throw error;
    if (data) await recordAutomationResult({ companyId: data.id, automation, scopeKey: "cron", category, summary, failed });
  } catch { console.error("AUTOMATION MONITOR LOOKUP FAILED", { automation }); }
}

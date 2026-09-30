import { NextResponse } from "next/server";
import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { companyNoticeFeed, notificationPreferences } from "@/lib/server/company-notifications";
import { notificationCategories, type NotificationCategory } from "@/lib/notifications";

export const dynamic = "force-dynamic";
async function accessFor(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") || "";
  if (!["xpace", "dawos"].includes(slug)) throw new AccessError("EMPRESA INVÁLIDA.", 400);
  return requireCompanyAccess(request, slug);
}
async function canManage(access: Awaited<ReturnType<typeof requireCompanyAccess>>) {
  if (access.profile.platform_role === "platform_owner") return true;
  const { data, error } = await access.admin.from("company_members").select("company_role").eq("company_id", access.company.id).eq("profile_id", access.profile.id).eq("active", true).maybeSingle();
  if (error) throw error;
  return data?.company_role === "company_manager" || Boolean(data && access.profile.platform_role === "company_manager");
}
export async function GET(request: Request) {
  try {
    const access = await accessFor(request);
    if (new URL(request.url).searchParams.get("preferencesOnly") === "1") return NextResponse.json({ success: true, preferences: await notificationPreferences(access.admin, access.company.id, access.profile.id), userName: access.profile.full_name || access.profile.email }, { headers: { "Cache-Control": "no-store" } });
    const snapshotAt = new Date().toISOString();
    const feed = await companyNoticeFeed(access.admin, access.company.id, access.company.slug, access.profile.id, await canManage(access));
    const bucket = new URL(request.url).searchParams.get("bucket") || "UNREAD";
    const page = Math.max(0, Math.min(100000, Number(new URL(request.url).searchParams.get("page")) || 0));
    const isRead = (n: typeof feed.notices[number]) => n.createdAt <= (feed.preferences.readBefore[n.category] || "");
    const list = bucket === "ISSUES" ? feed.issues : feed.notices.filter(n => n.createdAt <= snapshotAt && (bucket === "READ" ? isRead(n) : !isRead(n)));
    const currentPage = Math.min(Math.floor(page), Math.max(0, Math.ceil(list.length / 2) - 1));
    return NextResponse.json({ success: true, items: list.slice(currentPage * 2, currentPage * 2 + 2), total: list.length, unread: feed.unread, issueCount: feed.issues.length, issueSignals: feed.issues.map(issue => ({ id: issue.id, delayed: issue.category === "WHATSAPP" && issue.id.startsWith("connector:") })), todayErrors: feed.todayErrors, page: currentPage, pageSize: 2, snapshotAt, preferences: feed.preferences }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const access = await accessFor(request);
    const body = await request.json();
    const current = await notificationPreferences(access.admin, access.company.id, access.profile.id);
    if (body.action === "PREFERENCES") {
      if (!Array.isArray(body.categories) || body.categories.some((c: unknown) => typeof c !== "string" || !Object.hasOwn(notificationCategories, c))) throw new AccessError("CATEGORIA INVÁLIDA.", 400);
      const { error } = await access.admin.from("company_notification_preferences").upsert({ tenant_company_id: access.company.id, profile_id: access.profile.id, categories: [...new Set(body.categories)], updated_at: new Date().toISOString() }, { onConflict: "tenant_company_id,profile_id" });
      if (error) throw error;
    } else if (body.action === "MARK_READ" || body.action === "MIGRATE_READ") {
      const feed = await companyNoticeFeed(access.admin, access.company.id, access.company.slug, access.profile.id, await canManage(access));
      let cutoff = new Date().toISOString();
      if (body.action === "MARK_READ") {
        if (typeof body.snapshotAt !== "string" || !Number.isFinite(Date.parse(body.snapshotAt)) || Date.parse(body.snapshotAt) > Date.now()) throw new AccessError("ATUALIZE OS AVISOS ANTES DE MARCAR COMO LIDOS.", 400);
        cutoff = new Date(body.snapshotAt).toISOString();
      }
      if (body.action === "MIGRATE_READ") {
        if (Object.keys(current.readBefore).length) return NextResponse.json({ success: true });
        if (typeof body.seenAt !== "string" || !Number.isFinite(Date.parse(body.seenAt)) || Date.parse(body.seenAt) > Date.now()) throw new AccessError("DATA INVÁLIDA.", 400);
        cutoff = new Date(body.seenAt).toISOString();
      }
      // The update changes cursors only; concurrent preference saves are not overwritten.
      const readBefore = { ...current.readBefore };
      for (const c of current.categories) {
        const latest = feed.notices.filter(n => n.category === c && n.createdAt <= cutoff).reduce((value, n) => n.createdAt > value ? n.createdAt : value, readBefore[c] || "");
        if (latest) readBefore[c as NotificationCategory] = latest;
      }
      const { error } = await access.admin.rpc("mark_company_notifications_read", { p_company: access.company.id, p_profile: access.profile.id, p_cursors: readBefore });
      if (error) throw error;
    } else throw new AccessError("AÇÃO INVÁLIDA.", 400);
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("NOTIFICATION API ERROR", error);
  return NextResponse.json({ success: false, message: "Não foi possível carregar ou salvar os avisos." }, { status: 500 });
}

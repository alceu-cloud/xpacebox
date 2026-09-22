const { chromium } = require("@playwright/test");

const baseUrl = process.env.XPACE_SMOKE_BASE_URL || "http://localhost:3001";
const executablePath = process.env.XPACE_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function main() {
  const today = todayInSaoPaulo();
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(year, month - 1, day, 12).getDay();
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: "America/Sao_Paulo" });
    const fakeSession = {
      access_token: "test-access-token",
      refresh_token: "test-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "test-user", aud: "authenticated", role: "authenticated", email: "test@xpace.test", app_metadata: {}, user_metadata: {} },
    };
    await page.addInitScript((session) => localStorage.setItem("sb-example-auth-token", JSON.stringify(session)), fakeSession);
    await page.route("**/api/empresas/xpace", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, company: { id: "xpace", name: "XPACE", slug: "xpace" } }) }));
    await page.route("**/api/xpace/mobile/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, profileName: "Alceu", metrics: { trialsThisWeek: 1, activeClients: 1, newClientsThisMonth: 1, newLeadsThisMonth: 1 }, notifications: [{ id: "notification-1", title: "Aula experimental agendada", detail: `Lead Teste · ${today}`, createdAt: new Date().toISOString() }] }) }));
    await page.route("**/api/xpace/mobile/push", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, enabled: true, publicKey: "test-public-key" }) }));
    await page.route("**/api/xpace/agenda?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, groups: [{ id: "group-1", name: "Jazz Funk", schedules: [{ id: "schedule-1", weekday, startsAt: "19:00", endsAt: "20:00", roomName: "Sala 1", instructorName: "Professora", color: "#7435d9", capacity: 40 }], students: [{ id: "enrollment-1", studentName: "Aluno Teste", startsOn: "2020-01-01", endsOn: null }] }], trialAppointments: [{ id: "trial-1", leadName: "Lead Teste", classScheduleId: "schedule-1", scheduledOn: today, attendanceStatus: "AGENDADO" }] }) }));
    let attendanceBody;
    await page.route("**/api/xpace/agenda", async (route) => {
      attendanceBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, appointmentId: "trial-1", attendanceStatus: "COMPARECEU" }) });
    });

    await page.goto(`${baseUrl}/xpace/app`);
    await page.getByRole("heading", { name: "Sua escola hoje" }).waitFor();
    if (process.env.XPACE_SMOKE_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.XPACE_SMOKE_SCREENSHOT_DIR}/xpace-dashboard.png`, fullPage: true });
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    if (process.env.XPACE_SMOKE_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.XPACE_SMOKE_SCREENSHOT_DIR}/xpace-agenda.png`, fullPage: true });
    await page.getByRole("button", { name: /Jazz Funk/ }).click();
    await page.getByText("Aluno Teste").waitFor();
    await page.getByText("Lead Teste").waitFor();
    await page.getByRole("button", { name: "Marcar Lead Teste como compareceu" }).click();
    await page.getByText("LEAD · COMPARECEU").waitFor();
    if (attendanceBody?.action !== "UPDATE_TRIAL_ATTENDANCE" || attendanceBody.trialAttendance?.appointmentId !== "trial-1" || attendanceBody.trialAttendance?.classScheduleId !== "schedule-1" || attendanceBody.trialAttendance?.scheduledOn !== today || attendanceBody.trialAttendance?.attendanceStatus !== "COMPARECEU") {
      throw new Error(`Payload de presença inesperado: ${JSON.stringify(attendanceBody)}`);
    }
    await page.getByRole("button", { name: /Notificações/ }).click();
    await page.getByText("No iPhone, abra o app pela Tela de Início para ativar avisos.").waitFor();
    console.log("XPACE pocket smoke: dashboard, agenda, chamada e orientação push OK");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

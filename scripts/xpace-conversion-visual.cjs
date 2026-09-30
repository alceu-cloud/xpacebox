// Browser tests against localhost only; all APIs intercepted, never real sends.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  ts = require("typescript");
const { chromium } = require("@playwright/test");
const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("lib/xpace/conversion-metrics.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: exportsObject,
    require: () => require("../lib/xpace/report-metrics.ts"),
    Date,
    Intl,
  },
);
const metrics = require("../lib/xpace/report-metrics.ts"),
  history = require("../lib/server/xpace-report-history.ts");
const origin = process.env.TEST_ORIGIN || "http://localhost:3007";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
const out = path.join(os.tmpdir(), "xpace-conversion-visual");
fs.mkdirSync(out, { recursive: true });
const publicUrl = fs
  .readFileSync(".env.local", "utf8")
  .match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
const project = new URL(publicUrl).hostname.split(".")[0];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = {
  id: uuid(1),
  email: "visual@example.test",
  aud: "authenticated",
  role: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
};
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const [label, viewport] of [
      ["desktop", { width: 1440, height: 1000 }],
      ["mobile", { width: 390, height: 844 }],
      ["small-mobile", { width: 320, height: 740 }],
    ]) {
      const context = await browser.newContext({
        viewport,
        timezoneId: "America/Sao_Paulo",
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ({ key, user }) =>
          localStorage.setItem(
            key,
            JSON.stringify({
              access_token: "test-only",
              refresh_token: "test-only",
              token_type: "bearer",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              expires_in: 3600,
              user,
            }),
          ),
        { key: `sb-${project}-auth-token`, user },
      );
      const leads = Array.from({ length: 25 }, (_, i) => ({
        id: uuid(10 + i),
        lead_number: i + 1,
        full_name: "ALUNO TESTE " + String(i).padStart(2, "0"),
        mobile: "47999999999",
        email: null,
        pipeline_stage: "AULA_EXPERIMENTAL",
        linked_student_id: null,
        converted_person_id: null,
        assigned_to: user.id,
        loss_reason_id: null,
        loss_note: null,
        created_at: "2026-09-20T12:00:00Z",
        updated_at: "2026-09-20T12:00:00Z",
      }));
      const trials = leads.map((l, i) => ({
        id: uuid(50 + i),
        lead_id: l.id,
        scheduled_on: "2026-09-20",
        starts_at: "19:00",
        ends_at: "20:00",
        class_name_snapshot: "JAZZ TESTE",
        modality_name_snapshot: "JAZZ",
        instructor_name_snapshot: "PROFESSORA TESTE",
        actual_instructor_name_snapshot: "PROFESSORA REAL",
        attendance_status: "COMPARECEU",
        enrollment_outcome: "PENDENTE",
        confirmation_status: "CONFIRMADO",
        booking_kind: "NOVO",
        survey_status: "ENVIADA",
        whatsapp_opt_in: false,
        whatsapp_legacy_allowed_at: null,
      }));
      const activities = [],
        writes = [],
        errors = [];
      let failSave = true,
        sequence = 0;
      await context.route("**/*", async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        const send = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (url.hostname.endsWith(".supabase.co"))
          return send(url.pathname.includes("/auth/") ? user : []);
        if (url.pathname.startsWith("/api/")) {
          if (url.pathname === "/api/xpace/conversion") {
            if (req.method() === "POST") {
              const body = req.postDataJSON();
              writes.push(body);
              if (failSave) {
                failSave = false;
                return send(
                  { success: false, message: "Fixture: falha ao salvar" },
                  503,
                );
              }
              const payload =
                body.action === "SAVE_FOLLOWUP"
                  ? {
                      kind: "conversion_followup",
                      action: body.nextAction,
                      dueOn: body.dueOn,
                      responsibleId: body.responsibleId,
                      status: body.status,
                      result: body.result,
                    }
                  : {
                      kind: "conversion_survey",
                      response: body.response,
                      note: body.note,
                      reviewed: body.reviewed,
                    };
              activities.push({
                id: uuid(100 + sequence++),
                lead_id: body.leadId,
                appointment_id: body.appointmentId ?? null,
                payload,
                created_at: `2026-09-29T12:00:${String(sequence).padStart(2, "0")}Z`,
              });
              return send({ success: true });
            }
            return send({
              success: true,
              today: "2026-09-29",
              overview: exportsObject.buildConversionOverview(
                leads,
                trials,
                activities,
                [],
                url.searchParams.get("from"),
                url.searchParams.get("to"),
                "2026-09-29",
              ),
              attendants: [{ id: user.id, full_name: "ATENDENTE TESTE" }],
            });
          }
          if (req.method() !== "GET")
            throw Error("Unexpected write " + url.pathname);
          if (url.pathname === "/api/empresas/xpace")
            return send({ success: true, canAccessCentral: false });
          if (url.pathname === "/api/xpace/home")
            return send({
              success: true,
              metrics: { activeClients: 0, newClientsThisMonth: 0 },
              notifications: {
                items: [],
                total: 0,
                unread: 0,
                page: 0,
                pageSize: 2,
                latestCreatedAt: null,
              },
            });
          if (url.pathname === "/api/xpace/leads")
            return send({
              success: true,
              leads,
              appointments: trials,
              activities: activities.map((a) => ({
                ...a,
                activity_type: "CONTATO",
                body: "ACOMPANHAMENTO TESTE",
              })),
              sources: [],
              lossReasons: [],
              winReasons: [],
              attendants: [{ id: user.id, full_name: "ATENDENTE TESTE" }],
              instructors: [],
              groups: [],
              canOverrideTrialLimit: true,
              canDeleteLeads: true,
            });
          if (url.pathname === "/api/xpace/reports") {
            const { records, ...report } = metrics.buildTrialReport(
              [],
              url.searchParams.get("from"),
              url.searchParams.get("to"),
            );
            return send({
              success: true,
              report,
              history: [],
              systemMonths: [],
              historySource: history.historySource,
              historySources: [],
              historyDestinations: [],
              today: "2026-09-29",
              transition: true,
            });
          }
          return send({ success: true, configured: false, latest: null });
        }
        if (url.origin !== origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin + "/xpace");
      await page
        .locator(".xd-modules")
        .getByRole("button", { name: /RELATÓRIOS/ })
        .click();
      await page
        .locator(".xpr-tabs")
        .getByRole("button", { name: "AÇÃO E CONVERSÃO", exact: true })
        .click();
      const queue = page
        .locator(".xpr-panel")
        .filter({
          has: page.getByRole("heading", {
            name: /Compareceu e ainda não matriculou/i,
          }),
        });
      await queue.getByText(/ALUNO TESTE 00/).waitFor();
      const originalFrom = await page.getByLabel("DE", {exact:true}).inputValue();
      const originalTo = await page.getByLabel("ATÉ", {exact:true}).inputValue();
      await page.getByLabel("DE", {exact:true}).fill("2026-09-30");
      await page.getByLabel("ATÉ", {exact:true}).fill("2026-09-01");
      await page.getByRole("button", {name:"APLICAR",exact:true}).click();
      await page.getByRole("alert").getByText("A data inicial deve ser anterior à final.").waitFor();
      await page.getByLabel("DE", {exact:true}).fill(originalFrom);
      await page.getByLabel("ATÉ", {exact:true}).fill(originalTo);
      await page.getByRole("button", {name:"APLICAR",exact:true}).click();
      await queue.getByText(/ALUNO TESTE 00/).waitFor();
      assert.equal(await queue.locator("tbody tr").count(), 20);
      await queue.getByRole("button", { name: "Próxima", exact: true }).click();
      assert.equal(await queue.locator("tbody tr").count(), 5);
      await queue
        .getByRole("button", { name: "Anterior", exact: true })
        .click();
      await queue
        .getByRole("button", { name: "Próxima ação", exact: true })
        .first()
        .click();
      const dialog = page
        .getByRole("dialog")
        .filter({
          has: page.getByRole("heading", { name: "Próxima ação", exact: true }),
        });
      await dialog.waitFor();
      await dialog
        .getByLabel("Ação", { exact: true })
        .fill("Telefonar para conversar sobre o plano");
      await dialog.getByLabel("Data da próxima ação").fill("2026-09-30");
      await dialog.getByLabel(/Responsável/).selectOption(user.id);
      await dialog.getByRole("button", { name: "Salvar registro" }).click();
      await dialog
        .getByRole("alert")
        .getByText("Fixture: falha ao salvar", { exact: true })
        .waitFor();
      assert.equal(
        await dialog.getByLabel("Ação", { exact: true }).inputValue(),
        "Telefonar para conversar sobre o plano",
      );
      await dialog.getByRole("button", { name: "Salvar registro" }).click();
      await dialog.waitFor({ state: "hidden" });
      await queue.getByLabel("Pesquisar aluno").fill("ALUNO TESTE 00");
      await queue.getByText(/Telefonar para conversar sobre o plano/).waitFor();
      await page
        .getByRole("button", { name: "Atualizar acompanhamento", exact: true })
        .click();
      await queue.getByText(/Telefonar para conversar sobre o plano/).waitFor();
      const surveys = page
        .locator(".xpr-panel")
        .filter({
          has: page.getByRole("heading", {
            name: /Pesquisa: envio, resposta e atendimento/i,
          }),
        });
      await surveys
        .getByRole("button", { name: "Registrar resposta", exact: true })
        .first()
        .click();
      const responseDialog = page
        .getByRole("dialog")
        .filter({
          has: page.getByRole("heading", {
            name: "Resposta da pesquisa",
            exact: true,
          }),
        });
      await responseDialog
        .getByLabel("Resposta recebida")
        .selectOption("NEGATIVA");
      await responseDialog
        .getByLabel("Observação / atendimento realizado")
        .fill("Aluno relatou dificuldade com o horário");
      await responseDialog
        .getByRole("button", { name: "Salvar registro" })
        .click();
      await responseDialog.waitFor({ state: "hidden" });
      await page.getByText(/Há 1 avaliação/).waitFor();
      await surveys.getByLabel("Somente negativas para atender").check();
      assert.equal(await surveys.locator("tbody tr").count(), 1);
      await surveys
        .getByRole("button", { name: "Registrar resposta", exact: true })
        .click();
      await responseDialog.getByLabel("Já conversei com o aluno").check();
      await responseDialog
        .getByLabel("Observação / atendimento realizado")
        .fill("Conversei e apresentei outros horários");
      await responseDialog
        .getByRole("button", { name: "Salvar registro" })
        .click();
      await responseDialog.waitFor({ state: "hidden" });
      await surveys
        .getByText("Nenhuma pesquisa nesta seleção.", { exact: true })
        .waitFor();
      await surveys.getByLabel("Somente negativas para atender").uncheck();
      await queue
        .getByRole("button", { name: "Próxima ação", exact: true })
        .first()
        .click();
      await dialog.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Próxima ação",
      );
      await page.evaluate(() => window.scrollTo(0,0));
      await page.screenshot({
        path: path.join(out, label + "-top.png"),
        fullPage: false,
      });
      await page.screenshot({
        path: path.join(out, label + ".png"),
        fullPage: true,
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
        "No page overflow " + label,
      );
      const alignment = await page
        .locator(".xcv-workspace")
        .evaluate((el) =>
          [...el.querySelectorAll("td,th")].every(
            (cell) => getComputedStyle(cell).textAlign === "center",
          ),
        );
      assert.equal(alignment, true);
      await queue
        .getByRole("button", { name: "Abrir lead", exact: true })
        .first()
        .click();
      await page.locator(".xd-lead-detail").waitFor();
      assert.ok(
        await page
          .locator(".xd-lead-detail")
          .getByRole("heading")
          .first()
          .innerText(),
        "Deep-link opens lead",
      );
      await page.reload();
      await page.locator(".xd-modules").getByRole("button",{name:/CRM Relacionamento/}).click();
      await page.locator(".xd-leads-heading-actions").getByRole("button",{name:"AÇÃO E CONVERSÃO",exact:true}).click();
      await queue.getByLabel("Pesquisar aluno").fill("ALUNO TESTE 00");
      await queue.getByText(/Telefonar para conversar sobre o plano/).waitFor();
      assert.equal((await page.getByLabel("DE",{exact:true}).inputValue()).slice(-3),"-01","CRM shortcut starts on current month");
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.equal(writes.length, 4);
      await context.close();
      console.log("PASS browser " + label);
    }
  } finally {
    await browser.close();
  }
  console.log("Visual snapshots: " + out);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

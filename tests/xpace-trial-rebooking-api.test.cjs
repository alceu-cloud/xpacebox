// Isolated route regressions: no network, database, notifications or real sends.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const COMPANY = id(1), OTHER_COMPANY = id(2), LEAD = id(10), GROUP = id(20), SCHEDULE = id(21);
const SOURCE = id(30), INSTRUCTOR = id(40), APPOINTMENT = id(50), PREVIOUS = id(51), ACTOR = id(60);
const TARGET = '2026-10-03';
class FrozenDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-02T12:00:00.000Z'])); }
  static now() { return Date.parse('2026-10-02T12:00:00.000Z'); }
}
class AccessError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const lead = (changes = {}) => ({ id: LEAD, tenant_company_id: COMPANY, full_name: 'Pessoa Teste', email: 'pessoa@example.test', mobile: '47999999999', pipeline_stage: 'AULA_EXPERIMENTAL', source_id: SOURCE, created_at: '2026-09-20T12:00:00Z', ...changes });
const trial = (changes = {}) => ({ id: PREVIOUS, tenant_company_id: COMPANY, lead_id: LEAD, scheduled_on: '2026-10-01', starts_at: '19:00:00', ends_at: '20:00:00', booking_kind: 'NOVO', attendance_status: 'FALTOU', modality_name_snapshot: 'Jazz', ...changes });

function fixture(options = {}) {
  const calls = [], studentQueues = [], teacherQueues = [], deferred = [];
  const data = {
    companies: [{ id: COMPANY, name: 'Escola Fixture', slug: 'xpace', active: true }],
    xpace_lead_sources: [{ id: SOURCE, tenant_company_id: COMPANY, name: 'Fixture', active: true }],
    xpace_class_groups: [{ id: GROUP, tenant_company_id: COMPANY, name: 'Jazz sábado', modality: options.modality ?? 'Jazz', active: true, instructor_id: INSTRUCTOR, settings: { allowLeads: true, leadWelcomeVideoUrl: 'https://fixture.test/video.mp4' } }],
    xpace_class_schedules: [{ id: SCHEDULE, tenant_company_id: COMPANY, class_group_id: GROUP, weekday: 6, starts_at: '19:00:00', ends_at: '20:00:00', active: true, instructor_id: INSTRUCTOR, room_name: 'Sala Fixture', settings: { allowLeads: true, leadWelcomeVideoUrl: 'https://fixture.test/video.mp4' } }],
    xpace_instructors: [{ id: INSTRUCTOR, tenant_company_id: COMPANY, full_name: 'Professor Fixture', active: true }],
    xpace_leads: options.leads ?? [lead()],
    xpace_lead_appointments: options.history ?? [trial()],
    xpace_people: options.students ?? [],
  };
  const matches = (row, [method, column, value, extra]) => {
    if (method === 'eq') return row[column] === value;
    if (method === 'neq') return row[column] !== value;
    if (method === 'in') return value.includes(row[column]);
    if (method === 'is') return value === null ? row[column] == null : row[column] === value;
    if (method === 'gte') return row[column] >= value;
    if (method === 'lte') return row[column] <= value;
    if (method === 'lt') return row[column] < value;
    if (method === 'gt') return row[column] > value;
    if (method === 'not' && value === 'in') return !extra.replace(/[()]/g, '').split(',').includes(row[column]);
    if (method === 'not' && value === 'is') return row[column] != null;
    throw new Error(`Unsupported fixture filter: ${method} ${column}`);
  };
  const admin = { from(table) {
    const call = { table, operation: 'select', filters: [], orders: [], columns: '', range: null, limit: null, singular: false };
    const builder = {};
    for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'gte', 'lte', 'lt', 'gt', 'not', 'order', 'limit', 'range', 'single', 'maybeSingle']) builder[method] = (...args) => {
      if (['insert', 'update', 'delete'].includes(method)) { call.operation = method; call.value = plain(args[0] ?? null); }
      else if (method === 'select') call.columns = args[0];
      else if (method === 'order') call.orders.push(args);
      else if (method === 'limit') call.limit = args[0];
      else if (method === 'range') call.range = args;
      else if (['single', 'maybeSingle'].includes(method)) call.singular = true;
      else call.filters.push([method, ...args]);
      return builder;
    };
    builder.then = (resolve, reject) => {
      calls.push(call);
      const failure = options.fail?.(call) ?? null;
      if (failure) return Promise.resolve({ data: null, error: failure }).then(resolve, reject);
      if (call.operation === 'insert') {
        const predecessor = table === 'xpace_lead_appointments' && call.value.booking_kind === 'REAGENDAMENTO'
          ? load('lib/xpace/trial-rebooking.ts').reschedulePredecessor(data.xpace_lead_appointments.filter((row) => row.tenant_company_id === COMPANY && row.lead_id === call.value.lead_id), { modality: call.value.modality_name_snapshot, scheduledOn: call.value.scheduled_on, startsAt: call.value.starts_at }) : null;
        return Promise.resolve({ data: call.singular ? { id: table === 'xpace_leads' ? id(11) : APPOINTMENT, rescheduled_from_appointment_id: predecessor } : null, error: null }).then(resolve, reject);
      }
      if (call.operation !== 'select') return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      let rows = (data[table] ?? []).filter((row) => call.filters.every((filter) => matches(row, filter)));
      for (const [column, config] of [...call.orders].reverse()) rows = [...rows].sort((a, b) => String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (config?.ascending === false ? -1 : 1));
      if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
      if (call.limit != null) rows = rows.slice(0, call.limit);
      return Promise.resolve({ data: call.singular ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
    };
    return builder;
  } };
  const cache = new Map();
  const imports = {
    'server-only': {},
    'next/server': { after: (callback) => deferred.push(callback), NextResponse: Response },
    '@/lib/server/supabase-admin': { createSupabaseAdmin: () => admin },
    '@/lib/server/company-access': { AccessError, requireCompanyAccess: async (request, slug) => {
      assert.equal(slug, 'xpace');
      if (request.headers.get('authorization') !== 'Bearer fixture') throw new AccessError('SESSÃO OBRIGATÓRIA.', 401);
      return { admin, company: { id: COMPANY }, profile: { id: ACTOR, full_name: 'Gestor Fixture', platform_role: 'company_manager' }, user: { id: ACTOR } };
    } },
    '@/lib/server/xpace-automatic-messages': {
      queueTrialMessages: async (_admin, input) => studentQueues.push(plain(input)),
      queueTrialInstructorMessage: async (_admin, input) => { teacherQueues.push(plain(input)); return 'QUEUED'; },
      queueSatisfactionAfterAttendance: async () => { throw new Error('Rebooking must not record attendance or send survey'); },
    },
    '@/lib/server/xpace-web-push': { sendNewAppointmentPush: async () => { throw new Error('Deferred push must not execute in isolated test'); } },
    '@/lib/xpace/natural-sort': { sortNaturally: (items) => items },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { exports, require: (name) => {
      if (name in imports) return imports[name];
      if (['@/lib/xpace/trial-rebooking', '@/lib/xpace/trial-schedule', '@/lib/server/xpace-trial-rebooking'].includes(name)) return load(`${name.replace('@/', '')}.ts`);
      throw new Error(`Unmocked import: ${name}`);
    }, Date: FrozenDate, Intl, Request, Response, URL, Set, Map, console: { error() {} } }, { filename: file });
    return exports;
  }
  const request = (body, authenticated = true) => new Request('https://fixture.test/api', { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'Bearer fixture' } : {}) }, body: JSON.stringify(body) });
  const appointmentInsert = () => calls.find((call) => call.table === 'xpace_lead_appointments' && call.operation === 'insert');
  const noAppointmentWrites = () => assert.equal(calls.some((call) => call.table === 'xpace_lead_appointments' && call.operation !== 'select'), false);
  const assertTenantScopes = () => {
    for (const call of calls) {
      if (call.table === 'companies') continue;
      assert.ok(call.value?.tenant_company_id === COMPANY || call.filters.some((filter) => filter[0] === 'eq' && filter[1] === 'tenant_company_id' && filter[2] === COMPANY), `Unscoped ${call.table} ${call.operation}`);
    }
  };
  return { admin, calls, studentQueues, teacherQueues, deferred, data, load, request, appointmentInsert, noAppointmentWrites, assertTenantScopes };
}
const publicBody = (changes = {}) => ({ fullName: 'Pessoa Teste', mobile: '(47) 99999-9999', email: 'pessoa@example.test', sourceId: SOURCE, classGroupId: GROUP, classScheduleId: SCHEDULE, scheduledOn: TARGET, whatsappOptIn: false, ...changes });
const manualBody = (changes = {}) => ({ action: 'CREATE_APPOINTMENT', appointment: { leadId: LEAD, classGroupId: GROUP, classScheduleId: SCHEDULE, scheduledOn: TARGET, bookingKind: 'REAGENDAMENTO', ...changes } });
const agendaBody = (changes = {}) => ({ action: 'CREATE_TRIAL_IN_CLASS', trial: { fullName: 'Pessoa Teste', mobile: '47999999999', email: 'pessoa@example.test', classGroupId: GROUP, classScheduleId: SCHEDULE, scheduledOn: TARGET, whatsappOptIn: false, ...changes } });
const publicRoute = (f) => f.load('app/api/public/xpace/aula-experimental/route.ts');
const manualRoute = (f) => f.load('app/api/xpace/leads/route.ts');
const agendaRoute = (f) => f.load('app/api/xpace/agenda/route.ts');

test('public same-person/same-modality absence becomes reschedule, preserves prior row and consent', async () => {
  const f = fixture();
  const before = plain(f.data.xpace_lead_appointments);
  const response = await publicRoute(f).POST(f.request(publicBody({ fullName: '  PESSOA   TESTE ', email: 'PESSOA@EXAMPLE.TEST', tenant_company_id: OTHER_COMPANY, leadId: id(99), bookingKind: 'RECUPERACAO' })));
  assert.equal(response.status, 201);
  const insert = f.appointmentInsert().value;
  assert.equal(insert.lead_id, LEAD);
  assert.equal(insert.tenant_company_id, COMPANY);
  assert.equal(insert.booking_kind, 'REAGENDAMENTO');
  assert.equal(insert.rescheduled_from_appointment_id, undefined, 'Predecessor is resolved by database, not caller-selected');
  assert.equal(insert.whatsapp_opt_in, false);
  assert.equal(insert.survey_opt_in, false);
  assert.equal(insert.welcome_delivery_status, 'DISPENSADO');
  assert.equal(f.studentQueues.length, 0);
  assert.deepEqual(plain(f.data.xpace_lead_appointments), before);
  assert.equal(f.calls.some((call) => call.table === 'xpace_lead_appointments' && call.operation === 'update'), false);
  const activity = f.calls.find((call) => call.table === 'xpace_lead_activities' && call.value?.activity_type === 'AGENDAMENTO_CRIADO');
  assert.equal(activity.value.payload.bookingKind, 'REAGENDAMENTO');
  assert.equal(activity.value.payload.rescheduledFromAppointmentId, PREVIOUS);
  f.assertTenantScopes();
});

test('public eligible reschedule bypasses two-new-trial quota but a different modality remains NOVO', async () => {
  const quota = fixture({ history: [trial(), trial({ id: id(52), modality_name_snapshot: 'Hip-hop' })] });
  assert.equal((await publicRoute(quota).POST(quota.request(publicBody()))).status, 201);
  assert.equal(quota.appointmentInsert().value.booking_kind, 'REAGENDAMENTO');
  const other = fixture({ modality: 'Hip-hop' });
  assert.equal((await publicRoute(other).POST(other.request(publicBody({ bookingKind: 'REAGENDAMENTO' })))).status, 201);
  assert.equal(other.appointmentInsert().value.booking_kind, 'NOVO');
  assert.equal(other.appointmentInsert().value.rescheduled_from_appointment_id ?? null, null);
  other.assertTenantScopes();
  const third = fixture({ modality: 'Ballet', history: [trial(), trial({ id: id(52), modality_name_snapshot: 'Hip-hop' })] });
  assert.equal((await publicRoute(third).POST(third.request(publicBody()))).status, 409);
  third.noAppointmentWrites();
});

test('public absence does not grant rebooking after presence, with pending trial, or without actual absence', async () => {
  for (const history of [
    [trial({ attendance_status: 'COMPARECEU' })],
    [trial({ attendance_status: 'AGENDADO', confirmation_status: 'NAO_CONFIRMADO' })],
    [trial(), trial({ id: id(52), scheduled_on: '2026-10-02', attendance_status: 'COMPARECEU', booking_kind: 'REAGENDAMENTO' })],
    [trial(), trial({ id: id(52), scheduled_on: '2026-10-10', attendance_status: 'AGENDADO', booking_kind: 'REAGENDAMENTO' })],
    [trial({ scheduled_on: '2026-10-02', starts_at: '10:00:00', ends_at: '11:00:00' })],
  ]) {
    const f = fixture({ history });
    assert.equal((await publicRoute(f).POST(f.request(publicBody()))).status, 409);
    f.noAppointmentWrites();
    assert.equal(f.studentQueues.length, 0);
  }
});

test('public matching preserves accents and refuses shared-phone person, changed email or duplicate identity', async () => {
  for (const leads of [
    [lead({ full_name: 'Outra Pessoa' })],
    [lead({ email: 'outra@example.test' })],
    [lead(), lead({ id: id(11) })],
    [lead({ full_name: 'Pessóa Teste' })],
  ]) {
    const f = fixture({ leads });
    const response = await publicRoute(f).POST(f.request(publicBody()));
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /IDENTIFICAR|CADASTRO/);
    assert.equal(f.calls.some((call) => call.operation !== 'select'), false);
    assert.equal(f.studentQueues.length, 0);
  }
  const f = fixture({ leads: [lead({ email: null })] });
  assert.equal((await publicRoute(f).POST(f.request(publicBody()))).status, 201, 'Legacy empty email can match unique exact name');
  assert.equal(f.appointmentInsert().value.lead_id, LEAD);
});

test('public phone quota spans all matching-phone leads but predecessor belongs to matched person only', async () => {
  const f = fixture({ leads: [lead(), lead({ id: id(11), full_name: 'Familiar Fixture', email: 'familiar@example.test' })], history: [trial({ lead_id: id(11) }), trial({ id: id(52), lead_id: id(11), modality_name_snapshot: 'Hip-hop' })] });
  assert.equal((await publicRoute(f).POST(f.request(publicBody()))).status, 409);
  f.noAppointmentWrites();
  const lookup = f.calls.find((call) => call.table === 'xpace_leads');
  assert.match(lookup.columns, /full_name/);
  assert.match(lookup.columns, /email/);
  f.assertTenantScopes();
});

test('public and agenda reject an incomplete phone identity set instead of silently selecting latest', async () => {
  const leads = Array.from({ length: 26 }, (_, offset) => lead({ id: id(100 + offset), full_name: offset === 0 ? 'Pessoa Teste' : `Familiar ${offset}`, email: offset === 0 ? 'pessoa@example.test' : `familiar${offset}@example.test` }));
  for (const [route, body] of [[publicRoute, publicBody()], [agendaRoute, agendaBody()]]) {
    const f = fixture({ leads });
    assert.equal((await route(f).POST(f.request(body))).status, 409);
    assert.equal(f.calls.some((call) => call.operation !== 'select'), false);
    assert.equal(f.calls.find((call) => call.table === 'xpace_leads').limit, 26);
  }
});

test('public new identity creates a new NOVO lead; foreign tenant history never turns it into reschedule', async () => {
  const f = fixture({ leads: [lead({ tenant_company_id: OTHER_COMPANY })], history: [trial({ tenant_company_id: OTHER_COMPANY })] });
  assert.equal((await publicRoute(f).POST(f.request(publicBody()))).status, 201);
  assert.equal(f.appointmentInsert().value.booking_kind, 'NOVO');
  assert.equal(f.appointmentInsert().value.lead_id, id(11));
  assert.equal(f.appointmentInsert().value.rescheduled_from_appointment_id ?? null, null);
  f.assertTenantScopes();
});

test('public opt-in remains explicit for reschedule and only enables fixture queues', async () => {
  const f = fixture();
  assert.equal((await publicRoute(f).POST(f.request(publicBody({ whatsappOptIn: true })))).status, 201);
  assert.equal(f.appointmentInsert().value.whatsapp_opt_in, true);
  assert.equal(f.appointmentInsert().value.survey_opt_in, true);
  assert.equal(f.studentQueues.length, 1);
  assert.equal(f.studentQueues[0].companyId, COMPANY);
  assert.equal(f.studentQueues[0].leadId, LEAD);
  assert.equal(f.studentQueues[0].appointmentId, APPOINTMENT);
});

test('public history lookup failure fails closed before insert or message queue', async () => {
  const f = fixture({ fail: (call) => call.table === 'xpace_lead_appointments' && call.operation === 'select' ? { message: 'Fixture database unavailable' } : null });
  assert.equal((await publicRoute(f).POST(f.request(publicBody()))).status, 500);
  assert.equal(f.calls.some((call) => call.operation !== 'select'), false);
  assert.equal(f.studentQueues.length, 0);
});

test('public database rebooking guards and unique races return 409 without sends', async () => {
  for (const error of [
    { message: 'XPACE_TRIAL_RESCHEDULE_INVALID' },
    { message: 'XPACE_TRIAL_RESCHEDULE_ALREADY_USED' },
    { code: '23505', message: 'duplicate key violates xpace_trial_reschedule_source_unique' },
    { code: '23505', message: 'duplicate active appointment' },
  ]) {
    const f = fixture({ fail: (call) => call.table === 'xpace_lead_appointments' && call.operation === 'insert' ? error : null });
    assert.equal((await publicRoute(f).POST(f.request(publicBody({ whatsappOptIn: true })))).status, 409);
    assert.equal(f.studentQueues.length, 0);
    assert.equal(f.teacherQueues.length, 0);
  }
});

test('manual CRM rejects cross-modality reschedule before insert and accepts eligible same-modality', async () => {
  const bad = fixture({ modality: 'Hip-hop' });
  assert.equal((await manualRoute(bad).POST(bad.request(manualBody({ trialLimitOverride: true })))).status, 409, 'A paid override cannot turn a different modality into rescheduling');
  bad.noAppointmentWrites();
  const good = fixture();
  assert.equal((await manualRoute(good).POST(good.request(manualBody({ tenant_company_id: OTHER_COMPANY, created_by: id(99) })))).status, 201);
  const insert = good.appointmentInsert().value;
  assert.equal(insert.booking_kind, 'REAGENDAMENTO');
  assert.equal(insert.rescheduled_from_appointment_id, undefined, 'Database owns the predecessor link');
  assert.equal(insert.tenant_company_id, COMPANY);
  assert.equal(insert.created_by, ACTOR);
  assert.equal(insert.whatsapp_opt_in, false);
  good.assertTenantScopes();
});

test('manual CRM refuses presence-only/nonconfirmed rebooking and read failure', async () => {
  for (const history of [[trial({ attendance_status: 'COMPARECEU' })], [trial({ attendance_status: 'AGENDADO', confirmation_status: 'NAO_CONFIRMADO' })]]) {
    const f = fixture({ history });
    assert.equal((await manualRoute(f).POST(f.request(manualBody()))).status, 409);
    f.noAppointmentWrites();
  }
  const failed = fixture({ fail: (call) => call.table === 'xpace_lead_appointments' && call.operation === 'select' ? { message: 'Read failed' } : null });
  assert.equal((await manualRoute(failed).POST(failed.request(manualBody()))).status, 500);
  failed.noAppointmentWrites();
  const unauth = fixture();
  assert.equal((await manualRoute(unauth).POST(unauth.request(manualBody(), false))).status, 401);
  assert.equal(unauth.calls.length, 0);
});

test('agenda auto-classifies same-modality absence; cross modality stays new and shared phone cannot merge', async () => {
  const good = fixture();
  assert.equal((await agendaRoute(good).POST(good.request(agendaBody({ tenant_company_id: OTHER_COMPANY, bookingKind: 'NOVO' })))).status, 201);
  assert.equal(good.appointmentInsert().value.booking_kind, 'REAGENDAMENTO');
  assert.equal(good.appointmentInsert().value.rescheduled_from_appointment_id, undefined);
  const activity = good.calls.find((call) => call.table === 'xpace_lead_activities');
  assert.equal(activity.value.payload.rescheduledFromAppointmentId, PREVIOUS);
  good.assertTenantScopes();
  const other = fixture({ modality: 'Hip-hop' });
  assert.equal((await agendaRoute(other).POST(other.request(agendaBody()))).status, 201);
  assert.equal(other.appointmentInsert().value.booking_kind, 'NOVO');
  const ambiguous = fixture({ leads: [lead({ full_name: 'Familiar Fixture' })] });
  assert.equal((await agendaRoute(ambiguous).POST(ambiguous.request(agendaBody()))).status, 409);
  assert.equal(ambiguous.calls.some((call) => call.operation !== 'select'), false);
});

test('agenda stable student link is tenant validated and body cannot replace the actual student identity', async () => {
  const studentId = id(70);
  const good = fixture({ leads: [lead({ linked_student_id: studentId })], students: [{ id: studentId, tenant_company_id: COMPANY, full_name: 'Pessoa Teste', email: 'pessoa@example.test', mobile: '47999999999', is_student: true, active: true }] });
  assert.equal((await agendaRoute(good).POST(good.request(agendaBody({ studentId, fullName: 'Outra Pessoa', email: 'outra@example.test', mobile: '48999999999' })))).status, 201);
  assert.equal(good.appointmentInsert().value.lead_id, LEAD);
  assert.equal(good.appointmentInsert().value.booking_kind, 'REAGENDAMENTO');
  good.assertTenantScopes();
  const foreign = fixture({ students: [{ id: studentId, tenant_company_id: OTHER_COMPANY, full_name: 'Outra Pessoa', mobile: '48999999999', is_student: true, active: true }] });
  assert.equal((await agendaRoute(foreign).POST(foreign.request(agendaBody({ studentId })))).status, 404);
  foreign.noAppointmentWrites();
});

test('cancelled trial alone does not qualify as absence or consume public new-trial quota', async () => {
  const f = fixture({ history: [trial({ attendance_status: 'CANCELADO' })] });
  assert.equal((await publicRoute(f).POST(f.request(publicBody()))).status, 201);
  assert.equal(f.appointmentInsert().value.booking_kind, 'NOVO');
  assert.equal(f.appointmentInsert().value.rescheduled_from_appointment_id ?? null, null);
});

test('history loader pages beyond 1000 rows, excluding canceled and other tenant/lead histories', async () => {
  const history = Array.from({ length: 1002 }, (_, offset) => trial({ id: id(1000 + offset) }));
  history.push(trial({ id: id(3000), attendance_status: 'CANCELADO' }), trial({ id: id(3001), tenant_company_id: OTHER_COMPANY }), trial({ id: id(3002), lead_id: id(11) }));
  const f = fixture({ history });
  const values = await f.load('lib/server/xpace-trial-rebooking.ts').loadTrialHistory(f.admin, COMPANY, LEAD);
  assert.equal(values.length, 1002);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls.map((call) => call.range), [[0, 999], [1000, 1999]]);
  f.assertTenantScopes();
});

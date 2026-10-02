const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reschedulePredecessor, publicLeadMatch } = require('../lib/xpace/trial-rebooking.ts');
const { buildTrialReport } = require('../lib/xpace/report-metrics.ts');
const now = new Date('2026-10-02T02:30:00Z'); // 23:30 in Brazil, still October 1.
const target = { modality: 'Jazz', scheduledOn: '2026-10-03', startsAt: '18:00' };
const trial = (changes = {}) => ({ id: 'old', scheduled_on: '2026-10-01', starts_at: '18:00:00', ends_at: '19:00:00', modality_name_snapshot: 'JAZZ', attendance_status: 'FALTOU', ...changes });

test('same person history + exact modality + past absence yields predecessor', () => {
  assert.equal(reschedulePredecessor([trial()], target, now), 'old');
  assert.equal(reschedulePredecessor([trial({modality_name_snapshot:' jazz '})], target, now), 'old');
  for (const modality of ['Hip-hop', 'Jazz infantil', '', 'SEM MODALIDADE']) assert.equal(reschedulePredecessor([trial()], {...target,modality}, now), null);
});
test('unconfirmed/unknown/cancelled/present never imply absence', () => {
  for (const attendance_status of ['AGENDADO', 'NAO_INFORMADO', 'CANCELADO', 'COMPARECEU']) assert.equal(reschedulePredecessor([trial({attendance_status})], target, now), null);
});
test('latest pending/present prevents borrowing an older absence', () => {
  for (const attendance_status of ['AGENDADO', 'COMPARECEU', 'NAO_INFORMADO']) assert.equal(reschedulePredecessor([trial(),trial({id:'later',scheduled_on:'2026-10-02',attendance_status})], target, now), null);
  assert.equal(reschedulePredecessor([trial(),trial({id:'later',scheduled_on:'2026-10-02',attendance_status:'CANCELADO'})], target, now), 'old');
});
test('chronology, tied history, unknown time and Brazil midnight fail closed', () => {
  assert.equal(reschedulePredecessor([trial({scheduled_on:'2026-10-02'})],target,now),null);
  assert.equal(reschedulePredecessor([trial({ends_at:'23:45:00'})],target,now),null);
  assert.equal(reschedulePredecessor([trial({starts_at:null})],target,now),null);
  assert.equal(reschedulePredecessor([trial(),trial({id:'tie'})],target,now),null);
  assert.equal(reschedulePredecessor([trial()], {...target,scheduledOn:'2026-10-01',startsAt:'18:00'},now),null);
});
test('a repeated absence can continue a chain without erasing prior trials', () => {
  const history=[trial({scheduled_on:'2026-09-28'}),trial({id:'rebook',scheduled_on:'2026-10-01'})];
  const before=JSON.stringify(history);
  assert.equal(reschedulePredecessor(history,target,now),'rebook');
  assert.equal(JSON.stringify(history),before);
});
test('shared phone is not identity: unique name + compatible email required', () => {
  const leads=[{id:'alice',full_name:'Alice Silva',email:'alice@test.invalid'},{id:'bob',full_name:'Bob Silva',email:'bob@test.invalid'}];
  assert.equal(publicLeadMatch(leads,{fullName:' ALICE   SILVA ',email:'ALICE@TEST.INVALID'}).id,'alice');
  assert.equal(publicLeadMatch([],{fullName:'Alice',email:'a@test.invalid'}),null);
  for (const identity of [{fullName:'Carol Silva',email:'alice@test.invalid'},{fullName:'Alice Silva',email:'bob@test.invalid'}]) assert.throws(()=>publicLeadMatch(leads,identity),/IDENTITY_AMBIGUOUS/);
  assert.throws(()=>publicLeadMatch([leads[0],{...leads[0],id:'duplicate'}],{fullName:'Alice Silva',email:'alice@test.invalid'}),/IDENTITY_AMBIGUOUS/);
});
test('reports preserve one person, two bookings, absence and rebooking', () => {
  const base={leadId:'same-lead',personId:null,startsAt:'18:00',modality:'Jazz',instructor:'Fixture',enrollment:'PENDENTE',legacy:false,legacyMonth:null};
  const report=buildTrialReport([{...base,id:'old',on:'2026-10-01',kind:'NOVO',attendance:'FALTOU'},{...base,id:'new',on:'2026-10-03',kind:'REAGENDAMENTO',attendance:'COMPARECEU'}],'2026-10-01','2026-10-31');
  assert.equal(report.stats.leads,1);assert.equal(report.stats.appointments,2);assert.equal(report.stats.absent,1);assert.equal(report.stats.attended,1);
  assert.equal(report.kinds.find(g=>g.key==='REAGENDAMENTO').stats.attended,1);
});

"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { deleteClientSample, loadClientSamples, loadClientSampleHistory, saveClientSample, transitionClientSample } from "@/lib/amostras";
import type { SampleTransitionAction } from "@/lib/amostras";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { ClientSampleFormData, ClientSampleRecord, SampleDeadlineEvent, SampleStatus } from "@/types/amostras";
import type { ClientRecord, RepresentativeOption } from "@/types/clientes";
import type { ProductFicha } from "@/types/gerenciador";

function localToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
const today = localToday();

const emptyForm: ClientSampleFormData = {
  clientId: "",
  responsibleProfileId: "",
  requestedAt: today,
  deliveryDate: "",
  productionDueDate: "",
  readyAt: "",
  customerDeliveryDate: "",
  deliveredAt: "",
  approvalDueDate: "",
  approvedAt: "",
  closedAt: "",
  status: "IN_PRODUCTION",
  productFichaId: "",
  productDescription: "",
  dimensions: "",
  quantity: "1",
  shippingMethod: "",
  trackingCode: "",
  notes: "",
};

const statusOptions: Array<{ value: SampleStatus; label: string }> = [
  { value: "REQUESTED", label: "SOLICITADA" },
  { value: "IN_PRODUCTION", label: "EM PRODUCAO" },
  { value: "READY", label: "PRONTA PARA ENTREGA" },
  { value: "SENT", label: "ENTREGUE AO CLIENTE" },
  { value: "APPROVED", label: "APROVADA" },
  { value: "REJECTED", label: "REPROVADA" },
  { value: "CANCELLED", label: "CANCELADA" },
];

export default function AmostrasEmpresa({
  slug,
  clients,
  representatives,
  productFichas,
}: {
  slug: string;
  clients: ClientRecord[];
  representatives: RepresentativeOption[];
  productFichas: ProductFicha[];
}) {
  const [samples, setSamples] = useState<ClientSampleRecord[]>([]);
  const [form, setForm] = useState<ClientSampleFormData>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SampleStatus | "ALL">("ALL");
  const [sampleView, setSampleView] = useState<"OPEN" | "CLOSED">("OPEN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [transition, setTransition] = useState<{ sample: ClientSampleRecord; action: SampleTransitionAction | "REPROGRAM" } | null>(null);
  const [transitionDueDate, setTransitionDueDate] = useState("");
  const [actualDate, setActualDate] = useState(localToday());
  const [reason, setReason] = useState("");
  const [historySample, setHistorySample] = useState<ClientSampleRecord | null>(null);
  const [history, setHistory] = useState<SampleDeadlineEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (!historySample) return;
    let active = true;
    setHistory([]); setHistoryError(""); setHistoryLoading(true);
    loadClientSampleHistory(slug, historySample.id).then(events => { if (active) setHistory(events); })
      .catch(e => { if (active) setHistoryError(messageFrom(e)); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [slug, historySample]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadClientSamples(slug)
      .then((records) => {
        if (active) setSamples(records);
      })
      .catch((loadError) => {
        if (active) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const selectedClient = clients.find((client) => client.id === form.clientId);
  const clientFichas = useMemo(() => productFichas.filter((ficha) => ficha.clientId === form.clientId && ficha.status !== "INATIVO"), [form.clientId, productFichas]);
  const filteredSamples = useMemo(() => {
    const term = search.trim().toLocaleUpperCase("pt-BR");
    return samples.filter((sample) => {
      const matchesView = sampleView === "OPEN" ? !sample.closedAt : Boolean(sample.closedAt);
      const matchesStatus = statusFilter === "ALL" || sample.status === statusFilter;
      const matchesTerm = !term || `${sample.sampleCode} ${sample.clientName} ${sample.productDescription} ${sample.dimensions}`.toLocaleUpperCase("pt-BR").includes(term);
      return matchesView && matchesStatus && matchesTerm;
    });
  }, [samples, search, statusFilter, sampleView]);

  function update(key: keyof ClientSampleFormData, value: string) {
    setForm((current) => ({ ...current, [key]: key === "status" ? value as SampleStatus : upper(value) }));
  }

  function selectClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    setForm((current) => ({
      ...current,
      clientId,
      productFichaId: "",
      productDescription: "",
      responsibleProfileId: client?.representativeUserId || current.responsibleProfileId || representatives[0]?.id || "",
    }));
  }

  function selectProductFicha(productFichaId: string) {
    const ficha = clientFichas.find((item) => item.id === productFichaId);
    setForm((current) => ({
      ...current,
      productFichaId,
      productDescription: ficha ? productFichaLabel(ficha) : "",
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveClientSample(slug, form);
      setSamples((current) => current.some((sample) => sample.id === saved.sample.id)
        ? current.map((sample) => sample.id === saved.sample.id ? saved.sample : sample)
        : [saved.sample, ...current]);
      setForm(emptyForm);
      setMessage(saved.notificationSent
        ? `${saved.sample.sampleCode} SALVA E NOTIFICADA AO PPCP.`
        : `${saved.sample.sampleCode} SALVA COM SUCESSO.${saved.notificationError ? ` E-MAIL NAO ENVIADO: ${saved.notificationError}` : ""}`);
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(sample: ClientSampleRecord) {
    setForm({
      id: sample.id,
      clientId: sample.clientId,
      responsibleProfileId: sample.responsibleProfileId,
      requestedAt: sample.requestedAt,
      deliveryDate: sample.deliveryDate,
      productionDueDate: sample.productionDueDate,
      readyAt: sample.readyAt,
      customerDeliveryDate: sample.customerDeliveryDate,
      deliveredAt: sample.deliveredAt,
      approvalDueDate: sample.approvalDueDate,
      approvedAt: sample.approvedAt,
      closedAt: sample.closedAt,
      status: sample.status,
      productFichaId: sample.productFichaId,
      productDescription: sample.productDescription,
      dimensions: sample.dimensions,
      quantity: String(sample.quantity || 1),
      shippingMethod: sample.shippingMethod,
      trackingCode: sample.trackingCode,
      notes: sample.notes,
    });
    setMessage(`EDITANDO ${sample.sampleCode}.`);
    setError("");
  }

  async function handleDelete(sample: ClientSampleRecord) {
    if (!window.confirm(`EXCLUIR A AMOSTRA ${sample.sampleCode}?`)) return;
    setError("");
    setMessage("");
    try {
      await deleteClientSample(slug, sample.id);
      setSamples((current) => current.filter((item) => item.id !== sample.id));
      if (form.id === sample.id) setForm(emptyForm);
      setMessage(`${sample.sampleCode} EXCLUIDA.`);
    } catch (deleteError) {
      setError(messageFrom(deleteError));
    }
  }

  function startTransition(sample: ClientSampleRecord, action: SampleTransitionAction | "REPROGRAM") {
    setTransition({ sample, action });
    setTransitionDueDate("");
    setActualDate(localToday()); setReason(""); setError("");
  }

  async function confirmTransition() {
    if (!transition) return;
    const requiresNextDeadline = ["MARK_READY", "MARK_DELIVERED", "REPROGRAM"].includes(transition.action);
    if (requiresNextDeadline && !transitionDueDate) {
      setError("INFORME O PROXIMO PRAZO PARA CONTINUAR.");
      return;
    }
    if (transition.action === "REPROGRAM" && reason.trim().length < 3) { setError("INFORME O MOTIVO DA REPROGRAMACAO."); return; }
    if (transition.action !== "REPROGRAM" && !actualDate) { setError("INFORME A DATA REAL."); return; }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await transitionClientSample(slug, transition.sample, transition.action, transitionDueDate, transition.action === "REPROGRAM" ? "" : actualDate, reason);
      setSamples(await loadClientSamples(slug));
      setMessage(transition.action === "REPROGRAM" ? `${transition.sample.sampleCode} REPROGRAMADA. PRAZO ANTERIOR PRESERVADO NO HISTORICO.` : transitionMessage(transition.action, transition.sample.sampleCode));
      if (form.id === transition.sample.id) setForm(emptyForm);
      setTransition(null);
    } catch (transitionError) {
      setError(messageFrom(transitionError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="samples-shell">
      <header className="samples-header">
        <div>
          <span className="clients-eyebrow">CONTROLE DE AMOSTRAS</span>
          <h2>AMOSTRAS DE CLIENTES</h2>
          <p>CONTROLE PRODUCAO, ENTREGA AO CLIENTE E APROVACAO COM UM PRAZO PARA CADA ETAPA.</p>
        </div>
        <div className="samples-summary">
          <Summary label="ABERTAS" value={samples.filter((sample) => !sample.closedAt).length} />
          <Summary label="BAIXADAS" value={samples.filter((sample) => Boolean(sample.closedAt)).length} />
          <Summary label="COM PRAZO" value={samples.filter((sample) => !sample.closedAt && sample.controlDueDate).length} />
        </div>
      </header>

      {error && <div className="clients-feedback clients-feedback-error">{error}</div>}
      {message && <div className="clients-feedback clients-feedback-success">{message}</div>}

      <section className={`samples-form${form.id ? " is-editing" : ""}`}>
        {form.id ? <div className="samples-edit-state">EDITANDO {form.id ? `AMOSTRA SELECIONADA` : ""}</div> : null}
        <div className="samples-form-grid">
          <SampleSelect label="CLIENTE" value={form.clientId} onChange={selectClient} options={clients.map((client) => ({ value: client.id, label: `${client.tradeName || client.legalName} - ${formatCnpj(client.cnpj)}` }))} />
          <SampleSelect label="CONSULTOR DE VENDAS" value={form.responsibleProfileId} onChange={(value) => update("responsibleProfileId", value)} options={representatives.map((representative) => ({ value: representative.id, label: representative.name }))} />
          <SampleInput label="DATA DA SOLICITACAO" type="date" value={form.requestedAt} onChange={(value) => update("requestedAt", value)} />
          <SampleInput label="PRAZO PARA FICAR PRONTA" type="date" value={form.productionDueDate} onChange={(value) => update("productionDueDate", value)} disabled={Boolean(form.id)} />
          <SampleSelect label="ITEM CADASTRADO" value={form.productFichaId} onChange={selectProductFicha} options={clientFichas.map((ficha) => ({ value: ficha.id, label: productFichaLabel(ficha) }))} />
          <SampleInput label="QUANTIDADE" type="number" value={form.quantity} onChange={(value) => update("quantity", value)} />
          <label className="samples-field samples-span-2">
            <span>OBSERVACOES</span>
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>
        </div>
        {form.id ? <p className="samples-selected">PARA ALTERAR UMA DATA, USE <strong>REPROGRAMAR PRAZO</strong> NO CARD. O PRAZO ANTERIOR FICA NO HISTORICO.</p> : null}
        {selectedClient ? <p className="samples-selected">CLIENTE SELECIONADO: <strong>{selectedClient.clientCode} - {selectedClient.tradeName || selectedClient.legalName}</strong></p> : null}
        <div className="samples-actions">
          {form.id ? <button type="button" className="clients-button-secondary" onClick={() => setForm(emptyForm)}>CANCELAR EDICAO</button> : null}
          <button type="button" className="clients-button-primary" onClick={handleSave} disabled={saving || loading}>{saving ? "SALVANDO..." : form.id ? "SALVAR ALTERACOES" : "CADASTRAR AMOSTRA"}</button>
        </div>
      </section>

      <section className="samples-list">
        <div className="samples-list-header">
          <div>
            <span className="clients-eyebrow">CONTROLE DE PRAZOS</span>
            <h3>{sampleView === "OPEN" ? "AMOSTRAS EM ABERTO" : "AMOSTRAS BAIXADAS"}</h3>
          </div>
          <div className="samples-view-tabs" role="tablist" aria-label="VISAO DE AMOSTRAS">
            <button type="button" className={sampleView === "OPEN" ? "active" : ""} onClick={() => setSampleView("OPEN")}>ABERTAS ({samples.filter((sample) => !sample.closedAt).length})</button>
            <button type="button" className={sampleView === "CLOSED" ? "active" : ""} onClick={() => setSampleView("CLOSED")}>BAIXADAS ({samples.filter((sample) => Boolean(sample.closedAt)).length})</button>
          </div>
          <div className="samples-filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BUSCAR AMOSTRA" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SampleStatus | "ALL")}>
              <option value="ALL">TODOS OS STATUS</option>
              {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? <div className="clients-empty">CARREGANDO AMOSTRAS...</div> : null}
        {!loading && filteredSamples.length === 0 ? <div className="clients-empty">NENHUMA AMOSTRA ENCONTRADA.</div> : null}
        {!loading && filteredSamples.length > 0 ? (
          <div className="samples-grid">
            {filteredSamples.map((sample) => (
              <article key={sample.id} className="samples-card">
                <div className="samples-card-code">
                  <strong>{sample.sampleCode}</strong>
                  <span>{statusLabel(sample.status)}</span>
                  <small>SOLICITADA {displayDate(sample.requestedAt)}</small>
                </div>
                <div className="samples-card-product">
                  <h4>{sample.clientName}</h4>
                  <p>{sample.productDescription}</p>
                </div>
                <dl>
                  <div><dt>QTDE.</dt><dd>{sample.quantity}</dd></div>
                  <div><dt>{stageLabel(sample.controlStage)} · ORIGINAL</dt><dd>{displayDate(sample.controlDueDate)}</dd>{sample.controlCurrentDueDate && sample.controlCurrentDueDate !== sample.controlDueDate ? <small>PREVISAO ATUAL {displayDate(sample.controlCurrentDueDate)}</small> : null}</div>
                  <div><dt>CONCLUSAO</dt><dd>{displayDate(sample.closedAt)}</dd></div>
                  <div><dt>CONSULTOR</dt><dd>{sample.responsibleName || "-"}</dd></div>
                </dl>
                <div className="samples-card-actions">
                  {sampleActions(sample).map((action) => <button key={action.action} type="button" className={action.action === "REJECT" ? "danger" : ""} onClick={() => startTransition(sample, action.action)}>{action.label}</button>)}
                  {sampleActions(sample).length ? <button type="button" onClick={() => startTransition(sample, "REPROGRAM")}>REPROGRAMAR PRAZO</button> : null}
                  <button type="button" onClick={() => setHistorySample(sample)}>HISTORICO</button>
                  <button type="button" onClick={() => handleEdit(sample)}>EDITAR</button>
                  <button type="button" className="danger" onClick={() => handleDelete(sample)}>EXCLUIR</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      {transition ? <SampleDialog titleId="samples-transition-title" onClose={() => setTransition(null)} busy={saving}>
        <span className="clients-eyebrow">FLUXO DA AMOSTRA</span>
        <h3 id="samples-transition-title">{transition.action === "REPROGRAM" ? "REPROGRAMAR PRAZO" : transitionTitle(transition.action)}</h3>
        <p>{transition.sample.sampleCode} · {transition.sample.clientName}</p>
        <p className="samples-transition-confirm">{stageLabel(transition.sample.controlStage)} · PRAZO ORIGINAL: {displayDate(transition.sample.controlDueDate)} · PREVISAO ATUAL: {displayDate(transition.sample.controlCurrentDueDate ?? transition.sample.controlDueDate)}</p>
        {error ? <p className="clients-feedback clients-feedback-error" role="alert">{error}</p> : null}
        {transition.action === "REPROGRAM" ? <>
          <SampleInput label="NOVO PRAZO" type="date" value={transitionDueDate} onChange={setTransitionDueDate} min={localToday()} required />
          <label className="samples-field"><span>MOTIVO DA REPROGRAMACAO *</span><textarea value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={2000} /></label>
          <p className="samples-history-note">REPROGRAMAR NAO RETIRA O ATRASO NEM INTERROMPE A COBRANCA. O ALERTA CONTINUA PELO PRAZO ORIGINAL ATE CONCLUIR A ETAPA.</p>
        </> : <>
          <SampleInput label={transition.action === "MARK_READY" ? "DATA REAL EM QUE FICOU PRONTA" : transition.action === "MARK_DELIVERED" ? "DATA REAL DA ENTREGA" : "DATA REAL DA DECISAO"} type="date" value={actualDate} onChange={setActualDate} min={transition.action === "MARK_READY" ? transition.sample.requestedAt : transition.action === "MARK_DELIVERED" ? transition.sample.readyAt || transition.sample.requestedAt : transition.sample.deliveredAt || transition.sample.requestedAt} max={localToday()} required />
          {["MARK_READY", "MARK_DELIVERED"].includes(transition.action) ? <SampleInput label={transition.action === "MARK_READY" ? "DATA PREVISTA PARA ENTREGAR AO CLIENTE" : "DATA LIMITE PARA APROVACAO DO CLIENTE"} type="date" value={transitionDueDate} onChange={setTransitionDueDate} min={actualDate} required /> : null}
        </>}
        <div className="samples-actions"><button type="button" className="clients-button-secondary" onClick={() => setTransition(null)} disabled={saving}>CANCELAR</button><button type="button" className="clients-button-primary" onClick={() => void confirmTransition()} disabled={saving}>{saving ? "SALVANDO..." : "CONFIRMAR"}</button></div>
      </SampleDialog> : null}
      {historySample ? <SampleDialog titleId="samples-history-title" onClose={() => setHistorySample(null)}>
        <span className="clients-eyebrow">PRAZOS E REALIZACOES</span><h3 id="samples-history-title">HISTORICO DA AMOSTRA</h3><p>{historySample.sampleCode} · {historySample.clientName}</p>
        {historySample.deadlineBaselineAt ? <p className="samples-history-note">AMOSTRA ANTERIOR AO HISTORICO: AS DATAS INICIAIS SAO OS PRAZOS CONHECIDOS NA IMPLANTACAO. ADIAMENTOS ANTIGOS NAO FORAM RECONSTRUIDOS.</p> : null}
        <div className="samples-history-table-wrap"><table className="samples-history-table"><thead><tr><th>ETAPA</th><th>ORIGINAL / CONHECIDO</th><th>ATUAL</th><th>REALIZADO</th></tr></thead><tbody>
          <DeadlineRow label="PRODUCAO" original={historySample.originalProductionDueDate} current={historySample.productionDueDate} actual={historySample.readyAt} />
          <DeadlineRow label="ENTREGA" original={historySample.originalCustomerDeliveryDate} current={historySample.customerDeliveryDate} actual={historySample.deliveredAt} />
          <DeadlineRow label="APROVACAO" original={historySample.originalApprovalDueDate} current={historySample.approvalDueDate} actual={historySample.approvedAt || (["REJECTED"].includes(historySample.status) ? historySample.closedAt : "")} />
        </tbody></table></div>
        {historyLoading ? <p role="status">CARREGANDO HISTORICO...</p> : historyError ? <p role="alert" className="clients-feedback clients-feedback-error">{historyError}</p> : <ol className="samples-history-events">{history.map(event => <li key={event.id}>
          <strong>{stageLabel(event.stage)} · {event.action === "BASELINE" ? "PRAZO CONHECIDO" : event.action === "REPROGRAM" ? "REPROGRAMACAO" : transitionTitle(event.action)}</strong>
          <span>{event.action === "REPROGRAM" ? `${displayDate(event.oldDueDate)} → ${displayDate(event.newDueDate)}` : event.actualDate ? `REALIZADO EM ${displayDate(event.actualDate)} · PREVISTO ${displayDate(event.oldDueDate)}` : `PREVISTO ${displayDate(event.newDueDate)}`}</span>
          {event.reason ? <p>{event.reason}</p> : null}<small>{event.changedByName} · {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(event.createdAt))}</small>
        </li>)}</ol>}
        <div className="samples-actions"><button type="button" className="clients-button-secondary" onClick={() => setHistorySample(null)}>FECHAR</button></div>
      </SampleDialog> : null}
    </section>
  );
}

function SampleInput({ label, value, onChange, type = "text", wide = false, disabled, min, max, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean; disabled?: boolean; min?: string; max?: string; required?: boolean }) {
  return <label className={wide ? "samples-field samples-span-2" : "samples-field"}><span>{label}</span><input type={type} value={value} disabled={disabled} min={min} max={max} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SampleDialog({ titleId, onClose, busy = false, children }: { titleId: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const trigger = document.activeElement as HTMLElement | null; dialog?.showModal(); return () => { dialog?.close(); queueMicrotask(() => { if (trigger?.isConnected) trigger.focus(); }); }; }, []);
  return <dialog ref={ref} className="samples-transition-dialog samples-modal" aria-labelledby={titleId} aria-busy={busy} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}

function DeadlineRow({ label, original = "", current, actual }: { label: string; original?: string; current: string; actual: string }) {
  const lag = (due: string) => due && actual ? Math.round((Date.parse(actual) - Date.parse(due)) / 86400000) : null;
  const note = (days: number | null) => days === null ? "" : days > 0 ? `${days} DIA(S) DE ATRASO` : "NO PRAZO";
  return <tr><th scope="row">{label}</th><td>{displayDate(original)}{actual && original ? <small>{note(lag(original))}</small> : null}</td><td>{displayDate(current)}{actual && current ? <small>{note(lag(current))}</small> : null}</td><td>{displayDate(actual)}</td></tr>;
}

function SampleSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="samples-field"><span>{label}</span><SearchableSelect value={value} onChange={onChange} options={options} ariaLabel={label} /></label>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function upper(value: string) {
  return (value || "").toLocaleUpperCase("pt-BR");
}

function formatCnpj(value: string) {
  return value.replace(/\D/g, "").slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function displayDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function statusLabel(status: SampleStatus) {
  return statusOptions.find((item) => item.value === status)?.label || status;
}

function stageLabel(stage: ClientSampleRecord["controlStage"]) {
  return stage === "PRODUCAO" ? "FICAR PRONTA" : stage === "ENTREGA" ? "ENTREGAR CLIENTE" : stage === "APROVACAO" ? "APROVACAO" : "ENCERRADA";
}

function sampleActions(sample: ClientSampleRecord): Array<{ action: SampleTransitionAction; label: string }> {
  if (["REQUESTED", "IN_PRODUCTION"].includes(sample.status)) return [{ action: "MARK_READY", label: "MARCAR PRONTA" }];
  if (sample.status === "READY") return [{ action: "MARK_DELIVERED", label: "MARCAR ENTREGUE" }];
  if (sample.status === "SENT") return [{ action: "APPROVE", label: "APROVAR" }, { action: "REJECT", label: "REPROVAR" }];
  return [];
}

function transitionTitle(action: SampleTransitionAction) {
  if (action === "MARK_READY") return "AMOSTRA PRONTA";
  if (action === "MARK_DELIVERED") return "AMOSTRA ENTREGUE";
  return action === "APPROVE" ? "APROVAR AMOSTRA" : "REPROVAR AMOSTRA";
}

function transitionMessage(action: SampleTransitionAction, sampleCode: string) {
  if (action === "MARK_READY") return `${sampleCode} MARCADA COMO PRONTA. O PRAZO DE ENTREGA AO CLIENTE ESTA ATIVO.`;
  if (action === "MARK_DELIVERED") return `${sampleCode} MARCADA COMO ENTREGUE. O PRAZO DE APROVACAO ESTA ATIVO.`;
  return `${sampleCode} ${action === "APPROVE" ? "APROVADA" : "REPROVADA"} E ENCERRADA.`;
}

function productFichaLabel(ficha: ProductFicha) {
  return [ficha.ftNumber, ficha.reference].filter(Boolean).join(" - ") || "ITEM SEM REFERENCIA";
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "NAO FOI POSSIVEL CONCLUIR A OPERACAO.";
}

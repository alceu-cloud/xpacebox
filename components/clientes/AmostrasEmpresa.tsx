"use client";

import { useEffect, useMemo, useState } from "react";

import { deleteClientSample, loadClientSamples, saveClientSample, transitionClientSample } from "@/lib/amostras";
import type { SampleTransitionAction } from "@/lib/amostras";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { ClientSampleFormData, ClientSampleRecord, SampleStatus } from "@/types/amostras";
import type { ClientRecord, RepresentativeOption } from "@/types/clientes";
import type { ProductFicha } from "@/types/gerenciador";

const today = new Date().toISOString().slice(0, 10);

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
  const [transition, setTransition] = useState<{ sample: ClientSampleRecord; action: SampleTransitionAction } | null>(null);
  const [transitionDueDate, setTransitionDueDate] = useState("");

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

  function startTransition(sample: ClientSampleRecord, action: SampleTransitionAction) {
    setTransition({ sample, action });
    setTransitionDueDate("");
  }

  async function confirmTransition() {
    if (!transition) return;
    const requiresNextDeadline = ["MARK_READY", "MARK_DELIVERED"].includes(transition.action);
    if (requiresNextDeadline && !transitionDueDate) {
      setError("INFORME O PROXIMO PRAZO PARA CONTINUAR.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await transitionClientSample(slug, transition.sample.id, transition.action, transitionDueDate);
      setSamples(await loadClientSamples(slug));
      setMessage(transitionMessage(transition.action, transition.sample.sampleCode));
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
          <SampleInput label="PRAZO PARA FICAR PRONTA" type="date" value={form.productionDueDate} onChange={(value) => update("productionDueDate", value)} />
          <SampleSelect label="ITEM CADASTRADO" value={form.productFichaId} onChange={selectProductFicha} options={clientFichas.map((ficha) => ({ value: ficha.id, label: productFichaLabel(ficha) }))} />
          <SampleInput label="QUANTIDADE" type="number" value={form.quantity} onChange={(value) => update("quantity", value)} />
          <label className="samples-field samples-span-2">
            <span>OBSERVACOES</span>
            <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
          </label>
        </div>
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
                  <div><dt>{stageLabel(sample.controlStage)}</dt><dd>{displayDate(sample.controlDueDate)}</dd></div>
                  <div><dt>CONCLUSAO</dt><dd>{displayDate(sample.closedAt)}</dd></div>
                  <div><dt>CONSULTOR</dt><dd>{sample.responsibleName || "-"}</dd></div>
                </dl>
                <div className="samples-card-actions">
                  {sampleActions(sample).map((action) => <button key={action.action} type="button" className={action.action === "REJECT" ? "danger" : ""} onClick={() => startTransition(sample, action.action)}>{action.label}</button>)}
                  <button type="button" onClick={() => handleEdit(sample)}>EDITAR</button>
                  <button type="button" className="danger" onClick={() => handleDelete(sample)}>EXCLUIR</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      {transition ? <div className="samples-transition-backdrop" role="presentation"><section className="samples-transition-dialog" role="dialog" aria-modal="true" aria-labelledby="samples-transition-title"><span className="clients-eyebrow">FLUXO DA AMOSTRA</span><h3 id="samples-transition-title">{transitionTitle(transition.action)}</h3><p>{transition.sample.sampleCode} · {transition.sample.clientName}</p>{["MARK_READY", "MARK_DELIVERED"].includes(transition.action) ? <SampleInput label={transition.action === "MARK_READY" ? "DATA PREVISTA PARA ENTREGAR AO CLIENTE" : "DATA LIMITE PARA APROVACAO DO CLIENTE"} type="date" value={transitionDueDate} onChange={setTransitionDueDate} /> : <p className="samples-transition-confirm">CONFIRME A DECISAO PARA ENCERRAR ESTA ETAPA.</p>}<div className="samples-actions"><button type="button" className="clients-button-secondary" onClick={() => setTransition(null)} disabled={saving}>CANCELAR</button><button type="button" className="clients-button-primary" onClick={() => void confirmTransition()} disabled={saving}>{saving ? "SALVANDO..." : "CONFIRMAR"}</button></div></section></div> : null}
    </section>
  );
}

function SampleInput({ label, value, onChange, type = "text", wide = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean }) {
  return <label className={wide ? "samples-field samples-span-2" : "samples-field"}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
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

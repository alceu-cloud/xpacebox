"use client";

import { useEffect, useMemo, useState } from "react";

import { deleteClientSample, loadClientSamples, saveClientSample } from "@/lib/amostras";
import type { ClientSampleFormData, ClientSampleRecord, SampleStatus } from "@/types/amostras";
import type { ClientRecord, RepresentativeOption } from "@/types/clientes";

const today = new Date().toISOString().slice(0, 10);

const emptyForm: ClientSampleFormData = {
  clientId: "",
  responsibleProfileId: "",
  requestedAt: today,
  deliveryDate: "",
  closedAt: "",
  status: "REQUESTED",
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
  { value: "SENT", label: "ENVIADA" },
  { value: "APPROVED", label: "APROVADA" },
  { value: "REJECTED", label: "REPROVADA" },
  { value: "CANCELLED", label: "CANCELADA" },
];

export default function AmostrasEmpresa({
  slug,
  clients,
  representatives,
}: {
  slug: string;
  clients: ClientRecord[];
  representatives: RepresentativeOption[];
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
      responsibleProfileId: client?.representativeUserId || current.responsibleProfileId || representatives[0]?.id || "",
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveClientSample(slug, form);
      setSamples((current) => current.some((sample) => sample.id === saved.id)
        ? current.map((sample) => sample.id === saved.id ? saved : sample)
        : [saved, ...current]);
      setForm(emptyForm);
      setMessage(`${saved.sampleCode} SALVA COM SUCESSO.`);
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
      closedAt: sample.closedAt,
      status: sample.status,
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

  return (
    <section className="samples-shell">
      <header className="samples-header">
        <div>
          <span className="clients-eyebrow">CONTROLE DE AMOSTRAS</span>
          <h2>AMOSTRAS DE CLIENTES</h2>
          <p>CADASTRE SOLICITACOES, ACOMPANHE PRAZOS E MANTENHA O HISTORICO POR CLIENTE.</p>
        </div>
        <div className="samples-summary">
          <Summary label="ABERTAS" value={samples.filter((sample) => !sample.closedAt).length} />
          <Summary label="BAIXADAS" value={samples.filter((sample) => Boolean(sample.closedAt)).length} />
          <Summary label="COM PRAZO" value={samples.filter((sample) => !sample.closedAt && sample.deliveryDate).length} />
        </div>
      </header>

      {error && <div className="clients-feedback clients-feedback-error">{error}</div>}
      {message && <div className="clients-feedback clients-feedback-success">{message}</div>}

      <section className="samples-form">
        <div className="samples-form-grid">
          <SampleSelect label="CLIENTE" value={form.clientId} onChange={selectClient} options={clients.map((client) => ({ value: client.id, label: `${client.tradeName || client.legalName} - ${formatCnpj(client.cnpj)}` }))} />
          <SampleSelect label="RESPONSAVEL" value={form.responsibleProfileId} onChange={(value) => update("responsibleProfileId", value)} options={representatives.map((representative) => ({ value: representative.id, label: representative.name }))} />
          <SampleInput label="DATA DA SOLICITACAO" type="date" value={form.requestedAt} onChange={(value) => update("requestedAt", value)} />
          <SampleInput label="ENTREGA PREVISTA" type="date" value={form.deliveryDate} onChange={(value) => update("deliveryDate", value)} />
          <SampleInput label="DATA DA BAIXA" type="date" value={form.closedAt} onChange={(value) => update("closedAt", value)} />
          <SampleSelect label="STATUS" value={form.status} onChange={(value) => update("status", value)} options={statusOptions} />
          <SampleInput label="DESCRICAO DA AMOSTRA" value={form.productDescription} onChange={(value) => update("productDescription", value)} wide />
          <SampleInput label="MEDIDAS / MODELO" value={form.dimensions} onChange={(value) => update("dimensions", value)} />
          <SampleInput label="QUANTIDADE" type="number" value={form.quantity} onChange={(value) => update("quantity", value)} />
          <SampleInput label="ENVIO / TRANSPORTE" value={form.shippingMethod} onChange={(value) => update("shippingMethod", value)} />
          <SampleInput label="RASTREIO" value={form.trackingCode} onChange={(value) => update("trackingCode", value)} />
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
                <header>
                  <div><strong>{sample.sampleCode}</strong><span>{statusLabel(sample.status)}</span></div>
                  <small>{displayDate(sample.requestedAt)}</small>
                </header>
                <h4>{sample.clientName}</h4>
                <p>{sample.productDescription}</p>
                <dl>
                  <div><dt>MEDIDAS</dt><dd>{sample.dimensions || "-"}</dd></div>
                  <div><dt>QTDE.</dt><dd>{sample.quantity}</dd></div>
                  <div><dt>ENTREGA</dt><dd>{displayDate(sample.deliveryDate)}</dd></div>
                  <div><dt>BAIXA</dt><dd>{displayDate(sample.closedAt)}</dd></div>
                  <div><dt>RESP.</dt><dd>{sample.responsibleName || "-"}</dd></div>
                </dl>
                <div className="samples-card-actions">
                  <button type="button" onClick={() => handleEdit(sample)}>EDITAR</button>
                  <button type="button" className="danger" onClick={() => handleDelete(sample)}>EXCLUIR</button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function SampleInput({ label, value, onChange, type = "text", wide = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean }) {
  return <label className={wide ? "samples-field samples-span-2" : "samples-field"}><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SampleSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="samples-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">SELECIONE</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "NAO FOI POSSIVEL CONCLUIR A OPERACAO.";
}

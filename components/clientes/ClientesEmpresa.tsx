"use client";

import { useEffect, useMemo, useState } from "react";

import {
  deactivateClient,
  loadClientOptions,
  loadClients,
  lookupCnpj,
  saveClient as persistClient,
} from "@/lib/clientes";
import type {
  ClientFormData,
  ClientRecord,
  RepresentativeOption,
  SellerCompanyOption,
} from "@/types/clientes";

const emptyForm: ClientFormData = {
  legalName: "",
  tradeName: "",
  buyerName: "",
  whatsapp: "",
  cnpj: "",
  stateRegistration: "",
  phone: "",
  purchaseEmail: "",
  invoiceEmail: "",
  street: "",
  streetNumber: "",
  complement: "",
  postalCode: "",
  district: "",
  city: "",
  state: "",
  sellerCompanyId: "",
  representativeUserId: "",
  paymentTerms: "",
  cfop: "",
  freightTerms: "",
};

export default function ClientesEmpresa({ slug }: { slug: string }) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [sellerCompanies, setSellerCompanies] = useState<SellerCompanyOption[]>([]);
  const [representatives, setRepresentatives] = useState<RepresentativeOption[]>([]);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [options, records] = await Promise.all([loadClientOptions(slug), loadClients(slug)]);
        if (!active) return;
        setSellerCompanies(options.sellerCompanies);
        setRepresentatives(options.representatives);
        setClients(records);
        setForm((current) => ({
          ...current,
          sellerCompanyId: current.sellerCompanyId || options.sellerCompanies[0]?.id || "",
        }));
      } catch (loadError) {
        if (active) setError(messageFrom(loadError));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [slug]);

  const filteredClients = useMemo(() => {
    const term = search.trim().toLocaleUpperCase("pt-BR");
    if (!term) return clients;
    return clients.filter((client) =>
      `${client.clientCode} ${client.legalName} ${client.tradeName} ${client.cnpj}`
        .toLocaleUpperCase("pt-BR")
        .includes(term)
    );
  }, [clients, search]);

  async function handleLookup() {
    if (digits(form.cnpj).length !== 14) {
      setError("INFORME UM CNPJ COMPLETO PARA BUSCAR OS DADOS PUBLICOS.");
      return;
    }

    setLookingUp(true);
    setError("");
    setMessage("");
    try {
      const company = await lookupCnpj(form.cnpj);
      setForm((current) => ({
        ...current,
        cnpj: formatCnpj(company.cnpj),
        legalName: company.legalName || current.legalName,
        tradeName: company.tradeName || current.tradeName,
        stateRegistration: company.stateRegistration || current.stateRegistration,
        phone: company.phone || current.phone,
        purchaseEmail: company.email || current.purchaseEmail,
        invoiceEmail: company.email || current.invoiceEmail,
        street: company.street || current.street,
        streetNumber: company.streetNumber || current.streetNumber,
        complement: company.complement || current.complement,
        postalCode: formatCep(company.postalCode) || current.postalCode,
        district: company.district || current.district,
        city: company.city || current.city,
        state: company.state || current.state,
      }));
      setMessage(`DADOS PUBLICOS ENCONTRADOS. SITUACAO CADASTRAL: ${company.status || "CONSULTADA"}.`);
    } catch (lookupError) {
      setError(messageFrom(lookupError));
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await persistClient(slug, form);
      setClients((current) => {
        const exists = current.some((client) => client.id === saved.id);
        const next = exists ? current.map((client) => (client.id === saved.id ? saved : client)) : [...current, saved];
        return next.sort((a, b) => a.legalName.localeCompare(b.legalName, "pt-BR"));
      });
      setMessage(`${saved.clientCode} SALVO COM SUCESSO.`);
      setForm({ ...emptyForm, sellerCompanyId: sellerCompanies[0]?.id || "" });
    } catch (saveError) {
      setError(messageFrom(saveError));
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(client: ClientRecord) {
    setForm({
      id: client.id,
      legalName: client.legalName,
      tradeName: client.tradeName,
      buyerName: client.buyerName,
      whatsapp: client.whatsapp,
      cnpj: formatCnpj(client.cnpj),
      stateRegistration: client.stateRegistration,
      phone: client.phone,
      purchaseEmail: client.purchaseEmail,
      invoiceEmail: client.invoiceEmail,
      street: client.street,
      streetNumber: client.streetNumber,
      complement: client.complement,
      postalCode: formatCep(client.postalCode),
      district: client.district,
      city: client.city,
      state: client.state,
      sellerCompanyId: client.sellerCompanyId,
      representativeUserId: client.representativeUserId,
      paymentTerms: client.paymentTerms,
      cfop: client.cfop,
      freightTerms: client.freightTerms,
    });
    setMessage(`EDITANDO ${client.clientCode}.`);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeactivate(client: ClientRecord) {
    if (!window.confirm(`DESATIVAR O CLIENTE ${client.legalName}?`)) return;
    setError("");
    try {
      await deactivateClient(slug, client.id);
      setClients((current) => current.filter((item) => item.id !== client.id));
      setMessage(`${client.clientCode} DESATIVADO.`);
      if (form.id === client.id) setForm({ ...emptyForm, sellerCompanyId: sellerCompanies[0]?.id || "" });
    } catch (deleteError) {
      setError(messageFrom(deleteError));
    }
  }

  return (
    <section className="clients-module">
      <nav className="clients-tabs" aria-label="ETAPAS DO MODULO CLIENTES">
        <button type="button" className="clients-tab clients-tab-active">CADASTRO</button>
      </nav>

      <div className="clients-cnpj-band">
        <div>
          <span className="clients-eyebrow">IDENTIFICACAO FISCAL</span>
          <h2>CONSULTAR E CADASTRAR CLIENTE</h2>
          <p>INFORME O CNPJ PARA PREENCHER AUTOMATICAMENTE OS DADOS PUBLICOS DISPONIVEIS.</p>
        </div>
        <label className="clients-cnpj-field">
          <span>CNPJ</span>
          <div>
            <input
              value={form.cnpj}
              onChange={(event) => setForm({ ...form, cnpj: formatCnpj(event.target.value) })}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
            <button type="button" onClick={handleLookup} disabled={lookingUp}>
              {lookingUp ? "CONSULTANDO..." : "BUSCAR DADOS"}
            </button>
          </div>
        </label>
      </div>

      {error && <div className="clients-feedback clients-feedback-error">{error}</div>}
      {message && <div className="clients-feedback clients-feedback-success">{message}</div>}

      <div className="clients-form">
        <FormSection title="IDENTIFICACAO DO CLIENTE">
          <div className="clients-grid clients-grid-3">
            <ReadOnlyField label="CODIGO UNICO" value={form.id ? clients.find((item) => item.id === form.id)?.clientCode || "" : "GERADO AO SALVAR"} />
            <Field label="NOME / RAZAO SOCIAL" value={form.legalName} onChange={(legalName) => setForm({ ...form, legalName })} wide />
            <Field label="NOME FANTASIA" value={form.tradeName} onChange={(tradeName) => setForm({ ...form, tradeName })} />
            <SelectField label="EMPRESA ATENDENTE" value={form.sellerCompanyId} onChange={(sellerCompanyId) => setForm({ ...form, sellerCompanyId })} options={sellerCompanies.map((item) => ({ value: item.id, label: item.name }))} />
            <Field label="INSCRICAO ESTADUAL" value={form.stateRegistration} onChange={(stateRegistration) => setForm({ ...form, stateRegistration })} />
          </div>
        </FormSection>

        <FormSection title="CONTATOS E COMPRAS">
          <div className="clients-grid clients-grid-3">
            <Field label="NOME DO COMPRADOR" value={form.buyerName} onChange={(buyerName) => setForm({ ...form, buyerName })} />
            <Field label="WHATSAPP" value={form.whatsapp} onChange={(whatsapp) => setForm({ ...form, whatsapp })} />
            <Field label="FONE" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            <Field label="E-MAIL DE COMPRAS" type="email" value={form.purchaseEmail} onChange={(purchaseEmail) => setForm({ ...form, purchaseEmail })} />
            <Field label="E-MAIL PARA NOTA FISCAL" type="email" value={form.invoiceEmail} onChange={(invoiceEmail) => setForm({ ...form, invoiceEmail })} />
            <SelectField
              label="REPRESENTANTE"
              value={form.representativeUserId}
              onChange={(representativeUserId) => setForm({ ...form, representativeUserId })}
              placeholder="SELECIONE O REPRESENTANTE"
              options={representatives.map((item) => ({ value: item.id, label: item.name }))}
            />
          </div>
        </FormSection>

        <FormSection title="ENDERECO">
          <div className="clients-grid clients-address-grid">
            <Field label="CEP" value={form.postalCode} onChange={(postalCode) => setForm({ ...form, postalCode: formatCep(postalCode) })} />
            <Field label="ENDERECO" value={form.street} onChange={(street) => setForm({ ...form, street })} wide />
            <Field label="NUMERO" value={form.streetNumber} onChange={(streetNumber) => setForm({ ...form, streetNumber })} />
            <Field label="COMPLEMENTO" value={form.complement} onChange={(complement) => setForm({ ...form, complement })} />
            <Field label="BAIRRO" value={form.district} onChange={(district) => setForm({ ...form, district })} />
            <Field label="CIDADE" value={form.city} onChange={(city) => setForm({ ...form, city })} />
            <Field label="UF" value={form.state} onChange={(state) => setForm({ ...form, state: state.slice(0, 2).toUpperCase() })} />
          </div>
        </FormSection>

        <FormSection title="CONDICOES COMERCIAIS E FISCAIS">
          <div className="clients-grid clients-grid-3">
            <Field label="CONDICAO DE PAGAMENTO" value={form.paymentTerms} onChange={(paymentTerms) => setForm({ ...form, paymentTerms })} />
            <Field label="CFOP" value={form.cfop} onChange={(cfop) => setForm({ ...form, cfop })} />
            <SelectField
              label="FRETE"
              value={form.freightTerms}
              onChange={(freightTerms) => setForm({ ...form, freightTerms })}
              placeholder="SELECIONE A MODALIDADE"
              options={[
                { value: "FOB", label: "FOB - RETIRADA / DESTINATARIO" },
                { value: "CIF", label: "CIF - REMETENTE" },
                { value: "SEM_FRETE", label: "SEM FRETE" },
              ]}
            />
          </div>
        </FormSection>

        <div className="clients-actions">
          {form.id && (
            <button type="button" className="clients-button-secondary" onClick={() => setForm({ ...emptyForm, sellerCompanyId: sellerCompanies[0]?.id || "" })}>
              CANCELAR EDICAO
            </button>
          )}
          <button type="button" className="clients-button-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? "SALVANDO..." : form.id ? "SALVAR ALTERACOES" : "CADASTRAR CLIENTE"}
          </button>
        </div>
      </div>

      <section className="clients-list-section">
        <div className="clients-list-header">
          <div>
            <span className="clients-eyebrow">CARTEIRA COMPARTILHADA</span>
            <h2>CLIENTES CADASTRADOS</h2>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BUSCAR CLIENTE" />
        </div>

        {loading ? (
          <div className="clients-empty">CARREGANDO CLIENTES...</div>
        ) : filteredClients.length === 0 ? (
          <div className="clients-empty">NENHUM CLIENTE CADASTRADO NESTA EMPRESA.</div>
        ) : (
          <div className="clients-table-wrap">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>CODIGO</th>
                  <th>CLIENTE</th>
                  <th>CNPJ</th>
                  <th>EMPRESA</th>
                  <th>REPRESENTANTE</th>
                  <th>ACOES</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.clientCode}</td>
                    <td><strong>{client.tradeName || client.legalName}</strong><small>{client.legalName}</small></td>
                    <td>{formatCnpj(client.cnpj)}</td>
                    <td>{client.sellerCompanyName || "-"}</td>
                    <td>{client.representativeName || "NAO DEFINIDO"}</td>
                    <td>
                      <div className="clients-row-actions">
                        <button type="button" onClick={() => handleEdit(client)}>EDITAR</button>
                        <button type="button" className="danger" onClick={() => handleDeactivate(client)}>DESATIVAR</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="clients-form-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", wide = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean }) {
  return (
    <label className={wide ? "clients-field clients-field-wide" : "clients-field"}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="clients-field clients-field-readonly">
      <span>{label}</span>
      <input value={value} readOnly />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "SELECIONE" }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return (
    <label className="clients-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string) {
  const clean = digits(value).slice(0, 14);
  return clean
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatCep(value: string) {
  return digits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "OCORREU UM ERRO INESPERADO.";
}

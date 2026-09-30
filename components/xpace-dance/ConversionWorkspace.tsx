"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  ConversionOverview,
  FollowUp,
  SurveyResponse,
} from "@/lib/xpace/conversion-metrics";

type Payload = {
  success: true;
  overview: ConversionOverview;
  today: string;
  attendants: Array<{ id: string; full_name: string }>;
};
type Editor =
  | { kind: "followup"; item: ConversionOverview["queue"][number] }
  | { kind: "survey"; item: ConversionOverview["surveys"][number] };
const fmt = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);
const day = (v: string) =>
  v ? v.split("-").reverse().join("/") : "Não definida";
const responseLabel = {
  POSITIVA: "Positiva",
  NEUTRA: "Neutra",
  NEGATIVA: "Negativa",
  SEM_RESPOSTA: "Sem resposta",
};
function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="xdd-panel xpr-panel">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
function Table({
  labels,
  children,
}: {
  labels: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      className="xpr-table-scroll"
      tabIndex={0}
      aria-label="Tabela de acompanhamento, rolável horizontalmente"
    >
      <table className="xpr-table">
        <thead>
          <tr>
            {labels.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  tone = "violet",
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className={`xdd-metric xdd-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
async function request(query: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`/api/xpace/conversion${query}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success)
    throw new Error(
      data?.message ?? "Não foi possível carregar ou salvar o acompanhamento.",
    );
  return data;
}
export default function ConversionWorkspace({
  from,
  to,
  onOpenLead,
}: {
  from: string;
  to: string;
  onOpenLead: (id: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [view, setView] = useState("TODOS"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [surveyPage, setSurveyPage] = useState(1),
    [negativeOnly, setNegativeOnly] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState("");
  const [followUp, setFollowUp] = useState<FollowUp>({
    action: "",
    dueOn: "",
    responsibleId: "",
    status: "PENDENTE",
    result: "",
  });
  const [survey, setSurvey] = useState<SurveyResponse>({
    response: "SEM_RESPOSTA",
    note: "",
    reviewed: false,
  });
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null),
    controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoading(true);
    setError("");
    try {
      const payload = await request(`?${new URLSearchParams({ from, to })}`, {
        signal: next.signal,
      });
      if (!next.signal.aborted) setData(payload);
    } catch (cause) {
      if (!next.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "Falha no acompanhamento.",
        );
    } finally {
      if (!next.signal.aborted) setLoading(false);
    }
  }, [from, to]);
  useEffect(() => {
    setData(null);
    setPage(1);
    setSurveyPage(1);
    void load();
    return () => controller.current?.abort();
  }, [load]);
  useEffect(() => {
    if (editor) dialog.current?.showModal();
    else {
      dialog.current?.close();
      trigger.current?.focus();
    }
  }, [editor]);
  function openEditor(next: Editor) {
    trigger.current = document.activeElement as HTMLElement;
    setSaveError("");
    setNotice("");
    if (next.kind === "followup")
      setFollowUp(
        next.item.followUp ?? {
          action: "Conversar sobre a experiência e apresentar o plano",
          dueOn: data!.today,
          responsibleId:
            next.item.assignedTo &&
            data!.attendants.some((a) => a.id === next.item.assignedTo)
              ? next.item.assignedTo
              : "",
          status: "PENDENTE",
          result: "",
        },
      );
    else
      setSurvey(
        next.item.response ?? {
          response: "SEM_RESPOSTA",
          note: "",
          reviewed: false,
        },
      );
    setEditor(next);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const body =
        editor.kind === "followup"
          ? {
              action: "SAVE_FOLLOWUP",
              leadId: editor.item.leadId,
              nextAction: followUp.action,
              dueOn: followUp.dueOn,
              responsibleId: followUp.responsibleId,
              status: followUp.status,
              result: followUp.result,
            }
          : {
              action: "SAVE_SURVEY",
              leadId: editor.item.trial.lead_id,
              appointmentId: editor.item.trial.id,
              ...survey,
            };
      await request("", { method: "POST", body: JSON.stringify(body) });
      setEditor(null);
      setNotice(
        "Registro salvo no histórico do lead. Nenhuma mensagem foi enviada.",
      );
      await load();
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }
  const overview = data?.overview;
  const queue =
    overview?.queue.filter(
      (item) =>
        (!query ||
          item.name
            .toLocaleLowerCase("pt-BR")
            .includes(query.toLocaleLowerCase("pt-BR"))) &&
        (view === "TODOS" ||
          (view === "ATRASADOS" && item.overdue) ||
          (view === "SEM_ACAO" && item.needsAction)),
    ) ?? [];
  const surveys =
    overview?.surveys.filter(
      (item) =>
        !negativeOnly ||
        (item.response?.response === "NEGATIVA" && !item.response.reviewed),
    ) ?? [];
  const pages = Math.max(1, Math.ceil(queue.length / 20)),
    surveyPages = Math.max(1, Math.ceil(surveys.length / 20));
  const currentPage = Math.min(page, pages),
    currentSurveyPage = Math.min(surveyPage, surveyPages);
  return (
    <div className="xcv-workspace">
      <div className="xcv-toolbar">
        <p className="xpr-explanation">
          Ação comercial sem disparos automáticos. A presença, a matrícula e a
          etapa do CRM continuam sendo registros distintos.
        </p>
        <button
          type="button"
          className="xdd-refresh"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} aria-hidden="true" /> Atualizar acompanhamento
        </button>
      </div>
      {notice ? (
        <p className="xpr-context" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="xdd-alert" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      ) : null}
      {loading ? <p role="status">Carregando acompanhamento...</p> : null}
      {!loading && !error && overview && data ? (
        <>
          <Panel
            title="Conversão por pessoa"
            note={`Pessoas com experimental no período; duas modalidades não duplicam o total. Matrícula considera todo o histórico disponível. ${overview.funnel.existingClients} cliente(s) já vinculado(s) ficam separados da aquisição de novos alunos.`}
          >
            <div className="xdd-metrics xdd-metrics--four">
              <Metric
                label="AGENDARAM"
                value={fmt(overview.funnel.scheduled)}
                note="Pessoas únicas, sem cancelados"
              />
              <Metric
                label="COMPARECERAM"
                value={fmt(overview.funnel.attended)}
                note={`${fmt(overview.funnel.attendanceRate)}% de quem agendou`}
                tone="green"
              />
              <Metric
                label="PRESENTES QUE MATRICULARAM"
                value={fmt(overview.funnel.attendedEnrolled)}
                note={`${fmt(overview.funnel.attendedConversionRate)}% de todos os presentes; pendências permanecem na base`}
                tone="green"
              />
              <Metric
                label="CONVERSÃO GERAL"
                value={`${fmt(overview.funnel.generalConversionRate)}%`}
                note={`${overview.funnel.enrolled} matrículas de ${overview.funnel.scheduled} pessoas que agendaram`}
              />
            </div>
            <div className="xcv-funnel" aria-label="Etapas de conversão">
              {[
                {
                  label: "Agendou → compareceu",
                  count: overview.funnel.attended,
                  total: overview.funnel.scheduled,
                  value: overview.funnel.attendanceRate,
                },
                {
                  label: "Compareceu → matriculou",
                  count: overview.funnel.attendedEnrolled,
                  total: overview.funnel.attended,
                  value: overview.funnel.attendedConversionRate,
                },
              ].map((step) => (
                <div key={step.label}>
                  <strong>{step.label}</strong>
                  <span>
                    {step.count} de {step.total} · {fmt(step.value)}%
                  </span>
                  <progress
                    max={100}
                    value={step.value ?? 0}
                    aria-label={step.label}
                  />
                </div>
              ))}
            </div>
            <p className="xpr-explanation">
              Matrícula marcada: {overview.funnel.enrolled} · Lead ganho:{" "}
              {overview.funnel.won} · Divergências para conferir:{" "}
              {overview.funnel.mismatches}. Não igualamos esses campos
              automaticamente neste painel. Não compare esta taxa com a
              histórica por aulas sem conferir a base.
            </p>
          </Panel>
          <Panel
            title="Compareceu e ainda não matriculou"
            note="Uma pessoa por linha, com sua última presença, próxima ação e responsável. Perdas encerradas ficam fora da fila. Nenhuma falta ou silêncio encerra o lead automaticamente."
          >
            <div className="xcv-filters">
              <label>
                Pesquisar aluno
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label>
                Mostrar
                <select
                  value={view}
                  onChange={(e) => {
                    setView(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="TODOS">Todos em acompanhamento</option>
                  <option value="ATRASADOS">Ação atrasada</option>
                  <option value="SEM_ACAO">Sem próxima ação pendente</option>
                </select>
              </label>
              <strong>{queue.length} pessoa(s)</strong>
            </div>
            {queue.length ? (
              <>
                <Table
                  labels={[
                    "Aluno",
                    "Última presença",
                    "Tempo",
                    "Próxima ação",
                    "Responsável",
                    "Acompanhamento",
                  ]}
                >
                  {queue
                    .slice((currentPage - 1) * 20, currentPage * 20)
                    .map((item) => (
                      <tr key={item.leadId}>
                        <th scope="row">
                          {item.name}
                          <small>
                            {item.phone || "Telefone não informado"}
                          </small>
                          {!item.lastTrial.whatsapp_opt_in &&
                          !item.lastTrial.whatsapp_legacy_allowed_at ? (
                            <small className="xcv-consent-block">
                              WHATSAPP NÃO AUTORIZADO · não enviar, nem
                              manualmente
                            </small>
                          ) : null}
                        </th>
                        <td>
                          {item.lastTrial.class_name_snapshot ||
                            item.lastTrial.modality_name_snapshot ||
                            "Experimental"}
                          <small>
                            {day(item.lastTrial.scheduled_on)} ·{" "}
                            {item.lastTrial.starts_at?.slice(0, 5)}
                          </small>
                          <small>
                            {item.lastTrial.actual_instructor_name_snapshot ||
                              item.lastTrial.instructor_name_snapshot ||
                              "Sem professor"}
                          </small>
                        </td>
                        <td>
                          {item.days} dia(s)
                          <small>{item.visits} presença(s)</small>
                        </td>
                        <td>
                          {item.followUp?.action || "Definir próxima ação"}
                          <small>
                            {item.followUp
                              ? `${day(item.followUp.dueOn)} · ${item.followUp.status === "CONCLUIDA" ? "Concluída: definir novo passo" : item.overdue ? "Atrasada" : "Pendente"}`
                              : "Sem ação registrada"}
                          </small>
                        </td>
                        <td>
                          {data.attendants.find(
                            (a) =>
                              a.id ===
                              (item.followUp?.responsibleId || item.assignedTo),
                          )?.full_name || "Definir responsável"}
                        </td>
                        <td>
                          <div className="xcv-actions">
                            <button
                              type="button"
                              onClick={() =>
                                openEditor({ kind: "followup", item })
                              }
                            >
                              Próxima ação
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenLead(item.leadId)}
                            >
                              Abrir lead
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </Table>
                <Pagination
                  page={currentPage}
                  pages={pages}
                  onChange={setPage}
                />
              </>
            ) : (
              <p className="xpr-empty">
                Nenhuma pessoa nesta seleção. Amplie o período ou altere o
                filtro para investigar.
              </p>
            )}
          </Panel>
          <Panel
            title="Pesquisa: envio, resposta e atendimento"
            note="O envio após a presença continua automático. Respostas do Google Forms precisam ser conferidas e registradas pela equipe aqui; o conector não lê o formulário. Não altera o indicador de envio nem dispara mensagens."
          >
            <div className="xdd-metrics xdd-metrics--four">
              <Metric
                label="PRESENTES"
                value={fmt(overview.surveyTotals.eligible)}
                note="Contagem por aula, inclusive cliente existente"
              />
              <Metric
                label="PESQUISA ENVIADA"
                value={fmt(overview.surveyTotals.sent)}
                note="Aceita pelo WhatsApp; não significa resposta"
              />
              <Metric
                label="RESPOSTA REGISTRADA"
                value={fmt(overview.surveyTotals.responded)}
                note="Positiva, neutra ou negativa"
                tone="green"
              />
              <Metric
                label="NEGATIVAS PARA ATENDER"
                value={fmt(overview.surveyTotals.negative)}
                note="Avaliações negativas sem atendimento registrado"
                tone="red"
              />
            </div>
            {overview.surveyTotals.negative ? (
              <p className="xcv-warning" role="status">
                Há {overview.surveyTotals.negative} avaliação(ões) negativa(s)
                para conversar com o aluno. Registre o atendimento para retirar
                o aviso.
              </p>
            ) : null}
            <label className="xcv-checkbox">
              <input
                type="checkbox"
                checked={negativeOnly}
                onChange={(e) => {
                  setNegativeOnly(e.target.checked);
                  setSurveyPage(1);
                }}
              />{" "}
              Somente negativas para atender
            </label>
            {surveys.length ? (
              <>
                <Table
                  labels={[
                    "Aluno / aula",
                    "Data",
                    "Envio",
                    "Resposta",
                    "Atendimento",
                    "Registro",
                  ]}
                >
                  {surveys
                    .slice((currentSurveyPage - 1) * 20, currentSurveyPage * 20)
                    .map((item) => (
                      <tr key={item.trial.id}>
                        <th scope="row">
                          {item.name}
                          <small>
                            {item.trial.class_name_snapshot ||
                              item.trial.modality_name_snapshot ||
                              "Experimental"}
                          </small>
                        </th>
                        <td>{day(item.trial.scheduled_on)}</td>
                        <td>
                          {item.trial.survey_status === "ENVIADA"
                            ? "Enviada"
                            : "Não enviada"}
                          <small>
                            {!item.trial.whatsapp_opt_in &&
                            !item.trial.whatsapp_legacy_allowed_at
                              ? "WhatsApp não autorizado · não enviar, nem manualmente"
                              : "Confira a fila no Integrador"}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`xpr-tag ${item.response?.response === "NEGATIVA" ? "is-red" : item.response?.response === "POSITIVA" ? "is-green" : "is-amber"}`}
                          >
                            {item.response
                              ? responseLabel[item.response.response]
                              : "Não registrada"}
                          </span>
                        </td>
                        <td>
                          {item.response?.response === "NEGATIVA"
                            ? item.response.reviewed
                              ? "Atendimento registrado"
                              : "Conversar com o aluno"
                            : "—"}
                          <small>{item.response?.note}</small>
                        </td>
                        <td>
                          <div className="xcv-actions">
                            <button
                              type="button"
                              onClick={() =>
                                openEditor({ kind: "survey", item })
                              }
                            >
                              Registrar resposta
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenLead(item.trial.lead_id)}
                            >
                              Abrir lead
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </Table>
                <Pagination
                  page={currentSurveyPage}
                  pages={surveyPages}
                  onChange={setSurveyPage}
                />
              </>
            ) : (
              <p className="xpr-empty">Nenhuma pesquisa nesta seleção.</p>
            )}
          </Panel>
          <Panel
            title="Motivos de perda para orientar ações"
            note="Pessoas do período com todos os seus leads encerrados como perdidos. Motivo ausente é Não informado; observação sem categoria fica separada. Cadastre e ajuste os motivos em Configurações → CRM."
          >
            {overview.losses.length ? (
              <Table labels={["Motivo", "Pessoas", "Participação"]}>
                {overview.losses.map((reason) => (
                  <tr key={reason.name}>
                    <th scope="row">{reason.name}</th>
                    <td>{reason.count}</td>
                    <td>
                      {fmt(
                        (reason.count /
                          overview.losses.reduce(
                            (sum, r) => sum + r.count,
                            0,
                          )) *
                          100,
                      )}
                      %
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="xpr-empty">
                Nenhuma perda encerrada nesta seleção.
              </p>
            )}
          </Panel>
          <Panel
            title="Professores: conversão e tamanho da amostra"
            note="Pessoas presentes únicas por professor no período; professor real tem prioridade. Matrícula atribuída só onde Matriculou foi registrado. Uma pessoa pode experimentar dois professores, mas só conta uma vez no total geral. Não somar as linhas para obter o total geral."
          >
            {overview.teachers.length ? (
              <Table
                labels={[
                  "Professor",
                  "Presentes únicos",
                  "Matriculou nesta aula",
                  "Resultados preenchidos",
                  "Pendentes",
                  "Conversão / preenchidos",
                  "Amostra",
                ]}
              >
                {overview.teachers.map((teacher) => (
                  <tr key={teacher.name}>
                    <th scope="row">{teacher.name}</th>
                    <td>{teacher.attended}</td>
                    <td>{teacher.converted}</td>
                    <td>{teacher.known}</td>
                    <td>{teacher.pending}</td>
                    <td>
                      {fmt(teacher.rate)}%
                      <small>
                        {teacher.converted} de {teacher.known}
                      </small>
                    </td>
                    <td>{teacher.sample}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="xpr-empty">
                Nenhuma presença de novo aluno para comparar.
              </p>
            )}
            <p className="xpr-explanation">
              Menos de 5 resultados conhecidos: coletar dados, sem ranking.
              Horário, modalidade e atendimento comercial também influenciam o
              resultado; a taxa não prova desempenho isolado do professor.
            </p>
          </Panel>
        </>
      ) : null}
      <dialog
        className="xpr-dialog xcv-dialog"
        ref={dialog}
        aria-labelledby="xcv-editor-title"
        onCancel={(e) => {
          if (saving) e.preventDefault();
        }}
        onClose={() => setEditor(null)}
      >
        <header>
          <div>
            <span>HISTÓRICO DO LEAD</span>
            <h2 id="xcv-editor-title">
              {editor?.kind === "followup"
                ? "Próxima ação"
                : "Resposta da pesquisa"}
            </h2>
            <p>{editor?.item.name}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar acompanhamento"
            disabled={saving}
            onClick={() => setEditor(null)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <form className="xcv-form" onSubmit={save} aria-busy={saving}>
          {editor?.kind === "followup" ? (
            <>
              <label>
                Ação
                <input
                  autoFocus
                  required
                  minLength={3}
                  maxLength={500}
                  value={followUp.action}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, action: e.target.value })
                  }
                />
              </label>
              <label>
                Data da próxima ação
                <input
                  type="date"
                  required
                  value={followUp.dueOn}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, dueOn: e.target.value })
                  }
                />
              </label>
              <label>
                Responsável
                <select
                  required
                  value={followUp.responsibleId}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, responsibleId: e.target.value })
                  }
                >
                  <option value="">Selecione o responsável</option>
                  {data?.attendants.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Situação
                <select
                  value={followUp.status}
                  onChange={(e) =>
                    setFollowUp({
                      ...followUp,
                      status: e.target.value as FollowUp["status"],
                    })
                  }
                >
                  <option value="PENDENTE">Pendente</option>
                  <option value="CONCLUIDA">Concluída</option>
                </select>
              </label>
              <label>
                Resultado / observação
                <textarea
                  required={followUp.status === "CONCLUIDA"}
                  maxLength={2000}
                  value={followUp.result}
                  onChange={(e) =>
                    setFollowUp({ ...followUp, result: e.target.value })
                  }
                />
              </label>
              <p>
                Concluir a ação não encerra o lead nem marca matrícula. Se ainda
                estiver negociando, programe o próximo passo.
              </p>
            </>
          ) : (
            <>
              <p>
                Registre apenas uma resposta realmente recebida. Entrega no
                WhatsApp não comprova preenchimento do Google Forms.
              </p>
              <label>
                Resposta recebida
                <select
                  autoFocus
                  value={survey.response}
                  onChange={(e) =>
                    setSurvey({
                      ...survey,
                      response: e.target.value as SurveyResponse["response"],
                      reviewed: false,
                    })
                  }
                >
                  {Object.entries(responseLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Observação / atendimento realizado
                <textarea
                  required={survey.response === "NEGATIVA" || survey.reviewed}
                  minLength={
                    survey.response === "NEGATIVA" || survey.reviewed
                      ? 3
                      : undefined
                  }
                  maxLength={2000}
                  value={survey.note}
                  onChange={(e) =>
                    setSurvey({ ...survey, note: e.target.value })
                  }
                />
              </label>
              {survey.response === "NEGATIVA" ? (
                <label className="xcv-checkbox">
                  <input
                    type="checkbox"
                    checked={survey.reviewed}
                    onChange={(e) =>
                      setSurvey({ ...survey, reviewed: e.target.checked })
                    }
                  />{" "}
                  Já conversei com o aluno e registrei o atendimento acima
                </label>
              ) : null}
            </>
          )}
          {saveError ? (
            <p id="xcv-save-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="xcv-actions">
            <button
              type="button"
              disabled={saving}
              className="xd-secondary"
              onClick={() => setEditor(null)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="xd-primary"
              disabled={saving}
              aria-describedby={saveError ? "xcv-save-error" : undefined}
            >
              {saving ? "Salvando..." : "Salvar registro"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="xpr-pagination">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

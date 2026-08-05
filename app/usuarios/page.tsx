"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type UserRow = {
  id: string;
  full_name: string | null;
  platform_role: string;
  active: boolean;
};

type Company = {
  id: string;
  name: string;
};

type ApiResponse = {
  success: boolean;
  message: string;
};

export default function UsuariosPage() {
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("company_user");
  const [empresa, setEmpresa] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<
    "success" | "error" | ""
  >("");

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const [usersResult, companiesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, platform_role, active")
        .order("full_name"),

      supabase
        .from("companies")
        .select("id, name")
        .eq("active", true)
        .order("name"),
    ]);

    if (usersResult.error) {
      console.error("Erro ao carregar usuários:", usersResult.error);
    }

    if (companiesResult.error) {
      console.error(
        "Erro ao carregar empresas:",
        companiesResult.error
      );
    }

    setUsers(usersResult.data ?? []);
    setCompanies(companiesResult.data ?? []);
    setLoading(false);
  }

  function limparFormulario() {
    setNome("");
    setEmail("");
    setCargo("company_user");
    setEmpresa("");
    setMessage("");
    setMessageType("");
  }

  function abrirFormulario() {
    limparFormulario();
    setShowForm(true);
  }

  function fecharFormulario() {
    limparFormulario();
    setShowForm(false);
  }

  async function salvarUsuario() {
    setMessage("");
    setMessageType("");

    if (!nome.trim() || !email.trim() || !empresa) {
      setMessage("Preencha nome, e-mail e empresa.");
      setMessageType("error");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        setMessage(
          "Sua sessão expirou. Entre novamente no sistema."
        );
        setMessageType("error");
        return;
      }

      const response = await fetch("/api/usuarios/criar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          empresa,
          cargo,
        }),
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        setMessage(
          result.message || "Não foi possível criar o usuário."
        );
        setMessageType("error");
        return;
      }

      setMessage(result.message);
      setMessageType("success");

      setNome("");
      setEmail("");
      setCargo("company_user");
      setEmpresa("");

      await carregarDados();
    } catch (error) {
      console.error("Erro ao cadastrar usuário:", error);

      setMessage("Erro de comunicação com o servidor.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 40,
        background: "#0f172a",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
        }}
      >
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "10px 16px",
            marginBottom: 28,
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          ← Voltar
        </button>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Usuários</h1>

            <p style={{ color: "#cbd5e1" }}>
              Cadastre usuários e vincule cada acesso a uma
              empresa.
            </p>
          </div>

          <button
            onClick={abrirFormulario}
            style={{
              padding: "14px 20px",
              border: "none",
              borderRadius: 10,
              background: "#7c3aed",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            + Novo usuário
          </button>
        </div>

        {showForm && (
          <section
            style={{
              marginTop: 30,
              padding: 28,
              borderRadius: 16,
              background: "#ffffff",
              color: "#111827",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Novo usuário</h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
              }}
            >
              <label>
                Nome completo

                <input
                  value={nome}
                  onChange={(event) =>
                    setNome(event.target.value)
                  }
                  placeholder="Digite o nome"
                  disabled={saving}
                  style={inputStyle}
                />
              </label>

              <label>
                E-mail

                <input
                  type="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  placeholder="usuario@empresa.com"
                  disabled={saving}
                  style={inputStyle}
                />
              </label>

              <label>
                Empresa

                <select
                  value={empresa}
                  onChange={(event) =>
                    setEmpresa(event.target.value)
                  }
                  disabled={saving}
                  style={inputStyle}
                >
                  <option value="">Selecione</option>

                  {companies.map((company) => (
                    <option
                      key={company.id}
                      value={company.id}
                    >
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Perfil

                <select
                  value={cargo}
                  onChange={(event) =>
                    setCargo(event.target.value)
                  }
                  disabled={saving}
                  style={inputStyle}
                >
                  <option value="company_user">
                    Usuário comum
                  </option>

                  <option value="company_manager">
                    Gerenciador da empresa
                  </option>

                  <option value="platform_owner">
                    Administrador da plataforma
                  </option>
                </select>
              </label>
            </div>

            {message && (
              <p
                style={{
                  marginTop: 18,
                  padding: 12,
                  borderRadius: 8,
                  background:
                    messageType === "success"
                      ? "#dcfce7"
                      : "#fee2e2",
                  color:
                    messageType === "success"
                      ? "#166534"
                      : "#991b1b",
                  border:
                    messageType === "success"
                      ? "1px solid #86efac"
                      : "1px solid #fca5a5",
                }}
              >
                {message}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 22,
              }}
            >
              <button
                onClick={salvarUsuario}
                disabled={saving}
                style={{
                  padding: "12px 18px",
                  border: "none",
                  borderRadius: 10,
                  background: saving
                    ? "#a78bfa"
                    : "#7c3aed",
                  color: "#ffffff",
                  cursor: saving
                    ? "not-allowed"
                    : "pointer",
                  fontWeight: 700,
                }}
              >
                {saving
                  ? "Criando usuário..."
                  : "Salvar usuário"}
              </button>

              <button
                onClick={fecharFormulario}
                disabled={saving}
                style={{
                  padding: "12px 18px",
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  background: "#ffffff",
                  cursor: saving
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </section>
        )}

        <section style={{ marginTop: 30 }}>
          {loading ? (
            <p>Carregando usuários...</p>
          ) : users.length === 0 ? (
            <p>Nenhum usuário encontrado.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {users.map((user) => (
                <article
                  key={user.id}
                  style={{
                    padding: 20,
                    borderRadius: 14,
                    background: "#ffffff",
                    color: "#111827",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 18 }}>
                      {user.full_name ?? "Sem nome"}
                    </strong>

                    <p style={{ margin: "7px 0 0" }}>
                      Perfil: {user.platform_role}
                    </p>

                    <p style={{ margin: "7px 0 0" }}>
                      Status:{" "}
                      {user.active ? "Ativo" : "Inativo"}
                    </p>
                  </div>

                  <button
                    style={{
                      padding: "10px 16px",
                      border: "none",
                      borderRadius: 8,
                      background: "#e2e8f0",
                      cursor: "pointer",
                    }}
                  >
                    Editar
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  marginTop: 8,
  padding: 12,
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 15,
  boxSizing: "border-box" as const,
};

import { ui } from "@/lib/ui/styles";
import { useState } from "react";

type UserFormProps = {
  nome: string;
  setNome: (v: string) => void;
  modoEdicao: boolean;
  email: string;
  setEmail: (v: string) => void;
  senha: string;
  setSenha: (v: string) => void;
  confirmarSenha: string;
  setConfirmarSenha: (v: string) => void;
  empresa: string;
  setEmpresa: (v: string) => void;
  cargo: string;
  setCargo: (v: string) => void;
  companies: {
    id: string;
    name: string;
  }[];
};

export default function UserForm({
  nome,
  setNome,
  modoEdicao,
  email,
  setEmail,
  senha,
  setSenha,
  confirmarSenha,
  setConfirmarSenha,
  empresa,
  setEmpresa,
  cargo,
  setCargo,
  companies,
}: UserFormProps) {
  const [alterandoSenha, setAlterandoSenha] = useState(false);

  return (
    <div style={formStyle}>
      <div style={columnStyle}>
        <label style={labelStyle}>
          NOME
          <input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          EMPRESA
          <select
            value={empresa}
            onChange={(event) => setEmpresa(event.target.value)}
            style={inputStyle}
          >
            <option value="">SELECIONE...</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          PERFIL
          <select
            value={cargo}
            onChange={(event) => setCargo(event.target.value)}
            style={inputStyle}
          >
            <option value="company_user">USUARIO</option>
            <option value="company_manager">GERENTE</option>
            <option value="platform_owner">ADMINISTRADOR</option>
          </select>
        </label>
      </div>

      <div style={columnStyle}>
        <label style={labelStyle}>
          E-MAIL
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={inputStyle}
          />
        </label>

        {modoEdicao ? (
          <div style={passwordAreaStyle}>
            <button
              type="button"
              onClick={() => {
                const next = !alterandoSenha;
                setAlterandoSenha(next);
                if (!next) {
                  setSenha("");
                  setConfirmarSenha("");
                }
              }}
              style={changePasswordButtonStyle}
            >
              ALTERAR SENHA
            </button>

            {alterandoSenha && (
              <>
                <label style={labelStyle}>
                  NOVA SENHA
                  <input
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    placeholder="DIGITE A NOVA SENHA"
                    style={inputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  CONFIRMAR NOVA SENHA
                  <input
                    type="password"
                    value={confirmarSenha}
                    onChange={(event) => setConfirmarSenha(event.target.value)}
                    placeholder="REPITA A NOVA SENHA"
                    style={inputStyle}
                  />
                </label>
              </>
            )}
          </div>
        ) : (
          <>
            <label style={labelStyle}>
              SENHA INICIAL
              <input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="DIGITE A SENHA"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              CONFIRMAR SENHA
              <input
                type="password"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="REPITA A SENHA"
                style={inputStyle}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

const formStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(var(--xb-cols-2), minmax(0, 1fr))",
  gap: 28,
  alignItems: "start",
 minWidth: 0 };

const columnStyle = {
  display: "grid",
  gap: 22,
};

const labelStyle = {
  display: "grid",
  gap: 10,
  color: "#344054",
 ...ui.label };

const inputStyle = {
  width: "100%",
  height: 44,
  border: "1px solid rgba(20,24,39,.14)",
  background: "#ffffff",
  color: "#141827",
  outline: "none",
  boxSizing: "border-box" as const,
  colorScheme: "light",
 ...ui.field };

const passwordAreaStyle = {
  display: "grid",
  gap: 22,
};

const changePasswordButtonStyle = {
  height: 68,
  border: "1px solid rgba(111,50,210,.18)",
  background:
    "linear-gradient(145deg, rgba(111,50,210,.08), rgba(230,61,174,.06), rgba(255,59,37,.05)), #ffffff",
  color: "#6f32d2",
  cursor: "pointer",
 ...ui.button };

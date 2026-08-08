type UserFormProps = {
  nome: string;
  setNome: (v: string) => void;

  email: string;
  setEmail: (v: string) => void;

  senha: string;
  setSenha: (v: string) => void;

  empresa: string;
  setEmpresa: (v: string) => void;

  cargo: string;
  setCargo: (v: string) => void;

  companies: {
    id: string;
    name: string;
  }[];
};


const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.12)",
  background: "#16141f",
  color: "#ffffff",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box" as const,
  colorScheme: "dark",
};


const labelStyle = {
  display: "grid",
  gap: 8,
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 700,
};


export default function UserForm({
  nome,
  setNome,
  email,
  setEmail,
  senha,
  setSenha,
  empresa,
  setEmpresa,
  cargo,
  setCargo,
  companies,
}: UserFormProps) {

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit,minmax(260px,1fr))",
        gap: 18,
      }}
    >

      <label style={labelStyle}>
        Nome

        <input
          value={nome}
          onChange={(e) =>
            setNome(e.target.value)
          }
          style={inputStyle}
        />
      </label>


      <label style={labelStyle}>
        E-mail

        <input
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
  Senha inicial

        <input
          type="password"
          value={senha}
          onChange={(e) =>
            setSenha(e.target.value)
  }
          placeholder="Digite a senha"
          autoComplete="new-password"
          style={inputStyle}
/>

</label>


      <label style={labelStyle}>
        Empresa

        <select
          value={empresa}
          onChange={(e) =>
            setEmpresa(e.target.value)
          }
          style={inputStyle}
        >

          <option value="">
            Selecione...
          </option>

          {companies.map((c) => (
            <option
              key={c.id}
              value={c.id}
            >
              {c.name}
            </option>
          ))}

        </select>

      </label>


      <label style={labelStyle}>
        Perfil

        <select
          value={cargo}
          onChange={(e) =>
            setCargo(e.target.value)
          }
          style={inputStyle}
        >

          <option value="company_user">
            Usuário
          </option>

          <option value="company_manager">
            Gerente
          </option>

          <option value="platform_owner">
            Administrador
          </option>

        </select>

      </label>

    </div>
  );
}
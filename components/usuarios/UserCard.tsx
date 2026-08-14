type UserCardProps = {
  nome: string;
  perfil: string;
  empresa?: string;
  ativo: boolean;
  onEditar: () => void;
  onExcluir: () => void;
};

export default function UserCard({
  nome,
  perfil,
  empresa,
  ativo,
  onEditar,
  onExcluir,
}: UserCardProps) {
  return (
    <article style={cardStyle}>
      <div style={innerStyle}>
        <div>
          <h3 style={nameStyle}>{nome}</h3>
          <p style={profileStyle}>{perfil}</p>
          {empresa && <p style={companyStyle}>{empresa}</p>}
          <p style={{ ...statusStyle, color: ativo ? "#039855" : "#d92d20" }}>
            {ativo ? "ATIVO" : "INATIVO"}
          </p>
        </div>

        <div style={actionsStyle}>
          <button onClick={onEditar} style={editButtonStyle}>
            EDITAR
          </button>
          <button onClick={onExcluir} style={deleteButtonStyle}>
            EXCLUIR
          </button>
        </div>
      </div>
    </article>
  );
}

const cardStyle = {
  padding: 18,
  borderRadius: 24,
  border: "1px solid rgba(111,50,210,.16)",
  background:
    "linear-gradient(145deg, rgba(111,50,210,.06), rgba(230,61,174,.04), rgba(255,59,37,.04)), #ffffff",
  boxShadow: "0 18px 42px rgba(39,36,67,.1)",
};

const innerStyle = {
  minHeight: 144,
  padding: "28px 32px",
  borderRadius: 20,
  background: "rgba(255,255,255,.84)",
  border: "1px solid rgba(20,24,39,.08)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 24,
};

const nameStyle = {
  margin: 0,
  color: "#141827",
  fontSize: 30,
  fontWeight: 900,
};

const profileStyle = {
  color: "#667085",
  margin: "10px 0 0",
  fontSize: 18,
  fontWeight: 800,
};

const companyStyle = {
  color: "#6f32d2",
  margin: "10px 0 0",
  fontSize: 18,
  fontWeight: 900,
};

const statusStyle = {
  margin: "12px 0 0",
  fontSize: 18,
  fontWeight: 900,
};

const actionsStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
};

const editButtonStyle = {
  padding: "16px 24px",
  border: "none",
  borderRadius: 16,
  cursor: "pointer",
  color: "#ffffff",
  fontSize: 18,
  fontWeight: 900,
  background: "linear-gradient(90deg,#6f32d2,#e63dae)",
};

const deleteButtonStyle = {
  padding: "16px 24px",
  border: "1px solid rgba(217,45,32,.26)",
  borderRadius: 16,
  cursor: "pointer",
  color: "#b42318",
  fontSize: 18,
  fontWeight: 900,
  background: "rgba(254,228,226,.72)",
};

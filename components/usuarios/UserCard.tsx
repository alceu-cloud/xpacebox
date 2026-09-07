
import { ui } from "@/lib/ui/styles";
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
  ...ui.frame,
};

const innerStyle = {
  minHeight: 100,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 24,
 flexWrap: "wrap" as const };

const nameStyle = {
  margin: 0,
  color: "#141827",
  fontSize: 16,
  fontWeight: 900,
};

const profileStyle = {
  color: "#667085",
  margin: "10px 0 0",
  fontSize: 16,
  fontWeight: 800,
};

const companyStyle = {
  color: "#6f32d2",
  margin: "10px 0 0",
  fontSize: 16,
  fontWeight: 900,
};

const statusStyle = {
  margin: "12px 0 0",
  fontSize: 16,
  fontWeight: 900,
};

const actionsStyle = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap" as const,
  justifyContent: "flex-end",
};

const editButtonStyle = {
  border: "none",
  cursor: "pointer",
  color: "#ffffff",
  background: "linear-gradient(90deg,#6f32d2,#e63dae)",
 ...ui.button };

const deleteButtonStyle = {
  ...ui.button,
  border: "1px solid rgba(217,45,32,.26)",
  cursor: "pointer",
  color: "#b42318",
  background: "rgba(254,228,226,.72)",
};

import { ReactNode } from "react";

type UserModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  modoEdicao: boolean;
  children: ReactNode;
};

export default function UserModal({
  open,
  onClose,
  onSave,
  saving,
  modoEdicao,
  children,
}: UserModalProps) {
  if (!open) return null;

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <span style={eyebrowStyle}>ADMINISTRACAO</span>

        <h2 style={titleStyle}>
          {modoEdicao ? "EDITAR USUARIO" : "NOVO USUARIO"}
        </h2>

        <div style={dividerStyle} />

        {children}

        <div style={actionsStyle}>
          <button onClick={onClose} style={cancelButtonStyle}>
            CANCELAR
          </button>

          <button onClick={onSave} disabled={saving} style={saveButtonStyle}>
            {saving
              ? "SALVANDO..."
              : modoEdicao
                ? "SALVAR ALTERACAO"
                : "CRIAR USUARIO"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(20,24,39,.46)",
  display: "grid",
  placeItems: "center",
  zIndex: 999,
  padding: 28,
  backdropFilter: "blur(8px)",
};

const modalStyle = {
  width: "100%",
  maxWidth: 1060,
  background: "rgba(255,255,255,.96)",
  border: "1px solid rgba(20,24,39,.12)",
  borderRadius: 28,
  padding: 48,
  boxShadow: "0 30px 90px rgba(39,36,67,.22)",
};

const eyebrowStyle = {
  display: "block",
  marginBottom: 8,
  color: "#6f32d2",
  fontSize: 15,
  fontWeight: 900,
  letterSpacing: "3px",
};

const titleStyle = {
  margin: 0,
  color: "#141827",
  fontSize: 46,
  fontWeight: 900,
};

const dividerStyle = {
  height: 1,
  margin: "28px 0 34px",
  background:
    "linear-gradient(90deg,transparent,#6f32d2,#e63dae,#ff3b25,transparent)",
  opacity: 0.6,
};

const actionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 14,
  marginTop: 40,
  flexWrap: "wrap" as const,
};

const cancelButtonStyle = {
  minWidth: 150,
  padding: "20px 28px",
  borderRadius: 16,
  border: "1px solid rgba(20,24,39,.14)",
  background: "#ffffff",
  color: "#344054",
  cursor: "pointer",
  fontSize: 19,
  fontWeight: 900,
};

const saveButtonStyle = {
  minWidth: 230,
  padding: "20px 32px",
  border: "none",
  borderRadius: 16,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 19,
  fontWeight: 900,
  background: "linear-gradient(90deg,#6f32d2,#e63dae,#ff3b25)",
  boxShadow: "0 16px 34px rgba(230,61,174,.24)",
};

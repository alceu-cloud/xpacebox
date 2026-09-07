
import { ui } from "@/lib/ui/styles";
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
      <div style={modalStyle} role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
        <span style={eyebrowStyle}>ADMINISTRACAO</span>

        <h2 id="user-modal-title" style={titleStyle}>
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
  padding: 16,
  backdropFilter: "blur(8px)",
};

const modalStyle = {
  width: "100%",
  maxWidth: 860,
  maxHeight: "calc(100dvh - 32px)",
  overflowY: "auto" as const,
  background: "rgba(255,255,255,.96)",
  border: "1px solid rgba(20,24,39,.12)",
  borderRadius: 28,
  padding: "var(--xb-panel-padding)",
  boxShadow: "none",
};

const eyebrowStyle = {
  display: "block",
  marginBottom: 8,
  color: "#6f32d2",
  fontSize: 15,
  fontWeight: 900,
  letterSpacing: 0,
};

const titleStyle = {
  margin: 0,
  color: "#141827",
  fontWeight: 900,
 ...ui.title };

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
  marginTop: 24,
  paddingTop: 16,
  borderTop: "1px solid var(--xb-line)",
  flexWrap: "wrap" as const,
};

const cancelButtonStyle = {
  minWidth: 150,
  border: "1px solid rgba(20,24,39,.14)",
  background: "#ffffff",
  color: "#344054",
  cursor: "pointer",
 ...ui.button };

const saveButtonStyle = {
  minWidth: 180,
  border: "none",
  color: "#ffffff",
  cursor: "pointer",
  background: "linear-gradient(90deg,#6f32d2,#e63dae,#ff3b25)",
 ...ui.button };

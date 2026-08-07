import { ReactNode } from "react";

type UserModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  children: ReactNode;
  modoEdicao?: boolean;
};


export default function UserModal({
  open,
  onClose,
  onSave,
  saving,
  children,
  modoEdicao = false,
}: UserModalProps) {

  if (!open) return null;


  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        display: "grid",
        placeItems: "center",
        zIndex: 999,
      }}
    >

      <div
        style={{
          width: "100%",
          maxWidth: 760,
          background: "#0f0c1c",
          border:
            "1px solid rgba(255,255,255,.08)",
          borderRadius: 24,
          padding: 32,
          boxShadow:
            "0 30px 80px rgba(0,0,0,.45)",
        }}
      >

        <h2
          style={{
            color:"#fff",
            marginTop:0,
          }}
        >
          {modoEdicao
            ? "Editar Usuário"
            : "Novo Usuário"}
        </h2>


        {children}


        <div
          style={{
            display:"flex",
            justifyContent:"flex-end",
            gap:12,
            marginTop:30,
          }}
        >

          <button
            onClick={onClose}
            style={{
              padding:"12px 18px",
              borderRadius:12,
              border:
                "1px solid rgba(255,255,255,.15)",
              background:"transparent",
              color:"#fff",
              cursor:"pointer",
            }}
          >
            Cancelar
          </button>


          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding:"12px 18px",
              border:"none",
              borderRadius:12,
              color:"#fff",
              cursor:"pointer",
              fontWeight:800,
              background:
                "linear-gradient(90deg,#7c3aed,#db2777,#f97316)",
            }}
          >
            {saving
              ? "Salvando..."
              : modoEdicao
              ? "Salvar Alteração"
              : "Criar Usuário"}
          </button>


        </div>

      </div>

    </div>
  );
}
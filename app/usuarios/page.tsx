"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import LoginBackground from "@/components/login/LoginBackground";
import UserList from "@/components/usuarios/UserList";
import UserModal from "@/components/usuarios/UserModal";
import UserForm from "@/components/usuarios/UserForm";

import {
  carregarUsuarios,
  excluirUsuario as excluirUsuarioBanco,
} from "@/lib/usuarios";


type User = {
  id: string;
  full_name: string | null;
  platform_role: string;
  active: boolean;
};


const empresas = [
  {
    id: "xpace",
    name: "XPACE",
  },
];


export default function UsuariosPage() {
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [modal, setModal] = useState(false);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("company_user");


  useEffect(() => {
    carregar();
  }, []);


  async function carregar() {
    try {
      const dados = await carregarUsuarios();
      setUsers(dados);
    } catch (error) {
      console.error(
        "Erro ao carregar usuários:",
        error
      );
    }
  }


  async function excluirUsuario(user: User) {
    const confirmar = confirm(
      `Deseja excluir ${user.full_name}?`
    );

    if (!confirmar) return;


    try {
      await excluirUsuarioBanco(user.id);

      setUsers((lista) =>
        lista.filter(
          (item) => item.id !== user.id
        )
      );

      alert(
        "Usuário excluído com sucesso!"
      );

    } catch (error) {

      console.error(
        "Erro ao excluir usuário:",
        error
      );

      alert(
        "Erro ao excluir usuário"
      );
    }
  }


  function editarUsuario(user: User) {
    setNome(user.full_name ?? "");
    setCargo(user.platform_role);
    setModal(true);
  }


  return (
    <LoginBackground>

      <section style={panelStyle}>

        <header style={headerStyle}>

          <div>
            <Image
              src="/logo-xpacebox.png"
              alt="XPACEBOX"
              width={360}
              height={180}
              priority
              style={{
                width: "330px",
                maxWidth: "100%",
                height: "auto",
              }}
            />

            <p style={welcomeStyle}>
              ADMINISTRAÇÃO DA PLATAFORMA
            </p>
          </div>


          <button
            onClick={() => router.push("/")}
            style={logoutButtonStyle}
          >
            ← VOLTAR À CENTRAL
          </button>

        </header>
                <div style={dividerStyle} />


        <section style={sectionStyle}>

          <span style={eyebrowStyle}>
            ADMINISTRAÇÃO
          </span>


          <h1 style={titleStyle}>
            USUÁRIOS
          </h1>


          <p style={descriptionStyle}>
            CADASTRE E GERENCIE OS ACESSOS DA PLATAFORMA.
          </p>


          <button
            onClick={() => setModal(true)}
            style={actionButtonStyle}
          >
            + NOVO USUÁRIO
          </button>


          <div style={cardsAreaStyle}>

            <UserList
              users={users}
              onEditar={editarUsuario}
              onExcluir={excluirUsuario}
            />

          </div>


        </section>


      </section>


      <UserModal
        open={modal}
        onClose={() => setModal(false)}
        onSave={() => setModal(false)}
        saving={false}
      >

        <UserForm
          nome={nome}
          setNome={setNome}
          email={email}
          setEmail={setEmail}
          empresa={empresa}
          setEmpresa={setEmpresa}
          cargo={cargo}
          setCargo={setCargo}
          companies={empresas}
        />

      </UserModal>


    </LoginBackground>
  );
}


const panelStyle = {
  width: "100%",
  maxWidth: 1180,
  margin: "-80px auto 0",
  padding: "42px 48px",
  borderRadius: 30,
  background: "rgba(7,7,17,.9)",
  border: "1px solid rgba(255,255,255,.08)",
  boxShadow: "0 30px 90px rgba(0,0,0,.48)",
  backdropFilter: "blur(24px)",
};


const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
};


const welcomeStyle = {
  margin: "-12px 0 0",
  color: "#d1d5db",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "2px",
};


const logoutButtonStyle = {
  padding: "12px 22px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.05)",
  color: "#ffffff",
  fontWeight: 800,
  letterSpacing: "1px",
  cursor: "pointer",
};


const dividerStyle = {
  height: 1,
  margin: "30px 0 36px",
  background:
    "linear-gradient(90deg,transparent,#7c3aed,#db2777,#f97316,transparent)",
  opacity: 0.7,
};


const sectionStyle = {
  marginTop: 34,
};


const eyebrowStyle = {
  display: "block",
  marginBottom: 8,
  color: "#c084fc",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "3px",
};


const titleStyle = {
  margin: 0,
  color: "#ffffff",
  fontSize: 36,
};


const descriptionStyle = {
  margin: "10px 0 25px",
  color: "#9ca3af",
  fontSize: 13,
};
const actionButtonStyle = {
  padding: "14px 24px",
  borderRadius: 14,
  border: "none",
  cursor: "pointer",
  color: "#ffffff",
  fontWeight: 800,
  background:
    "linear-gradient(90deg,#7c3aed,#db2777,#f97316)",
};


const cardsAreaStyle = {
  marginTop: 30,
  display: "grid",
  gap: 18,
};
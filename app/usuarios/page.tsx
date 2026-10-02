"use client";

import { ui } from "@/lib/ui/styles";
import BrandLogo from "@/components/ui/BrandLogo";
import BackTitle from "@/components/navigation/BackTitle";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import UserForm from "@/components/usuarios/UserForm";
import UserList from "@/components/usuarios/UserList";
import UserModal from "@/components/usuarios/UserModal";
import {
  alterarSenhaUsuario,
  atualizarUsuario,
  carregarEmpresas,
  carregarUsuarioEmails,
  carregarUsuarios,
  criarUsuario,
  carregarProfessoresUsuario,
  excluirUsuario,
} from "@/lib/usuarios";
import { supabase } from "@/lib/supabase";

type Company = { id: string; name: string; slug: string };

type User = {
  id: string;
  email?: string | null;
  full_name: string | null;
  platform_role: string;
  active: boolean;
  company_members?: {
    company_id: string;
    company_role: string;
    companies?: { id: string; name: string; slug: string }[];
  }[];
};

export default function UsuariosPage() {
  const router = useRouter();

  const [authorized,setAuthorized]=useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [, setEmails] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<User | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("company_user");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [instructorId,setInstructorId]=useState("");
  const [teacherActive,setTeacherActive]=useState(true);
  const [teacherCompanyId,setTeacherCompanyId]=useState("");
  const [instructors,setInstructors]=useState<{id:string;full_name:string;active:boolean}[]>([]);
  const [teacherLoading,setTeacherLoading]=useState(false);
  const [teacherError,setTeacherError]=useState("");
  useEffect(()=>{if(!modalAberto||cargo!=="company_teacher")return;let cancelled=false;setTeacherLoading(true);setTeacherError("");
    carregarProfessoresUsuario(usuarioEditando?.id).then(result=>{if(cancelled)return;setTeacherCompanyId(result.companyId);setInstructors(result.instructors);if(result.binding){setEmpresa(result.binding.tenant_company_id);setInstructorId(result.binding.instructor_id);setTeacherActive(result.binding.active);}else setEmpresa(current=>current||result.companyId);}).catch(error=>{if(!cancelled)setTeacherError(error instanceof Error?error.message:"ERRO AO CARREGAR PROFESSORES.");}).finally(()=>{if(!cancelled)setTeacherLoading(false);});return()=>{cancelled=true;};
  },[modalAberto,cargo,usuarioEditando?.id]);

  useEffect(() => {
    async function check(){const {data}=await supabase.auth.getSession();if(!data.session){router.replace("/login");return;}const profile=await supabase.from("profiles").select("platform_role,active").eq("id",data.session.user.id).maybeSingle();if(!profile.data?.active||profile.data.platform_role!=="platform_owner"){router.replace(profile.data?.platform_role==="company_teacher"?"/xpace/professor":"/");return;}setAuthorized(true);await Promise.all([carregarLista(),carregarListaEmpresas(),carregarListaEmails()]);}void check();
  }, []);

  async function carregarLista() {
    setUsers(await carregarUsuarios());
  }

  async function carregarListaEmpresas() {
    setEmpresas(await carregarEmpresas());
  }

  async function carregarListaEmails() {
    setEmails(await carregarUsuarioEmails());
  }

  function abrirNovo() {
    setInstructorId("");setTeacherActive(true);setTeacherError("");
    setModoEdicao(false);
    setUsuarioEditando(null);
    setNome("");
    setEmail("");
    setSenha("");
    setConfirmarSenha("");
    setEmpresa("");
    setCargo("company_user");
    setModalAberto(true);
  }

  function abrirEditar(user: User) {
    setInstructorId("");setTeacherActive(true);setTeacherError("");
    setModoEdicao(true);
    setUsuarioEditando(user);
    setNome(user.full_name ?? "");
    setEmail(user.email ?? "");
    setCargo(user.platform_role);
    setSenha("");
    setConfirmarSenha("");
    setEmpresa(user.company_members?.[0]?.company_id ?? "");
    setModalAberto(true);
  }

  async function salvar() {
    try {
      if (senha && senha !== confirmarSenha) {
        alert("AS SENHAS NAO CONFEREM.");
        return;
      }

      if(cargo==="company_teacher"&&(teacherLoading||teacherError||empresa!==teacherCompanyId||!instructorId)){alert(teacherError||"ESCOLHA A EMPRESA XPACE E O PROFESSOR CADASTRADO.");return;}
      setSalvando(true);

      if (modoEdicao && usuarioEditando) {
        await atualizarUsuario(usuarioEditando.id, nome, email, cargo, empresa, undefined, instructorId||undefined, teacherActive);
        if (senha) await alterarSenhaUsuario(usuarioEditando.id, senha);
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) throw new Error("SESSAO EXPIRADA");

        await criarUsuario(session.access_token, nome, email, senha, empresa, cargo, instructorId||undefined, teacherActive);
      }

      await carregarLista();
      fecharModal();
    } catch (error) {
      console.error("ERRO AO SALVAR:", error);
      alert(error instanceof Error ? error.message : "ERRO AO SALVAR USUARIO");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(user: User) {
    if (!confirm(`DESEJA EXCLUIR ${user.full_name}?`)) return;
    await excluirUsuario(user.id);
    await carregarLista();
  }

  function fecharModal() {
    setModalAberto(false);
    setModoEdicao(false);
    setUsuarioEditando(null);
    setNome("");
    setEmail("");
    setSenha("");
    setConfirmarSenha("");
    setEmpresa("");
    setCargo("company_user");
  }

  if(!authorized)return <main className="xd-loading" aria-busy="true">CONFERINDO SEU ACESSO...</main>;
  return (
    <main className="xb-users">
      <section style={panelStyle}>
        <header className="xb-central-topbar">
          <BrandLogo priority />

        </header>

        <section className="xb-users-toolbar">
          <div>
          <span style={eyebrowStyle}>ADMINISTRACAO</span>
          <h1 style={titleStyle}><BackTitle title="USUARIOS" /></h1>
          <p style={descriptionStyle}>
            CADASTRE E GERENCIE OS ACESSOS DA PLATAFORMA.
          </p>

          </div>
          <button onClick={abrirNovo} className="xb-users-create">
            <Plus size={18} aria-hidden="true" /> NOVO USUARIO
          </button>
        </section>

        <div style={cardsAreaStyle}>
          <UserList users={users} onEditar={abrirEditar} onExcluir={remover} />
        </div>
      </section>

      <UserModal
        open={modalAberto}
        onClose={fecharModal}
        onSave={salvar}
        saving={salvando}
        modoEdicao={modoEdicao}
      >
        <UserForm
          nome={nome}
          setNome={setNome}
          modoEdicao={modoEdicao}
          email={email}
          setEmail={setEmail}
          senha={senha}
          setSenha={setSenha}
          confirmarSenha={confirmarSenha}
          setConfirmarSenha={setConfirmarSenha}
          empresa={empresa}
          setEmpresa={setEmpresa}
          cargo={cargo}
          setCargo={setCargo}
          companies={empresas}
          instructorId={instructorId} setInstructorId={setInstructorId} teacherActive={teacherActive} setTeacherActive={setTeacherActive} instructors={instructors} teacherCompanyId={teacherCompanyId} teacherLoading={teacherLoading} teacherError={teacherError}
        />
      </UserModal>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 40,
  background:
    "radial-gradient(circle at 8% 10%, rgba(111,50,210,.13), transparent 30%), radial-gradient(circle at 92% 18%, rgba(230,61,174,.10), transparent 28%), radial-gradient(circle at 86% 88%, rgba(255,59,37,.11), transparent 34%), linear-gradient(180deg,#ffffff 0%,#f7f8fc 100%)",
};

const panelStyle = {
  margin: "0 auto",
  backdropFilter: "blur(24px)",
 ...ui.shell };

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
 flexWrap: "wrap" as const };

const logoStyle = {
  width: "520px",
  maxWidth: "100%",
  height: "auto",
};

const backButtonStyle = {
  border: "1px solid rgba(111,50,210,.18)",
  background: "#ffffff",
  color: "#6f32d2",
  cursor: "pointer",
 ...ui.button };

const dividerStyle = {
  height: 1,
  margin: "38px 0 42px",
  background:
    "linear-gradient(90deg,transparent,#6f32d2,#e63dae,#ff3b25,transparent)",
  opacity: 0.6,
};

const heroStyle = {
  textAlign: "center" as const,
};

const eyebrowStyle = {
  display: "block",
  marginBottom: 10,
  color: "#6f32d2",
  fontSize: 16,
  fontWeight: 900,
  letterSpacing: 0,
};

const titleStyle = {
  margin: 0,
  color: "#141827",
  fontWeight: 900,
 ...ui.title };

const descriptionStyle = {
  margin: "12px 0 28px",
  color: "#667085",
  fontSize: 16,
  fontWeight: 800,
};

const actionButtonStyle = {
  border: "none",
  cursor: "pointer",
  color: "#ffffff",
  background: "linear-gradient(90deg,#6f32d2,#e63dae,#ff3b25)",
 ...ui.button };

const cardsAreaStyle = {
  marginTop: 38,
  display: "grid",
  gap: 20,
};

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
  carregarEmpresas,
  carregarUsuarioEmails,
  excluirUsuario,
  criarUsuario,
  atualizarUsuario,
} from "@/lib/usuarios";

import { supabase } from "@/lib/supabase";


type Company = {
  id: string;
  name: string;
  slug: string;
};


type User = {
  id: string;

  full_name: string | null;

  platform_role: string;

  active: boolean;


  company_members?: {

    company_id: string;

    company_role: string;


    companies?: {

      id: string;

      name: string;

      slug: string;

    }[];

  }[];

};



export default function UsuariosPage() {


  const router = useRouter();



  const [users, setUsers] =
    useState<User[]>([]);



  const [empresas, setEmpresas] =
    useState<Company[]>([]);



  const [emails, setEmails] =
    useState<any[]>([]);




  const [modalAberto, setModalAberto] =
    useState(false);



  const [salvando, setSalvando] =
    useState(false);



  const [modoEdicao, setModoEdicao] =
    useState(false);



  const [usuarioEditando, setUsuarioEditando] =
    useState<User | null>(null);




  const [nome, setNome] =
    useState("");



  const [email, setEmail] =
    useState("");



  const [empresa, setEmpresa] =
    useState("");



  const [cargo, setCargo] =
    useState("company_user");

  const [senha, setSenha] = 
    useState("");


  useEffect(() => {


    carregarLista();

    carregarListaEmpresas();

    carregarListaEmails();


  }, []);




  async function carregarLista() {


    const dados =
      await carregarUsuarios();



    setUsers(dados);


  }




  async function carregarListaEmpresas() {


    const dados =
      await carregarEmpresas();



    setEmpresas(dados);


  }
    async function carregarListaEmails() {


    const dados =
      await carregarUsuarioEmails();



    setEmails(dados);


  }


  function abrirNovo() {


    setModoEdicao(false);

    setUsuarioEditando(null);

    setNome("");

    setEmail("");

    setSenha("");

    setEmpresa("");

    setCargo("company_user");

    setModalAberto(true);


  }


  function abrirEditar(user: User) {


    console.log(
      "EDITANDO COMPLETO:",
      user
    );



    setModoEdicao(true);


    setUsuarioEditando(user);



    setNome(
      user.full_name ?? ""
    );



    setEmail(
      emails.find(
        (item) =>
          item.id === user.id
      )?.email ?? ""
    );



    setCargo(
      user.platform_role
    );

    setSenha("");

    setEmpresa(
      user.company_members?.[0]?.company_id ?? ""
    );



    setModalAberto(true);


  }






  async function salvar() {


    try {


      console.log(
        "SALVAR USUARIO:",
        {
          modoEdicao,
          usuarioEditando,
          nome,
          email,
          empresa,
          cargo,
        }
      );



      setSalvando(true);




      if (
        modoEdicao &&
        usuarioEditando
      ) {


        await atualizarUsuario(
          usuarioEditando.id,
          nome,
          email,
          cargo,
          "@amj20021979"
        );



      } else {



        const {
          data:{
            session
          }
        } =
          await supabase.auth.getSession();



        if(!session?.access_token){

          throw new Error(
            "Sessão expirada"
          );

        }



        await criarUsuario(
          session.access_token,
          nome,
          email,
          senha,
          empresa,
          cargo
        );


      }




      await carregarLista();


      fecharModal();



    } catch(error) {


      console.error(
        "ERRO AO SALVAR:",
        error
      );



      alert(
        error instanceof Error
          ? error.message
          : "Erro ao salvar usuário"
      );



    } finally {


      setSalvando(false);


    }


  }






  async function remover(user: User) {


    const confirmar =
      confirm(
        `Deseja excluir ${user.full_name}?`
      );


    if(!confirmar) return;



    await excluirUsuario(
      user.id
    );



    await carregarLista();


  }






  function fecharModal() {


    setModalAberto(false);


    setModoEdicao(false);


    setUsuarioEditando(null);



    setNome("");

    setEmail("");

    setSenha("");

    setEmpresa("");

    setCargo("company_user");


  }
    return (

    <LoginBackground>


      <section style={panelStyle}>


        <header style={headerStyle}>


          <Image

            src="/logo-xpacebox.png"

            alt="XPACEBOX"

            width={360}

            height={180}

            priority

            style={{
              width:"330px",
              maxWidth:"100%",
              height:"auto",
            }}

          />



          <button

            onClick={() =>
              router.push("/")
            }

            style={logoutButtonStyle}

          >

            ← VOLTAR À CENTRAL

          </button>


        </header>




        <div style={dividerStyle} />




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

          onClick={abrirNovo}

          style={actionButtonStyle}

        >

          + NOVO USUÁRIO

        </button>





        <div style={cardsAreaStyle}>


          <UserList

            users={users}

            onEditar={abrirEditar}

            onExcluir={remover}

          />


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

          email={email}

          setEmail={setEmail}

          senha={senha}

          setSenha={setSenha}

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

  width:"100%",

  maxWidth:1180,

  margin:"-80px auto 0",

  padding:"42px 48px",

  borderRadius:30,

  background:"rgba(7,7,17,.9)",

  border:"1px solid rgba(255,255,255,.08)",

  boxShadow:"0 30px 90px rgba(0,0,0,.48)",

  backdropFilter:"blur(24px)",

};





const headerStyle = {

  display:"flex",

  alignItems:"center",

  justifyContent:"space-between",

  gap:24,

};





const logoutButtonStyle = {

  padding:"12px 22px",

  borderRadius:12,

  border:"1px solid rgba(255,255,255,.16)",

  background:"rgba(255,255,255,.05)",

  color:"#fff",

  fontWeight:800,

  cursor:"pointer",

};





const dividerStyle = {

  height:1,

  margin:"30px 0 36px",

  background:
    "linear-gradient(90deg,transparent,#7c3aed,#db2777,#f97316,transparent)",

};





const eyebrowStyle = {

  display:"block",

  marginBottom:8,

  color:"#c084fc",

  fontSize:12,

  fontWeight:800,

  letterSpacing:"3px",

};





const titleStyle = {

  margin:0,

  color:"#fff",

  fontSize:36,

};





const descriptionStyle = {

  margin:"10px 0 25px",

  color:"#9ca3af",

  fontSize:13,

};





const actionButtonStyle = {

  padding:"14px 24px",

  borderRadius:14,

  border:"none",

  cursor:"pointer",

  color:"#fff",

  fontWeight:800,

  background:
    "linear-gradient(90deg,#7c3aed,#db2777,#f97316)",

};





const cardsAreaStyle = {

  marginTop:30,

  display:"grid",

  gap:18,

};
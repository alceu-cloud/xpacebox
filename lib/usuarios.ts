import { supabase } from "./supabase";



export async function carregarUsuarios() {

  const { data, error } =
    await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        platform_role,
        active,

        company_members (

          company_id,

          company_role,

          companies (
            id,
            name,
            slug
          )

        )

      `)
      .order("full_name");


  if(error){

    console.error(
      "ERRO AO CARREGAR USUÁRIOS:",
      error
    );

    throw error;

  }


  console.log(
    "USUÁRIOS CARREGADOS:",
    data
  );


  return data ?? [];

}





export async function carregarEmpresas(){

  const { data, error } =
    await supabase
      .from("companies")
      .select(`
        id,
        name,
        slug
      `)
      .eq(
        "active",
        true
      )
      .order("name");


  if(error){

    throw error;

  }


  return data ?? [];

}





export async function obterUsuarioLogado(){

  const {
    data:{
      user
    }
  } =
    await supabase.auth.getUser();


  return user;

}





export async function criarUsuario(
  accessToken:string,
  nome:string,
  email:string,
  senha:string,
  empresa:string,
  cargo:string
){

  const response =
    await fetch(
      "/api/usuarios/criar",
      {

        method:"POST",

        headers:{

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${accessToken}`

        },


        body:JSON.stringify({

          nome,
          email,
          senha,
          empresa,
          cargo

        })

      }
    );



  const resultado =
    await response.json();



  if(!resultado.success){

    throw new Error(
      resultado.message ||
      "Erro ao criar usuário"
    );

  }


  return resultado;

}





export async function atualizarUsuario(
  id:string,
  nome:string,
  email:string,
  cargo:string,
  empresa:string,
  senha?:string
){

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESSAO EXPIRADA");

  const response =
    await fetch(
      "/api/usuarios/atualizar",
      {

        method:"POST",

        headers:{

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`

        },


        body:JSON.stringify({

          id,
          nome,
          email,
          cargo,
          empresa,
          senha

        })

      }
    );



  const resultado =
    await response.json();



  if(!resultado.success){

    throw new Error(
      resultado.message ||
      "Erro ao atualizar usuário"
    );

  }


  return resultado;

}





export async function carregarUsuarioEmails(){

  const response =
    await fetch(
      "/api/usuarios/emails"
    );


  const resultado =
    await response.json();



  if(!resultado.success){

    throw new Error(
      resultado.message ||
      "Erro ao buscar emails"
    );

  }


  return resultado.usuarios ?? [];

}





export async function excluirUsuario(
  id:string
){

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESSAO EXPIRADA");

  const response =
    await fetch(
      "/api/usuarios/excluir",
      {

        method:"POST",

        headers:{

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`

        },


        body:JSON.stringify({

          id

        })

      }
    );



  const resultado =
    await response.json();



  console.log(
    "EXCLUIR USUÁRIO:",
    resultado
  );



  if(!resultado.success){

    throw new Error(
      resultado.message ||
      "Erro ao excluir usuário"
    );

  }


  return resultado;

}
export async function alterarSenhaUsuario(
id:string,
senha:string
){

const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;
if (!token) throw new Error("SESSAO EXPIRADA");


const response =
await fetch(
"/api/usuarios/alterar-senha",
{

method:"POST",

headers:{

"Content-Type":
"application/json",

Authorization:
`Bearer ${token}`

},

body:JSON.stringify({

id,
senha

})

}

);



const resultado =
await response.json();



if(!resultado.success){


throw new Error(
resultado.message ||
"Erro ao alterar senha"
);


}



return resultado;


}

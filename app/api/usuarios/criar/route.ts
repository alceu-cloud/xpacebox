import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


type CriarUsuarioBody = {
  nome?: string;
  email?: string;
  senha?: string;
  empresa?: string;
  cargo?: string;
};


export async function POST(request: Request) {

  try {


    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;


    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;


    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;



    if(
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceKey
    ){

      return NextResponse.json(
        {
          success:false,
          message:
            "Configuração do Supabase ausente."
        },
        {
          status:500
        }
      );

    }



    const authorization =
      request.headers.get("authorization");



    if(
      !authorization?.startsWith("Bearer ")
    ){

      return NextResponse.json(
        {
          success:false,
          message:
            "Sessão não encontrada."
        },
        {
          status:401
        }
      );

    }



    const accessToken =
      authorization.replace(
        "Bearer ",
        ""
      ).trim();





    const supabaseAuth =
      createClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          auth:{
            persistSession:false,
            autoRefreshToken:false,
          }
        }
      );



    const {
      data:{
        user:usuarioLogado
      },
      error:erroSessao
    } =
      await supabaseAuth.auth.getUser(
        accessToken
      );



    if(
      erroSessao ||
      !usuarioLogado
    ){

      return NextResponse.json(
        {
          success:false,
          message:
            "Sessão inválida."
        },
        {
          status:401
        }
      );

    }




    const supabaseAdmin =
      createClient(
        supabaseUrl,
        supabaseServiceKey,
        {
          auth:{
            persistSession:false,
            autoRefreshToken:false,
          }
        }
      );

    const {
      data:perfilAdministrador
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "platform_role, active"
        )
        .eq(
          "id",
          usuarioLogado.id
        )
        .single();




    if(
      !perfilAdministrador ||
      perfilAdministrador.platform_role !== "platform_owner" ||
      perfilAdministrador.active !== true
    ){

      return NextResponse.json(
        {
          success:false,
          message:
            "Sem permissão."
        },
        {
          status:403
        }
      );

    }





    const body = await request.json() as CriarUsuarioBody;




    const nome =
      body.nome?.trim();


    const email =
      body.email?.trim().toLowerCase();

    const senha =
      body.senha?.trim();


    const empresa =
      body.empresa?.trim();


    const cargo =
      body.cargo?.trim()
      ||
      "company_user";





    if (!nome || !email || !senha || !empresa)
      {

      return NextResponse.json(
        {
          success:false,
          message:
            "Nome, email, senha e empresa são obrigatórios."
        },
        {
          status:400
        }
      );

    }





    const redirectTo =
      `${request.headers.get("origin")}/login`;



   const {
  data:convite,
  error:erroConvite
} =
  await supabaseAdmin.auth.admin.createUser(
    {
      email,

      password:senha,

      email_confirm:true,

      user_metadata:{
        full_name:nome,
        platform_role:cargo,
      }
    }
  );




    if(
      erroConvite ||
      !convite.user
    ){

      return NextResponse.json(
        {
          success:false,
          message:
            erroConvite?.message ||
            "Erro criando usuário."
        },
        {
          status:400
        }
      );

    }





    const novoUsuarioId =
      convite.user.id;





    const {
      error:erroPerfil
    } =
      await supabaseAdmin
        .from("profiles")
        .upsert(
          {

            id:
              novoUsuarioId,

            full_name:
              nome,

            email:
              email,

            platform_role:
              cargo,

            active:
              true,

          },
          {
            onConflict:"id"
          }
        );




    if(erroPerfil){


      await supabaseAdmin.auth.admin.deleteUser(
        novoUsuarioId
      );


      return NextResponse.json(
        {
          success:false,
          message:
            erroPerfil.message
        },
        {
          status:500
        }
      );

    }







    const {
      error:erroVinculo
    } =
      await supabaseAdmin
        .from("company_members")
        .insert({

          profile_id:
            novoUsuarioId,

          company_id:
            empresa,

          active:
            true,

        });





    if(erroVinculo){


      await supabaseAdmin.auth.admin.deleteUser(
        novoUsuarioId
      );


      return NextResponse.json(
        {
          success:false,
          message:
            erroVinculo.message
        },
        {
          status:500
        }
      );

    }






    return NextResponse.json(
      {
        success:true,
        message:
          "Usuário criado com sucesso."
      }
    );



  } catch(error){


    console.error(
      "ERRO CRIAR USUARIO:",
      error
    );


    return NextResponse.json(
      {
        success:false,
        message:
          "Erro interno."
      },
      {
        status:500
      }
    );


  }

}
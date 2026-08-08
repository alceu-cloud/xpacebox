import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


export async function POST(request: Request) {


  try {


    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;


    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;




    if (!supabaseUrl || !serviceKey) {


      return NextResponse.json(
        {
          success:false,
          message:"Configuração do Supabase ausente."
        },
        {
          status:500
        }
      );


    }




    const supabaseAdmin =
      createClient(
        supabaseUrl,
        serviceKey,
        {
          auth:{
            persistSession:false,
            autoRefreshToken:false,
          }
        }
      );





    const body =
      await request.json();



    const {
      id,
      nome,
      email,
      cargo,
      senha
    } = body;




    console.log(
      "DADOS RECEBIDOS:",
      {
        id,
        nome,
        email,
        cargo,
        possuiSenha: !!senha
      }
    );





    if (!id || !nome || !email) {


      return NextResponse.json(
        {
          success:false,
          message:
            "ID, nome e email são obrigatórios."
        },
        {
          status:400
        }
      );


    }







    // CONFIRMA USUÁRIO NO AUTH


    const {
      data: usuarioAuth,
      error: erroBuscaAuth
    } =
      await supabaseAdmin.auth.admin.getUserById(
        id
      );




    if (
      erroBuscaAuth ||
      !usuarioAuth.user
    ) {


      return NextResponse.json(
        {
          success:false,
          message:
            "Usuário não encontrado no Auth."
        },
        {
          status:400
        }
      );


    }







    // ATUALIZA AUTH


    const dadosAuth:any = {};



    if(
      usuarioAuth.user.email !== email
    ){

      dadosAuth.email = email;

      dadosAuth.email_confirm = true;

    }




    if(senha){

      dadosAuth.password = senha;

    }







    if(
      Object.keys(dadosAuth).length > 0
    ){


      const {
        error: erroAuth
      } =
        await supabaseAdmin.auth.admin.updateUserById(
          id,
          dadosAuth
        );



      console.log(
        "RESULTADO UPDATE AUTH:",
        erroAuth
      );



      if(erroAuth){


        return NextResponse.json(
          {
            success:false,
            message:
              erroAuth.message ||
              "Erro ao atualizar Auth."
          },
          {
            status:400
          }
        );


      }


    }







    // ATUALIZA PROFILE


    const {
      error: erroProfile
    } =
      await supabaseAdmin
        .from("profiles")
        .update({

          full_name:nome,

          platform_role:cargo,

        })
        .eq(
          "id",
          id
        );





    console.log(
      "RESULTADO UPDATE PROFILE:",
      erroProfile
    );





    if(erroProfile){


      return NextResponse.json(
        {
          success:false,
          message:
            erroProfile.message ||
            "Erro ao atualizar perfil."
        },
        {
          status:400
        }
      );


    }







    return NextResponse.json(
      {
        success:true,
        message:
          "Usuário atualizado com sucesso."
      }
    );





  } catch(error){



    console.error(
      "ERRO GERAL ATUALIZAR:",
      error
    );



    return NextResponse.json(
      {
        success:false,
        message:
          error instanceof Error
            ? error.message
            : "Erro desconhecido."
      },
      {
        status:500
      }
    );


  }


}
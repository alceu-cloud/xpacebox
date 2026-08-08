import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


export async function POST(request: Request) {

  try {


    const supabaseAdmin =
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth:{
            persistSession:false,
            autoRefreshToken:false,
          }
        }
      );



    const body =
      await request.json();



    const { id } = body;



    if(!id){

      return NextResponse.json(
        {
          success:false,
          message:"ID do usuário obrigatório."
        },
        {
          status:400
        }
      );

    }





    // 1 - remove vínculos com empresas

    const {
      error: erroEmpresas
    } =
      await supabaseAdmin
        .from("company_members")
        .delete()
        .eq(
          "profile_id",
          id
        );



    if(erroEmpresas){

      return NextResponse.json(
        {
          success:false,
          message:
            erroEmpresas.message
        },
        {
          status:400
        }
      );

    }





    // 2 - remove profile

    const {
      error: erroProfile
    } =
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq(
          "id",
          id
        );



    if(erroProfile){

      return NextResponse.json(
        {
          success:false,
          message:
            erroProfile.message
        },
        {
          status:400
        }
      );

    }






    // 3 - remove usuário do AUTH

    const {
      error: erroAuth
    } =
      await supabaseAdmin.auth.admin.deleteUser(
        id
      );



    if(erroAuth){

      return NextResponse.json(
        {
          success:false,
          message:
            erroAuth.message
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
          "Usuário excluído completamente."
      }
    );



  } catch(error){


    console.error(
      "ERRO EXCLUIR USUARIO:",
      error
    );


    return NextResponse.json(
      {
        success:false,
        message:"Erro interno."
      },
      {
        status:500
      }
    );


  }

}
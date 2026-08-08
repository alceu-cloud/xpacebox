import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


export async function GET() {

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




    // Busca usuários reais do sistema

    const {
      data:profiles,
      error:erroProfiles
    } =
      await supabaseAdmin
        .from("profiles")
        .select("id");



    if(erroProfiles){

      throw erroProfiles;

    }




    const ids =
      profiles.map(
        (item)=>item.id
      );




    const {
      data,
      error
    } =
      await supabaseAdmin.auth.admin.listUsers();



    if(error){

      throw error;

    }




    const usuarios =
      data.users
        .filter(
          (user)=>
            ids.includes(user.id)
        )
        .map(
          (user)=>({

            id:user.id,

            email:user.email ?? "",

          })
        );




    console.log(
      "EMAILS FILTRADOS:",
      usuarios
    );



    return NextResponse.json({

      success:true,

      usuarios,

    });



  } catch(error){


    console.error(
      "ERRO BUSCAR EMAILS:",
      error
    );



    return NextResponse.json(
      {
        success:false,
        message:"Erro ao buscar emails."
      },
      {
        status:500
      }
    );


  }

}
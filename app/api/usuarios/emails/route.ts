import { NextResponse } from "next/server";
import { createSupabaseAdmin, createSupabaseAuth } from "@/lib/server/supabase-admin";

export async function GET(request: Request) {

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "SESSÃO NÃO ENCONTRADA." }, { status: 401 });
    }

    const token = authorization.slice("Bearer ".length).trim();
    const auth = createSupabaseAuth();
    const { data: userData, error: userError } = await auth.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ success: false, message: "SESSÃO INVÁLIDA." }, { status: 401 });
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: caller, error: callerError } = await supabaseAdmin
      .from("profiles")
      .select("platform_role, active")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller?.active || caller.platform_role !== "platform_owner") {
      return NextResponse.json({ success: false, message: "SEM PERMISSÃO." }, { status: 403 });
    }




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




    return NextResponse.json({

      success:true,

      usuarios,

    }, { headers: { "Cache-Control": "private, no-store" } });



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

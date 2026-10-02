import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuth } from "@/lib/server/supabase-admin";
import {AccessError} from "@/lib/server/company-access";
import {userRoles,validateTeacherUser,saveTeacherUser} from "@/lib/server/teacher-user-admin";


export async function POST(request: Request) {


  try {

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Sessão não encontrada." }, { status: 401 });
    }


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

    const auth = createSupabaseAuth();
    const { data: callerData, error: callerError } = await auth.auth.getUser(authorization.slice("Bearer ".length).trim());
    if (callerError || !callerData.user) {
      return NextResponse.json({ success: false, message: "Sessão inválida." }, { status: 401 });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("platform_role, active")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (!callerProfile?.active || callerProfile.platform_role !== "platform_owner") {
      return NextResponse.json({ success: false, message: "Apenas administradores podem alterar usuários." }, { status: 403 });
    }





    const body =
      await request.json();



    const {
      id,
      nome,
      email,
      cargo,
      empresa,
      senha,instructorId,teacherActive
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







    if(!userRoles.includes(cargo))throw new AccessError("PERFIL INVÁLIDO.",400);
    if(teacherActive!==undefined&&typeof teacherActive!=="boolean")throw new AccessError("DADOS DE ACESSO INVÁLIDOS.",400);
    const previous=await supabaseAdmin.from("profiles").select("platform_role").eq("id",id).maybeSingle();
    if(previous.error)throw previous.error;
    if(cargo==="company_teacher")await validateTeacherUser(supabaseAdmin,empresa,instructorId,id);

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







    if(cargo==="company_teacher"||previous.data?.platform_role==="company_teacher"){
      await saveTeacherUser(supabaseAdmin,{actor:callerData.user.id,id,name:nome,email,role:cargo,company:empresa||null,instructor:cargo==="company_teacher"?instructorId:null,teacherActive:teacherActive!==false});
      return NextResponse.json({success:true,message:"Usuário atualizado com sucesso."});
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

    if (empresa && cargo !== 'company_teacher') {
      const { data: company, error: companyError } = await supabaseAdmin
        .from("companies")
        .select("id")
        .eq("id", empresa)
        .eq("active", true)
        .maybeSingle();
      if (companyError || !company) {
        return NextResponse.json({ success: false, message: "Empresa inválida." }, { status: 400 });
      }
      const { data: existingMembership } = await supabaseAdmin
        .from("company_members")
        .select("profile_id")
        .eq("profile_id", id)
        .eq("company_id", empresa)
        .maybeSingle();
      const membershipQuery = existingMembership
        ? supabaseAdmin.from("company_members").update({ active: true }).eq("profile_id", id).eq("company_id", empresa)
        : supabaseAdmin.from("company_members").insert({ profile_id: id, company_id: empresa, active: true });
      const { error: membershipError } = await membershipQuery;
      if (membershipError) {
        return NextResponse.json({ success: false, message: membershipError.message || "Erro ao vincular empresa." }, { status: 400 });
      }
    }







    return NextResponse.json(
      {
        success:true,
        message:
          "Usuário atualizado com sucesso."
      }
    );





  } catch(error){
    if(error instanceof AccessError)return NextResponse.json({success:false,message:error.message},{status:error.status});



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

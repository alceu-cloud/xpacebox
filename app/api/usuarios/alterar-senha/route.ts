import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuth } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        {
          success: false,
          message: "Configuracao do Supabase ausente.",
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ success: false, message: "Sessão não encontrada." }, { status: 401 });
    const auth = createSupabaseAuth();
    const { data: callerData, error: callerError } = await auth.auth.getUser(authorization.slice("Bearer ".length).trim());
    if (callerError || !callerData.user) return NextResponse.json({ success: false, message: "Sessão inválida." }, { status: 401 });
    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("platform_role,active").eq("id", callerData.user.id).maybeSingle();
    if (!callerProfile?.active || callerProfile.platform_role !== "platform_owner") return NextResponse.json({ success: false, message: "Apenas administradores podem alterar senhas." }, { status: 403 });

    const { id, senha } = await request.json();

    if (!id || !senha) {
      return NextResponse.json(
        {
          success: false,
          message: "Usuario e senha sao obrigatorios.",
        },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: senha,
    });

    if (error) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Senha alterada com sucesso.",
    });
  } catch (error) {
    console.error("ERRO ALTERAR SENHA:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      { status: 500 }
    );
  }
}

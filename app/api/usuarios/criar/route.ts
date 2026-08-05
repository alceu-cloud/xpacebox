import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CriarUsuarioBody = {
  nome?: string;
  email?: string;
  empresa?: string;
  cargo?: string;
};

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        {
          success: false,
          message: "As variáveis do Supabase não estão configuradas.",
        },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          success: false,
          message: "Sessão não encontrada.",
        },
        { status: 401 }
      );
    }

    const accessToken = authorization.replace("Bearer ", "").trim();

    const supabaseAuth = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: { user: usuarioLogado },
      error: erroSessao,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (erroSessao || !usuarioLogado) {
      return NextResponse.json(
        {
          success: false,
          message: "Sessão inválida ou expirada.",
        },
        { status: 401 }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const { data: perfilAdministrador, error: erroPerfil } =
      await supabaseAdmin
        .from("profiles")
        .select("platform_role, active")
        .eq("id", usuarioLogado.id)
        .single();

    if (
      erroPerfil ||
      !perfilAdministrador ||
      perfilAdministrador.platform_role !== "platform_owner" ||
      perfilAdministrador.active !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Você não possui permissão para cadastrar usuários.",
        },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CriarUsuarioBody;

    const nome = body.nome?.trim();
    const email = body.email?.trim().toLowerCase();
    const empresa = body.empresa?.trim();
    const cargo = body.cargo?.trim() || "company_user";

    if (!nome || !email || !empresa) {
      return NextResponse.json(
        {
          success: false,
          message: "Preencha nome, e-mail e empresa.",
        },
        { status: 400 }
      );
    }

    const cargosPermitidos = [
      "company_user",
      "company_manager",
      "platform_owner",
    ];

    if (!cargosPermitidos.includes(cargo)) {
      return NextResponse.json(
        {
          success: false,
          message: "Perfil de usuário inválido.",
        },
        { status: 400 }
      );
    }

    const origem = request.headers.get("origin");
    const redirectTo = origem ? `${origem}/login` : undefined;

    const { data: convite, error: erroConvite } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          full_name: nome,
          platform_role: cargo,
        },
      });

    if (erroConvite || !convite.user) {
      return NextResponse.json(
        {
          success: false,
          message:
            erroConvite?.message ||
            "Não foi possível criar o usuário.",
        },
        { status: 400 }
      );
    }

    const novoUsuarioId = convite.user.id;

    const { error: erroSalvarPerfil } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: novoUsuarioId,
          full_name: nome,
          platform_role: cargo,
          active: true,
        },
        {
          onConflict: "id",
        }
      );

    if (erroSalvarPerfil) {
      await supabaseAdmin.auth.admin.deleteUser(novoUsuarioId);

      return NextResponse.json(
        {
          success: false,
          message: `Erro ao salvar o perfil: ${erroSalvarPerfil.message}`,
        },
        { status: 500 }
      );
    }

    const { data: vinculoExistente, error: erroConsultaVinculo } =
      await supabaseAdmin
        .from("company_members")
        .select("company_id")
        .eq("profile_id", novoUsuarioId)
        .eq("company_id", empresa)
        .maybeSingle();

    if (erroConsultaVinculo) {
      await supabaseAdmin.auth.admin.deleteUser(novoUsuarioId);

      return NextResponse.json(
        {
          success: false,
          message: `Erro ao consultar a empresa: ${erroConsultaVinculo.message}`,
        },
        { status: 500 }
      );
    }

    if (!vinculoExistente) {
      const { error: erroVinculo } = await supabaseAdmin
        .from("company_members")
        .insert({
          profile_id: novoUsuarioId,
          company_id: empresa,
          active: true,
        });

      if (erroVinculo) {
        await supabaseAdmin.auth.admin.deleteUser(novoUsuarioId);

        return NextResponse.json(
          {
            success: false,
            message: `Erro ao vincular a empresa: ${erroVinculo.message}`,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Usuário criado. O convite para definir a senha foi enviado por e-mail.",
    });
  } catch (error) {
    console.error("Erro ao criar usuário:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Erro interno ao cadastrar o usuário.",
      },
      { status: 500 }
    );
  }
}
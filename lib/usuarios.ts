import { supabase } from "./supabase";


export async function carregarUsuarios() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, platform_role, active")
    .order("full_name");

  if (error) {
    throw error;
  }

  return data ?? [];
}


export async function carregarEmpresas() {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("active", true)
    .order("name");

  if (error) {
    throw error;
  }

  return data ?? [];
}


export async function obterUsuarioLogado() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}


export async function criarUsuario(
  accessToken: string,
  nome: string,
  email: string,
  empresa: string,
  cargo: string
) {
  const response = await fetch(
    "/api/usuarios/criar",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        nome,
        email,
        empresa,
        cargo,
      }),
    }
  );

  return response.json();
}


export async function atualizarUsuario(
  id: string,
  nome: string,
  cargo: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: nome,
      platform_role: cargo,
    })
    .eq("id", id)
    .select();

  if (error) {
    throw error;
  }

  return data;
}


export async function excluirUsuario(id: string) {
  const { data, error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", id)
    .select();


  if (error) {
    throw error;
  }


  return data;
}
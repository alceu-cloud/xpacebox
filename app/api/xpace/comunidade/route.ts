import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";

const companySlug = "xpace";

type PersonInput = { cpf?: string; fullName?: string; mobile?: string; birthDate?: string; email?: string; gender?: string; whatsappOptIn?: boolean; postalCode?: string; street?: string; streetNumber?: string; complement?: string; district?: string; city?: string; state?: string };
type CommunityRequest = { student?: PersonInput; guardian?: { id?: string; person?: PersonInput } };

export async function GET(request: Request) {
  try {
    const { admin, company } = await requireCompanyAccess(request, companySlug);
    const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("pt-BR") ?? "";
    const { data: rows, error } = await admin.from("xpace_people").select("id,person_number,cpf,full_name,mobile,birth_date,email,gender,is_student,whatsapp_opt_in,city,state").eq("tenant_company_id", company.id).eq("active", true).order("full_name").limit(250);
    if (error) throw error;
    const people = (rows ?? []).filter((person) => matchesSearch(person, query));
    const studentIds = people.filter((person) => person.is_student).map((person) => person.id);
    const { data: links, error: linksError } = studentIds.length ? await admin.from("xpace_guardianships").select("student_id,guardian_id").eq("tenant_company_id", company.id).in("student_id", studentIds) : { data: [], error: null };
    if (linksError) throw linksError;
    const guardianIds = [...new Set((links ?? []).map((link) => link.guardian_id))];
    const { data: guardians, error: guardiansError } = guardianIds.length ? await admin.from("xpace_people").select("id,full_name,cpf,mobile").eq("tenant_company_id", company.id).in("id", guardianIds) : { data: [], error: null };
    if (guardiansError) throw guardiansError;
    const guardiansById = new Map((guardians ?? []).map((person) => [person.id, person]));
    const guardiansByStudent = new Map<string, Array<{ id: string; name: string; cpfMasked: string; mobile: string }>>();
    for (const link of links ?? []) {
      const guardian = guardiansById.get(link.guardian_id);
      if (!guardian) continue;
      const current = guardiansByStudent.get(link.student_id) ?? [];
      current.push({ id: guardian.id, name: guardian.full_name, cpfMasked: maskCpf(guardian.cpf), mobile: guardian.mobile ?? "" });
      guardiansByStudent.set(link.student_id, current);
    }
    return NextResponse.json({ success: true, people: people.map((person) => ({ id: person.id, personNumber: person.person_number, name: person.full_name, cpfMasked: maskCpf(person.cpf), mobile: person.mobile ?? "", birthDate: person.birth_date ?? "", email: person.email ?? "", gender: person.gender, isStudent: person.is_student, whatsappOptIn: person.whatsapp_opt_in, city: person.city ?? "", state: person.state ?? "", guardians: guardiansByStudent.get(person.id) ?? [] })) });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CommunityRequest;
    const student = normalizePerson(body.student);
    validatePerson(student, "ALUNO");
    const { admin, company, user } = await requireCompanyAccess(request, companySlug);
    const minor = isMinor(student.birthDate);
    if (minor && !body.guardian?.id && !body.guardian?.person) throw new RequestError("INFORME O RESPONSAVEL DO ALUNO MENOR DE IDADE.", 400);
    let guardianId = "";
    if (body.guardian?.id) {
      const { data: guardian, error } = await admin.from("xpace_people").select("id").eq("id", body.guardian.id).eq("tenant_company_id", company.id).eq("active", true).maybeSingle();
      if (error) throw error;
      if (!guardian) throw new RequestError("RESPONSAVEL NAO ENCONTRADO NA COMUNIDADE.", 404);
      guardianId = guardian.id;
    } else if (body.guardian?.person) {
      const guardian = normalizePerson(body.guardian.person);
      validatePerson(guardian, "RESPONSAVEL");
      const { data, error } = await admin.from("xpace_people").insert({ ...toDatabase(guardian), tenant_company_id: company.id, is_student: false, created_by: user.id }).select("id").single();
      if (error) throw error;
      guardianId = data.id;
    }
    const { data: saved, error: savedError } = await admin.from("xpace_people").insert({ ...toDatabase(student), tenant_company_id: company.id, is_student: true, created_by: user.id }).select("id,person_number,full_name").single();
    if (savedError) throw savedError;
    if (guardianId) {
      const { error } = await admin.from("xpace_guardianships").insert({ tenant_company_id: company.id, student_id: saved.id, guardian_id: guardianId, created_by: user.id });
      if (error) throw error;
    }
    return NextResponse.json({ success: true, person: { id: saved.id, personNumber: saved.person_number, name: saved.full_name } }, { status: 201 });
  } catch (error) { return handleError(error); }
}

function normalizePerson(value?: PersonInput) {
  const person = value ?? {};
  return { cpf: digits(person.cpf ?? ""), fullName: (person.fullName ?? "").trim().replace(/\s+/g, " "), mobile: digits(person.mobile ?? ""), birthDate: (person.birthDate ?? "").trim(), email: (person.email ?? "").trim().toLowerCase(), gender: normalizeGender(person.gender), whatsappOptIn: Boolean(person.whatsappOptIn), postalCode: digits(person.postalCode ?? ""), street: (person.street ?? "").trim(), streetNumber: (person.streetNumber ?? "").trim(), complement: (person.complement ?? "").trim(), district: (person.district ?? "").trim(), city: (person.city ?? "").trim(), state: (person.state ?? "").trim().toUpperCase() };
}

function validatePerson(person: ReturnType<typeof normalizePerson>, label: string) {
  if (!person.fullName || !person.cpf || !person.birthDate) throw new RequestError(`PREENCHA CPF, NOME E DATA DE NASCIMENTO DO ${label}.`, 400);
  if (!isCpf(person.cpf)) throw new RequestError(`CPF DO ${label} INVALIDO.`, 400);
  if (Number.isNaN(Date.parse(`${person.birthDate}T12:00:00`))) throw new RequestError(`DATA DE NASCIMENTO DO ${label} INVALIDA.`, 400);
  if (person.email && !/^\S+@\S+\.\S+$/.test(person.email)) throw new RequestError(`E-MAIL DO ${label} INVALIDO.`, 400);
}

function toDatabase(person: ReturnType<typeof normalizePerson>) {
  return { cpf: person.cpf, full_name: person.fullName, mobile: person.mobile || null, birth_date: person.birthDate, email: person.email || null, gender: person.gender, whatsapp_opt_in: person.whatsappOptIn, whatsapp_opt_in_at: person.whatsappOptIn ? new Date().toISOString() : null, postal_code: person.postalCode || null, street: person.street || null, street_number: person.streetNumber || null, complement: person.complement || null, district: person.district || null, city: person.city || null, state: person.state || null };
}

function isMinor(date: string) { const birth = new Date(`${date}T12:00:00`); const today = new Date(); let age = today.getFullYear() - birth.getFullYear(); const month = today.getMonth() - birth.getMonth(); if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1; return age < 18; }
function matchesSearch(person: Record<string, unknown>, query: string) { if (!query) return true; const text = `${person.full_name ?? ""} ${person.cpf ?? ""} ${person.mobile ?? ""}`.toLocaleLowerCase("pt-BR"); return text.includes(query.replace(/\D/g, "") || query); }
function normalizeGender(value?: string) { return ["FEMININO", "MASCULINO", "NAO_BINARIO", "PREFIRO_NAO_INFORMAR"].includes(value ?? "") ? value : "NAO_INFORMADO"; }
function isCpf(cpf: string) { if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false; const digit = (length: number) => { const total = cpf.slice(0, length).split("").reduce((sum, value, index) => sum + Number(value) * (length + 1 - index), 0); const result = (total * 10) % 11; return result === 10 ? 0 : result; }; return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]); }
function maskCpf(cpf: string | null) { const value = digits(cpf ?? ""); return value ? `***.***.***-${value.slice(-2)}` : "NAO INFORMADO"; }
function digits(value: string) { return value.replace(/\D/g, ""); }
class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
function handleError(error: unknown) { if (error instanceof AccessError || error instanceof RequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status }); const code = (error as { code?: string })?.code; if (code === "23505") return NextResponse.json({ success: false, message: "JA EXISTE UMA PESSOA COM ESTE CPF NA XPACE." }, { status: 409 }); console.error("XPACE COMMUNITY ERROR", error); return NextResponse.json({ success: false, message: "NAO FOI POSSIVEL SALVAR A PESSOA." }, { status: 500 }); }

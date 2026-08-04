"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type Company = {
  id: string;
  name: string;
  slug: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarEmpresas();
  }, []);

  async function carregarEmpresas() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("active", true)
      .order("name");

    if (error) {
      console.error(error);
    }

    setCompanies(data ?? []);
    setLoading(false);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 40,
        background: "#0f172a",
        color: "#fff",
        fontFamily: "Arial",
      }}
    >
      <h1>Central XPACEBOX</h1>
      <p>Escolha uma área ou empresa.</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
          marginTop: 40,
        }}
      >
        <button
          onClick={() => router.push("/usuarios")}
          style={{
            padding: 35,
            borderRadius: 16,
            cursor: "pointer",
            fontSize: 20,
          }}
        >
          👥 Usuários
        </button>

        {loading ? (
          <div>Carregando empresas...</div>
        ) : (
          companies.map((company) => (
            <button
              key={company.id}
              onClick={() => router.push(`/empresa/${company.slug}`)}
              style={{
                padding: 35,
                borderRadius: 16,
                cursor: "pointer",
                fontSize: 20,
              }}
            >
              🏢 {company.name}
            </button>
          ))
        )}

        <button
          style={{
            padding: 35,
            borderRadius: 16,
            cursor: "pointer",
            fontSize: 20,
          }}
        >
          ➕ Nova empresa
        </button>
      </div>
    </main>
  );
}
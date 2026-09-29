// Source: Graficos de Acompanhamento 2026.xlsx, inspected 2026-09-29.
// Manual monthly values only. Never use these as contracts, payments or customer records.
export type HistoryMonth = {
  month: string; active: number | null; newClients: number | null; churn: number | null;
  revenueCents: number | null; ticketCents: number | null;
  activeGoal: number; newGoal: number; churnGoal: number; equilibriumCents: number; ticketGoalCents: number;
};
const active = [85, 120, 144, 147, 165, 171, 161, 172];
const newClients = [17, 37, 19, 19, 29, 21, 8, 26];
const churn = [19, 12, 12, 8, 11, 10, 11];
const revenueCents = [1541200, 1925500, 2484200, 2320800, 2305000, 2530600, 2486300];
const ticketCents = [17700, 17100, 16600, 14800, 14000, 14000, 13600];
const activeGoals = [130, 130, 130, 150, 150, 150, 150, 160, 160, 160, 140, 140];
export const reportHistory2026: HistoryMonth[] = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, "0")}`,
  active: active[i] ?? null, newClients: newClients[i] ?? null, churn: churn[i] ?? null,
  revenueCents: revenueCents[i] ?? null, ticketCents: ticketCents[i] ?? null,
  activeGoal: activeGoals[i], newGoal: 15, churnGoal: 5, equilibriumCents: 2400000, ticketGoalCents: 19000,
}));
export const historySources = [{ name: "Instagram", count: 20 }, { name: "Indicação", count: 11 }, { name: "Cliente antigo", count: 5 }, { name: "Google", count: 4 }, { name: "Site", count: 0 }, { name: "Wellhub", count: 0 }];
export const historyDestinations = [{ name: "Sem tempo", count: 33 }, { name: "Não estava gostando", count: 17 }, { name: "Renovou", count: 9 }, { name: "Trocou de aula", count: 3 }, { name: "Sem motivo", count: 7 }, { name: "Renda", count: 12 }];
export const historySource = { file: "Graficos de Acompanhamento 2026.xlsx", inspectedOn: "2026-09-29", sheets: ["Contratos Encerrados", "Origem e Destino", "Fat Equilibrio", "Ticket Médio"] };

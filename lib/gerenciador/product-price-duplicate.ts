import type { ProductFicha, ProductPriceSnapshot } from "@/types/gerenciador";

const priceSnapshotMetadata = new Set(["id", "createdAt", "source", "contributionSource"]);

function normalizeSnapshotValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
  }
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(normalizeSnapshotValue).sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second), "pt-BR"));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([first], [second]) => first.localeCompare(second, "pt-BR"))
        .map(([key, entry]) => [key, normalizeSnapshotValue(entry)]),
    );
  }
  return value ?? "";
}

export function productPriceSnapshotSignature(snapshot: ProductPriceSnapshot) {
  const comparable = Object.fromEntries(
    Object.entries(snapshot as unknown as Record<string, unknown>)
      .filter(([key]) => !priceSnapshotMetadata.has(key)),
  );
  return JSON.stringify(normalizeSnapshotValue(comparable));
}

export function productFichaPriceSnapshots(ficha: ProductFicha) {
  const snapshots = [ficha.pricingData, ...(ficha.priceHistory ?? [])].filter((item): item is ProductPriceSnapshot => Boolean(item));
  return [...new Map(snapshots.map((item) => [item.id, item])).values()];
}

export function findMatchingProductPriceSnapshot(snapshots: ProductPriceSnapshot[], candidate: ProductPriceSnapshot) {
  const signature = productPriceSnapshotSignature(candidate);
  return snapshots.find((item) => productPriceSnapshotSignature(item) === signature);
}

export function findNewDuplicateProductPriceSnapshot(previous: ProductFicha[], next: ProductFicha[]) {
  const previousByFichaId = new Map(previous.map((item) => [item.id, item]));
  for (const ficha of next) {
    const previousSnapshots = productFichaPriceSnapshots(previousByFichaId.get(ficha.id) ?? { ...ficha, pricingData: undefined, priceHistory: [] });
    const previousSnapshotIds = new Set(previousSnapshots.map((item) => item.id));
    const newSnapshots = productFichaPriceSnapshots(ficha).filter((item) => !previousSnapshotIds.has(item.id));
    for (const snapshot of newSnapshots) {
      const matchingSnapshot = findMatchingProductPriceSnapshot(previousSnapshots, snapshot);
      if (matchingSnapshot) return { ficha, snapshot, matchingSnapshot };
    }
  }
  return undefined;
}

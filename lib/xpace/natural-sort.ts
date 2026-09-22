export function naturalCompare(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortNaturally<T>(items: readonly T[], getLabel: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => naturalCompare(getLabel(left), getLabel(right)));
}

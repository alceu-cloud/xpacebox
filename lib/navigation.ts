// In-page modules have no URL change. Keep their actual visited path separately.
export function pushScreen<T>(trail: T[], next: T): T[] {
  return trail.at(-1) === next ? trail : [...trail, next];
}
export function popScreen<T>(trail: T[]): T[] {
  return trail.length > 1 ? trail.slice(0, -1) : trail;
}

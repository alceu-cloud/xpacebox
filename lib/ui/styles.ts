// Shared geometry only. Module-specific and calculated colors stay with their owners.
export const ui = {
  field: { minHeight: 44, borderRadius: "var(--xb-radius-field)", padding: "0 14px", fontSize: 14, fontWeight: 600, maxWidth: "100%", minWidth: 0, boxShadow: "none", letterSpacing: 0 },
  button: { minHeight: 42, borderRadius: "var(--xb-radius-button)", padding: "10px 18px", fontSize: 12, fontWeight: 700, maxWidth: "100%", whiteSpace: "normal" as const, letterSpacing: 0, boxShadow: "none" },
  tab: { minHeight: 44, borderRadius: "var(--xb-radius-button)", padding: "10px 14px", fontSize: 12, fontWeight: 700, minWidth: 0, letterSpacing: 0, boxShadow: "none" },
  tabs: { padding: 5, gap: 5, borderRadius: 24, border: "1px solid var(--xb-line)", background: "var(--xb-surface-soft)", boxShadow: "none" },
  section: { padding: "var(--xb-section-padding)", border: 0, borderTop: "1px solid var(--xb-line)", borderRadius: 0, background: "transparent", boxShadow: "none", minWidth: 0 },
  frame: { padding: "var(--xb-panel-padding)", border: "1px solid var(--xb-line)", borderRadius: "var(--xb-radius-card)", background: "var(--xb-surface)", boxShadow: "none", minWidth: 0 },
  title: { fontSize: 24, lineHeight: 1.25, letterSpacing: 0 },
  label: { fontSize: 12, fontWeight: 700, letterSpacing: 0 },
  shell: { width: "100%", minWidth: 0, maxWidth: "none", padding: 0, border: 0, borderRadius: 0, background: "transparent", boxShadow: "none" },
};

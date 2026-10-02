-- Trigger-only helper: never callable directly by application/browser roles.
revoke all on function private.enforce_xpace_trial_lesson_limit() from public, anon, authenticated, service_role;

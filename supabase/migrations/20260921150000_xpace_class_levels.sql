-- The class level belongs to the grade, so it can be filtered and reported
-- independently from the modality and individual schedule slots.
alter table public.xpace_class_groups
  add column if not exists class_level text not null default 'INICIANTE';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'xpace_class_groups_class_level_check'
      and conrelid = 'public.xpace_class_groups'::regclass
  ) then
    alter table public.xpace_class_groups
      add constraint xpace_class_groups_class_level_check
      check (class_level in ('INICIANTE', 'INICIANTE_INTERMEDIARIO', 'INTERMEDIARIO', 'AVANCADO'));
  end if;
end $$;

-- The existing XPACE class is explicitly beginner. The default also keeps
-- older grades visible in the public booking page until each one is reviewed.
update public.xpace_class_groups
set class_level = 'INICIANTE'
where class_level is null;

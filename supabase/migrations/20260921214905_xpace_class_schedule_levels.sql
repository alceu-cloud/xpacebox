alter table public.xpace_class_schedules
  add column if not exists class_level text;

update public.xpace_class_schedules as schedule
set class_level = coalesce(grade.class_level, 'INICIANTE')
from public.xpace_class_groups as grade
where grade.id = schedule.class_group_id
  and schedule.class_level is null;

alter table public.xpace_class_schedules
  alter column class_level set default 'INICIANTE',
  alter column class_level set not null;

alter table public.xpace_class_schedules
  drop constraint if exists xpace_class_schedules_class_level_check;

alter table public.xpace_class_schedules
  add constraint xpace_class_schedules_class_level_check
  check (class_level in ('INICIANTE', 'INICIANTE_INTERMEDIARIO', 'INTERMEDIARIO', 'AVANCADO'));

alter table public.xpace_class_schedules
  add column if not exists age_group text;

update public.xpace_class_schedules
set age_group = 'ADULTO'
where age_group is null;

alter table public.xpace_class_schedules
  alter column age_group set default 'ADULTO',
  alter column age_group set not null;

alter table public.xpace_class_schedules
  drop constraint if exists xpace_class_schedules_age_group_check;

alter table public.xpace_class_schedules
  add constraint xpace_class_schedules_age_group_check
  check (age_group in ('BABY', 'KIDS', 'TEENS', 'ADULTO'));

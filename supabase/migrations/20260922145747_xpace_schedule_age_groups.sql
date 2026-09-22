-- A schedule may welcome more than one audience. Keep age_group as the
-- backwards-compatible primary audience while age_groups carries the complete
-- selection used by the agenda and public trial booking.
alter table public.xpace_class_schedules
  add column if not exists age_groups text[];

update public.xpace_class_schedules
set age_groups = array[age_group]
where age_groups is null or cardinality(age_groups) = 0;

alter table public.xpace_class_schedules
  alter column age_groups set default array['ADULTO']::text[],
  alter column age_groups set not null;

alter table public.xpace_class_schedules
  drop constraint if exists xpace_class_schedules_age_groups_check;

alter table public.xpace_class_schedules
  add constraint xpace_class_schedules_age_groups_check
  check (
    cardinality(age_groups) between 1 and 4
    and age_groups <@ array['BABY', 'KIDS', 'TEENS', 'ADULTO']::text[]
    and array_position(age_groups, null) is null
  );

alter table public.xpace_class_schedules
  add column if not exists color text;

update public.xpace_class_schedules
set color = '#7435D9'
where color is null;

alter table public.xpace_class_schedules
  alter column color set default '#7435D9',
  alter column color set not null;

alter table public.xpace_class_schedules
  add constraint xpace_class_schedules_color_format_check
  check (color ~ '^#[0-9A-Fa-f]{6}$');

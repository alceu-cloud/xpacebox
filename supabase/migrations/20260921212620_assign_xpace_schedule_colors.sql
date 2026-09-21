with palette(colors) as (
  values (array[
    '#7435D9', '#C02EB7', '#EC6FAE', '#ED8A3A', '#D9B42F',
    '#4FA34C', '#149C91', '#238BC8', '#3D5FCE', '#8A4DCD'
  ]::text[])
), ranked as (
  select id,
    (dense_rank() over (order by room_id, starts_at, ends_at) - 1) % 10 + 1 as color_index
  from public.xpace_class_schedules
)
update public.xpace_class_schedules as schedule
set color = palette.colors[ranked.color_index]
from ranked
cross join palette
where schedule.id = ranked.id;

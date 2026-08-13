-- Social Duo 3:
-- Expose partner week-start preference for accurate recurring period anchors.

insert into public.partner_profile_fields (field, is_exposed)
values ('week_starts_on', true)
on conflict (field) do update
set
  is_exposed = excluded.is_exposed,
  updated_at = pg_catalog.now();

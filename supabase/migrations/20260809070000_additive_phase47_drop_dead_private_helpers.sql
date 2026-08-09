-- Additive Phase 47:
-- Drop private planner helper functions that became unreachable after
-- execution-plan surface teardown and planner write-boundary cutover.

drop function if exists private.validate_planner_json(jsonb, text, integer, integer);
drop function if exists private.planner_json_depth(jsonb);
drop function if exists private.local_today_for_timezone(text);
drop function if exists private.is_valid_planner_timezone(text);

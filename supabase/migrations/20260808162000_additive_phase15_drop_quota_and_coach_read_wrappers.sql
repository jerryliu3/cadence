-- Additive Phase 15:
-- Remove passthrough AI quota and coach-read service wrappers
-- now that runtime callers use public surfaces directly.

drop function if exists public.consume_planner_ai_quota_service(
  uuid,
  text,
  integer,
  bigint
);

drop function if exists public.record_planner_ai_output_tokens_service(
  uuid,
  date,
  text,
  bigint
);

drop function if exists public.record_planner_ai_output_tokens_service(
  uuid,
  text,
  text,
  bigint
);

drop function if exists public.list_planner_coach_conversations_service(
  uuid,
  text,
  integer
);

drop function if exists public.get_planner_coach_conversation_service(
  uuid,
  uuid
);

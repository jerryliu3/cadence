-- Additive Phase 13:
-- Remove legacy private cutover surfaces after public runtime cutover.

drop function if exists private.save_planner_coach_conversation(
  uuid,
  text,
  text,
  jsonb,
  text
);
drop function if exists private.list_planner_coach_conversations(
  uuid,
  text,
  integer
);
drop function if exists private.get_planner_coach_conversation(
  uuid,
  uuid
);

drop table if exists private.planner_coach_conversation_messages;
drop table if exists private.planner_coach_conversations;

drop function if exists private.consume_planner_ai_quota(
  uuid,
  text,
  integer,
  bigint
);
drop function if exists private.record_planner_ai_output_tokens(
  uuid,
  date,
  text,
  bigint
);
drop function if exists private.record_planner_ai_output_tokens(
  uuid,
  text,
  bigint
);

drop table if exists private.planner_ai_usage_daily;

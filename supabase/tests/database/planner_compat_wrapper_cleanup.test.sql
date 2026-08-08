begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(12);

select is(
  to_regprocedure(
    'public.upsert_planner_preferences_service(uuid,text,jsonb,text,text,timestamptz)'
  ),
  null::regprocedure,
  'planner preferences service wrapper remains dropped'
);

select is(
  to_regprocedure('public.consume_planner_ai_quota_service(uuid,text,integer,bigint)'),
  null::regprocedure,
  'quota consume service wrapper remains dropped'
);

select is(
  to_regprocedure(
    'public.record_planner_ai_output_tokens_service(uuid,date,text,bigint)'
  ),
  null::regprocedure,
  'quota output-token service wrapper overload (date) remains dropped'
);

select is(
  to_regprocedure(
    'public.record_planner_ai_output_tokens_service(uuid,text,text,bigint)'
  ),
  null::regprocedure,
  'quota output-token service wrapper overload (text) remains dropped'
);

select is(
  to_regprocedure('public.list_planner_coach_conversations_service(uuid,text,integer)'),
  null::regprocedure,
  'coach conversation list wrapper remains dropped'
);

select is(
  to_regprocedure('public.get_planner_coach_conversation_service(uuid,uuid)'),
  null::regprocedure,
  'coach conversation read wrapper remains dropped'
);

select is(
  to_regprocedure('public.save_planner_coach_conversation_service(uuid,text,text,jsonb,text)'),
  null::regprocedure,
  'coach conversation save wrapper remains dropped'
);

select is(
  to_regprocedure(
    'public.move_execution_plan_item_service(uuid,uuid,date,bigint,bigint,bigint)'
  ),
  null::regprocedure,
  'legacy planner move wrapper remains dropped'
);

select is(
  to_regprocedure('private.bump_canonical_for_preferences()'),
  null::regprocedure,
  'legacy planner preference canonical revision helper remains dropped'
);

select is(
  to_regclass('public.completion_backfill_log'),
  null::regclass,
  'legacy completion backfill log table remains dropped'
);

select is(
  to_regprocedure('private.apply_publish_eligibility_mode_override()'),
  null::regprocedure,
  'publish eligibility trigger helper remains dropped'
);

select is(
  to_regprocedure(
    'public.publish_execution_plan_service(uuid,date,text,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,text,bigint,bigint,uuid,integer,jsonb,jsonb,jsonb,jsonb)'
  ),
  null::regprocedure,
  'legacy 28-argument publish overload remains dropped'
);

select * from finish();
rollback;

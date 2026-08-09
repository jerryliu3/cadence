begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions, pg_catalog;
select plan(33);

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

select ok(
  to_regprocedure('public.save_planner_coach_conversation_service(text,text,text,text,jsonb)') is not null,
  'coach conversation save wrapper remains available for authenticated clients'
);

select is(
  to_regprocedure(
    'public.move_execution_plan_item_service(uuid,uuid,date,bigint,bigint,bigint)'
  ),
  null::regprocedure,
  'legacy planner move wrapper remains dropped'
);

select is(
  to_regprocedure('public.sync_planner_items_from_active_execution_plan_service(uuid)'),
  null::regprocedure,
  'legacy planner-items runtime sync wrapper remains dropped'
);

select is(
  to_regprocedure(
    'public.set_execution_plan_goal_date_fact_service(uuid,uuid,date,text,bigint,bigint)'
  ),
  null::regprocedure,
  'legacy planner goal date-fact wrapper remains dropped'
);

select is(
  to_regprocedure(
    'public.set_execution_plan_item_date_fact_service(uuid,uuid,text,jsonb,bigint,bigint,bigint)'
  ),
  null::regprocedure,
  'legacy planner item date-fact wrapper remains dropped'
);

select is(
  to_regprocedure('public.set_planner_item_lock(uuid,boolean)'),
  null::regprocedure,
  'legacy planner lock compatibility overload remains dropped'
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

select is(
  to_regprocedure('public.get_planner_state()'),
  null::regprocedure,
  'legacy planner state read helper remains dropped'
);

select is(
  to_regprocedure(
    'public.dismiss_execution_plan_service(uuid,uuid,bigint,bigint)'
  ),
  null::regprocedure,
  'legacy planner dismiss service remains dropped'
);

select is(
  to_regprocedure(
    'public.set_execution_plan_item_lock_service(uuid,uuid,boolean,bigint,bigint,bigint)'
  ),
  null::regprocedure,
  'legacy planner lock service remains dropped'
);

select is(
  to_regprocedure(
    'public.publish_execution_plan_service(uuid,date,text,text,text,jsonb,jsonb,text,text,text,text,text,text,text,text,text,text,boolean,boolean,uuid,text,bigint,bigint,uuid,integer,jsonb,jsonb,jsonb,jsonb)'
  ),
  null::regprocedure,
  'legacy planner publish service remains dropped'
);

select is(
  to_regclass('public.execution_plans'),
  null::regclass,
  'execution_plans table remains dropped'
);

select is(
  to_regclass('public.execution_plan_goals'),
  null::regclass,
  'execution_plan_goals table remains dropped'
);

select is(
  to_regclass('public.execution_plan_days'),
  null::regclass,
  'execution_plan_days table remains dropped'
);

select is(
  to_regclass('public.execution_plan_items'),
  null::regclass,
  'execution_plan_items table remains dropped'
);

select is(
  to_regclass('public.execution_plan_issues'),
  null::regclass,
  'execution_plan_issues table remains dropped'
);

select is(
  to_regclass('private.planner_state'),
  null::regclass,
  'private planner_state table remains dropped'
);

select is(
  to_regprocedure('private.ensure_planner_state(uuid)'),
  null::regprocedure,
  'planner-state initialization helper remains dropped'
);

select is(
  to_regprocedure('private.bump_planner_canonical_revision(uuid)'),
  null::regprocedure,
  'planner canonical revision helper remains dropped'
);

select is(
  to_regprocedure('private.require_planner_state_revisions(uuid,bigint,bigint)'),
  null::regprocedure,
  'planner revision guard helper remains dropped'
);

select is(
  to_regprocedure('private.guard_execution_plan()'),
  null::regprocedure,
  'execution plan guard helper remains dropped'
);

select is(
  to_regprocedure('private.guard_execution_plan_goal()'),
  null::regprocedure,
  'execution plan goal guard helper remains dropped'
);

select is(
  to_regprocedure('private.guard_execution_plan_item()'),
  null::regprocedure,
  'execution plan item guard helper remains dropped'
);

select is(
  to_regprocedure('private.supersede_elapsed_active_execution_plans()'),
  null::regprocedure,
  'elapsed active execution-plan supersede helper remains dropped'
);

select * from finish();
rollback;

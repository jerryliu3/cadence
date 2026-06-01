create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create type public.goal_frequency_type as enum ('one_time', 'fixed_milestones', 'recurring');
create type public.recurrence_interval as enum ('daily', 'weekly', 'monthly');
create type public.completion_source as enum ('manual', 'linked_cascade');
create type public.participant_role as enum ('owner', 'participant');

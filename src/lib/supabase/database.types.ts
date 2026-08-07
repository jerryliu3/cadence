export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  private: {
    Tables: {
      planner_ai_usage_daily: {
        Row: {
          created_at: string
          feature: string
          input_tokens: number
          output_tokens: number
          owner_id: string
          request_count: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          created_at?: string
          feature: string
          input_tokens?: number
          output_tokens?: number
          owner_id: string
          request_count?: number
          updated_at?: string
          usage_date: string
        }
        Update: {
          created_at?: string
          feature?: string
          input_tokens?: number
          output_tokens?: number
          owner_id?: string
          request_count?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      planner_coach_conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: number
          ordinal: number
          owner_id: string
          proposal_meta: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: never
          ordinal: number
          owner_id: string
          proposal_meta?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: never
          ordinal?: number
          owner_id?: string
          proposal_meta?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_coach_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "planner_coach_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_coach_conversations: {
        Row: {
          created_at: string
          id: string
          message_count: number
          owner_id: string
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_count: number
          owner_id: string
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_count?: number
          owner_id?: string
          preview_text?: string
          scope_month?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      planner_state: {
        Row: {
          canonical_revision: number
          created_at: string
          execution_revision: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          canonical_revision?: number
          created_at?: string
          execution_revision?: number
          owner_id: string
          updated_at?: string
        }
        Update: {
          canonical_revision?: number
          created_at?: string
          execution_revision?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_xp_delta: {
        Args: { p_delta: number; p_user_id: string }
        Returns: undefined
      }
      bump_planner_canonical_revision: {
        Args: { p_owner: string }
        Returns: number
      }
      bump_planner_execution_revision: {
        Args: { p_owner: string }
        Returns: number
      }
      cascade_completion_xp_multiplier: { Args: never; Returns: number }
      consume_planner_ai_quota: {
        Args: {
          p_feature: string
          p_input_tokens?: number
          p_limit?: number
          p_owner: string
        }
        Returns: {
          allowed: boolean
          quota_usage_date: string
          remaining: number
          request_count: number
          retry_after_seconds: number
        }[]
      }
      ensure_planner_state: { Args: { p_owner: string }; Returns: undefined }
      ensure_xp_profile: { Args: { p_user_id: string }; Returns: undefined }
      get_planner_coach_conversation: {
        Args: { p_conversation_id: string; p_owner: string }
        Returns: {
          conversation_id: string
          created_at: string
          message_content: string
          message_count: number
          message_created_at: string
          message_ordinal: number
          message_proposal_meta: Json
          message_role: string
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      goal_achievement_xp: { Args: never; Returns: number }
      is_valid_planner_timezone: {
        Args: { p_timezone: string }
        Returns: boolean
      }
      level_for_total_xp: { Args: { p_total_xp: number }; Returns: number }
      list_planner_coach_conversations: {
        Args: { p_limit?: number; p_owner: string; p_scope_month?: string }
        Returns: {
          conversation_id: string
          created_at: string
          message_count: number
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      local_today_for_timezone: {
        Args: { p_timezone: string }
        Returns: string
      }
      manual_completion_xp: { Args: never; Returns: number }
      planner_json_depth: { Args: { p_value: Json }; Returns: number }
      planner_owner_lock_key: { Args: { p_owner: string }; Returns: number }
      record_planner_ai_output_tokens: {
        Args: {
          p_feature: string
          p_output_tokens: number
          p_owner: string
          p_usage_date: string
        }
        Returns: number
      }
      require_planner_state_revisions: {
        Args: {
          p_expected_canonical_revision: number
          p_expected_execution_revision: number
          p_owner: string
        }
        Returns: {
          canonical_revision: number
          created_at: string
          execution_revision: number
          owner_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "planner_state"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_planner_coach_conversation: {
        Args: {
          p_messages: Json
          p_owner: string
          p_scope_month: string
          p_timezone: string
          p_title?: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          message_count: number
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      validate_planner_json: {
        Args: {
          p_expected_type: string
          p_max_bytes?: number
          p_max_depth?: number
          p_value: Json
        }
        Returns: boolean
      }
      xp_for_completion_source: {
        Args: { p_source: Database["public"]["Enums"]["completion_source"] }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      completions: {
        Row: {
          completed_on: string
          created_at: string
          goal_id: string
          id: string
          source: Database["public"]["Enums"]["completion_source"]
          user_id: string
        }
        Insert: {
          completed_on?: string
          created_at?: string
          goal_id: string
          id?: string
          source?: Database["public"]["Enums"]["completion_source"]
          user_id: string
        }
        Update: {
          completed_on?: string
          created_at?: string
          goal_id?: string
          id?: string
          source?: Database["public"]["Enums"]["completion_source"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_plan_days: {
        Row: {
          created_at: string
          date: string
          generation_effort_minutes: number
          generation_session_count: number
          id: string
          is_blocked: boolean
          is_rest_day: boolean
          owner_id: string
          plan_id: string
          preference_cost: number
          resolved_policy: Json
          scope_month: string
        }
        Insert: {
          created_at?: string
          date: string
          generation_effort_minutes?: number
          generation_session_count?: number
          id?: string
          is_blocked?: boolean
          is_rest_day?: boolean
          owner_id: string
          plan_id: string
          preference_cost?: number
          resolved_policy?: Json
          scope_month: string
        }
        Update: {
          created_at?: string
          date?: string
          generation_effort_minutes?: number
          generation_session_count?: number
          id?: string
          is_blocked?: boolean
          is_rest_day?: boolean
          owner_id?: string
          plan_id?: string
          preference_cost?: number
          resolved_policy?: Json
          scope_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plan_days_plan_owner_scope_fkey"
            columns: ["plan_id", "owner_id", "scope_month"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id", "owner_id", "scope_month"]
          },
        ]
      }
      execution_plan_goals: {
        Row: {
          admissible_credit_basis: Json
          assessment_input_hash: string
          assessment_snapshot: Json
          category: string
          color: string | null
          created_at: string
          end_date: string | null
          generation_summary: Json
          goal_id: string | null
          id: string
          original_goal_id: string
          owner_id: string
          plan_id: string
          requirement_fingerprint: string
          requirement_kind: string
          requirement_snapshot: Json
          start_date: string
          title: string
        }
        Insert: {
          admissible_credit_basis: Json
          assessment_input_hash: string
          assessment_snapshot: Json
          category: string
          color?: string | null
          created_at?: string
          end_date?: string | null
          generation_summary?: Json
          goal_id?: string | null
          id?: string
          original_goal_id: string
          owner_id: string
          plan_id: string
          requirement_fingerprint: string
          requirement_kind: string
          requirement_snapshot: Json
          start_date: string
          title: string
        }
        Update: {
          admissible_credit_basis?: Json
          assessment_input_hash?: string
          assessment_snapshot?: Json
          category?: string
          color?: string | null
          created_at?: string
          end_date?: string | null
          generation_summary?: Json
          goal_id?: string | null
          id?: string
          original_goal_id?: string
          owner_id?: string
          plan_id?: string
          requirement_fingerprint?: string
          requirement_kind?: string
          requirement_snapshot?: Json
          start_date?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plan_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plan_goals_plan_owner_fkey"
            columns: ["plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      execution_plan_issues: {
        Row: {
          created_at: string
          details: Json
          id: string
          issue_code: string
          item_id: string | null
          owner_id: string
          plan_goal_id: string | null
          plan_id: string
          relaxation: Json | null
          severity: string
          unit_key: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          issue_code: string
          item_id?: string | null
          owner_id: string
          plan_goal_id?: string | null
          plan_id: string
          relaxation?: Json | null
          severity?: string
          unit_key?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          issue_code?: string
          item_id?: string | null
          owner_id?: string
          plan_goal_id?: string | null
          plan_id?: string
          relaxation?: Json | null
          severity?: string
          unit_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_plan_issues_goal_same_plan_fkey"
            columns: ["plan_goal_id", "plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_goals"
            referencedColumns: ["id", "plan_id", "owner_id"]
          },
          {
            foreignKeyName: "execution_plan_issues_item_same_plan_fkey"
            columns: ["item_id", "plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_items"
            referencedColumns: ["id", "plan_id", "owner_id"]
          },
          {
            foreignKeyName: "execution_plan_issues_plan_owner_fkey"
            columns: ["plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      execution_plan_items: {
        Row: {
          classification: string
          created_at: string
          credit_state: string
          credit_window_end: string
          credit_window_start: string
          credited_completion_date: string | null
          credited_completion_id: string | null
          effective_scheduled_local_time: string | null
          estimated_minutes: number
          id: string
          label: string | null
          locked: boolean
          locked_at: string | null
          max_per_day: number
          miss_policy: string
          ordinal: number
          original_scheduled_date: string | null
          owner_id: string
          period_key: string | null
          placement_window_end: string | null
          placement_window_start: string | null
          plan_goal_id: string
          plan_id: string
          priority: number
          requirement_kind: string
          rest_eligible: boolean
          revision: number
          scheduled_date: string | null
          scheduled_time_override: string | null
          unit_key: string
          updated_at: string
        }
        Insert: {
          classification: string
          created_at?: string
          credit_state: string
          credit_window_end: string
          credit_window_start: string
          credited_completion_date?: string | null
          credited_completion_id?: string | null
          effective_scheduled_local_time?: string | null
          estimated_minutes?: number
          id?: string
          label?: string | null
          locked?: boolean
          locked_at?: string | null
          max_per_day?: number
          miss_policy: string
          ordinal: number
          original_scheduled_date?: string | null
          owner_id: string
          period_key?: string | null
          placement_window_end?: string | null
          placement_window_start?: string | null
          plan_goal_id: string
          plan_id: string
          priority?: number
          requirement_kind: string
          rest_eligible: boolean
          revision?: number
          scheduled_date?: string | null
          scheduled_time_override?: string | null
          unit_key: string
          updated_at?: string
        }
        Update: {
          classification?: string
          created_at?: string
          credit_state?: string
          credit_window_end?: string
          credit_window_start?: string
          credited_completion_date?: string | null
          credited_completion_id?: string | null
          effective_scheduled_local_time?: string | null
          estimated_minutes?: number
          id?: string
          label?: string | null
          locked?: boolean
          locked_at?: string | null
          max_per_day?: number
          miss_policy?: string
          ordinal?: number
          original_scheduled_date?: string | null
          owner_id?: string
          period_key?: string | null
          placement_window_end?: string | null
          placement_window_start?: string | null
          plan_goal_id?: string
          plan_id?: string
          priority?: number
          requirement_kind?: string
          rest_eligible?: boolean
          revision?: number
          scheduled_date?: string | null
          scheduled_time_override?: string | null
          unit_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_plan_items_goal_same_plan_fkey"
            columns: ["plan_goal_id", "plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "execution_plan_goals"
            referencedColumns: ["id", "plan_id", "owner_id"]
          },
          {
            foreignKeyName: "execution_plan_items_plan_owner_fkey"
            columns: ["plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "execution_plan_items_scheduled_day_fkey"
            columns: ["plan_id", "scheduled_date"]
            isOneToOne: false
            referencedRelation: "execution_plan_days"
            referencedColumns: ["plan_id", "date"]
          },
        ]
      }
      execution_plans: {
        Row: {
          activated_at: string
          assessment_schema_version: string
          capacity_status: string
          change_summary: Json
          confirmation_required: boolean
          contract_version: string
          created_at: string
          dismissed_at: string | null
          eligibility_mode: string
          generation_input_hash: string
          generation_source: string
          id: string
          idempotency_key: string
          observed_canonical_revision: number
          observed_execution_revision: number
          owner_id: string
          parent_plan_id: string | null
          placement_status: string
          policy_compiler_version: string
          policy_schema_version: string
          policy_snapshot: Json
          prompt_version: string | null
          publishable: boolean
          request_digest: string
          requirement_schema_version: string
          scheduler_version: string
          scope_month: string
          search_status: string
          status: string
          superseded_at: string | null
          timezone: string
          version: number
        }
        Insert: {
          activated_at?: string
          assessment_schema_version: string
          capacity_status: string
          change_summary?: Json
          confirmation_required: boolean
          contract_version: string
          created_at?: string
          dismissed_at?: string | null
          eligibility_mode: string
          generation_input_hash: string
          generation_source: string
          id?: string
          idempotency_key: string
          observed_canonical_revision: number
          observed_execution_revision: number
          owner_id: string
          parent_plan_id?: string | null
          placement_status: string
          policy_compiler_version: string
          policy_schema_version: string
          policy_snapshot: Json
          prompt_version?: string | null
          publishable: boolean
          request_digest: string
          requirement_schema_version: string
          scheduler_version: string
          scope_month: string
          search_status: string
          status?: string
          superseded_at?: string | null
          timezone: string
          version: number
        }
        Update: {
          activated_at?: string
          assessment_schema_version?: string
          capacity_status?: string
          change_summary?: Json
          confirmation_required?: boolean
          contract_version?: string
          created_at?: string
          dismissed_at?: string | null
          eligibility_mode?: string
          generation_input_hash?: string
          generation_source?: string
          id?: string
          idempotency_key?: string
          observed_canonical_revision?: number
          observed_execution_revision?: number
          owner_id?: string
          parent_plan_id?: string | null
          placement_status?: string
          policy_compiler_version?: string
          policy_schema_version?: string
          policy_snapshot?: Json
          prompt_version?: string | null
          publishable?: boolean
          request_digest?: string
          requirement_schema_version?: string
          scheduler_version?: string
          scope_month?: string
          search_status?: string
          status?: string
          superseded_at?: string | null
          timezone?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "execution_plans_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_plans_parent_scope_fkey"
            columns: ["parent_plan_id", "owner_id", "scope_month"]
            isOneToOne: false
            referencedRelation: "execution_plans"
            referencedColumns: ["id", "owner_id", "scope_month"]
          },
        ]
      }
      goal_links: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          source_goal_id: string
          target_goal_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          source_goal_id: string
          target_goal_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          source_goal_id?: string
          target_goal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_links_source_goal_id_fkey"
            columns: ["source_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_links_target_goal_id_fkey"
            columns: ["target_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_participants: {
        Row: {
          goal_id: string
          id: string
          joined_at: string
          role: Database["public"]["Enums"]["participant_role"]
          user_id: string
        }
        Insert: {
          goal_id: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["participant_role"]
          user_id: string
        }
        Update: {
          goal_id?: string
          id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["participant_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_participants_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_shares: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          shared_with: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          shared_with: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          shared_with?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_shares_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_shares_shared_with_fkey"
            columns: ["shared_with"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived_at: string | null
          category: string
          color: string | null
          created_at: string
          default_local_time: string | null
          description: string | null
          end_date: string | null
          frequency_type: Database["public"]["Enums"]["goal_frequency_type"]
          id: string
          is_deleted: boolean
          is_group: boolean
          milestone_names: string[] | null
          owner_id: string
          photo_path: string | null
          recurrence_interval:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          reward_text: string | null
          start_date: string
          target_count: number | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: string
          color?: string | null
          created_at?: string
          default_local_time?: string | null
          description?: string | null
          end_date?: string | null
          frequency_type: Database["public"]["Enums"]["goal_frequency_type"]
          id?: string
          is_deleted?: boolean
          is_group?: boolean
          milestone_names?: string[] | null
          owner_id: string
          photo_path?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          reward_text?: string | null
          start_date?: string
          target_count?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          color?: string | null
          created_at?: string
          default_local_time?: string | null
          description?: string | null
          end_date?: string | null
          frequency_type?: Database["public"]["Enums"]["goal_frequency_type"]
          id?: string
          is_deleted?: boolean
          is_group?: boolean
          milestone_names?: string[] | null
          owner_id?: string
          photo_path?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          reward_text?: string | null
          start_date?: string
          target_count?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          hour: number
          id: string
          is_default: boolean
          last_sent_local_date: string | null
          message: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          hour: number
          id?: string
          is_default?: boolean
          last_sent_local_date?: string | null
          message?: string
          timezone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          hour?: number
          id?: string
          is_default?: boolean
          last_sent_local_date?: string | null
          message?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      planner_preferences: {
        Row: {
          created_at: string
          default_policy: Json
          owner_id: string
          policy_compiler_version: string
          policy_revision: number
          policy_schema_version: string
          timezone: string
          timezone_confirmed_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_policy: Json
          owner_id: string
          policy_compiler_version: string
          policy_revision?: number
          policy_schema_version: string
          timezone: string
          timezone_confirmed_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_policy?: Json
          owner_id?: string
          policy_compiler_version?: string
          policy_revision?: number
          policy_schema_version?: string
          timezone?: string
          timezone_confirmed_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_preferences_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      xp_ledger: {
        Row: {
          completed_on: string
          completion_id: string
          completion_source: Database["public"]["Enums"]["completion_source"]
          created_at: string
          event_type: string
          goal_id: string
          id: string
          metadata: Json
          user_id: string
          xp_delta: number
        }
        Insert: {
          completed_on: string
          completion_id: string
          completion_source: Database["public"]["Enums"]["completion_source"]
          created_at?: string
          event_type: string
          goal_id: string
          id?: string
          metadata?: Json
          user_id: string
          xp_delta: number
        }
        Update: {
          completed_on?: string
          completion_id?: string
          completion_source?: Database["public"]["Enums"]["completion_source"]
          created_at?: string
          event_type?: string
          goal_id?: string
          id?: string
          metadata?: Json
          user_id?: string
          xp_delta?: number
        }
        Relationships: []
      }
      xp_levels: {
        Row: {
          created_at: string
          level: number
          min_total_xp: number
          title: string
        }
        Insert: {
          created_at?: string
          level: number
          min_total_xp: number
          title: string
        }
        Update: {
          created_at?: string
          level?: number
          min_total_xp?: number
          title?: string
        }
        Relationships: []
      }
      xp_profiles: {
        Row: {
          created_at: string
          current_level: number
          total_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level: number
          total_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_profiles_current_level_fkey"
            columns: ["current_level"]
            isOneToOne: false
            referencedRelation: "xp_levels"
            referencedColumns: ["level"]
          },
          {
            foreignKeyName: "xp_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_rewards: {
        Row: {
          created_at: string
          id: string
          level: number
          reward_code: string
          reward_description: string
          reward_title: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: number
          reward_code: string
          reward_description: string
          reward_title: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number
          reward_code?: string
          reward_description?: string
          reward_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_rewards_level_fkey"
            columns: ["level"]
            isOneToOne: true
            referencedRelation: "xp_levels"
            referencedColumns: ["level"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_complete_goal: {
        Args: { p_goal_id: string; p_uid: string }
        Returns: boolean
      }
      can_view_goal: {
        Args: { p_goal_id: string; p_uid: string }
        Returns: boolean
      }
      consume_planner_ai_quota_service: {
        Args: {
          p_feature: string
          p_input_tokens?: number
          p_limit?: number
          p_owner: string
        }
        Returns: {
          allowed: boolean
          remaining: number
          request_count: number
          retry_after_seconds: number
          usage_date: string
        }[]
      }
      dismiss_execution_plan_service: {
        Args: {
          p_expected_canonical_revision: number
          p_expected_execution_revision: number
          p_owner: string
          p_plan_id: string
        }
        Returns: {
          execution_revision: number
          plan_id: string
          status: string
        }[]
      }
      get_planner_coach_conversation_service: {
        Args: { p_conversation_id: string; p_owner: string }
        Returns: {
          conversation_id: string
          created_at: string
          message_content: string
          message_count: number
          message_created_at: string
          message_ordinal: number
          message_proposal_meta: Json
          message_role: string
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      get_planner_state: {
        Args: never
        Returns: {
          canonical_revision: number
          execution_revision: number
        }[]
      }
      list_planner_coach_conversations_service: {
        Args: { p_limit?: number; p_owner: string; p_scope_month?: string }
        Returns: {
          conversation_id: string
          created_at: string
          message_count: number
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      mark_goal_complete: {
        Args: { p_date?: string; p_goal_id: string }
        Returns: undefined
      }
      move_execution_plan_item_service: {
        Args: {
          p_date: string
          p_expected_canonical_revision: number
          p_expected_execution_revision: number
          p_expected_item_revision: number
          p_item_id: string
          p_owner: string
        }
        Returns: {
          execution_revision: number
          item_id: string
          item_revision: number
          locked: boolean
          scheduled_date: string
        }[]
      }
      publish_execution_plan_service:
        | {
            Args: {
              p_assessment_schema_version: string
              p_capacity_status: string
              p_change_summary: Json
              p_confirmation_required: boolean
              p_contract_version: string
              p_days: Json
              p_eligibility_mode: string
              p_expected_base_plan_id: string
              p_expected_base_plan_version: number
              p_expected_canonical_revision: number
              p_expected_execution_revision: number
              p_generation_input_hash: string
              p_generation_source: string
              p_goals: Json
              p_idempotency_key: string
              p_issues: Json
              p_items: Json
              p_owner: string
              p_placement_status: string
              p_policy_compiler_version: string
              p_policy_schema_version: string
              p_policy_snapshot: Json
              p_publishable: boolean
              p_request_digest: string
              p_requirement_schema_version: string
              p_scheduler_version: string
              p_scope_month: string
              p_search_status: string
              p_timezone: string
            }
            Returns: {
              current_active_plan_id: string
              execution_revision: number
              is_currently_active: boolean
              plan_id: string
              replayed: boolean
              version: number
            }[]
          }
        | {
            Args: {
              p_assessment_schema_version: string
              p_capacity_status: string
              p_change_summary: Json
              p_confirmation_required: boolean
              p_contract_version: string
              p_days: Json
              p_expected_base_plan_id: string
              p_expected_base_plan_version: number
              p_expected_canonical_revision: number
              p_expected_execution_revision: number
              p_generation_input_hash: string
              p_generation_source: string
              p_goals: Json
              p_idempotency_key: string
              p_issues: Json
              p_items: Json
              p_owner: string
              p_placement_status: string
              p_policy_compiler_version: string
              p_policy_schema_version: string
              p_policy_snapshot: Json
              p_publishable: boolean
              p_request_digest: string
              p_requirement_schema_version: string
              p_scheduler_version: string
              p_scope_month: string
              p_search_status: string
              p_timezone: string
            }
            Returns: {
              current_active_plan_id: string
              execution_revision: number
              is_currently_active: boolean
              plan_id: string
              replayed: boolean
              version: number
            }[]
          }
      record_planner_ai_output_tokens_service: {
        Args: {
          p_feature: string
          p_output_tokens: number
          p_owner: string
          p_usage_date: string
        }
        Returns: number
      }
      save_planner_coach_conversation_service: {
        Args: {
          p_messages: Json
          p_owner: string
          p_scope_month: string
          p_timezone: string
          p_title?: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          message_count: number
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      set_execution_plan_goal_date_fact_service: {
        Args: {
          p_date: string
          p_desired_fact_state: string
          p_expected_canonical_revision: number
          p_expected_execution_revision: number
          p_owner: string
          p_plan_goal_id: string
        }
        Returns: {
          canonical_revision: number
          date: string
          execution_revision: number
          fact_state: string
          goal_id: string
        }[]
      }
      set_execution_plan_item_date_fact_service: {
        Args: {
          p_desired_fact_state: string
          p_expected_canonical_revision: number
          p_expected_credited_unit: Json
          p_expected_execution_revision: number
          p_expected_item_revision: number
          p_item_id: string
          p_owner: string
        }
        Returns: {
          canonical_revision: number
          date: string
          execution_revision: number
          fact_state: string
          goal_id: string
          item_id: string
        }[]
      }
      set_execution_plan_item_lock_service: {
        Args: {
          p_expected_canonical_revision: number
          p_expected_execution_revision: number
          p_expected_item_revision: number
          p_item_id: string
          p_locked: boolean
          p_owner: string
        }
        Returns: {
          execution_revision: number
          item_id: string
          item_revision: number
          locked: boolean
          scheduled_date: string
        }[]
      }
      unmark_goal_complete: {
        Args: { p_date?: string; p_goal_id: string }
        Returns: undefined
      }
      upsert_planner_preferences_service: {
        Args: {
          p_default_policy: Json
          p_owner: string
          p_policy_compiler_version?: string
          p_policy_schema_version?: string
          p_timezone: string
          p_timezone_confirmed_at?: string
        }
        Returns: {
          created_at: string
          default_policy: Json
          owner_id: string
          policy_compiler_version: string
          policy_revision: number
          policy_schema_version: string
          timezone: string
          timezone_confirmed_at: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "planner_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      completion_source: "manual" | "linked_cascade"
      goal_frequency_type: "one_time" | "fixed_milestones" | "recurring"
      participant_role: "owner" | "participant"
      recurrence_interval: "daily" | "weekly" | "monthly"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  private: {
    Enums: {},
  },
  public: {
    Enums: {
      completion_source: ["manual", "linked_cascade"],
      goal_frequency_type: ["one_time", "fixed_milestones", "recurring"],
      participant_role: ["owner", "participant"],
      recurrence_interval: ["daily", "weekly", "monthly"],
    },
  },
} as const


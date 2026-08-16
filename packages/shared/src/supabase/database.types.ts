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
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_team_for_user: { Args: { p_user_id: string }; Returns: string }
      assert_goal_owner: {
        Args: { p_goal_id: string; p_uid: string }
        Returns: undefined
      }
      assert_health_local_today: {
        Args: { p_local_today: string }
        Returns: undefined
      }
      assert_planner_schedule_window: {
        Args: { p_end: string; p_start: string }
        Returns: undefined
      }
      challenge_progress_value: {
        Args: {
          p_from: string
          p_metric: Database["public"]["Enums"]["challenge_metric"]
          p_to: string
          p_track_key: string
          p_user_ids: string[]
        }
        Returns: number
      }
      elect_health_activities_for_key: {
        Args: {
          p_local_date: string
          p_metric: Database["public"]["Enums"]["health_metric_key"]
          p_user_id: string
        }
        Returns: undefined
      }
      emit_feed_event: {
        Args: {
          p_actor_id: string
          p_bucket_date?: string
          p_event_type: Database["public"]["Enums"]["feed_event_type"]
          p_goal_id?: string
          p_occurrence_delta?: number
          p_payload?: Json
          p_subject_key: string
          p_track_key?: string
          p_xp_delta?: number
        }
        Returns: string
      }
      emit_feed_for_xp_ledger_row: {
        Args: {
          p_earned_on: string
          p_event_type: string
          p_goal_id: string
          p_source_key: string
          p_track_key: string
          p_user_id: string
          p_xp_delta: number
        }
        Returns: string
      }
      emit_feed_for_xp_level_up: {
        Args: {
          p_current_level: number
          p_previous_level: number
          p_track_key: string
          p_user_id: string
        }
        Returns: string
      }
      enqueue_notification_outbox: {
        Args: {
          p_available_at?: string
          p_body: string
          p_dedupe_key?: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_title: string
          p_url?: string
          p_user_id: string
        }
        Returns: string
      }
      finalize_health_activity_cluster: {
        Args: {
          p_activity_ids: string[]
          p_local_date: string
          p_metric: Database["public"]["Enums"]["health_metric_key"]
          p_user_id: string
        }
        Returns: undefined
      }
      goal_anchored_period_start: {
        Args: {
          p_anchor: string
          p_index: number
          p_interval: Database["public"]["Enums"]["recurrence_interval"]
        }
        Returns: string
      }
      goal_category_label: { Args: { p_key: string }; Returns: string }
      goal_period_key: {
        Args: {
          p_anchor: string
          p_interval: Database["public"]["Enums"]["recurrence_interval"]
          p_reference: string
        }
        Returns: string
      }
      goal_xp_credited_units: {
        Args: { p_goal_id: string; p_user_id: string }
        Returns: {
          completion_id: string
          completion_source: Database["public"]["Enums"]["completion_source"]
          earned_on: string
          event_type: string
          source_key: string
          track_key: string
          xp_amount: number
        }[]
      }
      health_ingest_lock_key: { Args: { p_user_id: string }; Returns: number }
      health_metric_uses_fuzzy_cluster: {
        Args: { p_metric: Database["public"]["Enums"]["health_metric_key"] }
        Returns: boolean
      }
      health_ranges_overlap: {
        Args: {
          p_end_a: string
          p_end_b: string
          p_start_a: string
          p_start_b: string
        }
        Returns: boolean
      }
      health_samples_overlap: {
        Args: {
          p_end_a: string
          p_end_b: string
          p_start_a: string
          p_start_b: string
        }
        Returns: boolean
      }
      health_source_priority_rank: {
        Args: {
          p_metric: Database["public"]["Enums"]["health_metric_key"]
          p_source_identifier: string
          p_user_id: string
        }
        Returns: number
      }
      health_utc_offset_envelope_dates: {
        Args: never
        Returns: {
          max_date: string
          min_date: string
        }[]
      }
      insert_goal_link_validated: {
        Args: {
          p_owner_id: string
          p_source_goal_id: string
          p_target_goal_id: string
        }
        Returns: undefined
      }
      is_active_team_member: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      is_active_team_pair: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      is_platform_admin_for: {
        Args: {
          p_min_role?: Database["public"]["Enums"]["admin_role"]
          p_user_id: string
        }
        Returns: boolean
      }
      is_valid_planner_timezone: {
        Args: { p_timezone: string }
        Returns: boolean
      }
      local_today_for_profile: { Args: { p_user_id: string }; Returns: string }
      local_today_for_timezone: {
        Args: { p_timezone: string }
        Returns: string
      }
      max_team_size: { Args: never; Returns: number }
      next_rollover_end: {
        Args: {
          p_rollover: Database["public"]["Enums"]["leaderboard_rollover"]
          p_starts_at: string
        }
        Returns: string
      }
      normalize_goal_category_key: {
        Args: { p_category: string }
        Returns: string
      }
      normalize_goal_category_pair: {
        Args: { p_category: string; p_category_key: string }
        Returns: {
          category: string
          category_key: string
        }[]
      }
      planner_cadence_period_key: {
        Args: {
          p_recurrence_interval: Database["public"]["Enums"]["recurrence_interval"]
          p_scheduled_date: string
          p_week_starts_on: number
        }
        Returns: string
      }
      planner_json_depth: { Args: { p_value: Json }; Returns: number }
      planner_owner_lock_key: { Args: { p_owner: string }; Returns: number }
      planner_schedule_item_matches_requirement: {
        Args: {
          p_end_date: string
          p_frequency_type: Database["public"]["Enums"]["goal_frequency_type"]
          p_recurrence_interval: Database["public"]["Enums"]["recurrence_interval"]
          p_scheduled_date: string
          p_start_date: string
          p_target_count: number
          p_unit_key: string
          p_week_starts_on: number
        }
        Returns: boolean
      }
      planner_window_is_replay: {
        Args: {
          p_end: string
          p_items: Json
          p_owner_id: string
          p_start: string
        }
        Returns: boolean
      }
      raise_if_future_completion_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: undefined
      }
      recompute_health_daily_metrics_for_user: {
        Args: { p_from: string; p_to: string; p_user_id: string }
        Returns: number
      }
      recompute_xp_for_goal_users: {
        Args: { p_goal_id: string }
        Returns: undefined
      }
      refresh_challenge_participant: {
        Args: {
          p_challenge_id: string
          p_now?: string
          p_subject_id: string
          p_subject_kind: Database["public"]["Enums"]["social_subject_kind"]
        }
        Returns: boolean
      }
      refresh_xp_profile: {
        Args: { p_track_keys?: string[]; p_user_id: string }
        Returns: undefined
      }
      sha256_hex_digest: { Args: { p_value: string }; Returns: string }
      subject_member_ids: {
        Args: {
          p_subject_id: string
          p_subject_kind: Database["public"]["Enums"]["social_subject_kind"]
        }
        Returns: string[]
      }
      team_all_members_socially_visible: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      team_display_name: { Args: { p_team_id: string }; Returns: string }
      team_id_for_pair: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: string
      }
      team_in_cohort: {
        Args: { p_cohort_id: string; p_team_id: string }
        Returns: boolean
      }
      team_in_group: {
        Args: { p_group_id: string; p_team_id: string }
        Returns: boolean
      }
      team_partner_id: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: string
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
      viewer_in_cohort: {
        Args: { p_cohort_id: string; p_uid: string }
        Returns: boolean
      }
      viewer_in_group: {
        Args: { p_group_id: string; p_uid: string }
        Returns: boolean
      }
      xp_cascade_multiplier: { Args: never; Returns: number }
      xp_goal_achievement_points: { Args: never; Returns: number }
      xp_level_for_total: { Args: { p_total_xp: number }; Returns: number }
      xp_lock_key: { Args: { p_scope: string }; Returns: number }
      xp_manual_completion_points: { Args: never; Returns: number }
      xp_min_total_for_level: { Args: { p_level: number }; Returns: number }
      xp_points_for_completion_source: {
        Args: { p_source: Database["public"]["Enums"]["completion_source"] }
        Returns: number
      }
      xp_skip_for_profile_delete: {
        Args: { p_user_id: string }
        Returns: boolean
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
      admin_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_participants: {
        Row: {
          awarded_at: string | null
          challenge_id: string
          completed_at: string | null
          joined_at: string
          progress_at: string | null
          progress_value: number
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
        }
        Insert: {
          awarded_at?: string | null
          challenge_id: string
          completed_at?: string | null
          joined_at?: string
          progress_at?: string | null
          progress_value?: number
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
        }
        Update: {
          awarded_at?: string | null
          challenge_id?: string
          completed_at?: string | null
          joined_at?: string
          progress_at?: string | null
          progress_value?: number
          subject_id?: string
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          audience_kind: Database["public"]["Enums"]["social_audience_kind"]
          cohort_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          max_participants: number | null
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key: string | null
          reward_xp: number
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["challenge_status"]
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          target_value: number
          title: string
          updated_at: string
        }
        Insert: {
          audience_kind?: Database["public"]["Enums"]["social_audience_kind"]
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          max_participants?: number | null
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key?: string | null
          reward_xp?: number
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["challenge_status"]
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
          target_value: number
          title: string
          updated_at?: string
        }
        Update: {
          audience_kind?: Database["public"]["Enums"]["social_audience_kind"]
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          max_participants?: number | null
          metric?: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key?: string | null
          reward_xp?: number
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["challenge_status"]
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
          target_value?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_metric_track_key_fkey"
            columns: ["metric_track_key"]
            isOneToOne: false
            referencedRelation: "goal_categories"
            referencedColumns: ["key"]
          },
        ]
      }
      cohort_members: {
        Row: {
          cohort_id: string
          joined_at: string
          role: Database["public"]["Enums"]["cohort_member_role"]
          user_id: string
        }
        Insert: {
          cohort_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["cohort_member_role"]
          user_id: string
        }
        Update: {
          cohort_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["cohort_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cohort_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          join_code: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          join_code: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          join_code?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohorts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      feed_events: {
        Row: {
          actor_id: string
          bucket_date: string
          created_at: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          goal_id: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          occurrence_count: number
          payload: Json
          reaction_count: number
          subject_key: string
          track_key: string | null
          updated_at: string
          xp_delta: number
        }
        Insert: {
          actor_id: string
          bucket_date: string
          created_at?: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          goal_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          occurrence_count?: number
          payload?: Json
          reaction_count?: number
          subject_key: string
          track_key?: string | null
          updated_at?: string
          xp_delta?: number
        }
        Update: {
          actor_id?: string
          bucket_date?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["feed_event_type"]
          goal_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          occurrence_count?: number
          payload?: Json
          reaction_count?: number
          subject_key?: string
          track_key?: string | null
          updated_at?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_events_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_reactions: {
        Row: {
          created_at: string
          feed_event_id: string
          reaction: Database["public"]["Enums"]["reaction_kind"]
          user_id: string
        }
        Insert: {
          created_at?: string
          feed_event_id: string
          reaction: Database["public"]["Enums"]["reaction_kind"]
          user_id: string
        }
        Update: {
          created_at?: string
          feed_event_id?: string
          reaction?: Database["public"]["Enums"]["reaction_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_reactions_feed_event_id_fkey"
            columns: ["feed_event_id"]
            isOneToOne: false
            referencedRelation: "feed_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_categories: {
        Row: {
          aliases: string[]
          color: string
          created_at: string
          key: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          color: string
          created_at?: string
          key: string
          label: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          color?: string
          created_at?: string
          key?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
          category_key: string
          color: string | null
          created_at: string
          default_local_time: string | null
          description: string | null
          end_date: string | null
          frequency_type: Database["public"]["Enums"]["goal_frequency_type"]
          id: string
          is_deleted: boolean
          is_private: boolean
          milestone_names: string[] | null
          owner_id: string
          photo_path: string | null
          recurrence_interval:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          reward_text: string | null
          start_date: string
          target_count: number | null
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: string
          category_key?: string
          color?: string | null
          created_at?: string
          default_local_time?: string | null
          description?: string | null
          end_date?: string | null
          frequency_type: Database["public"]["Enums"]["goal_frequency_type"]
          id?: string
          is_deleted?: boolean
          is_private?: boolean
          milestone_names?: string[] | null
          owner_id: string
          photo_path?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          reward_text?: string | null
          start_date?: string
          target_count?: number | null
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: string
          category_key?: string
          color?: string | null
          created_at?: string
          default_local_time?: string | null
          description?: string | null
          end_date?: string | null
          frequency_type?: Database["public"]["Enums"]["goal_frequency_type"]
          id?: string
          is_deleted?: boolean
          is_private?: boolean
          milestone_names?: string[] | null
          owner_id?: string
          photo_path?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          reward_text?: string | null
          start_date?: string
          target_count?: number | null
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "goal_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      health_activities: {
        Row: {
          created_at: string
          ended_at: string | null
          group_id: string | null
          id: string
          is_canonical: boolean
          local_date: string | null
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          payload: Json
          provider: Database["public"]["Enums"]["health_provider"]
          provider_native_id: string
          source_identifier: string
          source_name: string | null
          started_at: string
          suppressed_reason: string | null
          unit: string
          updated_at: string
          user_id: string
          utc_offset_minutes: number
          value_numeric: number
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          group_id?: string | null
          id?: string
          is_canonical?: boolean
          local_date?: string | null
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          payload?: Json
          provider: Database["public"]["Enums"]["health_provider"]
          provider_native_id: string
          source_identifier: string
          source_name?: string | null
          started_at: string
          suppressed_reason?: string | null
          unit: string
          updated_at?: string
          user_id: string
          utc_offset_minutes: number
          value_numeric: number
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          group_id?: string | null
          id?: string
          is_canonical?: boolean
          local_date?: string | null
          metric_key?: Database["public"]["Enums"]["health_metric_key"]
          payload?: Json
          provider?: Database["public"]["Enums"]["health_provider"]
          provider_native_id?: string
          source_identifier?: string
          source_name?: string | null
          started_at?: string
          suppressed_reason?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
          utc_offset_minutes?: number
          value_numeric?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_activities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "health_activity_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_activity_groups: {
        Row: {
          created_at: string
          id: string
          local_date: string
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          local_date: string
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          local_date?: string
          metric_key?: Database["public"]["Enums"]["health_metric_key"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_activity_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_autocomplete_rules: {
        Row: {
          created_at: string
          enabled: boolean
          goal_id: string
          id: string
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          threshold_numeric: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          goal_id: string
          id?: string
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          threshold_numeric: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          goal_id?: string
          id?: string
          metric_key?: Database["public"]["Enums"]["health_metric_key"]
          threshold_numeric?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_autocomplete_rules_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_autocomplete_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_completion_links: {
        Row: {
          completed_on: string
          created_at: string
          external_key: string
          goal_id: string
          user_id: string
        }
        Insert: {
          completed_on: string
          created_at?: string
          external_key: string
          goal_id: string
          user_id: string
        }
        Update: {
          completed_on?: string
          created_at?: string
          external_key?: string
          goal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_completion_links_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_completion_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_daily_metrics: {
        Row: {
          canonical_activity_count: number
          local_date: string
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          updated_at: string
          user_id: string
          value_numeric: number
        }
        Insert: {
          canonical_activity_count?: number
          local_date: string
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          updated_at?: string
          user_id: string
          value_numeric: number
        }
        Update: {
          canonical_activity_count?: number
          local_date?: string
          metric_key?: Database["public"]["Enums"]["health_metric_key"]
          updated_at?: string
          user_id?: string
          value_numeric?: number
        }
        Relationships: [
          {
            foreignKeyName: "health_daily_metrics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_source_priority: {
        Row: {
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          priority: number
          source_identifier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          metric_key: Database["public"]["Enums"]["health_metric_key"]
          priority: number
          source_identifier: string
          updated_at?: string
          user_id: string
        }
        Update: {
          metric_key?: Database["public"]["Enums"]["health_metric_key"]
          priority?: number
          source_identifier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_source_priority_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      health_sync_state: {
        Row: {
          last_error: string | null
          last_ingest_at: string | null
          last_sample_at: string | null
          permission_prompted_at: string | null
          provider: Database["public"]["Enums"]["health_provider"]
          updated_at: string
          user_id: string
        }
        Insert: {
          last_error?: string | null
          last_ingest_at?: string | null
          last_sample_at?: string | null
          permission_prompted_at?: string | null
          provider: Database["public"]["Enums"]["health_provider"]
          updated_at?: string
          user_id: string
        }
        Update: {
          last_error?: string | null
          last_ingest_at?: string | null
          last_sample_at?: string | null
          permission_prompted_at?: string | null
          provider?: Database["public"]["Enums"]["health_provider"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_season_results: {
        Row: {
          display_name: string
          frozen_at: string
          rank: number
          score: number
          season_id: string
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at: string | null
        }
        Insert: {
          display_name: string
          frozen_at?: string
          rank: number
          score: number
          season_id: string
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at?: string | null
        }
        Update: {
          display_name?: string
          frozen_at?: string
          rank?: number
          score?: number
          season_id?: string
          subject_id?: string
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_season_results_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_seasons: {
        Row: {
          cohort_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key: string | null
          previous_season_id: string | null
          rollover: Database["public"]["Enums"]["leaderboard_rollover"]
          scope: Database["public"]["Enums"]["leaderboard_scope_kind"]
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["leaderboard_season_status"]
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          title: string
          updated_at: string
        }
        Insert: {
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          metric?: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key?: string | null
          previous_season_id?: string | null
          rollover?: Database["public"]["Enums"]["leaderboard_rollover"]
          scope?: Database["public"]["Enums"]["leaderboard_scope_kind"]
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["leaderboard_season_status"]
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
          title: string
          updated_at?: string
        }
        Update: {
          cohort_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          metric?: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key?: string | null
          previous_season_id?: string | null
          rollover?: Database["public"]["Enums"]["leaderboard_rollover"]
          scope?: Database["public"]["Enums"]["leaderboard_scope_kind"]
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["leaderboard_season_status"]
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_seasons_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_seasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_seasons_metric_track_key_fkey"
            columns: ["metric_track_key"]
            isOneToOne: false
            referencedRelation: "goal_categories"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "leaderboard_seasons_previous_season_id_fkey"
            columns: ["previous_season_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_standings: {
        Row: {
          rank: number
          refreshed_at: string
          score: number
          season_id: string
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at: string | null
        }
        Insert: {
          rank: number
          refreshed_at?: string
          score?: number
          season_id: string
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at?: string | null
        }
        Update: {
          rank?: number
          refreshed_at?: string
          score?: number
          season_id?: string
          subject_id?: string
          subject_kind?: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_standings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action"]
          admin_id: string | null
          admin_username: string
          created_at: string
          id: string
          reason: string | null
          target_id: string
          target_kind: Database["public"]["Enums"]["moderation_target"]
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action"]
          admin_id?: string | null
          admin_username: string
          created_at?: string
          id?: string
          reason?: string | null
          target_id: string
          target_kind: Database["public"]["Enums"]["moderation_target"]
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action"]
          admin_id?: string | null
          admin_username?: string
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string
          target_kind?: Database["public"]["Enums"]["moderation_target"]
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          available_at: string
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dedupe_key: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error: string | null
          sent_at: string | null
          state: Database["public"]["Enums"]["notification_state"]
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          sent_at?: string | null
          state?: Database["public"]["Enums"]["notification_state"]
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          last_error?: string | null
          sent_at?: string | null
          state?: Database["public"]["Enums"]["notification_state"]
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_user_id_fkey"
            columns: ["user_id"]
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
        Relationships: [
          {
            foreignKeyName: "notification_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      nudges: {
        Row: {
          created_at: string
          from_user_id: string
          goal_id: string | null
          id: string
          kind: Database["public"]["Enums"]["nudge_kind"]
          message: string | null
          team_id: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          goal_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["nudge_kind"]
          message?: string | null
          team_id: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          goal_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["nudge_kind"]
          message?: string | null
          team_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudges_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudges_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudges_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nudges_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_profile_fields: {
        Row: {
          field: string
          is_exposed: boolean
          updated_at: string
        }
        Insert: {
          field: string
          is_exposed?: boolean
          updated_at?: string
        }
        Update: {
          field?: string
          is_exposed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
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
        Relationships: [
          {
            foreignKeyName: "planner_ai_usage_daily_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "planner_coach_conversation_messages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        Relationships: [
          {
            foreignKeyName: "planner_coach_conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_goal_unplaceable: {
        Row: {
          computed_at: string
          effective_span_end: string
          goal_id: string
          lock_signature: string
          owner_id: string
          policy_revision: number
          reason: string
          requirement_fingerprint: string
          unplaced_count: number
        }
        Insert: {
          computed_at?: string
          effective_span_end: string
          goal_id: string
          lock_signature?: string
          owner_id: string
          policy_revision: number
          reason: string
          requirement_fingerprint: string
          unplaced_count: number
        }
        Update: {
          computed_at?: string
          effective_span_end?: string
          goal_id?: string
          lock_signature?: string
          owner_id?: string
          policy_revision?: number
          reason?: string
          requirement_fingerprint?: string
          unplaced_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "planner_goal_unplaceable_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      planner_items: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          locked: boolean
          original_scheduled_date: string | null
          owner_id: string
          scheduled_date: string
          scheduled_time: string | null
          unit_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          locked?: boolean
          original_scheduled_date?: string | null
          owner_id: string
          scheduled_date: string
          scheduled_time?: string | null
          unit_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          locked?: boolean
          original_scheduled_date?: string | null
          owner_id?: string
          scheduled_date?: string
          scheduled_time?: string | null
          unit_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planner_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planner_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          blackout_ranges: Json
          calendar_feed_token_version: number
          created_at: string
          display_name: string | null
          id: string
          rest_weekdays: number[]
          social_activity_visible: boolean
          timezone: string
          timezone_confirmed_at: string | null
          username: string
          week_starts_on: number
        }
        Insert: {
          avatar_url?: string | null
          blackout_ranges?: Json
          calendar_feed_token_version?: number
          created_at?: string
          display_name?: string | null
          id: string
          rest_weekdays?: number[]
          social_activity_visible?: boolean
          timezone?: string
          timezone_confirmed_at?: string | null
          username: string
          week_starts_on?: number
        }
        Update: {
          avatar_url?: string | null
          blackout_ranges?: Json
          calendar_feed_token_version?: number
          created_at?: string
          display_name?: string | null
          id?: string
          rest_weekdays?: number[]
          social_activity_visible?: boolean
          timezone?: string
          timezone_confirmed_at?: string | null
          username?: string
          week_starts_on?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          id: string
          native_token: string | null
          p256dh: string | null
          platform: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          id?: string
          native_token?: string | null
          p256dh?: string | null
          platform?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          native_token?: string | null
          p256dh?: string | null
          platform?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          accepted_at: string | null
          closed_at: string | null
          created_at: string
          dissolved_at: string | null
          id: string
          initiator_id: string
          invite_message: string | null
          invited_at: string
          status: Database["public"]["Enums"]["team_status"]
          visibility_acknowledged_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          closed_at?: string | null
          created_at?: string
          dissolved_at?: string | null
          id?: string
          initiator_id: string
          invite_message?: string | null
          invited_at?: string
          status?: Database["public"]["Enums"]["team_status"]
          visibility_acknowledged_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          closed_at?: string | null
          created_at?: string
          dissolved_at?: string | null
          id?: string
          initiator_id?: string
          invite_message?: string | null
          invited_at?: string
          status?: Database["public"]["Enums"]["team_status"]
          visibility_acknowledged_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_initiator_id_fkey"
            columns: ["initiator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_awards: {
        Row: {
          acknowledged_at: string | null
          id: string
          revoked_at: string | null
          reward_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          revoked_at?: string | null
          reward_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          revoked_at?: string | null
          reward_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_awards_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "xp_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_awards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_ledger: {
        Row: {
          completion_id: string | null
          completion_source:
            | Database["public"]["Enums"]["completion_source"]
            | null
          created_at: string
          earned_on: string
          entry_kind: string
          event_type: string
          goal_id: string | null
          id: string
          metadata: Json
          seq: number
          source_key: string
          track_key: string
          user_id: string
          xp_delta: number
        }
        Insert: {
          completion_id?: string | null
          completion_source?:
            | Database["public"]["Enums"]["completion_source"]
            | null
          created_at?: string
          earned_on: string
          entry_kind: string
          event_type: string
          goal_id?: string | null
          id?: string
          metadata?: Json
          seq?: never
          source_key: string
          track_key: string
          user_id: string
          xp_delta: number
        }
        Update: {
          completion_id?: string | null
          completion_source?:
            | Database["public"]["Enums"]["completion_source"]
            | null
          created_at?: string
          earned_on?: string
          entry_kind?: string
          event_type?: string
          goal_id?: string | null
          id?: string
          metadata?: Json
          seq?: never
          source_key?: string
          track_key?: string
          user_id?: string
          xp_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "xp_ledger_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_ledger_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xp_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_levels: {
        Row: {
          created_at: string
          level: number
          title: string
        }
        Insert: {
          created_at?: string
          level: number
          title: string
        }
        Update: {
          created_at?: string
          level?: number
          title?: string
        }
        Relationships: []
      }
      xp_profiles: {
        Row: {
          created_at: string
          current_level: number
          total_xp: number
          track_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level: number
          total_xp?: number
          track_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: number
          total_xp?: number
          track_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      accept_team_invite_service: {
        Args: { p_team_id: string; p_visibility_acknowledged: boolean }
        Returns: boolean
      }
      acknowledge_user_award_service: {
        Args: { p_award_id: string; p_user_id: string }
        Returns: boolean
      }
      add_feed_reaction_service: {
        Args: {
          p_feed_event_id: string
          p_reaction: Database["public"]["Enums"]["reaction_kind"]
        }
        Returns: boolean
      }
      apply_external_completion_service: {
        Args: {
          p_completed_on: string
          p_external_key: string
          p_goal_id: string
          p_local_today: string
        }
        Returns: boolean
      }
      apply_health_autocomplete_service: {
        Args: { p_local_today: string }
        Returns: Json
      }
      award_social_xp_service: {
        Args: {
          p_event_type: string
          p_source_key: string
          p_user_id: string
          p_xp: number
        }
        Returns: number
      }
      can_administer_goal: {
        Args: { p_goal_id: string; p_uid: string }
        Returns: boolean
      }
      can_complete_goal: {
        Args: { p_goal_id: string; p_uid: string }
        Returns: boolean
      }
      can_view_goal: {
        Args: { p_goal_id: string; p_uid: string }
        Returns: boolean
      }
      claim_notification_outbox_service: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          body: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          title: string
          url: string
          user_id: string
        }[]
      }
      clear_planner_schedule: {
        Args: { p_end: string; p_expected_digest: string; p_start: string }
        Returns: {
          schedule_digest: string
          unlocked_count: number
        }[]
      }
      clear_planner_schedule_windows: {
        Args: { p_expected_digest: string; p_windows: Json }
        Returns: {
          deleted_count: number
          schedule_digest: string
          window_count: number
        }[]
      }
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
      create_goal: {
        Args: {
          p_category?: string
          p_category_key?: string
          p_color?: string
          p_default_local_time?: string
          p_description?: string
          p_end_date?: string
          p_frequency_type?: Database["public"]["Enums"]["goal_frequency_type"]
          p_id: string
          p_is_private?: boolean
          p_milestone_names?: string[]
          p_recurrence_interval?: Database["public"]["Enums"]["recurrence_interval"]
          p_reward_text?: string
          p_start_date?: string
          p_target_count?: number
          p_team_id?: string
          p_title: string
        }
        Returns: string
      }
      create_goal_links: { Args: { p_links: Json }; Returns: undefined }
      create_goals: { Args: { p_goals: Json }; Returns: string[] }
      create_team_invite_service: {
        Args: { p_message?: string; p_partner_id: string }
        Returns: string
      }
      decline_team_invite_service: {
        Args: { p_team_id: string }
        Returns: boolean
      }
      delete_health_autocomplete_rule_service: {
        Args: { p_rule_id: string }
        Returns: boolean
      }
      disconnect_health_provider_service: {
        Args: { p_provider: Database["public"]["Enums"]["health_provider"] }
        Returns: Json
      }
      dissolve_team_service: { Args: never; Returns: boolean }
      find_profile_by_username: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          username: string
        }[]
      }
      get_challenge_detail: {
        Args: { p_challenge_id: string }
        Returns: {
          audience_kind: Database["public"]["Enums"]["social_audience_kind"]
          cohort_id: string
          description: string
          ends_at: string
          id: string
          max_participants: number
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key: string
          participant_count: number
          reward_xp: number
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["challenge_status"]
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          target_value: number
          title: string
          viewer_awarded_at: string
          viewer_completed_at: string
          viewer_joined: boolean
          viewer_progress: number
        }[]
      }
      get_leaderboard_standings: {
        Args: { p_limit?: number; p_offset?: number; p_season_id: string }
        Returns: {
          display_name: string
          rank: number
          score: number
          season_id: string
          subject_id: string
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          tie_break_at: string
          viewer_rank: number
        }[]
      }
      get_partner_profile_service: {
        Args: { p_owner_id: string }
        Returns: Json
      }
      get_planner_schedule_digest: {
        Args: { p_owner?: string }
        Returns: string
      }
      get_social_challenges: {
        Args: never
        Returns: {
          audience_kind: Database["public"]["Enums"]["social_audience_kind"]
          cohort_id: string
          description: string
          ends_at: string
          id: string
          max_participants: number
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key: string
          participant_count: number
          reward_xp: number
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["challenge_status"]
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          target_value: number
          title: string
          viewer_awarded_at: string
          viewer_completed_at: string
          viewer_joined: boolean
          viewer_progress: number
        }[]
      }
      get_social_feed: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_limit?: number
          p_scope?: string
          p_scope_id?: string
        }
        Returns: {
          actor_avatar_url: string
          actor_display_name: string
          actor_id: string
          actor_username: string
          category_label: string
          created_at: string
          event_type: Database["public"]["Enums"]["feed_event_type"]
          goal_title: string
          hidden_at: string
          id: string
          occurrence_count: number
          payload: Json
          reaction_count: number
          track_key: string
          viewer_reacted: boolean
          xp_delta: number
        }[]
      }
      get_social_leaderboard_season: {
        Args: { p_season_id: string }
        Returns: {
          cohort_id: string
          ends_at: string
          id: string
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key: string
          rollover: Database["public"]["Enums"]["leaderboard_rollover"]
          scope: Database["public"]["Enums"]["leaderboard_scope_kind"]
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["leaderboard_season_status"]
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          title: string
        }[]
      }
      get_social_leaderboards: {
        Args: never
        Returns: {
          cohort_id: string
          ends_at: string
          id: string
          metric: Database["public"]["Enums"]["challenge_metric"]
          metric_track_key: string
          rollover: Database["public"]["Enums"]["leaderboard_rollover"]
          scope: Database["public"]["Enums"]["leaderboard_scope_kind"]
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["leaderboard_season_status"]
          subject_kind: Database["public"]["Enums"]["social_subject_kind"]
          title: string
        }[]
      }
      get_team_goal_progress: {
        Args: { p_goal_id: string }
        Returns: {
          completion_count: number
          display_name: string
          user_id: string
          username: string
        }[]
      }
      get_team_state: {
        Args: never
        Returns: {
          accepted_at: string
          closed_at: string
          invite_message: string
          invited_at: string
          is_incoming: boolean
          partner_avatar_url: string
          partner_display_name: string
          partner_id: string
          partner_username: string
          status: Database["public"]["Enums"]["team_status"]
          team_id: string
        }[]
      }
      health_local_date_from_offset: {
        Args: { p_started_at: string; p_utc_offset_minutes: number }
        Returns: string
      }
      hide_feed_event_service: {
        Args: { p_event_id: string; p_hidden: boolean; p_reason?: string }
        Returns: boolean
      }
      ingest_health_activities_service: {
        Args: { p_deleted_native_ids?: Json; p_samples: Json }
        Returns: Json
      }
      is_platform_admin: {
        Args: { p_min_role?: Database["public"]["Enums"]["admin_role"] }
        Returns: boolean
      }
      join_challenge_service: {
        Args: { p_challenge_id: string }
        Returns: boolean
      }
      join_cohort_with_code_service: {
        Args: { p_join_code: string }
        Returns: string
      }
      join_group_with_code_service: {
        Args: { p_join_code: string }
        Returns: string
      }
      leave_challenge_service: {
        Args: { p_challenge_id: string }
        Returns: boolean
      }
      mark_goal_complete: {
        Args: { p_date?: string; p_goal_id: string }
        Returns: undefined
      }
      prepare_planner_schedule: {
        Args: {
          p_expected_digest: string
          p_items: Json
          p_unplaceable?: Json
          p_windows: Json
        }
        Returns: {
          deleted_count: number
          replayed: boolean
          schedule_digest: string
          upserted_count: number
        }[]
      }
      prepare_planner_schedule_core: {
        Args: { p_expected_digest: string; p_items: Json; p_windows: Json }
        Returns: {
          deleted_count: number
          replayed: boolean
          schedule_digest: string
          upserted_count: number
        }[]
      }
      recompute_goal_xp_service: {
        Args: { p_force_zero?: boolean; p_goal_id: string; p_user_id: string }
        Returns: number
      }
      recompute_health_daily_metrics_service: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      reconcile_goal_xp_service: {
        Args: { p_user_id?: string }
        Returns: number
      }
      record_planner_ai_output_tokens: {
        Args: {
          p_feature: string
          p_output_tokens: number
          p_owner: string
          p_usage_date: string
        }
        Returns: number
      }
      refresh_challenge_progress_service: { Args: never; Returns: number }
      refresh_leaderboard_standings_service: { Args: never; Returns: number }
      remove_feed_reaction_service: {
        Args: {
          p_feed_event_id: string
          p_reaction: Database["public"]["Enums"]["reaction_kind"]
        }
        Returns: boolean
      }
      replace_goal_source_link: {
        Args: { p_source_goal_id: string; p_target_goal_id?: string }
        Returns: undefined
      }
      replace_native_push_subscription_service: {
        Args: {
          p_endpoint: string
          p_native_token: string
          p_platform: string
          p_updated_at?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: boolean
      }
      resolve_notification_outbox_delivery_service: {
        Args: { p_error?: string; p_outbox_id: string; p_sent: boolean }
        Returns: boolean
      }
      rollover_leaderboard_seasons_service: { Args: never; Returns: number }
      save_planner_coach_conversation_service: {
        Args: {
          p_messages: Json
          p_preview_text: string
          p_scope_month: string
          p_timezone: string
          p_title: string
        }
        Returns: {
          created_at: string
          id: string
          message_count: number
          preview_text: string
          scope_month: string
          timezone: string
          title: string
          updated_at: string
        }[]
      }
      send_nudge_service: {
        Args: {
          p_goal_id?: string
          p_kind?: Database["public"]["Enums"]["nudge_kind"]
          p_message?: string
          p_to_user_id: string
        }
        Returns: string
      }
      set_goal_archived: {
        Args: { p_archived: boolean; p_goal_id: string }
        Returns: undefined
      }
      set_goal_milestone_names: {
        Args: { p_goal_id: string; p_milestone_names: string[] }
        Returns: undefined
      }
      set_goal_photo_path: {
        Args: { p_goal_id: string; p_photo_path: string }
        Returns: undefined
      }
      set_planner_item_lock: {
        Args: {
          p_expected_digest: string
          p_item_id: string
          p_locked: boolean
        }
        Returns: {
          item_id: string
          locked: boolean
          schedule_digest: string
        }[]
      }
      set_planner_schedule: {
        Args: {
          p_end: string
          p_expected_digest: string
          p_items: Json
          p_start: string
        }
        Returns: {
          schedule_digest: string
          upserted_count: number
        }[]
      }
      soft_delete_goal: { Args: { p_goal_id: string }; Returns: undefined }
      unmark_goal_complete: {
        Args: { p_date?: string; p_goal_id: string }
        Returns: undefined
      }
      update_goal: {
        Args: {
          p_category?: string
          p_category_key?: string
          p_color?: string
          p_default_local_time?: string
          p_description?: string
          p_end_date?: string
          p_frequency_type?: Database["public"]["Enums"]["goal_frequency_type"]
          p_id: string
          p_is_private?: boolean
          p_milestone_names?: string[]
          p_recurrence_interval?: Database["public"]["Enums"]["recurrence_interval"]
          p_reward_text?: string
          p_start_date?: string
          p_target_count?: number
          p_team_id?: string
          p_title: string
        }
        Returns: undefined
      }
      upsert_health_autocomplete_rule_service: {
        Args: {
          p_enabled?: boolean
          p_goal_id: string
          p_metric_key: Database["public"]["Enums"]["health_metric_key"]
          p_threshold_numeric: number
        }
        Returns: Json
      }
      username_is_available: { Args: { p_username: string }; Returns: boolean }
    }
    Enums: {
      admin_role: "admin" | "moderator"
      challenge_metric:
        | "total_xp"
        | "category_xp"
        | "completions_count"
        | "distinct_active_days"
        | "max_streak_days"
      challenge_status: "draft" | "scheduled" | "active" | "closed" | "archived"
      cohort_member_role: "member" | "manager"
      completion_source: "manual" | "linked_cascade" | "external_sync"
      feed_event_type:
        | "xp_earned"
        | "level_up"
        | "goal_achieved"
        | "challenge_completed"
        | "season_result"
        | "team_formed"
      goal_frequency_type: "fixed_milestones" | "recurring"
      health_metric_key:
        | "steps"
        | "active_energy_kcal"
        | "distance_meters"
        | "exercise_minutes"
        | "sleep_asleep_minutes"
        | "workout_duration_minutes"
      health_provider: "apple_healthkit" | "android_health_connect"
      leaderboard_rollover:
        | "none"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
      leaderboard_scope_kind: "global" | "cohort"
      leaderboard_season_status: "upcoming" | "open" | "closed"
      moderation_action:
        | "hide"
        | "unhide"
        | "ban_leaderboard"
        | "unban_leaderboard"
        | "remove_participant"
        | "close_challenge"
      moderation_target: "feed_event" | "user" | "challenge" | "team"
      notification_channel: "push"
      notification_kind:
        | "team_invite"
        | "team_accepted"
        | "team_dissolved"
        | "nudge"
        | "reaction"
        | "challenge_joined"
        | "challenge_completed"
        | "challenge_ending_soon"
        | "season_closed"
        | "planner_proposal"
        | "planner_proposal_decided"
      notification_state: "pending" | "sent" | "failed" | "skipped"
      nudge_kind: "cheer" | "remind" | "custom"
      reaction_kind: "cheer" | "fire" | "clap" | "strong"
      recurrence_interval: "daily" | "weekly" | "monthly"
      social_audience_kind: "global" | "cohort"
      social_subject_kind: "user" | "team"
      team_status: "pending" | "active" | "closed"
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
      admin_role: ["admin", "moderator"],
      challenge_metric: [
        "total_xp",
        "category_xp",
        "completions_count",
        "distinct_active_days",
        "max_streak_days",
      ],
      challenge_status: ["draft", "scheduled", "active", "closed", "archived"],
      cohort_member_role: ["member", "manager"],
      completion_source: ["manual", "linked_cascade", "external_sync"],
      feed_event_type: [
        "xp_earned",
        "level_up",
        "goal_achieved",
        "challenge_completed",
        "season_result",
        "team_formed",
      ],
      goal_frequency_type: ["fixed_milestones", "recurring"],
      health_metric_key: [
        "steps",
        "active_energy_kcal",
        "distance_meters",
        "exercise_minutes",
        "sleep_asleep_minutes",
        "workout_duration_minutes",
      ],
      health_provider: ["apple_healthkit", "android_health_connect"],
      leaderboard_rollover: [
        "none",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      leaderboard_scope_kind: ["global", "cohort"],
      leaderboard_season_status: ["upcoming", "open", "closed"],
      moderation_action: [
        "hide",
        "unhide",
        "ban_leaderboard",
        "unban_leaderboard",
        "remove_participant",
        "close_challenge",
      ],
      moderation_target: ["feed_event", "user", "challenge", "team"],
      notification_channel: ["push"],
      notification_kind: [
        "team_invite",
        "team_accepted",
        "team_dissolved",
        "nudge",
        "reaction",
        "challenge_joined",
        "challenge_completed",
        "challenge_ending_soon",
        "season_closed",
        "planner_proposal",
        "planner_proposal_decided",
      ],
      notification_state: ["pending", "sent", "failed", "skipped"],
      nudge_kind: ["cheer", "remind", "custom"],
      reaction_kind: ["cheer", "fire", "clap", "strong"],
      recurrence_interval: ["daily", "weekly", "monthly"],
      social_audience_kind: ["global", "cohort"],
      social_subject_kind: ["user", "team"],
      team_status: ["pending", "active", "closed"],
    },
  },
} as const


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
      is_valid_planner_timezone: {
        Args: { p_timezone: string }
        Returns: boolean
      }
      local_today_for_timezone: {
        Args: { p_timezone: string }
        Returns: string
      }
      normalize_goal_category_key: {
        Args: { p_category: string }
        Returns: string
      }
      planner_json_depth: { Args: { p_value: Json }; Returns: number }
      planner_owner_lock_key: { Args: { p_owner: string }; Returns: number }
      planner_scope_is_replay: {
        Args: { p_items: Json; p_month: string; p_owner_id: string }
        Returns: boolean
      }
      sha256_hex_digest: { Args: { p_value: string }; Returns: string }
      validate_planner_json: {
        Args: {
          p_expected_type: string
          p_max_bytes?: number
          p_max_depth?: number
          p_value: Json
        }
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
          category_key: string
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
          start_date: string
          target_count: number | null
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
          is_group?: boolean
          milestone_names?: string[] | null
          owner_id: string
          photo_path?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          start_date?: string
          target_count?: number | null
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
          is_group?: boolean
          milestone_names?: string[] | null
          owner_id?: string
          photo_path?: string | null
          recurrence_interval?:
            | Database["public"]["Enums"]["recurrence_interval"]
            | null
          start_date?: string
          target_count?: number | null
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
          created_at: string
          display_name: string | null
          id: string
          rest_weekdays: number[]
          timezone: string
          timezone_confirmed_at: string | null
          username: string
          week_starts_on: number
        }
        Insert: {
          avatar_url?: string | null
          blackout_ranges?: Json
          created_at?: string
          display_name?: string | null
          id: string
          rest_weekdays?: number[]
          timezone?: string
          timezone_confirmed_at?: string | null
          username: string
          week_starts_on?: number
        }
        Update: {
          avatar_url?: string | null
          blackout_ranges?: Json
          created_at?: string
          display_name?: string | null
          id?: string
          rest_weekdays?: number[]
          timezone?: string
          timezone_confirmed_at?: string | null
          username?: string
          week_starts_on?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      clear_planner_schedule: {
        Args: { p_expected_digest: string; p_month: string }
        Returns: {
          schedule_digest: string
          unlocked_count: number
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
      get_planner_schedule_digest: {
        Args: { p_owner?: string }
        Returns: string
      }
      mark_goal_complete: {
        Args: { p_date?: string; p_goal_id: string }
        Returns: undefined
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
        Args: { p_expected_digest: string; p_items: Json; p_month: string }
        Returns: {
          schedule_digest: string
          upserted_count: number
        }[]
      }
      set_planner_schedule_batch: {
        Args: { p_batches: Json; p_expected_digest: string }
        Returns: {
          schedule_digest: string
          scope_count: number
          upserted_count: number
        }[]
      }
      unmark_goal_complete: {
        Args: { p_date?: string; p_goal_id: string }
        Returns: undefined
      }
      username_is_available: { Args: { p_username: string }; Returns: boolean }
    }
    Enums: {
      completion_source: "manual" | "linked_cascade"
      goal_frequency_type: "fixed_milestones" | "recurring"
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
      goal_frequency_type: ["fixed_milestones", "recurring"],
      participant_role: ["owner", "participant"],
      recurrence_interval: ["daily", "weekly", "monthly"],
    },
  },
} as const


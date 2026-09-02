export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_actions: {
        Row: {
          category: string
          channel: string
          created_at: string
          decision: string
          email_body: string | null
          email_subject: string | null
          escalated_at: string | null
          event_id: string
          id: string
          matched_via: string
          reasoning: string
          recovered: boolean
          recovered_amount: number | null
          recovered_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          signal: string
          status: string
          workflow: string | null
        }
        Insert: {
          category: string
          channel: string
          created_at?: string
          decision: string
          email_body?: string | null
          email_subject?: string | null
          escalated_at?: string | null
          event_id: string
          id?: string
          matched_via: string
          reasoning: string
          recovered?: boolean
          recovered_amount?: number | null
          recovered_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          signal: string
          status?: string
          workflow?: string | null
        }
        Update: {
          category?: string
          channel?: string
          created_at?: string
          decision?: string
          email_body?: string | null
          email_subject?: string | null
          escalated_at?: string | null
          event_id?: string
          id?: string
          matched_via?: string
          reasoning?: string
          recovered?: boolean
          recovered_amount?: number | null
          recovered_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          signal?: string
          status?: string
          workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      business_alerts: {
        Row: {
          affected_count: number
          alert_type: string
          created_at: string
          event_id: string | null
          id: string
          status: string
          summary: string
          time_window_end: string
          time_window_start: string
        }
        Insert: {
          affected_count?: number
          alert_type: string
          created_at?: string
          event_id?: string | null
          id?: string
          status?: string
          summary: string
          time_window_end?: string
          time_window_start?: string
        }
        Update: {
          affected_count?: number
          alert_type?: string
          created_at?: string
          event_id?: string | null
          id?: string
          status?: string
          summary?: string
          time_window_end?: string
          time_window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_alerts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          event_created_at: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          received_at: string
        }
        Insert: {
          event_created_at?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          received_at?: string
        }
        Update: {
          event_created_at?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      risk_rules: {
        Row: {
          category: Database["public"]["Enums"]["risk_category"]
          created_at: string
          id: string
          recommended_action: string
          root_cause: string
          signal: string
          updated_at: string
          urgency: Database["public"]["Enums"]["risk_urgency"]
        }
        Insert: {
          category: Database["public"]["Enums"]["risk_category"]
          created_at?: string
          id?: string
          recommended_action: string
          root_cause: string
          signal: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["risk_urgency"]
        }
        Update: {
          category?: Database["public"]["Enums"]["risk_category"]
          created_at?: string
          id?: string
          recommended_action?: string
          root_cause?: string
          signal?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["risk_urgency"]
        }
        Relationships: []
      }
      scheduled_retries: {
        Row: {
          attempt: number
          created_at: string
          event_id: string
          executed: boolean
          id: string
          outcome: string | null
          retry_at: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          event_id: string
          executed?: boolean
          id?: string
          outcome?: string | null
          retry_at: string
        }
        Update: {
          attempt?: number
          created_at?: string
          event_id?: string
          executed?: boolean
          id?: string
          outcome?: string | null
          retry_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_retries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          event_id: string | null
          gmail_message_id: string | null
          id: string
          sender: string
          subject: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          event_id?: string | null
          gmail_message_id?: string | null
          id?: string
          sender: string
          subject?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event_id?: string | null
          gmail_message_id?: string | null
          id?: string
          sender?: string
          subject?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          ai_answer: string | null
          created_at: string
          customer_confirmation: string | null
          customer_email: string
          customer_question: string | null
          event_id: string | null
          final_reply: string | null
          gmail_thread_id: string
          human_owned: boolean
          human_owned_at: string | null
          id: string
          matched_via: string | null
          original_subject: string | null
          state: string
          updated_at: string
        }
        Insert: {
          ai_answer?: string | null
          created_at?: string
          customer_confirmation?: string | null
          customer_email: string
          customer_question?: string | null
          event_id?: string | null
          final_reply?: string | null
          gmail_thread_id: string
          human_owned?: boolean
          human_owned_at?: string | null
          id?: string
          matched_via?: string | null
          original_subject?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          ai_answer?: string | null
          created_at?: string
          customer_confirmation?: string | null
          customer_email?: string
          customer_question?: string | null
          event_id?: string | null
          final_reply?: string | null
          gmail_thread_id?: string
          human_owned?: boolean
          human_owned_at?: string | null
          id?: string
          matched_via?: string | null
          original_subject?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      risk_category:
        | "customer_fixable"
        | "bank_side"
        | "merchant_side"
        | "healthy"
        | "fraud_suspected"
      risk_urgency: "low" | "medium" | "high" | "healthy"
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
  public: {
    Enums: {
      risk_category: [
        "customer_fixable",
        "bank_side",
        "merchant_side",
        "healthy",
        "fraud_suspected",
      ],
      risk_urgency: ["low", "medium", "high", "healthy"],
    },
  },
} as const

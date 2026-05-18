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
      generations: {
        Row: {
          created_at: string
          id: string
          input_text: string | null
          palette_key: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_text?: string | null
          palette_key?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_text?: string | null
          palette_key?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      plan_quotas: {
        Row: {
          description: string | null
          monthly_limit: number
          plan: Database["public"]["Enums"]["user_plan"]
          updated_at: string
        }
        Insert: {
          description?: string | null
          monthly_limit: number
          plan: Database["public"]["Enums"]["user_plan"]
          updated_at?: string
        }
        Update: {
          description?: string | null
          monthly_limit?: number
          plan?: Database["public"]["Enums"]["user_plan"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          hide_welcome: boolean
          id: string
          is_active: boolean
          plan: Database["public"]["Enums"]["user_plan"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          hide_welcome?: boolean
          id: string
          is_active?: boolean
          plan?: Database["public"]["Enums"]["user_plan"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          hide_welcome?: boolean
          id?: string
          is_active?: boolean
          plan?: Database["public"]["Enums"]["user_plan"]
          updated_at?: string
        }
        Relationships: []
      }
      sicai_analyses: {
        Row: {
          abstraction_level: string | null
          agency: string | null
          ai_model: string | null
          ai_raw_response: Json | null
          analysis_level: string
          cardinality: Json | null
          classification_status: string | null
          created_at: string
          document_id: string | null
          dominant_textual_function: string | null
          graphic_family: string | null
          iconic_affordance: Json | null
          id: string
          image_prompt: string | null
          intensities: Json
          paragraph_id: string | null
          secondary_categories: Json | null
          sicai_archetype_id: string | null
          spatiality: string | null
          temporality: string | null
          tension: string | null
          transformation: string | null
          updated_at: string
          visual_brief: Json | null
        }
        Insert: {
          abstraction_level?: string | null
          agency?: string | null
          ai_model?: string | null
          ai_raw_response?: Json | null
          analysis_level: string
          cardinality?: Json | null
          classification_status?: string | null
          created_at?: string
          document_id?: string | null
          dominant_textual_function?: string | null
          graphic_family?: string | null
          iconic_affordance?: Json | null
          id?: string
          image_prompt?: string | null
          intensities?: Json
          paragraph_id?: string | null
          secondary_categories?: Json | null
          sicai_archetype_id?: string | null
          spatiality?: string | null
          temporality?: string | null
          tension?: string | null
          transformation?: string | null
          updated_at?: string
          visual_brief?: Json | null
        }
        Update: {
          abstraction_level?: string | null
          agency?: string | null
          ai_model?: string | null
          ai_raw_response?: Json | null
          analysis_level?: string
          cardinality?: Json | null
          classification_status?: string | null
          created_at?: string
          document_id?: string | null
          dominant_textual_function?: string | null
          graphic_family?: string | null
          iconic_affordance?: Json | null
          id?: string
          image_prompt?: string | null
          intensities?: Json
          paragraph_id?: string | null
          secondary_categories?: Json | null
          sicai_archetype_id?: string | null
          spatiality?: string | null
          temporality?: string | null
          tension?: string | null
          transformation?: string | null
          updated_at?: string
          visual_brief?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sicai_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sicai_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sicai_analyses_paragraph_id_fkey"
            columns: ["paragraph_id"]
            isOneToOne: false
            referencedRelation: "sicai_paragraphs"
            referencedColumns: ["id"]
          },
        ]
      }
      sicai_archetypes: {
        Row: {
          archetype_id: string
          avoid_for: Json | null
          best_for: Json | null
          cardinality: string
          composition_principle: string | null
          created_at: string
          description: string | null
          graphic_family: string
          id: string
          possible_tones: Json | null
          representation_regime: string
          visual_motifs: Json | null
        }
        Insert: {
          archetype_id: string
          avoid_for?: Json | null
          best_for?: Json | null
          cardinality: string
          composition_principle?: string | null
          created_at?: string
          description?: string | null
          graphic_family: string
          id?: string
          possible_tones?: Json | null
          representation_regime: string
          visual_motifs?: Json | null
        }
        Update: {
          archetype_id?: string
          avoid_for?: Json | null
          best_for?: Json | null
          cardinality?: string
          composition_principle?: string | null
          created_at?: string
          description?: string | null
          graphic_family?: string
          id?: string
          possible_tones?: Json | null
          representation_regime?: string
          visual_motifs?: Json | null
        }
        Relationships: []
      }
      sicai_documents: {
        Row: {
          created_at: string
          created_by: string | null
          document_status: string | null
          id: string
          language: string | null
          paragraph_count: number | null
          raw_text: string | null
          source_id: string | null
          summary: string | null
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_status?: string | null
          id?: string
          language?: string | null
          paragraph_count?: number | null
          raw_text?: string | null
          source_id?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_status?: string | null
          id?: string
          language?: string | null
          paragraph_count?: number | null
          raw_text?: string | null
          source_id?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sicai_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sicai_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sicai_paragraphs: {
        Row: {
          created_at: string
          detected_items_count: number | null
          document_id: string | null
          has_list: boolean | null
          id: string
          paragraph_index: number
          paragraph_text: string
          word_count: number | null
        }
        Insert: {
          created_at?: string
          detected_items_count?: number | null
          document_id?: string | null
          has_list?: boolean | null
          id?: string
          paragraph_index: number
          paragraph_text: string
          word_count?: number | null
        }
        Update: {
          created_at?: string
          detected_items_count?: number | null
          document_id?: string | null
          has_list?: boolean | null
          id?: string
          paragraph_index?: number
          paragraph_text?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sicai_paragraphs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sicai_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sicai_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sicai_sources: {
        Row: {
          analysis_interest: string | null
          content_status: string | null
          created_at: string
          expected_sicai_profile: string | null
          id: string
          language: string | null
          source_id: string
          source_name: string | null
          source_type: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          analysis_interest?: string | null
          content_status?: string | null
          created_at?: string
          expected_sicai_profile?: string | null
          id?: string
          language?: string | null
          source_id: string
          source_name?: string | null
          source_type?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          analysis_interest?: string | null
          content_status?: string | null
          created_at?: string
          expected_sicai_profile?: string | null
          id?: string
          language?: string | null
          source_id?: string
          source_name?: string | null
          source_type?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      template_studio_params: {
        Row: {
          created_at: string
          created_by: string | null
          params: Json
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          params: Json
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          params?: Json
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_generate: { Args: { _user_id: string }; Returns: boolean }
      current_month_usage: { Args: { _user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      user_plan: "free" | "basic" | "premium"
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
      app_role: ["admin", "user"],
      user_plan: ["free", "basic", "premium"],
    },
  },
} as const

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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      child_recipe_history: {
        Row: {
          child_id: string
          id: string
          is_favorite: boolean | null
          notes: string | null
          occurred_at: string
          rating: number | null
          recipe_id: string
          recipe_version_id: string | null
        }
        Insert: {
          child_id: string
          id?: string
          is_favorite?: boolean | null
          notes?: string | null
          occurred_at?: string
          rating?: number | null
          recipe_id: string
          recipe_version_id?: string | null
        }
        Update: {
          child_id?: string
          id?: string
          is_favorite?: boolean | null
          notes?: string | null
          occurred_at?: string
          rating?: number | null
          recipe_id?: string
          recipe_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_recipe_history_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_recipe_history_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_recipe_history_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          allergies: string[] | null
          birth_date: string | null
          created_at: string | null
          dietary_restrictions: string[] | null
          gender: string | null
          id: string
          name: string
          notes: string | null
          profile_id: string
          updated_at: string | null
        }
        Insert: {
          allergies?: string[] | null
          birth_date?: string | null
          created_at?: string | null
          dietary_restrictions?: string[] | null
          gender?: string | null
          id?: string
          name: string
          notes?: string | null
          profile_id: string
          updated_at?: string | null
        }
        Update: {
          allergies?: string[] | null
          birth_date?: string | null
          created_at?: string | null
          dietary_restrictions?: string[] | null
          gender?: string | null
          id?: string
          name?: string
          notes?: string | null
          profile_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan: {
        Row: {
          child_id: string
          created_at: string | null
          id: string
          meal_date: string
          meal_type: string
          note: string | null
          recipe_id: string | null
          recipe_version_id: string | null
          updated_at: string | null
        }
        Insert: {
          child_id: string
          created_at?: string | null
          id?: string
          meal_date: string
          meal_type: string
          note?: string | null
          recipe_id?: string | null
          recipe_version_id?: string | null
          updated_at?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string | null
          id?: string
          meal_date?: string
          meal_type?: string
          note?: string | null
          recipe_id?: string | null
          recipe_version_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          metadata: Json | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          metadata?: Json | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          id: string
          is_optional: boolean | null
          name: string
          normalized_name: string | null
          notes: string | null
          quantity: number | null
          recipe_version_id: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_optional?: boolean | null
          name: string
          normalized_name?: string | null
          notes?: string | null
          quantity?: number | null
          recipe_version_id: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_optional?: boolean | null
          name?: string
          normalized_name?: string | null
          notes?: string | null
          quantity?: number | null
          recipe_version_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          created_at: string | null
          description: string
          duration_minutes: number | null
          id: string
          recipe_version_id: string
          step_order: number
          step_type: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          duration_minutes?: number | null
          id?: string
          recipe_version_id: string
          step_order: number
          step_type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          duration_minutes?: number | null
          id?: string
          recipe_version_id?: string
          step_order?: number
          step_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tags: {
        Row: {
          recipe_id: string
          tag_id: string
        }
        Insert: {
          recipe_id: string
          tag_id: string
        }
        Update: {
          recipe_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tags_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_versions: {
        Row: {
          author_profile_id: string | null
          created_at: string | null
          id: string
          ingredients: Json
          instructions: Json
          is_published: boolean | null
          notes: string | null
          recipe_id: string
          search_vector: unknown
          version_number: number
        }
        Insert: {
          author_profile_id?: string | null
          created_at?: string | null
          id?: string
          ingredients: Json
          instructions: Json
          is_published?: boolean | null
          notes?: string | null
          recipe_id: string
          search_vector?: unknown
          version_number?: number
        }
        Update: {
          author_profile_id?: string | null
          created_at?: string | null
          id?: string
          ingredients?: Json
          instructions?: Json
          is_published?: boolean | null
          notes?: string | null
          recipe_id?: string
          search_vector?: unknown
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          age_range: unknown
          author_profile_id: string | null
          created_at: string | null
          current_version_id: string | null
          id: string
          metadata: Json | null
          summary: string | null
          title: string
          updated_at: string | null
          visibility: string | null
        }
        Insert: {
          age_range?: unknown
          author_profile_id?: string | null
          created_at?: string | null
          current_version_id?: string | null
          id?: string
          metadata?: Json | null
          summary?: string | null
          title: string
          updated_at?: string | null
          visibility?: string | null
        }
        Update: {
          age_range?: unknown
          author_profile_id?: string | null
          created_at?: string | null
          current_version_id?: string | null
          id?: string
          metadata?: Json | null
          summary?: string | null
          title?: string
          updated_at?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_bought: boolean | null
          normalized_product: string | null
          product: string
          quantity: number | null
          shopping_list_id: string
          source_child_id: string | null
          source_recipe_id: string | null
          source_recipe_version_id: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_bought?: boolean | null
          normalized_product?: string | null
          product: string
          quantity?: number | null
          shopping_list_id: string
          source_child_id?: string | null
          source_recipe_id?: string | null
          source_recipe_version_id?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_bought?: boolean | null
          normalized_product?: string | null
          product?: string
          quantity?: number | null
          shopping_list_id?: string
          source_child_id?: string | null
          source_recipe_id?: string | null
          source_recipe_version_id?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          profile_id: string
          shared_group_id: string | null
          title: string | null
          updated_at: string | null
          week_start_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          profile_id: string
          shared_group_id?: string | null
          title?: string | null
          updated_at?: string | null
          week_start_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          profile_id?: string
          shared_group_id?: string | null
          title?: string | null
          updated_at?: string | null
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

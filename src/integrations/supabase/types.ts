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
      chat_history: {
        Row: {
          child_id: string | null
          created_at: string
          id: string
          message: string
          message_type: string | null
          response: string | null
          user_id: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          id?: string
          message: string
          message_type?: string | null
          response?: string | null
          user_id: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          id?: string
          message?: string
          message_type?: string | null
          response?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_history_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          allergies: string[] | null
          avatar_url: string | null
          birth_date: string
          created_at: string
          diet_goals: string[] | null
          dislikes: string[] | null
          height: number | null
          id: string
          name: string
          preferences: string[] | null
          updated_at: string
          user_id: string
          weight: number | null
        }
        Insert: {
          allergies?: string[] | null
          avatar_url?: string | null
          birth_date: string
          created_at?: string
          diet_goals?: string[] | null
          dislikes?: string[] | null
          height?: number | null
          id?: string
          name: string
          preferences?: string[] | null
          updated_at?: string
          user_id: string
          weight?: number | null
        }
        Update: {
          allergies?: string[] | null
          avatar_url?: string | null
          birth_date?: string
          created_at?: string
          diet_goals?: string[] | null
          dislikes?: string[] | null
          height?: number | null
          id?: string
          name?: string
          preferences?: string[] | null
          updated_at?: string
          user_id?: string
          weight?: number | null
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          child_id: string | null
          created_at: string
          id: string
          is_completed: boolean | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          planned_date: string
          recipe_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          child_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          meal_type: Database["public"]["Enums"]["meal_type"]
          planned_date: string
          recipe_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          child_id?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean | null
          meal_type?: Database["public"]["Enums"]["meal_type"]
          planned_date?: string
          recipe_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
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
          notifications_enabled: boolean | null
          subscription_status: string | null
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          notifications_enabled?: boolean | null
          subscription_status?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          notifications_enabled?: boolean | null
          subscription_status?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          amount: number | null
          category: Database["public"]["Enums"]["product_category"] | null
          id: string
          name: string
          order_index: number | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          id?: string
          name: string
          order_index?: number | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          id?: string
          name?: string
          order_index?: number | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          duration_minutes: number | null
          id: string
          image_url: string | null
          instruction: string
          recipe_id: string
          step_number: number
        }
        Insert: {
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          instruction: string
          recipe_id: string
          step_number: number
        }
        Update: {
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          instruction?: string
          recipe_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories: number | null
          carbs: number | null
          child_id: string | null
          cooking_time_minutes: number | null
          created_at: string
          description: string | null
          fats: number | null
          id: string
          image_url: string | null
          is_favorite: boolean | null
          is_premium_feature: boolean | null
          macros: Json | null
          max_age_months: number | null
          min_age_months: number | null
          proteins: number | null
          rating: number | null
          source_products: string[] | null
          tags: string[] | null
          times_cooked: number | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          child_id?: string | null
          cooking_time_minutes?: number | null
          created_at?: string
          description?: string | null
          fats?: number | null
          id?: string
          image_url?: string | null
          is_favorite?: boolean | null
          is_premium_feature?: boolean | null
          macros?: Json | null
          max_age_months?: number | null
          min_age_months?: number | null
          proteins?: number | null
          rating?: number | null
          source_products?: string[] | null
          tags?: string[] | null
          times_cooked?: number | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          child_id?: string | null
          cooking_time_minutes?: number | null
          created_at?: string
          description?: string | null
          fats?: number | null
          id?: string
          image_url?: string | null
          is_favorite?: boolean | null
          is_premium_feature?: boolean | null
          macros?: Json | null
          max_age_months?: number | null
          min_age_months?: number | null
          proteins?: number | null
          rating?: number | null
          source_products?: string[] | null
          tags?: string[] | null
          times_cooked?: number | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          amount: number | null
          category: Database["public"]["Enums"]["product_category"] | null
          created_at: string
          id: string
          is_purchased: boolean | null
          name: string
          recipe_id: string | null
          shopping_list_id: string
          unit: string | null
        }
        Insert: {
          amount?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          created_at?: string
          id?: string
          is_purchased?: boolean | null
          name: string
          recipe_id?: string | null
          shopping_list_id: string
          unit?: string | null
        }
        Update: {
          amount?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          created_at?: string
          id?: string
          is_purchased?: boolean | null
          name?: string
          recipe_id?: string | null
          shopping_list_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
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
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_usage: {
        Row: {
          created_at: string
          date: string
          generations: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          generations?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          generations?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_usage_limit: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_usage: { Args: { _user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      meal_type: "breakfast" | "lunch" | "dinner" | "snack"
      product_category:
        | "vegetables"
        | "fruits"
        | "dairy"
        | "meat"
        | "grains"
        | "other"
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
      meal_type: ["breakfast", "lunch", "dinner", "snack"],
      product_category: [
        "vegetables",
        "fruits",
        "dairy",
        "meat",
        "grains",
        "other",
      ],
    },
  },
} as const

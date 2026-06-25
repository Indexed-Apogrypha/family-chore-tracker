/**
 * Supabase schema types — GENERATED, do not edit by hand.
 *
 * Regenerate after any migration (design §5, §6):
 *   supabase gen types typescript --project-id ayuhskelywuvdcggomre > src/composition/database.types.ts
 * (or via the Supabase MCP `generate_typescript_types`). The Supabase adapters
 * type their queries against `Database` so a schema drift fails `typecheck`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      chore_instances: {
        Row: {
          assigned_member_id: string;
          created_at: string;
          description: string | null;
          due_date: string;
          family_id: string;
          id: string;
          points: number;
          status: string;
          template_id: string | null;
          title: string;
        };
        Insert: {
          assigned_member_id: string;
          created_at?: string;
          description?: string | null;
          due_date: string;
          family_id: string;
          id?: string;
          points: number;
          status?: string;
          template_id?: string | null;
          title: string;
        };
        Update: {
          assigned_member_id?: string;
          created_at?: string;
          description?: string | null;
          due_date?: string;
          family_id?: string;
          id?: string;
          points?: number;
          status?: string;
          template_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chore_instances_assigned_member_id_fkey";
            columns: ["assigned_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chore_instances_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chore_instances_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "chore_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      chore_templates: {
        Row: {
          active: boolean;
          assigned_member_id: string;
          created_at: string;
          description: string | null;
          family_id: string;
          id: string;
          points: number;
          recurrence: Json;
          title: string;
        };
        Insert: {
          active?: boolean;
          assigned_member_id: string;
          created_at?: string;
          description?: string | null;
          family_id: string;
          id?: string;
          points: number;
          recurrence: Json;
          title: string;
        };
        Update: {
          active?: boolean;
          assigned_member_id?: string;
          created_at?: string;
          description?: string | null;
          family_id?: string;
          id?: string;
          points?: number;
          recurrence?: Json;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chore_templates_assigned_member_id_fkey";
            columns: ["assigned_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chore_templates_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      families: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          auth_user_id: string | null;
          created_at: string;
          display_name: string;
          family_id: string;
          id: string;
          kind: string;
          pin_hash: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          created_at?: string;
          display_name: string;
          family_id: string;
          id?: string;
          kind: string;
          pin_hash?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          created_at?: string;
          display_name?: string;
          family_id?: string;
          id?: string;
          kind?: string;
          pin_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      points_ledger: {
        Row: {
          created_at: string;
          delta: number;
          family_id: string;
          id: string;
          member_id: string;
          reason: string;
          submission_id: string;
        };
        Insert: {
          created_at?: string;
          delta: number;
          family_id: string;
          id?: string;
          member_id: string;
          reason: string;
          submission_id: string;
        };
        Update: {
          created_at?: string;
          delta?: number;
          family_id?: string;
          id?: string;
          member_id?: string;
          reason?: string;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "points_ledger_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "points_ledger_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "points_ledger_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: true;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          ai_verdict: Json | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          family_id: string;
          id: string;
          instance_id: string;
          photo_path: string;
          status: string;
          submitted_by: string;
        };
        Insert: {
          ai_verdict?: Json | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          family_id: string;
          id: string;
          instance_id: string;
          photo_path: string;
          status?: string;
          submitted_by: string;
        };
        Update: {
          ai_verdict?: Json | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          family_id?: string;
          id?: string;
          instance_id?: string;
          photo_path?: string;
          status?: string;
          submitted_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "chore_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_family: {
        Args: {
          p_auth_user_id?: string;
          p_founder_name: string;
          p_name: string;
        };
        Returns: {
          family_id: string;
          family_name: string;
          founder_id: string;
        }[];
      };
      record_decision_and_advance: {
        Args: {
          p_decided_at: string;
          p_decided_by: string;
          p_family_id: string;
          p_instance_id: string;
          p_status: string;
          p_submission_id: string;
        };
        Returns: undefined;
      };
      record_verdict_and_advance: {
        Args: {
          p_family_id: string;
          p_instance_id: string;
          p_submission_id: string;
          p_verdict: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

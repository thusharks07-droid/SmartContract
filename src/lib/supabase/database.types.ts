export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      contractiq_profiles: {
        Row: { user_id: string; display_name: string | null; created_at: string; updated_at: string }
        Insert: never
        Update: { display_name?: string | null }
        Relationships: [
          { foreignKeyName: 'contractiq_profiles_user_id_fkey'; columns: ['user_id']; isOneToOne: true; referencedRelation: 'users'; referencedColumns: ['id'] },
        ]
      }
      contractiq_scans: {
        Row: {
          id: string; user_id: string; contract_name: string; source_filename: string | null; source_code: string; source_hash: string | null
          input_type: 'upload' | 'paste'; compiler_version: string | null; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
          is_demo: boolean; analysis_engine: string | null; analysis_version: string | null; options: Json; summary: Json
          error_code: string | null; error_message: string | null; started_at: string | null; completed_at: string | null
          notes: string | null; created_at: string; updated_at: string
        }
        Insert: {
          user_id: string; contract_name?: string; source_filename?: string | null; source_code: string
          source_hash?: string | null; input_type: 'upload' | 'paste'; compiler_version?: string | null
          options?: Json; notes?: string | null
        }
        Update: never
        Relationships: [
          { foreignKeyName: 'contractiq_scans_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
        ]
      }
      contractiq_findings: {
        Row: {
          id: string; scan_id: string; user_id: string; rule_id: string; title: string; description: string; impact: string
          severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'; confidence: 'high' | 'medium' | 'low' | null
          category: string | null; source_path: string | null; line_start: number | null; line_end: number | null
          code_excerpt: string | null; recommendation: string; evidence: Json; verification: Json; created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: 'contractiq_findings_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'contractiq_findings_scan_owner_fk'; columns: ['scan_id', 'user_id']; isOneToOne: false; referencedRelation: 'contractiq_scans'; referencedColumns: ['id', 'user_id'] },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Using fallback local storage mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'implicit',
  },
});

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          updated_at?: string;
        };
      };
      user_wallets: {
        Row: {
          id: string;
          user_id: string;
          credits: Record<string, number>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          credits?: Record<string, number>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          credits?: Record<string, number>;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'purchase' | 'usage';
          model_id: string | null;
          amount: number | null;
          credits: Record<string, number> | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'purchase' | 'usage';
          model_id?: string | null;
          amount?: number | null;
          credits?: Record<string, number> | null;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: 'purchase' | 'usage';
          model_id?: string | null;
          amount?: number | null;
          credits?: Record<string, number> | null;
          description?: string | null;
        };
      };
    };
  };
}


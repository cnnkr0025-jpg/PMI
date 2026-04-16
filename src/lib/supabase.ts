import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  if (typeof window === 'undefined') {
    console.error('[Supabase] NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다.');
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: typeof window !== 'undefined',
      autoRefreshToken: typeof window !== 'undefined',
      flowType: 'pkce',
      // Supabase 토큰을 localStorage가 아닌 sessionStorage에 저장하여 XSS 피해 최소화
      ...(typeof window !== 'undefined' ? {
        storage: {
          getItem: (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } },
          setItem: (key: string, value: string) => { try { sessionStorage.setItem(key, value); } catch {} },
          removeItem: (key: string) => { try { sessionStorage.removeItem(key); } catch {} },
        },
      } : {}),
    },
  }
);

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


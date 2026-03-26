import { supabase } from './supabase';
import type { User } from '@/types';
import { PasswordValidator } from './passwordValidator';
import { SignJWT } from 'jose';
import { getBaseUrl } from './redirect';

export class AuthService {
  /**
   * 회원가입
   */
  static async register(email: string, password: string, name: string): Promise<{ success: boolean; error?: string; requiresEmailVerification?: boolean; autoLogin?: boolean }> {
    try {
      // Supabase가 설정되어 있는 경우
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return { success: false, error: '올바른 이메일 형식이 아닙니다.' };
        }

        // 비밀번호 강도 검증 (강화된 정책)
        const passwordValidation = PasswordValidator.validate(password);
        if (!passwordValidation.isValid) {
          return { success: false, error: passwordValidation.errors[0] };
        }

        // 이메일과 비밀번호 유사도 검증
        if (!PasswordValidator.checkEmailSimilarity(password, email)) {
          return { success: false, error: '비밀번호는 이메일과 유사하지 않아야 합니다.' };
        }

        // 이름 검증
        if (name.length < 2 || name.length > 50) {
          return { success: false, error: '이름은 2자 이상 50자 이하여야 합니다.' };
        }

        // 이메일 중복 확인 (auth.users에서)
        const { data: existingUsers, error: checkError } = await supabase
          .rpc('check_email_exists', { check_email: email });

        // RPC 함수가 없으면 무시하고 진행 (fallback)
        if (!checkError && existingUsers) {
          if (existingUsers === true) {
            return { success: false, error: '이미 사용 중인 이메일입니다.' };
          }
        } else {
          // RPC 함수가 없는 경우 public.users 테이블에서 확인
          const { data: publicUsers } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .limit(1);

          if (publicUsers && publicUsers.length > 0) {
            return { success: false, error: '이미 사용 중인 이메일입니다.' };
          }
        }

        // Supabase Auth로 사용자 생성 (이메일 인증 활성화)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
            },
            emailRedirectTo: `${getBaseUrl()}/auth/callback`,
          },
        });

        if (authError) {
          // Supabase의 중복 이메일 오류 처리
          if (authError.message.includes('already registered') || 
              authError.message.includes('already exists') ||
              authError.message.includes('duplicate')) {
            return { success: false, error: '이미 사용 중인 이메일입니다.' };
          }
          return { success: false, error: authError.message };
        }

        if (!authData.user) {
          return { success: false, error: '사용자 생성 실패' };
        }

        // Supabase가 이미 존재하는 사용자에게 확인 이메일을 보내는 경우 체크
        // identities가 비어있으면 이미 존재하는 사용자 - 자동 로그인 시도
        if (authData.user.identities && authData.user.identities.length === 0) {
          // 이미 가입된 계정이므로 로그인 시도
          const loginResult = await this.login(email, password);
          if (loginResult.success) {
            return { success: true, autoLogin: true };
          }
          return { success: false, error: '이미 사용 중인 이메일입니다. 로그인을 시도해주세요.' };
        }

        // public.users 테이블에 사용자 정보 저장 (Trigger 대신 직접 처리)
        // 잠시 대기하여 auth 세션이 완전히 설정되도록 함
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          // 사용자 정보 삽입 시도
          const { data: insertData, error: insertError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              email: email,
              name: name,
            })
            .select()
            .single();

          if (insertError) {
            if (process.env.NODE_ENV !== 'production') {
              console.error('사용자 정보 저장 실패:', insertError);
              console.error('Error details:', JSON.stringify(insertError, null, 2));
              
              // RLS 정책 오류인 경우 특별히 로깅
              if (insertError.message.includes('policy') || insertError.message.includes('permission')) {
                console.error('RLS 정책 오류 감지! Supabase Dashboard에서 RLS 정책을 확인하세요.');
                console.error('FIX_USERS_TABLE.sql 파일을 실행하세요.');
              }
            }
          } else if (process.env.NODE_ENV !== 'production') {
            console.log('✅ 사용자 정보 저장 성공:', insertData);
          }

          // user_wallets도 생성
          const { data: walletData, error: walletError } = await supabase
            .from('user_wallets')
            .insert({
              user_id: authData.user.id,
              credits: {},
            })
            .select()
            .single();

          if (walletError) {
            if (process.env.NODE_ENV !== 'production') {
              console.error('지갑 생성 실패:', walletError);
              console.error('Wallet error details:', JSON.stringify(walletError, null, 2));
            }
          } else if (process.env.NODE_ENV !== 'production') {
            console.log('✅ 지갑 생성 성공:', walletData);
          }
        } catch (dbError: any) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('DB 저장 중 예외 발생:', dbError);
            console.error('Exception details:', JSON.stringify(dbError, null, 2));
          }
        }

        // 이메일 확인 필요 여부 체크
        const requiresEmailVerification = authData.user.identities?.length === 0;

        return { 
          success: true, 
          requiresEmailVerification: requiresEmailVerification || false 
        };
      } else {
        // Supabase 미설정 시 로컬 스토리지 사용 (fallback)
        return { success: true, requiresEmailVerification: false };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 로그인
   */
  static async login(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      // Supabase가 설정되어 있는 경우
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[AuthService.login] Supabase auth error:', authError.message);
          }
          // 사용자 친화적인 에러 메시지
          if (authError.message.includes('Invalid login credentials')) {
            return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
          }
          if (authError.message.includes('Email not confirmed')) {
            return { success: false, error: '이메일 인증이 필요합니다. 이메일을 확인해주세요.' };
          }
          return { success: false, error: authError.message };
        }

        if (!authData.user) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[AuthService.login] No user data returned');
          }
          return { success: false, error: '로그인 실패' };
        }

        // users 테이블에서 사용자 정보 가져오기
        const { data: userData, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (dbError || !userData) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[AuthService.login] Failed to fetch user data:', dbError?.message);
          }
          return { success: false, error: '사용자 정보를 찾을 수 없습니다' };
        }

        const user: User = {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          createdAt: new Date(userData.created_at),
        };

        if (process.env.NODE_ENV !== 'production') {
          console.log('[AuthService.login] Login successful for user:', user.email);
        }

        return { success: true, user };
      } else {
        // Supabase 미설정 시 로컬 fallback
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[AuthService.login] Supabase not configured, using fallback');
        }
        return { success: true };
      }
    } catch (error: any) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[AuthService.login] Unexpected error:', error);
      }
      return { success: false, error: error.message || '로그인 중 오류가 발생했습니다.' };
    }
  }

  /**
   * 로그아웃
   */
  static async logout(): Promise<void> {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      await supabase.auth.signOut();
    }
  }

  /**
   * 소셜 로그인 (OAuth)
   */
  static async signInWithOAuth(provider: 'google' | 'github'): Promise<{ success: boolean; error?: string }> {
    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return { success: false, error: 'Supabase가 설정되지 않았습니다.' };
      }

      const redirectUrl = getBaseUrl();
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo: `${redirectUrl}/auth/callback`,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 현재 세션 확인
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          return null;
        }

        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (!userData) {
          return null;
        }

        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          createdAt: new Date(userData.created_at),
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 이메일 인증 재전송
   */
  static async resendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: {
            emailRedirectTo: `${getBaseUrl()}/auth/callback`,
          },
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      return { success: false, error: 'Supabase가 설정되지 않았습니다.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 비밀번호 재설정 이메일 전송
   */
  static async sendPasswordResetEmail(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${getBaseUrl()}/auth/reset-password`,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      return { success: false, error: 'Supabase가 설정되지 않았습니다.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 비밀번호 변경
   */
  static async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        // 비밀번호 강도 검증
        const passwordValidation = PasswordValidator.validate(newPassword);
        if (!passwordValidation.isValid) {
          return { success: false, error: passwordValidation.errors[0] };
        }

        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true };
      }

      return { success: false, error: 'Supabase가 설정되지 않았습니다.' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 세션 토큰 생성 (JWT)
   */
  static async createSessionToken(userId: string, email: string, name: string): Promise<string> {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET이 설정되지 않았습니다.');
    }
    
    const key = new TextEncoder().encode(secret);
    
    const token = await new SignJWT({ userId, email, name })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(key);
    
    return token;
  }
}


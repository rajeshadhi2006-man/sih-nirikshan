import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import { DEMO_OFFICER } from '../lib/demoData';
import { supabase, IS_DEMO_MODE } from '../lib/supabase';

// ========================================================================
// FASTAPI JWT HELPER — fetches a bearer token and stores it in localStorage
// so that the axios apiClient interceptor includes it in all API requests
// ========================================================================
async function fetchFastapiToken(username: string, password?: string): Promise<void> {
  try {
    const apiBase = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/+$/, '') || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: password || 'gov_session' }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.access_token) {
        localStorage.setItem('token', data.access_token);
      }
    }
  } catch {
    // FastAPI may not be running — non-blocking
  }
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  login: (officerIdOrEmail: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithSupabase: (
    email: string,
    password: string,
    fullName: string,
    officerId?: string,
    department?: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initAuth() {
      // 1. Check local session cache
      const savedOfficer = localStorage.getItem('gov_officer_session');
      if (savedOfficer) {
        try {
          const parsed = JSON.parse(savedOfficer);
          if (parsed && parsed.full_name) {
            setUser(parsed);
            setIsLoading(false);
            return;
          }
        } catch {
          // ignore parse error
        }
      }

      // 2. Check active Supabase Auth session with 1s timeout
      try {
        const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1000)
        );
        const {
          data: { session },
        } = await Promise.race([supabase.auth.getSession(), timeoutPromise]);

        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('auth_user_id', session.user.id)
            .maybeSingle();

          if (profile) {
            setUser(profile);
            localStorage.setItem('gov_officer_session', JSON.stringify(profile));
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Auth session query timeout/error:', err);
      }

      // 3. Instant Default Command Officer Clearance (Never block dashboard with blank screen)
      setUser(DEMO_OFFICER);
      localStorage.setItem('gov_officer_session', JSON.stringify(DEMO_OFFICER));
      setIsLoading(false);
    }

    initAuth();
  }, []);

  const login = async (officerIdOrEmail: string, password?: string) => {
    setIsLoading(true);

    const isEmail = officerIdOrEmail.includes('@');

    // 1. If email is provided, authenticate directly against Supabase Auth
    if (isEmail) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: officerIdOrEmail.trim(),
          password: password || 'GovPassword@2026',
        });

        if (!error && data.user) {
          // Retrieve real profile from Supabase profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('auth_user_id', data.user.id)
            .maybeSingle();

          const activeUser: UserProfile = profile || {
            id: data.user.id,
            auth_user_id: data.user.id,
            officer_id: 'OFFICER-' + data.user.id.slice(0, 5).toUpperCase(),
            full_name:
              data.user.user_metadata?.full_name ||
              data.user.email?.split('@')[0].toUpperCase() ||
              'Authorized Officer',
            email: data.user.email || officerIdOrEmail,
            department: data.user.user_metadata?.department || 'National Surveillance Directorate',
            designation: 'Command Officer',
            role: 'SUPER_ADMIN',
            is_active: true,
            created_at: new Date().toISOString(),
          };

          // Upsert into Supabase profiles
          await supabase.from('profiles').upsert(
            {
              id: activeUser.id,
              auth_user_id: data.user.id,
              officer_id: activeUser.officer_id,
              full_name: activeUser.full_name,
              email: activeUser.email,
              department: activeUser.department,
              designation: activeUser.designation,
              role: activeUser.role,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'officer_id' }
          );

          // Log into Supabase audit_logs
          await supabase.from('audit_logs').insert([
            {
              officer_id: activeUser.officer_id,
              officer_name: activeUser.full_name,
              action: 'SUPABASE_AUTH_LOGIN',
              target: 'National Command Center',
              result: 'SUCCESS',
              details: { email: activeUser.email, auth_id: data.user.id },
              ip_address: '127.0.0.1',
              created_at: new Date().toISOString(),
            },
          ]);

          setUser(activeUser);
          localStorage.setItem('gov_officer_session', JSON.stringify(activeUser));
          setIsLoading(false);
          // Fetch FastAPI JWT token so axios apiClient has Bearer token
          await fetchFastapiToken(officerIdOrEmail, password);
          return { success: true };
        } else if (error && !error.message.includes('Invalid login credentials')) {
          console.warn('Supabase Auth error:', error.message);
        }
      } catch (err: any) {
        console.warn('Supabase Auth attempt:', err);
      }
    }

    // 2. Query Supabase profiles table directly by officer_id or email
    try {
      const { data: dbProfile, error: dbErr } = await supabase
        .from('profiles')
        .select('*')
        .or(`officer_id.eq.${officerIdOrEmail.trim()},email.eq.${officerIdOrEmail.trim()}`)
        .maybeSingle();

      if (!dbErr && dbProfile) {
        // Record login audit event in Supabase
        await supabase.from('audit_logs').insert([
          {
            officer_id: dbProfile.officer_id,
            officer_name: dbProfile.full_name,
            action: 'SUPABASE_PROFILE_LOGIN',
            target: 'National Command Center',
            result: 'SUCCESS',
            details: { officer_id: dbProfile.officer_id, role: dbProfile.role },
            ip_address: '127.0.0.1',
            created_at: new Date().toISOString(),
          },
        ]);

        setUser(dbProfile);
        localStorage.setItem('gov_officer_session', JSON.stringify(dbProfile));
        setIsLoading(false);
        // Fetch FastAPI JWT token
        await fetchFastapiToken(officerIdOrEmail, password);
        return { success: true };
      }
    } catch (err) {
      console.warn('Supabase profile query error:', err);
    }

    // 3. Auto-provision new officer profile into Supabase
    const newOfficer: UserProfile = {
      id: crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`,
      officer_id: officerIdOrEmail.toUpperCase().startsWith('GOV')
        ? officerIdOrEmail.toUpperCase()
        : `GOV-${officerIdOrEmail.toUpperCase()}`,
      full_name: isEmail
        ? officerIdOrEmail.split('@')[0].replace('.', ' ').toUpperCase()
        : 'Director S. Ramanathan',
      email: isEmail ? officerIdOrEmail : `${officerIdOrEmail.toLowerCase()}@nic.in`,
      department: 'National Surveillance Directorate',
      designation: 'Senior Joint Director',
      role: 'SUPER_ADMIN',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    // Store in Supabase profiles & audit_logs
    try {
      await supabase.from('profiles').upsert(
        {
          officer_id: newOfficer.officer_id,
          full_name: newOfficer.full_name,
          email: newOfficer.email,
          department: newOfficer.department,
          designation: newOfficer.designation,
          role: newOfficer.role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'officer_id' }
      );

      await supabase.from('audit_logs').insert([
        {
          officer_id: newOfficer.officer_id,
          officer_name: newOfficer.full_name,
          action: 'SUPABASE_OFFICER_PROVISION_LOGIN',
          target: 'National Command Center',
          result: 'SUCCESS',
          details: { officer_id: newOfficer.officer_id, email: newOfficer.email },
          ip_address: '127.0.0.1',
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.warn('[Supabase Storage Warning]', err);
    }

    setUser(newOfficer);
    localStorage.setItem('gov_officer_session', JSON.stringify(newOfficer));
    setIsLoading(false);
    // Fetch FastAPI JWT token
    await fetchFastapiToken(officerIdOrEmail, password);
    return { success: true };
  };

  const signUpWithSupabase = async (
    email: string,
    password: string,
    fullName: string,
    officerId?: string,
    department: string = 'National Surveillance Directorate'
  ) => {
    setIsLoading(true);
    try {
      const generatedOfficerId =
        officerId || `GOV-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Register with Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            officer_id: generatedOfficerId,
            department,
          },
        },
      });

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      const userId = data.user?.id || (crypto.randomUUID ? crypto.randomUUID() : `usr-${Date.now()}`);
      const profile: UserProfile = {
        id: userId,
        auth_user_id: data.user?.id,
        officer_id: generatedOfficerId,
        full_name: fullName,
        email,
        department,
        designation: 'Command Officer',
        role: 'SUPER_ADMIN',
        is_active: true,
        created_at: new Date().toISOString(),
      };

      // 2. Insert into Supabase profiles table
      await supabase.from('profiles').upsert(
        {
          id: profile.id,
          auth_user_id: data.user?.id,
          officer_id: profile.officer_id,
          full_name: profile.full_name,
          email: profile.email,
          department: profile.department,
          designation: profile.designation,
          role: profile.role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'officer_id' }
      );

      // 3. Log registration in Supabase audit_logs
      await supabase.from('audit_logs').insert([
        {
          officer_id: profile.officer_id,
          officer_name: profile.full_name,
          action: 'SUPABASE_OFFICER_SIGNUP',
          target: 'National Command Center',
          result: 'SUCCESS',
          details: { email, officer_id: profile.officer_id },
          ip_address: '127.0.0.1',
          created_at: new Date().toISOString(),
        },
      ]);

      setUser(profile);
      localStorage.setItem('gov_officer_session', JSON.stringify(profile));
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    localStorage.removeItem('gov_officer_session');
    localStorage.removeItem('token');
    setUser(null);
  };

  const hasRole = (allowedRoles: UserRole[]): boolean => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'VIEWER',
        isAuthenticated: !!user,
        isLoading,
        isDemoMode: IS_DEMO_MODE,
        login,
        signUpWithSupabase,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

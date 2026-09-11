import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

type Role = 'auth' | 'picker' | 'driver' | 'warehouse_staff' | 'customer' | 'pending' | 'request_access' | 'driver_onboarding';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_online: boolean;
  is_pending_staff?: boolean;
  requested_role?: Role;
  warehouse_id?: string;
  employee_id?: string;
}

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;
  role: Role;
  setRole: (role: Role) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  setProfile: () => {},
  role: 'auth',
  setRole: () => {},
  isLoading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role>('auth');
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (userId: string, userEmail?: string) => {
    try {
      const { data: rawData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      const data = rawData as any;
      
      if (error && error.code === 'PGRST116') {
        // Unprovisioned user
        alert("Your staff account has not been provisioned. Contact an administrator.");
        await supabase.auth.signOut();
        setProfile(null);
        setRole('auth');
        return;
      }

      if (!error && data) {
        if (data.is_suspended) {
          alert("Your staff account is suspended. Contact an administrator.");
          await supabase.auth.signOut();
          setProfile(null);
          setRole('auth');
          return;
        }

        if (data.role === 'customer') {
          if (data.is_pending_staff) {
            setProfile(data);
            if (data.requested_role === 'driver') {
              setRole('driver_onboarding');
            } else {
              setRole('pending');
            }
            return;
          } else {
            setProfile(data);
            setRole('request_access');
            return;
          }
        }

        const validStaffRoles = ['picker', 'driver', 'warehouse_staff'];
        if (!validStaffRoles.includes(data.role)) {
          alert("Unauthorized access. This app is for authorized staff only.");
          await supabase.auth.signOut();
          setProfile(null);
          setRole('auth');
          return;
        }

        setProfile(data);
        setRole(data.role as Role);
      } else if (error) {
        console.warn("Profile fetch error:", error);
        await supabase.auth.signOut();
        setRole('auth');
      }
    } catch (err) {
      console.warn("Profile fetch exception:", err);
      await supabase.auth.signOut();
      setRole('auth');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.id) {
        fetchProfile(session.user.id, session.user.email).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    }).catch(err => {
      console.error("Auth Error:", err);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.id) {
        fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
        setRole('auth');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, setProfile, role, setRole, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

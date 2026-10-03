import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Zap, AlertCircle, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import './LoginView.css';

export const LoginView: React.FC = () => {
  const { login, theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthenticating(true);

    try {
      const { supabase } = await import('../../services/api/supabaseClient');
      
      if (!supabase) {
        // Fallback for mock mode if Supabase is not configured
        setTimeout(() => {
          setError('Database not connected.');
          setIsAuthenticating(false);
        }, 800);
        return;
      }

      // 1. Sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw authError;

      // 2. Get user role from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single();
        
      if (profileError) {
        // Sign out the auth session since we can't determine their role
        await supabase.auth.signOut();
        throw new Error(`Account setup incomplete or access denied. (${profileError.message})`);
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('No profile found for this account. Please contact an administrator.');
      }
      
      const userRole = profile.role;
      
      login(userRole);
      
      // Redirect based on role
      const roleRoutes: Record<string, string> = {
        admin: '/admin',
        warehouse_staff: '/warehouse',
        customer: '/customer',
        picker: '/picker',
        driver: '/delivery',
      };
      navigate(roleRoutes[userRole] || '/customer');

    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Access denied.');
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="login-container">
      <button 
        onClick={toggleTheme} 
        style={{ position: 'absolute', top: '24px', right: '24px', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-light)', borderRadius: '50%', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}
        title="Toggle Light/Dark Theme"
      >
        {theme === 'light' ? <Moon size={20} color="var(--text-primary)" /> : <Sun size={20} color="var(--text-primary)" />}
      </button>

      <div className="login-bg-glow"></div>
      
      <div className="login-card glass-panel">
        <img 
          src="/flashgo-logo.png" 
          alt="FlashGO Logo" 
          style={{ width: '200px', objectFit: 'contain', margin: '0 auto 16px auto', display: 'block' }} 
        />
        <p className="login-subtitle">Super Admin Access Portal</p>
        
        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input 
              type="email" 
              id="email" 
              className="input-field" 
              placeholder="admin@flashgo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showPassword ? 'text' : 'password'}
                id="password" 
                className="input-field" 
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingRight: '48px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="btn-primary login-btn pulse-active"
            disabled={isAuthenticating}
          >
            {isAuthenticating ? 'Authorizing...' : 'Secure Login'}
          </button>

          {/* <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>New to FlashGO? </span>
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                navigate('/signup');
              }} 
              style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Sign up here
            </a>
          </div> */}
        </form>
      </div>
    </div>
  );
};

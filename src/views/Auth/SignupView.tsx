import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Zap, AlertCircle, Moon, Sun } from 'lucide-react';
import './LoginView.css'; // Reusing login styles

export const SignupView: React.FC = () => {
  const { login, theme, toggleTheme } = useApp();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthenticating(true);

    try {
      const { supabase } = await import('../../services/api/supabaseClient');
      
      if (!supabase) {
        // Fallback for mock mode if Supabase is not configured
        setTimeout(() => {
          login('customer');
          navigate('/');
        }, 800);
        return;
      }

      // 1. Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name
          }
        }
      });

      if (authError) throw authError;
      
      if (!authData.user) {
        throw new Error("Supabase returned null user. Full response: " + JSON.stringify(authData));
      }

      // 2. Insert into the public.profiles table manually
      // Note: In production, it's better to do this via a Postgres Trigger on auth.users
      const { error: profileError } = await supabase.from('profiles').insert([
        {
          id: authData.user.id,
          email: email,
          full_name: name,
          role: 'customer'
        }
      ]);
      
      // We might get an RLS error if there's no insert policy, but we attempt it anyway.
      if (profileError) {
         console.warn("Could not insert profile (RLS issue?): ", profileError);
      }

      login('customer');
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup.');
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
        <div className="login-logo">
          <Zap size={32} />
          Flash<span>GO</span>
        </div>
        <p className="login-subtitle">Create Your Account</p>
        
        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form className="login-form" onSubmit={handleSignup}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input 
              type="text" 
              id="name" 
              className="input-field" 
              placeholder="John Doe"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input 
              type="email" 
              id="email" 
              className="input-field" 
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              className="input-field" 
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary login-btn pulse-active"
            disabled={isAuthenticating}
          >
            {isAuthenticating ? 'Creating Account...' : 'Sign Up'}
          </button>

          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Already have an account? </span>
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                navigate('/login');
              }} 
              style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              Log in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};

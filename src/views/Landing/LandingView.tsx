import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Zap, Map, Truck, Box, Sparkles, Moon, Sun } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import './LandingView.css';

export const LandingView: React.FC = () => {
  const { theme, toggleTheme } = useApp();

  return (
    <div className="landing-container">
      {/* Navigation */}
      <nav className="landing-nav">
        <Link to="/" className="landing-logo">
          <Zap size={28} className="animate-float" style={{ color: 'var(--primary)' }} />
          Flash<span>GO</span>
        </Link>
        <div className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <button 
            onClick={toggleTheme} 
            className="theme-toggle-btn" 
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
            title="Toggle Light/Dark Theme"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <Link to="/login" className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
            Open Portal
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-bg-glow"></div>
        <div className="hero-content">
          <div className="hero-badge animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <Sparkles size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Enterprise-Grade Q-Commerce Platform
          </div>
          <h1 className="hero-title animate-slide-up" style={{ animationDelay: '0.2s' }}>Hyper-Local Logistics, <br />Synchronized in Real-Time.</h1>
          <p className="hero-subtitle animate-slide-up" style={{ animationDelay: '0.3s' }}>
            A seamless multi-agent delivery ecosystem. From smart warehouse picking to GPS vector routing and secure customer handoffs—all within a sub-10-minute threshold.
          </p>
          <div className="hero-actions animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <Link to="/login" className="btn-primary">
              Launch Super Admin
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="section-header">
          <h2 className="section-title">The FlashGO Advantage</h2>
          <p className="section-subtitle">Addressing modern supply chain bottlenecks with intelligent automation.</p>
        </div>
        
        <div className="features-grid">
          <div className="feature-card glass-panel animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="feature-icon-wrapper">
              <Box size={28} />
            </div>
            <h3 className="feature-title">Smart Aisle Picking</h3>
            <p className="feature-desc">Micro-fulfillment algorithms map products to precise physical coordinates (e.g., A-R1-S2), eliminating walkpath waste and missing items.</p>
          </div>
          
          <div className="feature-card glass-panel animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="feature-icon-wrapper">
              <Map size={28} />
            </div>
            <h3 className="feature-title">Live Vector Telemetry</h3>
            <p className="feature-desc">Interactive GPS maps compute active driver speeds and ETA thresholds using asynchronous state-machines to prevent backend lag.</p>
          </div>
          
          <div className="feature-card glass-panel animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="feature-icon-wrapper">
              <ShieldCheck size={28} />
            </div>
            <h3 className="feature-title">Secure OTP Handoffs</h3>
            <p className="feature-desc">Dynamic dual-verification PIN handshakes ensure 100% accurate drop-offs, completely neutralizing package disputes and theft.</p>
          </div>
          
          <div className="feature-card glass-panel animate-slide-up" style={{ animationDelay: '0.5s' }}>
            <div className="feature-icon-wrapper">
              <Truck size={28} />
            </div>
            <h3 className="feature-title">Unified Multi-Agent Sync</h3>
            <p className="feature-desc">Customer, Picker, Driver, and Admin are flawlessly synchronized via high-speed WebSockets, sharing a single unified source of truth.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <h2 className="cta-title">Ready to oversee operations?</h2>
        <p className="cta-subtitle">Jump into the Super Admin Control Center to manage active shifts, edit the catalog, and view real-time Q-Commerce metrics.</p>
        <Link to="/login" className="btn-primary pulse-active">
          Initialize System
        </Link>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-logo">
          <strong>FlashGO</strong> Q-Commerce Ecosystem
        </div>
      </footer>
    </div>
  );
};

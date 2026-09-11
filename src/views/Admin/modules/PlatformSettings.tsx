import React, { useState, useEffect } from 'react';
import { Sliders, CreditCard } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { SettingsService } from '../../../services/api/SettingsService';
import './PlatformSettings.css';
import { AuditLogs } from './AuditLogs';

export const PlatformSettings: React.FC = () => {
  const { addToast } = useApp();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'config' | 'audit'>('config');

  // Global settings state
  const [deliveryFee, setDeliveryFee] = useState('2.99');
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState('15.00');
  
  useEffect(() => {
    SettingsService.getSettings().then(s => {
      if (s) {
        setDeliveryFee(s.base_delivery_fee.toString());
        setFreeDeliveryThreshold(s.free_delivery_threshold.toString());
      }
    });
  }, []);
  
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await SettingsService.updateSettings(Number(deliveryFee), Number(freeDeliveryThreshold));
      addToast('System settings synchronized to database!', 'success');
    } catch (err: any) {
      addToast('Failed to save settings: ' + err.message, 'error');
    }
  };

  return (
    <div className="admin-module">
      <header className="module-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h2>Platform Settings & Security</h2>
          <p>Global configuration, payment settings, and system audit logs.</p>
        </div>
        <div style={{ display: 'flex', gap: '24px' }}>
          <button 
            onClick={() => setActiveTab('config')}
            style={{ padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: activeTab === 'config' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'config' ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: 600 }}
          >
            Configurations
          </button>
          <button 
            onClick={() => setActiveTab('audit')}
            style={{ padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: activeTab === 'audit' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'audit' ? 'var(--primary)' : 'var(--text-secondary)', fontWeight: 600 }}
          >
            Audit Logs
          </button>
        </div>
      </header>

      <div style={{ maxWidth: activeTab === 'config' ? '800px' : '1000px', margin: '0 auto', width: '100%', paddingTop: '24px' }}>
        {activeTab === 'config' ? (
          <div className="glass-panel" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} color="var(--accent)" />
                <h3 className="panel-title" style={{ margin: 0, fontWeight: 800 }}>System Configurations</h3>
              </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '-12px' }}>
              Configure base delivery fee and the minimum threshold required for free delivery.
            </p>

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.05em' }}>BASE DELIVERY FEE (₹)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={deliveryFee} 
                    onChange={(e) => setDeliveryFee(e.target.value)} 
                    style={{ width: '100%', padding: '12px', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none' }} 
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 900, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.05em' }}>FREE DELIVERY THRESHOLD (₹)</label>
                  <div style={{ position: 'relative' }}>
                    <CreditCard size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                      type="number" 
                      min="0"
                      value={freeDeliveryThreshold} 
                      onChange={(e) => setFreeDeliveryThreshold(e.target.value)} 
                      style={{ width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', fontWeight: 600 }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Orders at or above the free-delivery threshold receive free delivery. 
                  Below this threshold, the configured base delivery fee is authoritatively applied by the backend during checkout.
                </p>
              </div>

              <button type="submit" style={{ padding: '14px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                Synchronize Platform Parameters
              </button>
            </form>
          </div>
        </div>
        ) : (
          <AuditLogs />
        )}
      </div>
    </div>
  );
};

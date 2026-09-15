import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/db';
import { WorkSlotService } from '../../../services/api/WorkSlotService';
import { Plus, Warehouse, Calendar, Save } from 'lucide-react';

export const DriverDailyIncentiveManagement: React.FC = () => {
  const { addToast, currentUser } = useApp();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [milestones, setMilestones] = useState<any[]>([]);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouse) {
      loadCampaigns();
    }
  }, [selectedWarehouse]);

  const loadWarehouses = async () => {
    try {
      if (!supabase) return;
      const { data } = await supabase.from('warehouses').select('*');
      if (data) setWarehouses(data);
      if (currentUser?.warehouse_id) {
        setSelectedWarehouse(currentUser.warehouse_id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadCampaigns = async () => {
    if (!selectedWarehouse) return;
    setLoading(true);
    try {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const startDate = d.toISOString().split('T')[0];
      
      const dEnd = new Date();
      dEnd.setDate(dEnd.getDate() + 30);
      const endDate = dEnd.toISOString().split('T')[0];

      const data = await WorkSlotService.adminGetDriverDailyIncentives(selectedWarehouse, startDate, endDate);
      setCampaigns(data);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormEnabled(true);
    setMilestones([]);
  };

  const handleAddMilestone = () => {
    if (milestones.length >= 4) return;
    const nextTarget = milestones.length > 0 ? milestones[milestones.length - 1].target_earnings + 500 : 500;
    const nextReward = milestones.length > 0 ? milestones[milestones.length - 1].reward_amount + 50 : 50;
    
    setMilestones([...milestones, {
      target_earnings: nextTarget,
      reward_amount: nextReward,
      sort_order: milestones.length
    }]);
  };

  const handleRemoveMilestone = (index: number) => {
    const updated = [...milestones];
    updated.splice(index, 1);
    updated.forEach((m, i) => m.sort_order = i);
    setMilestones(updated);
  };

  const handleUpdateMilestone = (index: number, field: string, value: string) => {
    const num = Number(value);
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: num };
    setMilestones(updated);
  };

  const handleMoveMilestone = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === milestones.length - 1) return;
    
    const updated = [...milestones];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = updated[index];
    updated[index] = updated[swapIndex];
    updated[swapIndex] = temp;
    
    updated.forEach((m, i) => m.sort_order = i);
    setMilestones(updated);
  };

  const handleEdit = (campaign: any) => {
    setFormDate(campaign.business_date);
    setFormEnabled(campaign.enabled);
    setMilestones(campaign.milestones || []);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouse || !formDate) {
      addToast('Warehouse and Date are required', 'error');
      return;
    }

    try {
      await WorkSlotService.adminSaveDriverDailyIncentives(
        selectedWarehouse,
        formDate,
        formEnabled,
        milestones
      );
      addToast('Daily incentive saved successfully', 'success');
      setShowForm(false);
      loadCampaigns();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ flex: 1, maxWidth: '300px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Filter by Warehouse</label>
          <select 
            value={selectedWarehouse} 
            onChange={e => setSelectedWarehouse(e.target.value)} 
            disabled={!!currentUser?.warehouse_id} 
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }}
          >
            <option value="">Select Warehouse...</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        
        {selectedWarehouse && (
          <button 
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {showForm ? 'Cancel' : <><Plus size={18} /> Configure Day</>}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>Configure Daily Driver Incentive</h3>
          
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Business Date</label>
              <input 
                type="date" 
                value={formDate} 
                onChange={e => setFormDate(e.target.value)} 
                required
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: 'var(--bg-base)' }} 
              />
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={formEnabled} 
                  onChange={(e) => setFormEnabled(e.target.checked)} 
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontWeight: 'bold' }}>{formEnabled ? 'Campaign Enabled' : 'Campaign Disabled'}</span>
              </label>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 12px 0' }}>Milestones</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {milestones.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic', margin: 0 }}>No milestones configured</p>
              ) : (
                milestones.map((m, index) => (
                  <div key={index} style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--bg-base)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontWeight: 'bold', width: '90px' }}>Milestone {index + 1}</div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Target Earnings (₹)</label>
                      <input 
                        type="number" 
                        value={m.target_earnings} 
                        onChange={(e) => handleUpdateMilestone(index, 'target_earnings', e.target.value)}
                        min="1"
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#fff' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Reward Amount (₹)</label>
                      <input 
                        type="number" 
                        value={m.reward_amount} 
                        onChange={(e) => handleUpdateMilestone(index, 'reward_amount', e.target.value)}
                        min="1"
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                      <button type="button" onClick={() => handleMoveMilestone(index, 'up')} disabled={index === 0} style={{ padding: '8px', cursor: 'pointer', background: '#fff', border: '1px solid var(--border-light)', borderRadius: '6px' }}>↑</button>
                      <button type="button" onClick={() => handleMoveMilestone(index, 'down')} disabled={index === milestones.length - 1} style={{ padding: '8px', cursor: 'pointer', background: '#fff', border: '1px solid var(--border-light)', borderRadius: '6px' }}>↓</button>
                      <button type="button" onClick={() => handleRemoveMilestone(index)} style={{ padding: '8px', color: '#dc2626', cursor: 'pointer', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px' }}>✕</button>
                    </div>
                  </div>
                ))
              )}
              
              {milestones.length < 4 && (
                <button 
                  type="button" 
                  onClick={handleAddMilestone}
                  style={{ padding: '10px', background: 'transparent', border: '1px dashed var(--primary)', borderRadius: '8px', cursor: 'pointer', color: 'var(--primary)', fontWeight: 'bold' }}
                >
                  + Add milestone
                </button>
              )}
            </div>
          </div>
          
          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
              <Save size={18} /> Save Configuration
            </button>
          </div>
        </form>
      )}

      {selectedWarehouse && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
            <p>Loading campaigns...</p>
          ) : campaigns.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No daily driver incentives configured for this warehouse in the selected range.</p>
          ) : (
            campaigns.map(campaign => (
              <div key={campaign.id} className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                      <Calendar size={18} style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
                      {new Date(campaign.business_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: campaign.enabled ? '#dcfce7' : '#f1f5f9', color: campaign.enabled ? '#166534' : '#475569', textTransform: 'uppercase' }}>
                      {campaign.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {campaign.milestones.length} milestone(s) configured
                  </div>
                </div>
                <button 
                  onClick={() => handleEdit(campaign)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-light)', background: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Edit
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

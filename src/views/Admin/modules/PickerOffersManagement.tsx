import React, { useState, useEffect } from 'react';
import { Target, Gift, Calendar, Plus, Clock, X, Info, Trash2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../services/api/supabaseClient';
import { useApp } from '../../../context/AppContext';
import './PickerOffersManagement.css'; // Link the new dedicated CSS module

export const PickerOffersManagement: React.FC = () => {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'weekly_target' | 'bonus_offers'>('weekly_target');
  
  const [loading, setLoading] = useState(true);
  const [weeklyTarget, setWeeklyTarget] = useState<any>(null);
  const [nextWeeklyTarget, setNextWeeklyTarget] = useState<any>(null);
  const [bonusOffers, setBonusOffers] = useState<any[]>([]);

  // Schedule target state
  const [newTargetItems, setNewTargetItems] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [offerName, setOfferName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [milestones, setMilestones] = useState<{ slots: string; reward: string }[]>([{ slots: '', reward: '' }]);
  const [isCreating, setIsCreating] = useState(false);

  const [bonusFilter, setBonusFilter] = useState<'active' | 'scheduled' | 'history'>('active');

  useEffect(() => {
    fetchAdminOffersData();
  }, []);

  const fetchAdminOffersData = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const currentDay = today.getDay();
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
      
      const currentMonday = new Date(today);
      currentMonday.setDate(today.getDate() - daysToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      const currentSunday = new Date(currentMonday);
      currentSunday.setDate(currentMonday.getDate() + 6);
      currentSunday.setHours(23, 59, 59, 999);

      // Fetch all targets
      const { data: allTargets } = await supabase
        .from('picker_weekly_targets')
        .select('*')
        .order('effective_from', { ascending: false });

      if (allTargets) {
        const current = allTargets.find((t: any) => new Date(t.effective_from) <= currentSunday);
        setWeeklyTarget(current || null);
        
        const next = allTargets.find((t: any) => new Date(t.effective_from) > currentSunday);
        setNextWeeklyTarget(next || null);
      }

      // Fetch active bonus offers
      const { data: offersData } = await supabase
        .from('picker_bonus_offers')
        .select('*, picker_bonus_offer_milestones(*)')
        .order('created_at', { ascending: false });

      setBonusOffers(offersData || []);
    } catch (e) {
      console.error(e);
      addToast('Failed to fetch offers data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleTarget = async () => {
    const items = parseInt(newTargetItems, 10);
    if (isNaN(items) || items <= 0) {
      addToast('Please enter a valid target items number greater than 0', 'error');
      return;
    }

    setIsScheduling(true);
    try {
      const today = new Date();
      const currentDay = today.getDay();
      const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
      
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() - daysToMonday + 7);
      nextMonday.setHours(0, 0, 0, 0);

      const { error } = await supabase
        .from('picker_weekly_targets')
        .insert({
          target_items: items,
          effective_from: nextMonday.toISOString(),
          is_active: true
        });

      if (error) throw error;
      
      addToast('Weekly target scheduled successfully', 'success');
      setNewTargetItems('');
      fetchAdminOffersData();
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Failed to schedule target', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCreateBonus = async () => {
    if (!offerName || !startDate || !endDate) {
      addToast('Please fill in all basic offer details', 'error');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      addToast('End date must be on or after start date', 'error');
      return;
    }

    const validMilestones = milestones.filter(m => m.slots && m.reward);
    if (validMilestones.length === 0) {
      addToast('At least one valid milestone is required', 'error');
      return;
    }

    let prevSlots = 0;
    let prevReward = -1;
    for (const m of validMilestones) {
      const slots = parseInt(m.slots, 10);
      const reward = parseInt(m.reward, 10);
      if (isNaN(slots) || slots <= 0 || isNaN(reward) || reward < 0) {
        addToast('Milestones must have positive numbers', 'error');
        return;
      }
      if (slots <= prevSlots) {
        addToast('Milestone slots must be strictly ascending', 'error');
        return;
      }
      if (reward < prevReward) {
        addToast('Milestone rewards must be non-decreasing', 'error');
        return;
      }
      prevSlots = slots;
      prevReward = reward;
    }

    setIsCreating(true);
    try {
      const { data: offer, error: offerError } = await supabase
        .from('picker_bonus_offers')
        .insert({
          name: offerName,
          start_date: startDate,
          end_date: endDate,
          is_active: true
        })
        .select()
        .single();

      if (offerError) throw offerError;

      const milestonesData = validMilestones.map(m => ({
        offer_id: offer.id,
        target_value: parseInt(m.slots, 10),
        reward_amount: parseInt(m.reward, 10)
      }));

      const { error: msError } = await supabase
        .from('picker_bonus_offer_milestones')
        .insert(milestonesData);

      if (msError) throw msError;

      addToast('Bonus offer created successfully', 'success');
      setIsModalOpen(false);
      resetModal();
      fetchAdminOffersData();
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Failed to create bonus offer', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const resetModal = () => {
    setOfferName('');
    setStartDate('');
    setEndDate('');
    setMilestones([{ slots: '', reward: '' }]);
  };

  const formatDateString = (dateStr: string) => {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const activeOffersCount = bonusOffers.filter(o => o.is_active && new Date(o.start_date) <= new Date() && new Date(o.end_date) >= new Date()).length;
  const scheduledOffersCount = bonusOffers.filter(o => o.is_active && new Date(o.start_date) > new Date()).length;

  const todayStr = new Date().toISOString().split('T')[0];
  const filteredBonusOffers = bonusOffers.filter(o => {
    if (bonusFilter === 'active') return o.is_active && o.start_date <= todayStr && o.end_date >= todayStr;
    if (bonusFilter === 'scheduled') return o.is_active && o.start_date > todayStr;
    if (bonusFilter === 'history') return !o.is_active || o.end_date < todayStr;
    return true;
  });

  return (
    <div className="pom-wrapper">
      <div className="pom-container">
        
        <div className="pom-header-section">
          <div className="pom-title-group">
            <h1>Picker Offers Management</h1>
            <p>Manage weekly picking targets and performance bonus campaigns.</p>
          </div>
          
          <div className="pom-summary-row">
            <div className="pom-summary-card">
              <span className="pom-summary-label">Weekly Target</span>
              <span className="pom-summary-value">{weeklyTarget ? weeklyTarget.target_items : '—'}</span>
            </div>
            <div className="pom-summary-card">
              <span className="pom-summary-label">Active Bonuses</span>
              <span className="pom-summary-value">{loading ? '—' : activeOffersCount}</span>
            </div>
            <div className="pom-summary-card">
              <span className="pom-summary-label">Scheduled Bonuses</span>
              <span className="pom-summary-value">{loading ? '—' : scheduledOffersCount}</span>
            </div>
          </div>
        </div>

        <div className="pom-tabs-container">
          <button
            onClick={() => setActiveTab('weekly_target')}
            className={`pom-tab ${activeTab === 'weekly_target' ? 'active' : ''}`}
          >
            <Target size={18} />
            Weekly Item Target
          </button>
          <button
            onClick={() => setActiveTab('bonus_offers')}
            className={`pom-tab ${activeTab === 'bonus_offers' ? 'active' : ''}`}
          >
            <Gift size={18} />
            Bonus Offers
          </button>
        </div>

        <div className="pom-tab-content">
          {activeTab === 'weekly_target' && (
            <>
              <div className="pom-2col-grid">
                
                <div className="pom-card">
                  <h2>Current Weekly Target</h2>
                  {loading ? (
                    <div className="pom-empty-state">
                      <span style={{color: 'var(--text-muted)'}}>Loading...</span>
                    </div>
                  ) : weeklyTarget ? (
                    <div className="pom-stat-block">
                      <div>
                        <p className="label">Target Items</p>
                        <p className="value">{weeklyTarget.target_items}</p>
                      </div>
                      <div className="pom-stat-meta">
                        <span className="pom-badge active">
                          <CheckCircle2 size={12} /> Active
                        </span>
                        <div>
                          <p className="meta-label">Effective Since</p>
                          <p className="meta-value">{formatDateString(weeklyTarget.effective_from)}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pom-empty-state">
                      <div className="pom-empty-icon">
                        <Target size={32} />
                      </div>
                      <h3 className="pom-empty-title">No weekly target configured</h3>
                      <p className="pom-empty-desc">Set a weekly picking target to give Pickers a clear performance goal.</p>
                    </div>
                  )}
                </div>

                <div className="pom-card">
                  <h2>Schedule Next Target</h2>
                  <div className="pom-helper-box">
                    <Info size={18} />
                    <span>Changes take effect from next Monday so the current week's progress is not disrupted.</span>
                  </div>
                  
                  <div className="pom-form-group">
                    <label>Weekly Item Target</label>
                    <div style={{display: 'flex', gap: '16px', alignItems: 'flex-start'}}>
                      <div className="pom-input-wrapper" style={{flex: 1}}>
                        <input
                          type="number"
                          min="1"
                          value={newTargetItems}
                          onChange={(e) => setNewTargetItems(e.target.value)}
                          className="pom-input"
                          placeholder="e.g. 1000"
                          disabled={isScheduling}
                        />
                        <span className="pom-input-suffix">items / week</span>
                      </div>
                      <button 
                        onClick={handleScheduleTarget}
                        disabled={isScheduling || !newTargetItems || parseInt(newTargetItems) <= 0}
                        className="pom-btn-primary"
                      >
                        {isScheduling ? 'Scheduling...' : 'Schedule Target'}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
              
              <div className="pom-card">
                <h2>Next Scheduled Target</h2>
                {loading ? (
                   <div style={{color: 'var(--text-muted)'}}>Loading...</div>
                ) : nextWeeklyTarget ? (
                  <div className="pom-stat-block" style={{maxWidth: '300px'}}>
                    <div>
                      <p className="label">Target Items</p>
                      <p className="value" style={{fontSize: '2rem', color: 'var(--primary, #22c55e)'}}>{nextWeeklyTarget.target_items}</p>
                    </div>
                    <div className="pom-stat-meta">
                      <span className="pom-badge scheduled">Scheduled</span>
                      <div>
                        <p className="meta-label">Effective Date</p>
                        <p className="meta-value">{formatDateString(nextWeeklyTarget.effective_from)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)'}}>
                    <Clock size={20} />
                    <span>No target scheduled yet.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'bonus_offers' && (
            <>
              <div className="pom-workspace-header">
                <div>
                  <h2 style={{fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px'}}>Bonus Offers Workspace</h2>
                  <p style={{fontSize: '0.875rem', color: 'var(--text-muted)'}}>Create and manage Picker slot-completion bonus campaigns.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="pom-btn-primary"
                >
                  <Plus size={18} />
                  Create Bonus Offer
                </button>
              </div>

              <div className="pom-filters">
                <button 
                  onClick={() => setBonusFilter('active')}
                  className={`pom-filter-chip ${bonusFilter === 'active' ? 'active' : ''}`}
                >
                  Active
                </button>
                <button 
                  onClick={() => setBonusFilter('scheduled')}
                  className={`pom-filter-chip ${bonusFilter === 'scheduled' ? 'active' : ''}`}
                >
                  Scheduled
                </button>
                <button 
                  onClick={() => setBonusFilter('history')}
                  className={`pom-filter-chip ${bonusFilter === 'history' ? 'active' : ''}`}
                >
                  History
                </button>
              </div>

              {loading ? (
                <div className="pom-empty-state"><span style={{color: 'var(--text-muted)'}}>Loading offers...</span></div>
              ) : filteredBonusOffers.length > 0 ? (
                <div className="pom-table-container">
                  <table className="pom-table">
                    <thead>
                      <tr>
                        <th>Offer Name</th>
                        <th>Date Range</th>
                        <th>Milestone Count</th>
                        <th>Highest Slot Target</th>
                        <th>Maximum Bonus</th>
                        <th>Status</th>
                        <th style={{textAlign: 'right'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBonusOffers.map((offer) => {
                        const milestones = offer.picker_bonus_offer_milestones || [];
                        const maxTier = milestones.reduce((max: any, m: any) => 
                          !max || m.target_value > max.target_value ? m : max
                        , null);
                        
                        let badgeClass = 'history';
                        let badgeText = 'History';
                        
                        if (offer.is_active) {
                          const today = new Date().toISOString().split('T')[0];
                          if (offer.start_date <= today && offer.end_date >= today) {
                            badgeClass = 'active';
                            badgeText = 'Active';
                          } else if (offer.start_date > today) {
                            badgeClass = 'scheduled';
                            badgeText = 'Scheduled';
                          }
                        }

                        return (
                          <tr key={offer.id}>
                            <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{offer.name}</td>
                            <td>
                              <div style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                                <Calendar size={14} style={{color: 'var(--text-muted)'}} />
                                {formatDateString(offer.start_date).split(' ').slice(0,2).join(' ')} - {formatDateString(offer.end_date).split(' ').slice(0,2).join(' ')}
                              </div>
                            </td>
                            <td style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>{milestones.length}</td>
                            <td style={{fontWeight: 600, color: 'var(--text-primary)'}}>{maxTier ? maxTier.target_value : '-'}</td>
                            <td style={{fontWeight: 600, color: 'var(--primary, #22c55e)'}}>{maxTier ? `₹${maxTier.reward_amount}` : '-'}</td>
                            <td>
                              <span className={`pom-badge ${badgeClass}`}>{badgeText}</span>
                            </td>
                            <td style={{textAlign: 'right'}}>
                              <button style={{background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer'}}>View</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="pom-empty-state">
                  <div className="pom-empty-icon">
                    <Gift size={32} />
                  </div>
                  <h3 className="pom-empty-title">No bonus offers configured</h3>
                  <p className="pom-empty-desc">Create a Monday, weekend, festival, or special-demand bonus for Pickers.</p>
                  <button 
                    onClick={() => setIsModalOpen(true)}
                    className="pom-btn-primary"
                    style={{marginTop: '16px'}}
                  >
                    <Plus size={18} /> Create Bonus Offer
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="pom-modal-backdrop">
          <div className="pom-modal-content">
            <div className="pom-modal-header">
              <h3>Create Bonus Offer</h3>
              <button onClick={() => { setIsModalOpen(false); resetModal(); }} className="pom-close-btn">
                <X size={20} />
              </button>
            </div>
            
            <div className="pom-modal-body">
              <div className="pom-form-group">
                <label>Offer Name</label>
                <input
                  type="text"
                  value={offerName}
                  onChange={e => setOfferName(e.target.value)}
                  className="pom-input"
                  placeholder="e.g. Monday Bonus"
                />
              </div>
              
              <div className="pom-form-row">
                <div className="pom-form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setStartDate(e.target.value)}
                    className="pom-input"
                  />
                </div>
                <div className="pom-form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || new Date().toISOString().split('T')[0]}
                    onChange={e => setEndDate(e.target.value)}
                    className="pom-input"
                  />
                </div>
              </div>

              <div className="pom-milestone-header">
                <h4 style={{fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0}}>Milestones</h4>
                <button 
                  onClick={() => setMilestones([...milestones, { slots: '', reward: '' }])}
                  className="pom-add-btn"
                >
                  <Plus size={16} /> Add Milestone
                </button>
              </div>
              
              <div className="pom-helper-box" style={{marginBottom: '16px'}}>
                <Info size={16} />
                <span><strong>Reward represents the TOTAL bonus at that milestone.</strong><br/>Example: 6 slots → ₹340 means ₹340 total payout, not a cumulative ₹790.</span>
              </div>

              {milestones.map((m, index) => (
                <div key={index} className="pom-milestone-row">
                  <div className="pom-form-group" style={{marginBottom: 0}}>
                    <label style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Completed Slots</label>
                    <input
                      type="number"
                      min="1"
                      value={m.slots}
                      onChange={e => {
                        const newM = [...milestones];
                        newM[index].slots = e.target.value;
                        setMilestones(newM);
                      }}
                      className="pom-input"
                      placeholder="e.g. 3"
                    />
                  </div>
                  <div className="pom-form-group" style={{marginBottom: 0}}>
                    <label style={{fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Total Bonus (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={m.reward}
                      onChange={e => {
                        const newM = [...milestones];
                        newM[index].reward = e.target.value;
                        setMilestones(newM);
                      }}
                      className="pom-input"
                      placeholder="e.g. 90"
                    />
                  </div>
                  <button 
                    onClick={() => setMilestones(milestones.filter((_, i) => i !== index))}
                    disabled={milestones.length === 1}
                    className="pom-icon-btn danger"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              ))}
            </div>

            <div className="pom-modal-footer">
              <button 
                onClick={() => { setIsModalOpen(false); resetModal(); }}
                className="pom-btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateBonus}
                disabled={isCreating}
                className="pom-btn-primary"
              >
                {isCreating ? 'Creating...' : 'Create Bonus Offer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

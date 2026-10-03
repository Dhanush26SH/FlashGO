import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/api/supabaseClient';
import { useApp } from '../../../context/AppContext';
import { Plus, Save, Store, Trash2 } from 'lucide-react';

interface Tier {
  id?: string;
  min_items: number | string;
  max_items: number | string | null;
  earning_amount: number | string;
}

export const DriverRateCards: React.FC = () => {
  const { addToast } = useApp();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [currentRateCard, setCurrentRateCard] = useState<any>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      fetchCurrentRateCard(selectedWarehouseId);
    } else {
      setCurrentRateCard(null);
      setTiers([]);
    }
  }, [selectedWarehouseId]);

  const fetchWarehouses = async () => {
    try {
      const { data, error } = await supabase.from('warehouses').select('id, name').order('name');
      if (error) throw error;
      setWarehouses(data || []);
      if (data && data.length > 0) {
        setSelectedWarehouseId(data[0].id);
      }
    } catch (e: any) {
      addToast(`Failed to load warehouses: ${e.message}`, 'error');
    }
  };

  const fetchCurrentRateCard = async (warehouseId: string) => {
    try {
      setLoading(true);
      const { data: rcData, error: rcError } = await supabase
        .from('driver_earning_rate_cards')
        .select('*')
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active')
        .lte('effective_from', new Date().toISOString())
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();

      if (rcError && rcError.code !== 'PGRST116') {
        throw rcError;
      }

      if (rcData) {
        setCurrentRateCard(rcData);
        const { data: tierData, error: tierError } = await supabase
          .from('driver_earning_tiers')
          .select('*')
          .eq('rate_card_id', rcData.id)
          .order('min_items', { ascending: true });
        
        if (tierError) throw tierError;
        setTiers(tierData || []);
      } else {
        setCurrentRateCard(null);
        setTiers([]);
      }
    } catch (e: any) {
      addToast(`Failed to load rate card: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      setIsEditing(false);
    }
  };

  const handleAddTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const nextMin = lastTier ? (lastTier.max_items ? Number(lastTier.max_items) + 1 : Number(lastTier.min_items) + 1) : 1;
    
    // Auto-fix previous open-ended tier if it was max_items=null
    let updatedTiers = [...tiers];
    if (lastTier && lastTier.max_items === null) {
        updatedTiers[updatedTiers.length - 1] = {
            ...lastTier,
            max_items: nextMin - 1
        };
    }

    setTiers([...updatedTiers, { min_items: nextMin, max_items: null, earning_amount: 0 }]);
  };

  const handleUpdateTier = (index: number, field: keyof Tier, value: string) => {
    const updated = [...tiers];
    if (field === 'max_items') {
      updated[index] = { ...updated[index], max_items: value === '' ? null : value };
    } else if (field === 'min_items') {
      updated[index] = { ...updated[index], min_items: value };
    } else if (field === 'earning_amount') {
      updated[index] = { ...updated[index], earning_amount: value };
    }
    setTiers(updated);
  };

  const handleRemoveTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (tiers.length === 0) {
      addToast('Cannot save an empty rate card. Add at least one tier.', 'error');
      return;
    }

    // Validation
    const sortedTiers = [...tiers].sort((a, b) => Number(a.min_items) - Number(b.min_items));
    let expectedNextMin = 1;

    for (let i = 0; i < sortedTiers.length; i++) {
      const t = sortedTiers[i];
      const minItems = Number(t.min_items);
      const maxItems = t.max_items === null || t.max_items === '' ? null : Number(t.max_items);
      const earningAmount = Number(t.earning_amount);

      if (t.min_items === '' || isNaN(minItems) || minItems < 1) {
        addToast(`Tier ${i + 1}: Minimum items must be a valid number >= 1`, 'error');
        return;
      }
      if (minItems !== expectedNextMin) {
        addToast(`Tier ${i + 1}: Must start exactly at ${expectedNextMin} to form a continuous range (no gaps or overlaps).`, 'error');
        return;
      }
      if (maxItems !== null && (isNaN(maxItems) || maxItems < minItems)) {
        addToast(`Tier ${i + 1}: Maximum items cannot be less than minimum`, 'error');
        return;
      }
      if (t.earning_amount === '' || isNaN(earningAmount) || earningAmount <= 0) {
        addToast(`Tier ${i + 1}: Earning amount must be greater than zero`, 'error');
        return;
      }
      if (maxItems === null) {
        if (i !== sortedTiers.length - 1) {
          addToast(`Tier ${i + 1}: Only the final tier can be open-ended (no maximum).`, 'error');
          return;
        }
      } else {
        expectedNextMin = maxItems + 1;
      }
    }

    try {
      setLoading(true);
      
      // If there's a current card, we don't mutate it. We mark it inactive just in case (though effective_from ordering natively handles it).
      // Actually we just insert a new rate card with effective_from = NOW()
      
      const { data: newCard, error: cardError } = await supabase
        .from('driver_earning_rate_cards')
        .insert({
          warehouse_id: selectedWarehouseId,
          effective_from: new Date().toISOString(),
          status: 'active'
        })
        .select('id')
        .single();
      
      if (cardError) throw cardError;

      const tiersToInsert = tiers.map((t, idx) => ({
        rate_card_id: newCard.id,
        min_items: Number(t.min_items),
        max_items: t.max_items === null || t.max_items === '' ? null : Number(t.max_items),
        earning_amount: Number(t.earning_amount),
        sort_order: idx
      }));

      const { error: tiersError } = await supabase
        .from('driver_earning_tiers')
        .insert(tiersToInsert);
      
      if (tiersError) throw tiersError;

      addToast('New rate card version published successfully', 'success');
      await fetchCurrentRateCard(selectedWarehouseId);
    } catch (e: any) {
      addToast(`Failed to publish rate card: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-card glass-panel animate-slide-up" style={{ marginTop: '24px' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Store size={18} color="var(--primary)" /> Driver Rate Card Configuration
        </h3>
        
        <select 
          className="admin-input" 
          value={selectedWarehouseId} 
          onChange={(e) => setSelectedWarehouseId(e.target.value)}
          style={{ width: '250px' }}
        >
          <option value="" disabled>Select Warehouse</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: '24px' }}>
        {loading && <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>}
        
        {!loading && currentRateCard && !isEditing && (
          <div style={{ background: 'var(--bg-card)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <span className="admin-badge-success">ACTIVE VERSION</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                  Effective Since: {new Date(currentRateCard.effective_from).toLocaleString()}
                </span>
              </div>
              <button 
                onClick={() => setIsEditing(true)} 
                style={{ padding: '6px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}
              >
                Create New Version
              </button>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left' }}>
                  <th style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>MIN ITEMS</th>
                  <th style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>MAX ITEMS</th>
                  <th style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>EARNING (₹)</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 600 }}>{t.min_items}</td>
                    <td style={{ padding: '12px 8px', color: t.max_items === null ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                      {t.max_items === null ? 'No maximum' : t.max_items}
                    </td>
                    <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--primary)' }}>₹{Number(t.earning_amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (!currentRateCard || isEditing) && (
          <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: '8px', border: '1px dashed var(--border-strong)' }}>
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Drafting New Rate Card Version</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Saving this will securely sunset the previous configuration and apply these rates immediately.
              </p>
            </div>

            {tiers.map((t, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '12px', background: 'var(--bg-card)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Min Items</label>
                  <input 
                    type="number" 
                    className="admin-input" 
                    value={t.min_items} 
                    onChange={(e) => handleUpdateTier(idx, 'min_items', e.target.value)}
                    min="1"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Max Items (Leave empty for No Max)</label>
                  <input 
                    type="number" 
                    className="admin-input" 
                    value={t.max_items === null ? '' : t.max_items} 
                    onChange={(e) => handleUpdateTier(idx, 'max_items', e.target.value)}
                    placeholder="Unbounded"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="admin-label">Earning Amount (₹)</label>
                  <input 
                    type="number" 
                    className="admin-input" 
                    value={t.earning_amount} 
                    onChange={(e) => handleUpdateTier(idx, 'earning_amount', e.target.value)}
                    min="0"
                  />
                </div>
                <button 
                  onClick={() => handleRemoveTier(idx)}
                  style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '12px', cursor: 'pointer' }}
                  title="Remove Tier"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button 
                onClick={handleAddTier}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                <Plus size={16} /> Add Tier
              </button>

              <div style={{ display: 'flex', gap: '12px' }}>
                {isEditing && (
                  <button 
                    onClick={() => { setIsEditing(false); fetchCurrentRateCard(selectedWarehouseId); }}
                    style={{ padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
                <button 
                  onClick={handleSave}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 24px', background: 'var(--primary)', border: 'none', color: 'white', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Save size={16} /> Publish New Rates
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

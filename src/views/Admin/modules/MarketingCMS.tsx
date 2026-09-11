import React, { useState, useEffect } from 'react';
import './MarketingCMS.css';
import { useApp } from '../../../context/AppContext';
import { 
  Megaphone, 
  Trash2, 
  Image as ImageIcon, 
  Plus, 
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { MarketingService } from '../../../services/api/MarketingService';
import type { Promotion } from '../../../services/api/MarketingService';

export const MarketingCMS: React.FC = () => {
  const { addToast, products, categories } = useApp();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetType, setTargetType] = useState<'product' | 'category' | 'none'>('none');
  const [targetId, setTargetId] = useState('');
  const [active, setActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState(0);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchPromotions = async () => {
    try {
      setIsLoading(true);
      const data = await MarketingService.getAllPromotions();
      setPromotions(data);
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setSubtitle('');
    setImageUrl('');
    setTargetType('none');
    setTargetId('');
    setActive(true);
    setDisplayOrder(0);
    setStartsAt('');
    setEndsAt('');
  };

  const handleEdit = (p: Promotion) => {
    setEditingId(p.id);
    setTitle(p.title);
    setSubtitle(p.subtitle || '');
    setImageUrl(p.image_url);
    setTargetType(p.target_type);
    setTargetId(p.target_id || '');
    setActive(p.active);
    setDisplayOrder(p.display_order);
    setStartsAt(p.starts_at ? new Date(p.starts_at).toISOString().slice(0, 16) : '');
    setEndsAt(p.ends_at ? new Date(p.ends_at).toISOString().slice(0, 16) : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim()) {
      addToast('Title and Image URL are required', 'error');
      return;
    }
    if ((targetType === 'product' || targetType === 'category') && !targetId.trim()) {
      addToast('Target selection is required for Product or Category targets', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Partial<Promotion> = {
        title,
        subtitle: subtitle || undefined,
        image_url: imageUrl,
        target_type: targetType,
        target_id: targetType === 'none' ? undefined : targetId,
        active,
        display_order: displayOrder,
        starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
        ends_at: endsAt ? new Date(endsAt).toISOString() : undefined
      };

      if (editingId) {
        await MarketingService.updatePromotion(editingId, payload);
        addToast('Promotion updated successfully', 'success');
      } else {
        await MarketingService.createPromotion(payload);
        addToast('Promotion created successfully', 'success');
      }
      resetForm();
      fetchPromotions();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this promotion?')) return;
    try {
      await MarketingService.deletePromotion(id);
      addToast('Promotion deleted', 'success');
      fetchPromotions();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const toggleActive = async (p: Promotion) => {
    try {
      await MarketingService.updatePromotion(p.id, {
        title: p.title,
        image_url: p.image_url,
        target_type: p.target_type,
        active: !p.active,
        display_order: p.display_order
      });
      fetchPromotions();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 4px 0' }}>Promotion Banners</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Manage customer home screen promotions</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px' }}>
        
        {/* Editor Form */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', height: 'fit-content' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Megaphone size={18} color="var(--primary)" /> {editingId ? 'Edit Promotion' : 'New Promotion'}
          </h3>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Title *</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                className="input-field" 
                placeholder="e.g. Summer Mega Sale" 
                required
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Subtitle</label>
              <input 
                type="text" 
                value={subtitle} 
                onChange={e => setSubtitle(e.target.value)} 
                className="input-field" 
                placeholder="e.g. Up to 50% off" 
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Image URL *</label>
              <input 
                type="url" 
                value={imageUrl} 
                onChange={e => setImageUrl(e.target.value)} 
                className="input-field" 
                placeholder="https://..." 
                required
              />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Target Type</label>
              <select 
                value={targetType} 
                onChange={e => { setTargetType(e.target.value as any); setTargetId(''); }} 
                className="input-field"
              >
                <option value="none">None (Informational)</option>
                <option value="category">Category</option>
                <option value="product">Product</option>
              </select>
            </div>
            
            {targetType === 'category' && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Select Category *</label>
                <select 
                  value={targetId} 
                  onChange={e => setTargetId(e.target.value)} 
                  className="input-field"
                  required
                >
                  <option value="">-- Choose Category --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {targetType === 'product' && (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Select Product *</label>
                <select 
                  value={targetId} 
                  onChange={e => setTargetId(e.target.value)} 
                  className="input-field"
                  required
                >
                  <option value="">-- Choose Product --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Loc: {p.warehouse_location})</option>
                  ))}
                </select>
              </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Starts At</label>
                <input 
                  type="datetime-local" 
                  value={startsAt} 
                  onChange={e => setStartsAt(e.target.value)} 
                  className="input-field" 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Ends At</label>
                <input 
                  type="datetime-local" 
                  value={endsAt} 
                  onChange={e => setEndsAt(e.target.value)} 
                  className="input-field" 
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600 }}>Display Order</label>
                <input 
                  type="number" 
                  min="0"
                  value={displayOrder} 
                  onChange={e => setDisplayOrder(parseInt(e.target.value))} 
                  className="input-field" 
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '24px', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={active} 
                  onChange={e => setActive(e.target.checked)} 
                  id="promo-active"
                />
                <label htmlFor="promo-active" style={{ fontSize: '0.9rem', fontWeight: 600 }}>Active</label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : editingId ? 'Update Promotion' : 'Create Promotion'}
              </button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* List */}
        <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem' }}>Active & Scheduled Promotions</h3>
          
          {isLoading ? (
            <p>Loading...</p>
          ) : promotions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              No promotions found. Create one to display on the customer home screen.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {promotions.map(p => (
                <div key={p.id} style={{ 
                  display: 'flex', gap: '16px', padding: '16px', 
                  borderRadius: '12px', backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-light)',
                  opacity: p.active ? 1 : 0.6
                }}>
                  <div style={{ width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f0f0f0' }}>
                    <img src={p.image_url} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80' }}/>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>{p.title}</h4>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => toggleActive(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.active ? 'var(--success)' : 'var(--text-muted)' }}>
                          {p.active ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                        <button onClick={() => handleEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)' }}>
                          <Megaphone size={16} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {p.subtitle && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.subtitle}</p>}
                    
                    <div style={{ display: 'flex', gap: '12px', marginTop: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      <span>Target: {p.target_type.toUpperCase()}</span>
                      <span>Order: {p.display_order}</span>
                      {(p.starts_at || p.ends_at) && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Scheduled</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

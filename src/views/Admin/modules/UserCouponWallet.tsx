import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { FlashGoDB } from '../../../services/db';
import type { Profile, Coupon } from '../../../services/db';
import { WalletService } from '../../../services/api/WalletService';
import { CouponsService } from '../../../services/api/CouponsService';
import { UsersService } from '../../../services/api/UsersService';
import { ShieldAlert, Users, Wallet, Gift, Plus, Trash2 } from 'lucide-react';

export const UserCouponWallet: React.FC = () => {
  const { addToast } = useApp();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const loadData = async () => {
    try {
      const data = await UsersService.getProfiles();
      if (data && data.some(p => p.role === 'customer')) setProfiles(data as any);
    } catch (e) {
      console.error('Failed to load profiles', e);
    }

    try {
      const data = await CouponsService.getCoupons();
      if (data && data.length > 0) setCoupons(data);
    } catch (e) {
      console.error('Failed to load coupons', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const [selectedCustId, setSelectedCustId] = useState<string>('');
  const [adjustAmount, setAdjustAmount] = useState('25');
  const [adjustDesc, setAdjustDesc] = useState('Campaign Loyalty Credit');
  
  const [newCode, setNewCode] = useState('');
  const [newDiscType, setNewDiscType] = useState<'percentage' | 'flat'>('percentage');
  const [newValue, setNewValue] = useState('15');
  const [newMinOrder, setNewMinOrder] = useState('10');
  const [isWalletSubmitting, setIsWalletSubmitting] = useState(false);
  const [isCouponSubmitting, setIsCouponSubmitting] = useState(false);

  const customers = profiles.filter(p => p.role === 'customer');

  // Wallet
  const handleWalletAdjust = async (type: 'credit' | 'debit') => {
    if (!selectedCustId) return;
    const amount = Number(adjustAmount);
    if (isNaN(amount) || amount <= 0) {
      addToast('Please enter a valid amount', 'warning');
      return;
    }
    
    setIsWalletSubmitting(true);
    try {
      if (type === 'credit') {
        await WalletService.addWalletFunds(selectedCustId, amount, adjustDesc);
      } else {
        await WalletService.deductWalletFunds(selectedCustId, amount, adjustDesc);
      }
      addToast(`Successfully processed ${type} of ₹${amount}`, 'success');
      setAdjustAmount('25');
      setAdjustDesc('Campaign Loyalty Credit');
      loadData();
    } catch (e: any) {
      addToast(`Failed to process wallet transaction: ${e.message}`, 'error');
    } finally {
      setIsWalletSubmitting(false);
    }
  };

  // Coupons
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return addToast('Promo code is required', 'warning');
    
    setIsCouponSubmitting(true);
    try {
      await CouponsService.createCoupon({
        code: newCode.toUpperCase(),
        discount_type: newDiscType,
        discount_value: Number(newValue),
        min_order_value: Number(newMinOrder),
        active: true
      });
      addToast(`Promo Voucher ${newCode.toUpperCase()} scheduled successfully!`, 'success');
      setNewCode('');
      setNewValue('15');
      loadData();
    } catch (e: any) {
      addToast(`Failed to create coupon: ${e.message}`, 'error');
    } finally {
      setIsCouponSubmitting(false);
    }
  };

  const handleDeleteCoupon = async (id: string, code: string) => {
    if (!window.confirm(`Are you sure you want to delete promo ${code}?`)) return;
    try {
      await CouponsService.deleteCoupon(id);
      loadData();
      addToast(`Promo Voucher ${code} removed from active campaigns`, 'info');
    } catch (e: any) {
      addToast(`Failed to delete coupon: ${e.message}`, 'error');
    }
  };

  return (
    <div className="container">
      <div className=" ">
        <div>
          <h2 className="title">Customer Center & Loyalty Campaigns</h2>
          <p className="subtitle">Oversee user wallets, check referral rings for fraud, and schedule BOGO coupons</p>
        </div>
        <Users size={36} color="var(--primary)" />
      </div>

      <div className="main-grid">
        <div className="column">
          <div className=" ">
            <h3 className="panel-title">Customer Directory & Security Audits</h3>
            <p className="panel-desc">Inspect customer accounts, check loyalty point rankings, and manage referrals</p>
            <div className="cust-register-container">
              {customers.map(c => {
                const isRestricted = (c as any).is_suspended;
                return (
                  <div key={c.id} style={{ ...custCardStyle, border: isRestricted ? '1px dashed var(--danger)' : '1px solid var(--border-light)' }}>
                    <div className="cust-header">
                      <div>
                        <h4 className="cust-name">{c.full_name}</h4>
                        <div className="cust-phone">{c.phone} | {c.email}</div>
                      </div>
                    </div>
                    <div className="divider" />
                    <div className="cust-sub-grid">
                      <div>
                        <div className="grid-label">WALLET BALANCE</div>
                        <div className="grid-val">₹{Number(c.wallet_balance).toFixed(2)}</div>
                      </div>
                    </div>
                    {isRestricted && (
                      <div className="fraud-banner" style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: 'none' }}>
                        <ShieldAlert size={14} />
                        <span>ACCOUNT SUSPENDED BY ADMIN</span>
                      </div>
                    )}
                    <button 
                      onClick={() => setSelectedCustId(c.id)}
                      className={selectedCustId === c.id ? 'audit-btn-active' : 'audit-btn'}
                    >
                      {selectedCustId === c.id ? 'Selected for Wallet Ops' : 'Select Customer'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ ...panelCardStyle, border: '1px solid rgba(16, 185, 129, 0.3)' }} className="glass-panel">
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wallet size={18} color="#10b981" />
                <h3 className="panel-title">Wallet Debit & Credit Operations</h3>
              </div>
            </div>
            <p className="panel-desc">Manually reconcile balances or issue customer satisfaction loyalty vouchers</p>
            {selectedCustId ? (
              <div>
                <div style={{ fontSize: '0.78rem', marginBottom: '12px' }}>
                  Target Customer: <strong>{profiles.find(p => p.id === selectedCustId)?.full_name}</strong>
                  <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    (Current: ₹{Number(profiles.find(p => p.id === selectedCustId)?.wallet_balance).toFixed(2)})
                  </span>
                </div>
                <div className="adjust-form">
                  <div style={{ width: '120px' }}>
                    <label className="input-label">AMOUNT (₹)</label>
                    <input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="po-input" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="input-label">TRANSACTION AUDIT REASON</label>
                    <input type="text" value={adjustDesc} onChange={(e) => setAdjustDesc(e.target.value)} className="po-input" />
                  </div>
                </div>
                <div className="adjust-btn-row">
                  <button onClick={() => handleWalletAdjust('credit')} className="credit-btn" disabled={isWalletSubmitting}>
                    {isWalletSubmitting ? 'Processing...' : 'Credit Wallet'}
                  </button>
                  <button onClick={() => handleWalletAdjust('debit')} className="debit-btn" disabled={isWalletSubmitting}>
                    {isWalletSubmitting ? 'Processing...' : 'Debit Wallet'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ ...emptyStateStyle, padding: '20px' }}>
                Select a customer profile above to unlock wallet adjustments.
              </div>
            )}
          </div>
        </div>

        <div className="column">
          <div className=" ">
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gift size={18} color="var(--primary)" />
                <h3 className="panel-title">Coupon Campaigns & BOGO Scheduler</h3>
              </div>
            </div>
            <p className="panel-desc">Draft promotion vouchers, category limits, flat value and BOGO thresholds</p>
            <form onSubmit={handleCreateCoupon} className="coupon-form">
              <div style={{ flex: 1 }}>
                <label className="input-label">PROMO CODE</label>
                <input type="text" value={newCode} placeholder="e.g. FLASH30" onChange={(e) => setNewCode(e.target.value)} className="po-input" />
              </div>
              <div style={{ width: '110px' }}>
                <label className="input-label">DISCOUNT TYPE</label>
                <select value={newDiscType} onChange={(e) => setNewDiscType(e.target.value as any)} className="dropdown">
                  <option value="percentage">% Percent</option>
                  <option value="flat">₹ Flat</option>
                </select>
              </div>
              <div style={{ width: '80px' }}>
                <label className="input-label">VALUE</label>
                <input type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="po-input" />
              </div>
              <div style={{ width: '80px' }}>
                <label className="input-label">MIN ORDER</label>
                <input type="number" value={newMinOrder} onChange={(e) => setNewMinOrder(e.target.value)} className="po-input" />
              </div>
              <button type="submit" className="raise-p-o-btn" disabled={isCouponSubmitting}>
                <Plus size={16} /> {isCouponSubmitting ? 'Scheduling...' : 'Schedule'}
              </button>
            </form>
            <div className="divider" />
            <div className="coupon-grid">
              {coupons.map(c => (
                <div key={c.id} className="coupon-card">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="promo-label">{c.code}</span>
                      <span className="active-promo-dot" />
                    </div>
                    <div className="promo-meta">
                      Min checkout: ₹{c.min_order_value} | Type: {c.discount_type === 'percentage' ? `${c.discount_value}% Off` : `₹${c.discount_value} Flat`}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteCoupon(c.id, c.code)} className="delete-promo-btn">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const panelCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-base)',
  padding: '24px',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
};
const custCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  borderRadius: '8px',
  padding: '16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  transition: 'all 0.2s'
};
const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '40px 20px',
  backgroundColor: 'var(--bg-surface)',
  borderRadius: '8px',
  border: '1px dashed var(--border-light)',
  color: 'var(--text-muted)',
  fontSize: '0.85rem'
};

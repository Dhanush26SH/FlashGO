import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/api/supabaseClient';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { AdminService } from '../../../services/api/AdminService';

export const WarehouseQRDisplay: React.FC = () => {
  const { currentUser } = useApp();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(0);

  const isGlobalAdmin = currentUser?.role === 'admin' && !currentUser?.warehouse_id;

  useEffect(() => {
    if (isGlobalAdmin) {
      AdminService.getWarehouses().then(setWarehouses).catch(console.error);
    } else if (currentUser?.warehouse_id) {
      setSelectedWarehouseId(currentUser.warehouse_id);
    }
  }, [currentUser, isGlobalAdmin]);

  const fetchQR = async () => {
    if (!selectedWarehouseId) {
      setQrToken(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('get_or_create_current_warehouse_qr', {
        p_warehouse_id: selectedWarehouseId,
      });

      if (rpcError) throw rpcError;

      setQrToken(data);
      setExpiresIn(60); // It's generated for 60s, or we can just count down 60s
    } catch (e: any) {
      console.error('Error fetching QR:', e);
      setError(e.message || 'Failed to generate QR');
      setQrToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    
    if (selectedWarehouseId) {
      fetchQR();
      const interval = setInterval(fetchQR, 55000);
      return () => clearInterval(interval);
    } else {
      setQrToken(null);
      setError(null);
      setExpiresIn(0);
    }
  }, [selectedWarehouseId, currentUser]);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const timer = setInterval(() => {
      setExpiresIn(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresIn]);

  if (!currentUser || currentUser.role !== 'admin') {
    return null;
  }

  const selectedWarehouseName = isGlobalAdmin 
    ? warehouses.find(w => w.id === selectedWarehouseId)?.name 
    : 'Your Assigned Store';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', backgroundColor: 'var(--bg-surface)', borderRadius: '12px',
      border: 'none', height: '100%'
    }}>
      
      {isGlobalAdmin && (
        <div style={{ width: '100%', marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Select Warehouse / Store</label>
          <select 
            value={selectedWarehouseId} 
            onChange={e => setSelectedWarehouseId(e.target.value)}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
          >
            <option value="">-- Choose Store --</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {!selectedWarehouseId ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Select a store to display its check-in QR
        </div>
      ) : loading && !qrToken ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
          <Loader2 size={32} className="spinner" />
          <span>Generating Secure QR...</span>
        </div>
      ) : error ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--danger)', textAlign: 'center' }}>
          <AlertCircle size={32} />
          <span>{error}</span>
          <button onClick={fetchQR} style={{ padding: '8px 16px', borderRadius: '6px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-light)', cursor: 'pointer', color: 'var(--text-primary)' }}>Retry</button>
        </div>
      ) : qrToken ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          {selectedWarehouseName && (
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center' }}>
              {selectedWarehouseName}
            </div>
          )}
          <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '12px' }}>
            <QRCodeSVG value={qrToken} size={200} level="H" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: expiresIn < 10 ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600 }}>
            <span>Refreshes in {expiresIn}s</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

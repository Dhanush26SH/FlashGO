import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/api/supabaseClient';
import { Search, Plus, MapPin, Package, RefreshCw, Send, CheckCircle } from 'lucide-react';

export const StockTransfers: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      if (!supabase) return;
      let query = supabase.from('stock_transfers').select('*, product:products(name), source:warehouses!stock_transfers_source_warehouse_id_fkey(name), dest:warehouses!stock_transfers_destination_warehouse_id_fkey(name)').order('created_at', { ascending: false });
      
      if (currentUser?.role === 'warehouse_manager') {
        query = query.or(`source_warehouse_id.eq.${currentUser.warehouse_id},destination_warehouse_id.eq.${currentUser.warehouse_id}`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      setTransfers(data || []);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [currentUser]);

  const handleDispatch = async (id: string, qty: number) => {
    if (!confirm('Confirm dispatch?')) return;
    try {
      const { error } = await supabase.rpc('dispatch_stock_transfer', {
        p_transfer_id: id, p_quantity: qty, p_user_id: currentUser!.id
      });
      if (error) throw error;
      addToast('Dispatched successfully', 'success');
      fetchTransfers();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleReceive = async (id: string, qty: number) => {
    if (!confirm('Confirm receive?')) return;
    try {
      const { error } = await supabase.rpc('receive_stock_transfer', {
        p_transfer_id: id, p_quantity: qty, p_user_id: currentUser!.id
      });
      if (error) throw error;
      addToast('Received successfully', 'success');
      fetchTransfers();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  if (loading) return <div className="p-4">Loading transfers...</div>;

  return (
    <div className="module-content">
      <div className="flex justify-between items-center mb-6">
        <h2>Cross-Warehouse Stock Transfers</h2>
        {currentUser?.role === 'admin' && <button className="btn-primary"><Plus size={16}/> New Transfer</button>}
      </div>
      
      <div className="glass-panel p-4 overflow-x-auto">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>ID</th>
              <th>Product</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Requested</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transfers.length === 0 ? <tr><td colSpan={7} className="text-center p-4">No transfers found</td></tr> : null}
            {transfers.map(t => (
              <tr key={t.id}>
                <td>{t.id.slice(0,8)}</td>
                <td>{t.product?.name}</td>
                <td>{t.source?.name}</td>
                <td>{t.dest?.name}</td>
                <td>{t.requested_quantity}</td>
                <td><span className={`status-badge ${t.status}`}>{t.status}</span></td>
                <td>
                  <div className="flex gap-2">
                    {t.status === 'approved' && (currentUser?.role === 'admin' || currentUser?.warehouse_id === t.source_warehouse_id) && (
                      <button onClick={() => handleDispatch(t.id, t.requested_quantity)} className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded flex items-center gap-1"><Send size={14}/> Dispatch</button>
                    )}
                    {t.status === 'in_transit' && (currentUser?.role === 'admin' || currentUser?.warehouse_id === t.destination_warehouse_id) && (
                      <button onClick={() => handleReceive(t.id, t.dispatched_quantity)} className="bg-green-500/20 text-green-400 px-2 py-1 rounded flex items-center gap-1"><CheckCircle size={14}/> Receive</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

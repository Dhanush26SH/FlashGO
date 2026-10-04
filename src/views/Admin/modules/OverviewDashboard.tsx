import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { PremiumMap } from '../../../components/PremiumMap';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { IndianRupee, Compass, AlertTriangle, Activity, ShoppingCart, Users, Truck, Package, RefreshCw, ShieldAlert, Store, Database } from 'lucide-react';
import { useLiveDriverSession } from '../../../hooks/useLiveDriverSession';
import { AnalyticsService } from '../../../services/api/AnalyticsService';
import { supabase } from '../../../services/api/supabaseClient';
import './OverviewDashboard.css';

export const OverviewDashboard: React.FC = () => {
  const { orders, refreshData } = useApp();
  
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [stats, setStats] = useState<any>(null);
  const [ordersPerHour, setOrdersPerHour] = useState<any[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('warehouses').select('id, name, code').then((res: any) => {
      if(res.data) setWarehouses(res.data);
    });
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const wId = selectedWarehouseId || undefined;
      const data = await AnalyticsService.getAdminDashboardStats(wId);
      const hourly = await AnalyticsService.getOrdersPerHour(wId);
      const alerts = await AnalyticsService.getDashboardInventoryAlerts(wId);
      
      setStats(data);
      setOrdersPerHour(hourly);
      setInventoryAlerts(alerts);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedWarehouseId]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel('dashboard_analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchDashboardData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_transactions' }, () => { fetchDashboardData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { fetchDashboardData(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedWarehouseId]);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const activeOutForDeliveryOrders = orders.filter(o => 
    o.status === 'out_for_delivery' && 
    (selectedWarehouseId ? o.warehouse_id === selectedWarehouseId : true)
  );
  const activeOrderWithSim = activeOutForDeliveryOrders.find(o => o.id === selectedOrderId) || activeOutForDeliveryOrders[0];

  const { realDriverCoords } = useLiveDriverSession(
    activeOrderWithSim?.status === 'out_for_delivery' ? (activeOrderWithSim.driver_id || undefined) : undefined
  );

  const handleRetry = () => {
    fetchDashboardData();
    refreshData();
  };

  const recentActivityOrders = orders.filter(o => selectedWarehouseId ? o.warehouse_id === selectedWarehouseId : true).slice(0, 5);

  const filteredForSnapshot = orders.filter(o => selectedWarehouseId ? o.warehouse_id === selectedWarehouseId : true);
  const snapshotPicking = filteredForSnapshot.filter(o => o.status === 'picking').length;
  const snapshotPacked = filteredForSnapshot.filter(o => o.status === 'packed' || o.status === 'staged').length;
  const snapshotOutForDelivery = filteredForSnapshot.filter(o => o.status === 'out_for_delivery').length;
  const snapshotCodOutstanding = filteredForSnapshot
    .filter(o => o.status === 'out_for_delivery' && o.payment_method === 'cod' && !o.cod_collected)
    .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  return (
    <div className="od-container" style={{ position: 'relative' }}>
      {isLoading && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw className="spin" size={32} style={{ marginBottom: '16px', color: 'var(--primary)' }} />
          <h3 style={{ color: 'var(--text-primary)' }}>Syncing Metrics...</h3>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-base)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldAlert size={48} style={{ marginBottom: '16px', color: 'var(--accent-red)' }} />
          <h3 style={{ color: 'var(--accent-red)' }}>Connection Error</h3>
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <button onClick={handleRetry} style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent-red)', color: 'white', cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Header Context Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={24} color="var(--primary)" /> 
          Operational Overview
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Store size={18} color="var(--text-secondary)" />
          <select 
            value={selectedWarehouseId}
            onChange={(e) => setSelectedWarehouseId(e.target.value)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              fontSize: '0.9rem',
              outline: 'none',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="">All Warehouses (Global)</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs Row */}
      <div className="od-kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '16px' }}>
        {[
          { label: 'ONLINE PICKERS', val: stats?.online_pickers || 0, desc: 'Active picker shifts', icon: <Users size={20} color="var(--primary)" />, color: 'var(--primary-glow)' },
          { label: 'ONLINE DRIVERS', val: stats?.online_drivers || 0, desc: 'Active driver shifts', icon: <Truck size={20} color="var(--primary)" />, color: 'var(--primary-glow)' },
          { label: 'TODAY\'S ORDERS', val: stats?.today_orders || 0, desc: 'Orders placed today', icon: <ShoppingCart size={20} color="var(--accent)" />, color: 'var(--accent-glow)' },
          { label: 'PENDING ORDERS', val: stats?.pending_orders || 0, desc: 'Awaiting assignment', icon: <Package size={20} color="var(--warning)" />, color: 'rgba(245, 158, 11, 0.15)', alert: (stats?.pending_orders || 0) > 5 },
          { label: 'ATTENTION REQ (>20m)', val: stats?.attention_orders || 0, desc: 'Requires intervention', icon: <AlertTriangle size={20} color="var(--danger)" />, color: 'rgba(239, 68, 68, 0.15)', alert: (stats?.attention_orders || 0) > 0 },
          { label: 'FLEET UTILIZATION', val: `${stats?.busy_drivers || 0} / ${stats?.online_drivers || 0}`, desc: 'Busy vs Online Drivers', icon: <Activity size={20} color="var(--info)" />, color: 'rgba(59, 130, 246, 0.15)' },
        ].map((k, i) => (
          <div key={i} className="od-kpi-card animate-slide-up" style={{ animationDelay: `${i * 0.05}s`, minHeight: '120px' }}>
            <div className="od-kpi-header">
              <div className="od-kpi-label">{k.label}</div>
              <div className="od-icon-badge" style={{ backgroundColor: k.color }}>{k.icon}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
              <div className="od-kpi-val" style={{ fontSize: '1.8rem' }}>{k.val}</div>
              {k.alert && <span className="od-pulse-alert-dot" style={{ backgroundColor: 'var(--danger)' }} />}
            </div>
            <div className="od-kpi-desc" style={{ marginTop: '8px' }}>{k.desc}</div>
          </div>
        ))}
        
        {/* Picking Now */}
        <div className="od-kpi-card animate-slide-up" style={{ animationDelay: '0.35s', minHeight: '120px' }}>
          <div className="od-kpi-header">
            <div className="od-kpi-label">PICKING NOW</div>
            <div className="od-icon-badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}><Package size={20} color="var(--success)" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
            <div className="od-kpi-val" style={{ fontSize: '1.8rem' }}>{snapshotPicking}</div>
          </div>
          <div className="od-kpi-desc" style={{ marginTop: '8px' }}>Active picking tasks</div>
        </div>

        {/* Ready / Staged */}
        <div className="od-kpi-card animate-slide-up" style={{ animationDelay: '0.40s', minHeight: '120px' }}>
          <div className="od-kpi-header">
            <div className="od-kpi-label">READY / STAGED</div>
            <div className="od-icon-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)' }}><Store size={20} color="var(--info)" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
            <div className="od-kpi-val" style={{ fontSize: '1.8rem' }}>{snapshotPacked}</div>
          </div>
          <div className="od-kpi-desc" style={{ marginTop: '8px' }}>Awaiting dispatch</div>
        </div>

        {/* Out for Delivery */}
        <div className="od-kpi-card animate-slide-up" style={{ animationDelay: '0.45s', minHeight: '120px' }}>
          <div className="od-kpi-header">
            <div className="od-kpi-label">OUT FOR DELIVERY</div>
            <div className="od-icon-badge" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}><Truck size={20} color="var(--warning)" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
            <div className="od-kpi-val" style={{ fontSize: '1.8rem' }}>{snapshotOutForDelivery}</div>
          </div>
          <div className="od-kpi-desc" style={{ marginTop: '8px' }}>Currently en route</div>
        </div>

        {/* COD Outstanding */}
        <div className="od-kpi-card animate-slide-up" style={{ animationDelay: '0.50s', minHeight: '120px' }}>
          <div className="od-kpi-header">
            <div className="od-kpi-label">COD OUTSTANDING</div>
            <div className="od-icon-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)' }}><IndianRupee size={20} color="var(--danger)" /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '12px' }}>
            <div className="od-kpi-val" style={{ fontSize: '1.8rem' }}>₹{snapshotCodOutstanding.toFixed(2)}</div>
          </div>
          <div className="od-kpi-desc" style={{ marginTop: '8px' }}>Pending cash collection</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '16px', marginBottom: '16px' }}>
        
        {/* Inventory Alerts (Replaces Live Status & Quick Actions) */}
        <div className="glass-panel" style={{ padding: '20px', gridColumn: 'span 2' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="var(--warning)" /> 
            Low Stock & Stockout Risks
          </h3>
          {inventoryAlerts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
              <Package size={32} color="var(--text-muted)" />
              <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>Stock levels are healthy.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {inventoryAlerts.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: 'var(--bg-base)', borderRadius: '8px', borderLeft: `3px solid ${item.stock_quantity === 0 ? 'var(--danger)' : 'var(--warning)'}` }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ID: {item.id.substring(0,8)}...</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: item.stock_quantity === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                      {item.stock_quantity} units
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Sellable</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}><Database size={16} color="var(--accent)" /> Recent Operational Activity</h3>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentActivityOrders.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', marginTop: '40px' }}>No recent activity.</p>
            ) : (
              recentActivityOrders.map((o: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', marginTop: '6px' }} />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Order #{o.id.substring(0,6).toUpperCase()} {o.status.replace('_', ' ')}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(o.updated_at || o.created_at).toLocaleTimeString()} - {o.customer_name || 'Customer'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="od-charts-map-grid">
        
        <div className="od-column-layout">
          <div className="od-chart-container animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="od-chart-header">
              <div>
                <h3 className="od-chart-title">Orders Per Hour</h3>
                <p className="od-chart-subtitle">Hourly order volume for current day</p>
              </div>
            </div>
            <div style={{ width: '100%', height: '360px', marginTop: '12px' }}>
              <ResponsiveContainer>
                <BarChart data={ordersPerHour} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-light)" />
                  <XAxis dataKey="hour" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', backgroundColor: 'var(--bg-card)' }}
                    formatter={(value: any) => [value, 'Orders']}
                  />
                  <Bar dataKey="orders" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Hand Column: Live Telemetry Dispatch Radar */}
        <div className="od-column-layout">
          <div className="od-telemetry-card animate-slide-up glass-panel" style={{ animationDelay: '0.6s' }}>
            <div className="od-chart-header" style={{ alignItems: 'flex-start' }}>
              <div>
                <h3 className="od-chart-title">Active Dispatch Telemetry Map</h3>
                <p className="od-chart-subtitle">Live coordinate plotting of out-for-delivery fleets</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="od-live-dot" />
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--primary)' }}>RADAR ACTIVE</span>
                </div>
                <select 
                  value={activeOrderWithSim?.id || ''}
                  onChange={e => setSelectedOrderId(e.target.value)}
                  disabled={activeOutForDeliveryOrders.length === 0}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: 'var(--bg-base)',
                    color: activeOutForDeliveryOrders.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: '1px solid var(--border-light)',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    outline: 'none',
                    cursor: activeOutForDeliveryOrders.length > 0 ? 'pointer' : 'not-allowed',
                    maxWidth: '180px'
                  }}
                >
                  {activeOutForDeliveryOrders.length === 0 ? (
                    <option value="">No Active Riders</option>
                  ) : (
                    activeOutForDeliveryOrders.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.driver_name || `Rider`} (Order #{o.id.slice(-6).toUpperCase()})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div style={{ height: '360px', marginTop: '16px', position: 'relative' }}>
              {activeOrderWithSim ? (
                <PremiumMap 
                  riderLat={realDriverCoords?.lat || activeOrderWithSim.delivery_lat} 
                  riderLng={realDriverCoords?.lng || activeOrderWithSim.delivery_lng}
                  destLat={activeOrderWithSim.delivery_lat}
                  destLng={activeOrderWithSim.delivery_lng}
                  destAddress={activeOrderWithSim.delivery_address}
                  isSimulating={false}
                />
              ) : (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <PremiumMap isStandby={true} />
                  

                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

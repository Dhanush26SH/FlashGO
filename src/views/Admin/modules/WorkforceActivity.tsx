import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/api/supabaseClient';
import { useApp } from '../../../context/AppContext';
import { AdminService } from '../../../services/api/AdminService';
import { Calendar, Filter, ChevronDown, ChevronUp, Package, CheckCircle, Clock, Search, MapPin, IndianRupee, Truck, Star, X } from 'lucide-react';
import './WorkforceActivity.css';

type TabType = 'Picker' | 'Driver' | 'Warehouse Staff';
type DateFilter = 'Today' | '7Days' | '30Days' | 'Custom';
type WarehouseDuty = 'All Duties' | 'Inward / Receiving' | 'Putaway' | 'Auditor' | 'Expiry' | 'F&V';

export const WorkforceActivity: React.FC = () => {
  const { currentUser } = useApp();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const data = await AdminService.getWarehouses();
        setWarehouses(data || []);
        if (data && data.length > 0 && !selectedWarehouseId) {
          if (currentUser?.warehouse_id) {
            setSelectedWarehouseId(currentUser.warehouse_id);
          } else {
            setSelectedWarehouseId(data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load warehouses', err);
      }
    };
    fetchWarehouses();
  }, [currentUser, selectedWarehouseId]);

  const [activeTab, setActiveTab] = useState<TabType>('Picker');
  const [dateFilter, setDateFilter] = useState<DateFilter>('Today');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [workerSearch, setWorkerSearch] = useState<string>('');
  const [warehouseDuty, setWarehouseDuty] = useState<WarehouseDuty>('All Duties');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  
  const [liveStaff, setLiveStaff] = useState<any[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [ratingWorkerId, setRatingWorkerId] = useState('');
  const [ratingWorkerName, setRatingWorkerName] = useState('');
  const [ratingRole, setRatingRole] = useState<'picker' | 'driver' | 'warehouse_staff'>('picker');
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingPerformance, setRatingPerformance] = useState<'Good'|'Average'|'Poor'>('Good');
  const [ratingBehaviour, setRatingBehaviour] = useState<'Good'|'Average'|'Poor'>('Good');
  const [ratingAttendance, setRatingAttendance] = useState<'Good'|'Average'|'Poor'>('Good');
  const [ratingRemarks, setRatingRemarks] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [ratingSuccess, setRatingSuccess] = useState('');

  const openRatingModal = (workerId: string, workerName: string, role: 'picker' | 'driver' | 'warehouse_staff') => {
    setRatingWorkerId(workerId);
    setRatingWorkerName(workerName);
    setRatingRole(role);
    setRatingValue(5);
    setRatingPerformance('Good');
    setRatingBehaviour('Good');
    setRatingAttendance('Good');
    setRatingRemarks('');
    setRatingError('');
    setRatingSuccess('');
    setRatingModalVisible(true);
  };

  const handleSubmitRating = async () => {
    if (submittingRating) return;
    setSubmittingRating(true);
    setRatingError('');
    setRatingSuccess('');

    try {
      const { start, end } = getDates();
      const periodStartStr = start.split('T')[0];
      const periodEndStr = end.split('T')[0];

      const { error: rpcError } = await supabase.rpc('admin_create_staff_performance_review', {
        p_staff_id: ratingWorkerId,
        p_warehouse_id: selectedWarehouseId,
        p_period_start: periodStartStr,
        p_period_end: periodEndStr,
        p_star_rating: ratingValue,
        p_performance: ratingPerformance,
        p_work_behaviour: ratingBehaviour,
        p_attendance: ratingAttendance,
        p_remarks: ratingRemarks
      });

      if (rpcError) throw rpcError;
      
      setRatingSuccess('Review submitted successfully.');
      setTimeout(() => setRatingModalVisible(false), 2000);
    } catch (err: any) {
      setRatingError(err.message || 'Failed to submit review.');
    } finally {
      setSubmittingRating(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, dateFilter, customStart, customEnd, workerSearch, warehouseDuty, selectedWarehouseId]);

  useEffect(() => {
    fetchLiveStaff();
  }, [activeTab, selectedWarehouseId]);

  const fetchLiveStaff = async () => {
    if (!selectedWarehouseId) return;
    setLoadingLive(true);
    try {
      const data = await AdminService.getLiveStaffStatus(selectedWarehouseId, activeTab);
      setLiveStaff(data || []);
    } catch (err) {
      console.error('Failed to load live staff status', err);
    } finally {
      setLoadingLive(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDates = () => {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (dateFilter === '7Days') {
      start.setDate(end.getDate() - 7);
    } else if (dateFilter === '30Days') {
      start.setDate(end.getDate() - 30);
    } else if (dateFilter === 'Custom' && customStart && customEnd) {
      return { start: new Date(customStart).toISOString(), end: new Date(customEnd).toISOString() };
    }
    
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const fetchData = async () => {
    if (!selectedWarehouseId) return;
    
    setLoading(true);
    setError(null);
    setData(null);

    const { start, end } = getDates();

    try {
      let rpcName = '';
      let params: any = {
        p_warehouse_id: selectedWarehouseId,
        p_start_date: start,
        p_end_date: end
      };

      if (activeTab === 'Picker') rpcName = 'admin_get_picker_work_history';
      else if (activeTab === 'Driver') rpcName = 'admin_get_driver_work_history';
      else if (activeTab === 'Warehouse Staff') {
        rpcName = 'admin_get_warehouse_staff_work_history';
        // Map frontend canonical filter names to the historical RPC text literals
        let rpcDuty = warehouseDuty as string;
        if (warehouseDuty === 'Inward / Receiving') rpcDuty = 'Inward + Damage';
        params.p_duty = rpcDuty;
      }

      // If workerSearch is uuid-like, use it. But typically search is by name.
      // For this simplified architecture, we'll fetch all and filter client-side if it's text, 
      // since the RPC accepts worker_id UUID. For robust text search, a view or RPC modification is needed.
      // We'll leave worker_id null to fetch all for the warehouse/dates, and filter client-side below.

      const { data: result, error: rpcError } = await supabase.rpc(rpcName, params);

      if (rpcError) throw rpcError;

      let filteredDetails = result?.details || [];
      
      // Map legacy duty names from RPC to canonical display names
      if (activeTab === 'Warehouse Staff') {
        filteredDetails = filteredDetails.map((worker: any) => ({
          ...worker,
          events: (worker.events || []).map((ev: any) => ({
            ...ev,
            duty: ev.duty === 'Inward + Damage' ? 'Inward / Receiving' : ev.duty
          }))
        }));
      }

      if (workerSearch.trim() !== '') {
        const term = workerSearch.toLowerCase();
        filteredDetails = filteredDetails.filter((d: any) => d.worker_name?.toLowerCase().includes(term));
      }

      setData({
        summary: result?.summary || {},
        details: filteredDetails
      });

    } catch (err: any) {
      setError(err.message || 'Failed to fetch work history.');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).toUpperCase();
  };

  const renderSummaryCards = () => {
    const { summary } = data || {};
    
    if (activeTab === 'Picker') {
      return (
        <div className="summary-cards">
          <div className="summary-card">
            <span className="summary-card-title">Slots Booked / Completed</span>
            <span className="summary-card-value">{summary?.slots_booked || 0} / {summary?.slots_completed || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Active Hours</span>
            <span className="summary-card-value">{((summary?.active_minutes || 0) / 60).toFixed(1)}h</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Orders Completed</span>
            <span className="summary-card-value">{summary?.orders_completed || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Units Picked</span>
            <span className="summary-card-value">{summary?.total_units_picked || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Total Earnings</span>
            <span className="summary-card-value">₹{summary?.total_earnings || 0}</span>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'Driver') {
      return (
        <div className="summary-cards">
          <div className="summary-card">
            <span className="summary-card-title">Gigs Booked</span>
            <span className="summary-card-value">{summary?.gigs_booked || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Active Hours</span>
            <span className="summary-card-value">{((summary?.active_minutes || 0) / 60).toFixed(1)}h</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Deliveries Assigned / Completed</span>
            <span className="summary-card-value">{summary?.deliveries_assigned || 0} / {summary?.deliveries_completed || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">COD Orders Collected</span>
            <span className="summary-card-value">{summary?.cod_collected || 0}</span>
          </div>
          <div className="summary-card" style={{border: '1px dashed var(--border-light)', backgroundColor: 'var(--bg-base)'}}>
            <span className="summary-card-title" style={{opacity: 0.7}}>Earnings</span>
            <span className="summary-card-value" style={{fontSize: '1rem', opacity: 0.7}}>Coming later</span>
          </div>
        </div>
      );
    }
    
    if (activeTab === 'Warehouse Staff') {
      return (
        <div className="summary-cards">
          <div className="summary-card">
            <span className="summary-card-title">Staff Worked</span>
            <span className="summary-card-value">{summary?.staff_worked || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Active Hours</span>
            <span className="summary-card-value">{((summary?.active_minutes || 0) / 60).toFixed(1)}h</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Putaway Units</span>
            <span className="summary-card-value">{summary?.putaway_units || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Inward Units Processed</span>
            <span className="summary-card-value">{summary?.inward_units_processed || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Audits Completed</span>
            <span className="summary-card-value">{summary?.audits_completed || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Expiry Units Removed</span>
            <span className="summary-card-value">{summary?.expiry_units_removed || 0}</span>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">F&V Units Removed</span>
            <span className="summary-card-value">{summary?.fnv_units_removed || 0}</span>
          </div>
        </div>
      );
    }
    
    return null;
  };

  const renderPickerTab = () => {
    const { summary, details } = data || {};
    return (
        <div className="history-list">
          {details?.length === 0 && <div className="empty-state"><p>No picker history found for this period.</p></div>}
          {details?.map((item: any) => (
            <div key={item.shift_id} className="history-item">
              <div className="history-item-header" onClick={() => toggleExpand(item.shift_id)}>
                <div className="history-item-main">
                  <div className="history-item-avatar">{item.worker_name?.charAt(0) || 'P'}</div>
                  <div className="history-item-info">
                    <span className="history-item-name">{item.worker_name}</span>
                    <span className="history-item-time">{formatDateTime(item.shift_start)} - {formatDateTime(item.shift_end)}</span>
                  </div>
                </div>
                <div className="history-item-metrics">
                  <div className="history-metric">
                    <span className="history-metric-label">Status</span>
                    <span className="history-metric-value">{item.status?.toUpperCase()}</span>
                  </div>
                  <div className="history-metric">
                    <span className="history-metric-label">Orders</span>
                    <span className="history-metric-value">{item.orders_worked?.length || 0}</span>
                  </div>
                  <div className="history-metric">
                    <span className="history-metric-label">Earnings</span>
                    <span className="history-metric-value">₹{item.earnings || 0}</span>
                  </div>
                  {expandedItems[item.shift_id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              
              {expandedItems[item.shift_id] && (
                <div className="history-item-details">
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openRatingModal(item.worker_id, item.worker_name, 'picker'); }}
                      style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Star size={14} /> Rate Staff
                    </button>
                  </div>
                  <div className="event-timeline">
                    {[...(item.orders_worked || [])].sort((a, b) => new Date(b.assigned_at || 0).getTime() - new Date(a.assigned_at || 0).getTime()).map((order: any) => (
                      <div key={order.order_id} className="event-item">
                        <div className="event-dot"></div>
                        <div className="event-content">
                          <div className="event-header">
                            <span className="event-title"><Package size={14}/> Order {order.order_number}</span>
                            <span className="event-time">{formatDateTime(order.assigned_at)}</span>
                          </div>
                          <div className="event-body grid-picker">
                            <div className="grid-cell">
                              <span className="grid-header">Order ID</span>
                              <span className="grid-value" style={{ fontFamily: 'monospace' }}>{order.order_id.split('-')[0]}...</span>
                            </div>
                            <div className="grid-cell">
                              <span className="grid-header">Products</span>
                              <span className="grid-value">-</span>
                            </div>
                            <div className="grid-cell">
                              <span className="grid-header">Units Picked</span>
                              <span className="grid-value">{order.units_picked || 0}</span>
                            </div>
                            <div className="grid-cell">
                              <span className="grid-header">Status</span>
                              <span className="grid-value">{order.picking_status?.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {item.orders_worked?.length === 0 && <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>No orders assigned during this slot.</p>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
    );
  };

  const renderDriverTab = () => {
    const { summary, details } = data || {};
    return (
        <div className="history-list">
          {details?.length === 0 && <div className="empty-state"><p>No driver history found for this period.</p></div>}
          {details?.map((item: any) => (
            <div key={item.session_id} className="history-item">
              <div className="history-item-header" onClick={() => toggleExpand(item.session_id)}>
                <div className="history-item-main">
                  <div className="history-item-avatar">{item.worker_name?.charAt(0) || 'D'}</div>
                  <div className="history-item-info">
                    <span className="history-item-name">{item.worker_name}</span>
                    <span className="history-item-time">{formatDateTime(item.shift_start)} - {formatDateTime(item.shift_end)}</span>
                  </div>
                </div>
                <div className="history-item-metrics">
                  <div className="history-metric">
                    <span className="history-metric-label">Status</span>
                    <span className="history-metric-value">{item.status?.toUpperCase()}</span>
                  </div>
                  <div className="history-metric">
                    <span className="history-metric-label">Trips</span>
                    <span className="history-metric-value">{item.trips?.length || 0}</span>
                  </div>
                  {expandedItems[item.session_id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              
              {expandedItems[item.session_id] && (
                <div className="history-item-details">
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openRatingModal(item.worker_id, item.worker_name, 'driver'); }}
                      style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Star size={14} /> Rate Staff
                    </button>
                  </div>
                  <div className="event-timeline">
                    {[...(item.trips || [])].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).map((trip: any) => (
                      <div key={trip.trip_id} className="event-item">
                        <div className="event-dot"></div>
                        <div className="event-content">
                          <div className="event-header">
                            <span className="event-title"><Truck size={14}/> Trip</span>
                            <span className="event-time">{formatDateTime(trip.created_at)}</span>
                          </div>
                          <div className="event-body grid-driver">
                            <div className="grid-cell">
                              <span className="grid-header">Trip ID</span>
                              <span className="grid-value" style={{ fontFamily: 'monospace' }}>{trip.trip_id.split('-')[0]}...</span>
                            </div>
                            <div className="grid-cell">
                              <span className="grid-header">Orders</span>
                              <span className="grid-value">{trip.orders?.length || 0}</span>
                            </div>
                            <div className="grid-cell">
                              <span className="grid-header">Status</span>
                              <span className="grid-value">{trip.status?.toUpperCase()}</span>
                            </div>
                            <div className="grid-cell">
                              <span className="grid-header">Delivered</span>
                              <span className="grid-value">{trip.delivered_at ? formatDateTime(trip.delivered_at) : '-'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {item.trips?.length === 0 && <p style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>No trips assigned during this session.</p>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
    );
  };
  const renderWarehouseStaffTab = () => {
    const { summary, details } = data || {};
    
    const groupedDetails = details?.reduce((acc: any, event: any) => {
      if (!acc[event.staff_id]) {
        acc[event.staff_id] = { worker_id: event.staff_id, worker_name: event.worker_name, events: [] };
      }
      acc[event.staff_id].events.push(event);
      return acc;
    }, {});
    
    const staffList = Object.values(groupedDetails || {}).sort((a: any, b: any) => a.worker_name.localeCompare(b.worker_name));

    return (
        <div className="history-list">
          {(!staffList || staffList.length === 0) && <div className="empty-state"><p>No tasks found for this period and duty filter.</p></div>}
          
          {staffList.map((worker: any) => (
            <div key={worker.worker_id} className="history-item">
              <div className="history-item-header" onClick={() => toggleExpand(worker.worker_id)}>
                <div className="history-item-main">
                  <div className="history-item-avatar">{worker.worker_name?.charAt(0) || 'W'}</div>
                  <div className="history-item-info">
                    <span className="history-item-name">{worker.worker_name}</span>
                    <span className="history-item-time">{worker.events.length} Completed Tasks</span>
                  </div>
                </div>
                <div className="history-item-metrics">
                  {expandedItems[worker.worker_id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
              
              {expandedItems[worker.worker_id] && (
                <div className="history-item-details">
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openRatingModal(worker.worker_id, worker.worker_name, 'warehouse_staff'); }}
                      style={{ padding: '6px 12px', background: 'var(--primary)', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Star size={14} /> Rate Staff
                    </button>
                  </div>
                  <div className="event-timeline">
                    {worker.events.map((event: any) => (
                      <div key={event.task_id} className="event-item">
                        <div className={`event-dot ${
                          event.duty === 'Putaway' ? 'putaway' : 
                          event.duty === 'Auditor' ? 'auditor' : 
                          event.duty === 'Expiry' ? 'expiry' : 
                          event.duty === 'F&V' ? 'fnv' : 
                          'inward'
                        }`}></div>
                        <div className="event-content">
                          <div className="event-header">
                            <span className="event-title">
                              <span className={`duty-badge ${
                                event.duty === 'Putaway' ? 'putaway' : 
                                event.duty === 'Auditor' ? 'auditor' : 
                                event.duty === 'Expiry' ? 'expiry' : 
                                event.duty === 'F&V' ? 'fnv' : 
                                'inward'
                              }`}>
                                {event.duty}
                              </span>
                            </span>
                            <span className="event-time">{formatDateTime(event.timestamp)}</span>
                          </div>
                          
                          {event.duty === 'Putaway' && (
                            <div className="event-body grid-putaway">
                              <div className="grid-cell">
                                <span className="grid-header">Product</span>
                                <span className="grid-value">{event.details.product_name}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Assigned</span>
                                <span className="grid-value">{event.details.assigned_qty}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Placed</span>
                                <span className="grid-value">{event.details.placed_qty}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Location</span>
                                <span className="grid-value">{event.details.location || '-'}</span>
                              </div>
                            </div>
                          )}

                          {(event.duty === 'Expiry' || event.duty === 'F&V') && (
                            <div className="event-body grid-putaway">
                              <div className="grid-cell">
                                <span className="grid-header">Product</span>
                                <span className="grid-value">{event.details.product_name}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Batch</span>
                                <span className="grid-value">{event.details.batch || '-'}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Removed</span>
                                <span className="grid-value">{event.details.removed_qty}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Reason</span>
                                <span className="grid-value">{event.details.reason}</span>
                              </div>
                            </div>
                          )}
                          
                          {event.duty === 'Auditor' && (
                            <div className="event-body grid-auditor">
                              <div className="grid-cell">
                                <span className="grid-header">Product</span>
                                <span className="grid-value">{event.details.product_name}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Location</span>
                                <span className="grid-value">{event.details.location || '-'}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">System</span>
                                <span className="grid-value">{event.details.system_qty}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Physical</span>
                                <span className="grid-value">{event.details.physical_qty ?? '-'}</span>
                              </div>
                              <div className="grid-cell">
                                <span className="grid-header">Variance</span>
                                <span className="grid-value" style={{ color: event.details.variance < 0 ? 'var(--danger)' : event.details.variance > 0 ? '#10b981' : 'inherit' }}>
                                  {event.details.variance !== null ? (event.details.variance > 0 ? `+${event.details.variance}` : event.details.variance) : '-'}
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {event.duty === 'Inward / Receiving' && (
                            <div className="event-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Receipt: <strong>{event.details.receipt_number || '-'}</strong>
                              </div>
                              {event.details.items?.map((item: any, i: number) => (
                                <div key={i} className="grid-inward" style={{ borderTop: i > 0 ? '1px dashed var(--border-light)' : 'none', paddingTop: i > 0 ? '8px' : '0' }}>
                                  <div className="grid-cell">
                                    <span className="grid-header">Product</span>
                                    <span className="grid-value">{item.product_name}</span>
                                  </div>
                                  <div className="grid-cell">
                                    <span className="grid-header">Accepted</span>
                                    <span className="grid-value">{item.accepted_qty}</span>
                                  </div>
                                  <div className="grid-cell">
                                    <span className="grid-header">Damaged</span>
                                    <span className="grid-value">{item.damaged_qty}</span>
                                  </div>
                                  <div className="grid-cell">
                                    <span className="grid-header">Expired</span>
                                    <span className="grid-value">{item.expired_qty || 0}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
    );
  };

  const validLiveStaff = liveStaff.filter(s => s.full_name?.trim());

  return (
    <div className="workforce-activity-container">
      <div className="workforce-header">
        <h2 className="workforce-title">Staff Work History</h2>
        <p className="workforce-subtitle">Consolidated operational history for {warehouses.find(w => w.id === selectedWarehouseId)?.name || 'All Warehouses'}</p>
      </div>

      <div className="workforce-filters">
        <div className="filter-group">
          <label className="filter-label"><MapPin size={12}/> Warehouse</label>
          <select className="filter-select" value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)}>
            {warehouses.map(store => (
              <option key={store.id} value={store.id}>{store.name} {store.code ? `(${store.code})` : ''}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label"><Calendar size={12}/> Date Range</label>
          <select className="filter-select" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)}>
            <option value="Today">Today</option>
            <option value="7Days">Last 7 Days</option>
            <option value="30Days">Last 30 Days</option>
            <option value="Custom">Custom Range</option>
          </select>
        </div>

        {dateFilter === 'Custom' && (
          <>
            <div className="filter-group">
              <label className="filter-label">Start</label>
              <input type="date" className="filter-input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            </div>
            <div className="filter-group">
              <label className="filter-label">End</label>
              <input type="date" className="filter-input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
            </div>
          </>
        )}

        {/* Global Filters */}
        <div className="filter-group">
          <label className="filter-label"><Search size={12}/> Search Worker</label>
          <input 
            type="text" 
            className="filter-input" 
            placeholder="Search by name..." 
            value={workerSearch} 
            onChange={(e) => setWorkerSearch(e.target.value)}
          />
        </div>
      </div>

      {renderSummaryCards()}

      <div className="workforce-tabs">
        <button className={`workforce-tab ${activeTab === 'Picker' ? 'active' : ''}`} onClick={() => setActiveTab('Picker')}>Picker</button>
        <button className={`workforce-tab ${activeTab === 'Driver' ? 'active' : ''}`} onClick={() => setActiveTab('Driver')}>Driver</button>
        <button className={`workforce-tab ${activeTab === 'Warehouse Staff' ? 'active' : ''}`} onClick={() => setActiveTab('Warehouse Staff')}>Warehouse Staff</button>
      </div>

      <div className="live-staff-section">
        <div className="live-staff-header">
          <h3 className="live-staff-title">LIVE {activeTab.toUpperCase()} STATUS</h3>
          <div className="live-staff-summary">
            <span className="status-badge online"><span className="dot"></span> {validLiveStaff.filter(s => s.is_online).length} Online</span>
            <span className="status-badge offline"><span className="dot"></span> {validLiveStaff.filter(s => !s.is_online).length} Offline</span>
          </div>
        </div>
        
        {loadingLive ? (
          <div className="live-staff-loading"><Clock size={16} className="spin"/> Loading live status...</div>
        ) : validLiveStaff.length === 0 ? (
          <div className="live-staff-empty">No staff found</div>
        ) : (
          <div className="live-staff-table-container">
            <table className="live-staff-table">
              <thead>
                <tr>
                  <th style={{ width: '60%' }}>STAFF</th>
                  <th style={{ width: '20%' }}>EMPLOYEE ID</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {validLiveStaff
                  .filter(s => !workerSearch || (s.full_name || '').toLowerCase().includes(workerSearch.toLowerCase()) || (s.employee_id || '').toLowerCase().includes(workerSearch.toLowerCase()))
                  .sort((a, b) => {
                    const nameA = (a.full_name || '').trim().toLowerCase();
                    const nameB = (b.full_name || '').trim().toLowerCase();
                    if (!nameA && nameB) return 1;
                    if (nameA && !nameB) return -1;
                    const comp = nameA.localeCompare(nameB);
                    if (comp !== 0) return comp;
                    return (a.employee_id || a.id).localeCompare(b.employee_id || b.id);
                  })
                  .map(staff => (
                  <tr key={staff.id}>
                    <td className="staff-name">{staff.full_name?.trim()}</td>
                    <td className="staff-emp-id">{staff.employee_id || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className={`staff-status ${staff.is_online ? 'is-online' : 'is-offline'}`}>
                        <div className="status-indicator"></div>
                        {staff.is_online ? 'ONLINE' : 'OFFLINE'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeTab === 'Warehouse Staff' && (
        <div className="workforce-filters" style={{ marginTop: '16px', marginBottom: '0' }}>
          <div className="filter-group">
            <label className="filter-label"><Filter size={12}/> Duty Filter</label>
            <select className="filter-select" value={warehouseDuty} onChange={(e) => setWarehouseDuty(e.target.value as WarehouseDuty)}>
              <option value="All Duties">All Duties</option>
              <option value="Inward / Receiving">Inward / Receiving</option>
              <option value="Putaway">Putaway</option>
              <option value="Auditor">Auditor</option>
              <option value="Expiry">Expiry</option>
              <option value="F&V">F&V</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <Clock size={32} className="spin" color="var(--primary)" />
          <p>Loading historical data...</p>
        </div>
      ) : error ? (
        <div className="error-state">
          <h3>Failed to Load Data</h3>
          <p>{error}</p>
        </div>
      ) : (
        <div className="workforce-content">
          {activeTab === 'Picker' && renderPickerTab()}
          {activeTab === 'Driver' && renderDriverTab()}
          {activeTab === 'Warehouse Staff' && renderWarehouseStaffTab()}
        </div>
      )}

      {ratingModalVisible && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Rate Staff</h2>
              <button onClick={() => setRatingModalVisible(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={24} color="#64748b" />
              </button>
            </div>

            <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '16px', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 4px 0', fontWeight: 'bold' }}>{ratingWorkerName}</p>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#64748b' }}>Role: {ratingRole.toUpperCase()}</p>
              <p style={{ margin: '0', fontSize: '0.85rem', color: '#64748b' }}>
                Period: {getDates().start.split('T')[0]} to {getDates().end.split('T')[0]}
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Overall Rating (1-5)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button 
                    key={star} 
                    onClick={() => setRatingValue(star)} 
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Star size={32} color={star <= ratingValue ? '#eab308' : '#e2e8f0'} fill={star <= ratingValue ? '#eab308' : 'transparent'} />
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Performance</label>
              <select value={ratingPerformance} onChange={e => setRatingPerformance(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="Good">Good</option>
                <option value="Average">Average</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Work Behaviour</label>
              <select value={ratingBehaviour} onChange={e => setRatingBehaviour(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="Good">Good</option>
                <option value="Average">Average</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Attendance</label>
              <select value={ratingAttendance} onChange={e => setRatingAttendance(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                <option value="Good">Good</option>
                <option value="Average">Average</option>
                <option value="Poor">Poor</option>
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.9rem' }}>Remarks (Optional)</label>
              <textarea 
                value={ratingRemarks} 
                onChange={e => setRatingRemarks(e.target.value)} 
                rows={3} 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }}
                placeholder="Enter any additional remarks..."
              />
            </div>

            {ratingError && (
              <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', marginBottom: '16px', fontSize: '0.85rem' }}>
                {ratingError}
              </div>
            )}
            
            {ratingSuccess && (
              <div style={{ padding: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#16a34a', marginBottom: '16px', fontSize: '0.85rem' }}>
                {ratingSuccess}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setRatingModalVisible(false)} 
                disabled={submittingRating}
                style={{ padding: '10px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSubmitRating} 
                disabled={submittingRating || !!ratingSuccess}
                style={{ padding: '10px 24px', border: 'none', background: 'var(--primary)', color: '#fff', borderRadius: '6px', cursor: submittingRating ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: submittingRating ? 0.7 : 1 }}
              >
                {submittingRating ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import './DeliveryOperations.css';
import { useApp } from '../../../context/AppContext';
import { Map, Truck, Search, CheckCircle } from 'lucide-react';
import { LogisticsService } from '../../../services/api/LogisticsService';
import { PremiumMap } from '../../../components/PremiumMap';
import type { MapWarehouse, MapDriver, MapDestination } from '../../../components/PremiumMap';
import { supabase } from '../../../services/api/supabaseClient';

const DRIVER_GPS_STALE_AFTER_MS = 120000; // 2 minutes

interface DriverSession {
  driver_id: string;
  latest_lat: number | null;
  latest_lng: number | null;
  last_updated: string | null;
}

export const DeliveryOperations: React.FC = () => {
  const { addToast, orders, logisticsTrips, profiles, darkStores, refreshData } = useApp();
  const drivers = profiles.filter(p => p.role === 'driver');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [driverSessions, setDriverSessions] = useState<Record<string, DriverSession>>({});

  // Active trips across the platform
  const allActiveTrips = logisticsTrips.filter(t => t.status === 'in_transit' || t.status === 'accepted' || t.status === 'pending');

  // Filter active trips by warehouse and search query
  const filteredTrips = allActiveTrips.filter(trip => {
    // 1. Warehouse Filter
    if (selectedWarehouseId !== 'all' && trip.warehouse_id !== selectedWarehouseId) {
      return false;
    }
    // 2. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesTripId = trip.id.toLowerCase().includes(q);
      const driver = drivers.find(d => d.id === trip.driver_id);
      const matchesDriverName = driver?.full_name?.toLowerCase().includes(q);
      
      const attachedOrders = orders.filter(o => o.trip_id === trip.id);
      const matchesOrderId = attachedOrders.some(o => o.id.toLowerCase().includes(q));

      if (!matchesTripId && !matchesDriverName && !matchesOrderId) {
        return false;
      }
    }
    return true;
  });

  // Data mapping for PremiumMap
  const mapWarehouses: MapWarehouse[] = darkStores
    .filter(store => selectedWarehouseId === 'all' || store.id === selectedWarehouseId)
    .map(store => ({
      id: store.id,
      lat: store.lat,
      lng: store.lng,
      name: store.name
    }));

  const mapDestinations: MapDestination[] = [];
  const mapDrivers: MapDriver[] = [];

  const now = Date.now();

  filteredTrips.forEach(trip => {
    // Collect destinations for this trip
    const tripOrders = orders.filter(o => o.trip_id === trip.id && o.delivery_lat && o.delivery_lng);
    tripOrders.forEach(o => {
      mapDestinations.push({
        id: o.id,
        lat: o.delivery_lat!,
        lng: o.delivery_lng!,
        address: o.delivery_address || 'Customer',
        tripId: trip.id
      });
    });

    // Collect driver telemetry for this trip
    if (trip.driver_id) {
      const session = driverSessions[trip.driver_id];
      const driverObj = drivers.find(d => d.id === trip.driver_id);
      
      if (session && session.latest_lat && session.latest_lng) {
        const lastUpdated = session.last_updated ? new Date(session.last_updated).getTime() : 0;
        const isStale = (now - lastUpdated) > DRIVER_GPS_STALE_AFTER_MS;

        mapDrivers.push({
          id: trip.driver_id,
          lat: session.latest_lat,
          lng: session.latest_lng,
          name: driverObj?.full_name || 'Driver',
          isStale
        });
      }
    }
  });

  // Fetch and subscribe to driver telemetry
  useEffect(() => {
    let isMounted = true;

    const fetchInitialSessions = async () => {
      try {
        const { data, error } = await supabase.from('driver_sessions').select('*');
        if (error) throw error;
        if (isMounted && data) {
          const sessionsMap: Record<string, DriverSession> = {};
          data.forEach((s: any) => {
            sessionsMap[s.driver_id] = s;
          });
          setDriverSessions(sessionsMap);
        }
      } catch (err) {
        console.error('Failed to fetch driver sessions:', err);
      }
    };

    fetchInitialSessions();

    const channel = supabase.channel('admin_live_delivery_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_sessions' }, (payload: any) => {
        const newSession = payload.new as DriverSession;
        if (newSession && newSession.driver_id) {
          setDriverSessions(prev => ({
            ...prev,
            [newSession.driver_id]: newSession
          }));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logistics_trips' }, () => {
        refreshData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        refreshData();
      })
      .subscribe();

    // Timer to re-render map drivers freshness status periodically
    const interval = setInterval(() => {
      if (isMounted) setDriverSessions(prev => ({ ...prev }));
    }, 30000);

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [refreshData]);
  
  const handleAssignDriver = async (tripId: string, driverId: string) => {
    try {
      await LogisticsService.reassignTrip(tripId, driverId);
      addToast('Driver assigned successfully to the trip', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to assign driver', 'error');
    }
  };

  const handleCompleteTrip = (tripId: string) => {
    addToast('Use the Driver app to complete trips via OTP.', 'info');
  };

  return (
    <div className="container">
      <div className=" ">
        <div>
          <h2 className="title">Live Delivery & Fleet Operations</h2>
          <p className="subtitle">Monitor active trips and track rider locations in real-time.</p>
        </div>
        <Map size={36} color="var(--primary)" />
      </div>

      <div className="two-col-grid" style={{ marginTop: '20px' }}>
        {/* Left: Map Visualization */}
        <div className=" ">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Map size={18} color="var(--primary)" />
              <h3 className="panel-title">Live Dispatch Radar</h3>
            </div>
            <div className="live-badge">
              <span className="pulse-dot"></span> LIVE
            </div>
          </div>
          
          <div className="map-visual-container" style={{ height: '600px', borderRadius: '12px', overflow: 'hidden' }}>
            <PremiumMap 
              warehouses={mapWarehouses}
              drivers={mapDrivers}
              destinations={mapDestinations}
            />
          </div>
          
          <div className="map-stats-row">
            <div className="stat-box">
              <div className="stat-label">Active Riders</div>
              <div className="stat-value">{mapDrivers.length}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Active Trips</div>
              <div className="stat-value">{filteredTrips.length}</div>
            </div>
          </div>
        </div>

        {/* Right: Trip Management */}
        <div className=" ">
          <div className="panel-header">
            <h3 className="panel-title">Active Logistics Trips</h3>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <div className="search-container" style={{ flex: 1, margin: 0 }}>
              <Search size={16} color="var(--text-secondary)" />
              <input 
                type="text" 
                placeholder="Search trips, orders, or drivers..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
            
            <select 
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Warehouses</option>
              {darkStores.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
          </div>

          <div className="trip-list" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {filteredTrips.length === 0 ? (
              <div className="empty-state">No active trips match your criteria.</div>
            ) : (
              filteredTrips.map(trip => {
                const driver = drivers.find(d => d.id === trip.driver_id);
                const attachedOrders = orders.filter(o => o.trip_id === trip.id);
                const session = trip.driver_id ? driverSessions[trip.driver_id] : null;
                const lastUpdated = session?.last_updated ? new Date(session.last_updated).getTime() : 0;
                const gpsStatus = !session?.latest_lat ? 'No GPS' : (Date.now() - lastUpdated) > DRIVER_GPS_STALE_AFTER_MS ? 'Stale' : 'Fresh';

                return (
                  <div key={trip.id} className="trip-card">
                    <div className="trip-header">
                      <div>
                        <div className="trip-id">TRIP #{trip.id.slice(-6).toUpperCase()}</div>
                        <div className="trip-meta">{attachedOrders.length} Orders attached</div>
                      </div>
                      <span style={statusBadgeStyle(trip.status)}>{trip.status.toUpperCase()}</span>
                    </div>

                    <div className="trip-body">
                      {trip.status === 'pending' && !trip.driver_id ? (
                        <div className="assign-row">
                          <select 
                            onChange={(e) => handleAssignDriver(trip.id, e.target.value)}
                            className="dropdown"
                            value=""
                          >
                            <option value="" disabled>Assign Rider...</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.id}>{d.full_name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="driver-info">
                          <div className="driver-avatar"><Truck size={12} /></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{driver?.full_name || 'Unknown Driver'}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Contact: {driver?.phone}</div>
                          </div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: gpsStatus === 'Fresh' ? '#10b981' : gpsStatus === 'Stale' ? '#f59e0b' : 'var(--text-muted)' }}>
                            {gpsStatus}
                          </div>
                        </div>
                      )}
                    </div>

                    {trip.status === 'in_transit' && (
                      <div className="trip-footer">
                        <button onClick={() => handleCompleteTrip(trip.id)} className="complete-btn" style={{ width: '100%' }}>
                          <CheckCircle size={14} /> Mark Trip Completed
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Styles
const statusBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent)' },
    accepted: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent)' },
    assigned: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent)' },
    in_transit: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--primary)' },
    completed: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' }
  };
  const c = colors[status] || { bg: 'var(--border-light)', text: 'var(--text-secondary)' };
  return { backgroundColor: c.bg, color: c.text, fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' };
};

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PremiumMap } from '../../components/PremiumMap';
import { FlashGoDB } from '../../services/db';
import { MapPin, Navigation, Phone, CheckCircle, Clock, Package, Camera, AlertTriangle, IndianRupee, ShieldAlert, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../../services/api/supabaseClient';
import { NotificationCenter } from '../../components/NotificationCenter';
import { LogisticsService } from '../../services/api/LogisticsService';
import { useDriverLocation } from '../../hooks/useDriverLocation';
import { useLiveDriverSession } from '../../hooks/useLiveDriverSession';
import { WorkSlotScheduler } from '../../components/WorkSlotScheduler';

export const DeliveryView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'schedule'>('console');
  return (
    <div style={{ padding: '0', maxWidth: '1200px', margin: '0 auto', height: '100%' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '16px 24px', backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-light)' }}>
        <button 
          onClick={() => setActiveTab('console')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'console' ? 'var(--primary)' : 'var(--bg-surface)', color: activeTab === 'console' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Delivery Console
        </button>
        <button 
          onClick={() => setActiveTab('schedule')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'schedule' ? 'var(--primary)' : 'var(--bg-surface)', color: activeTab === 'schedule' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          My Schedule
        </button>
      </div>
      <div style={{ height: 'calc(100% - 70px)', overflowY: 'auto' }}>
        {activeTab === 'console' ? <DeliveryConsole /> : <div style={{ padding: '24px' }}><WorkSlotScheduler /></div>}
      </div>
    </div>
  );
};

const DeliveryConsole: React.FC = () => {
  const { 
    orders, currentUser, logisticsTrips, reconcileDriverCOD
  } = useApp();

  const [isOnline, setIsOnline] = useState(true);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);

  const { realDriverCoords, isDriverActive } = useLiveDriverSession(
    activeOrderId ? currentUser?.id : undefined
  );
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  const cashOnHand = currentUser?.cod_wallet_liability || 0;

  // Sourced driver stats
  const driverEarnings = currentUser ? FlashGoDB.getDriverEarnings(currentUser.id) : [];
  const totalEarned = driverEarnings.reduce((acc, curr) => acc + Number(curr.earning_amount), 0);
  const totalCompletedCount = driverEarnings.length;

  const availableTrips = logisticsTrips.filter(t => t.status === 'pending');
  const myAssignedTrips = logisticsTrips.filter(t => t.driver_id === currentUser?.id && (t.status === 'accepted' || t.status === 'in_transit'));

  const activeOrder = orders.find(o => o.id === activeOrderId);

  // Trigger GPS tracking
  useDriverLocation({
    driverId: currentUser?.id,
    isDelivering: isOnline && !!activeOrderId
  });

  const handleClaimTrip = async (tripId: string) => {
    if (currentUser) {
      setIsActionLoading(true);
      try {
        await LogisticsService.claimTrip(tripId, currentUser.id);
        setActiveTripId(tripId);
        
        // Find the first order in this trip to navigate to
        const tripOrders = orders.filter(o => o.trip_id === tripId).sort((a,b) => (a.delivery_sequence || 0) - (b.delivery_sequence || 0));
        if (tripOrders.length > 0) {
          setActiveOrderId(tripOrders[0].id);
        }
      } catch (err: any) {
        alert(err.message || 'Failed to claim trip');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleStartTrip = async (tripId: string) => {
    if (currentUser) {
      setIsActionLoading(true);
      try {
        await LogisticsService.startTrip(tripId, currentUser.id);
      } catch (err: any) {
        alert(err.message || 'Failed to start trip');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  // --- OTP Delivery Verify ---
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeOrderId) return;
    
    setOtpError('');
    setIsActionLoading(true);
    let success = false;
    try {
      success = await LogisticsService.markOrderDelivered(activeOrderId, otpInput, currentUser.id);
    } catch (err: any) {
      setOtpError(err.message || 'Invalid OTP code.');
    } finally {
      setIsActionLoading(false);
    }
    
    if (success) {
      alert('Order successfully verified and delivered! Earnings added to your wallet.');
      
      // If trip contains more orders, proceed to next one
      if (activeTripId) {
        const tripOrders = orders.filter(o => o.trip_id === activeTripId).sort((a,b) => (a.delivery_sequence || 0) - (b.delivery_sequence || 0));
        const nextOrder = tripOrders.find(o => o.status !== 'delivered' && o.id !== activeOrderId);
        
        if (nextOrder) {
          setActiveOrderId(nextOrder.id);
          setOtpInput('');
          return;
        } else {
          // Completed all orders in trip
          setActiveTripId(null);
        }
      }
      
      setActiveOrderId(null);
      setOtpInput('');
    }
  };

  const handleReconcileCash = async () => {
    if (currentUser) {
      setIsActionLoading(true);
      try {
        await reconcileDriverCOD(currentUser.id);
        alert('Reconciliation Request Sent! Warehouse Lead has cleared your cash liability balance.');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  return (
    <div style={containerStyle}>
      <header style={headerStyle} className="glass-panel">
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>⚡ FlashGO Rider Console</h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Welcome, {currentUser?.full_name || 'Driver'}</p>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <NotificationCenter />
          {/* Online Toggle button */}
          <button 
            onClick={() => setIsOnline(!isOnline)} 
            style={isOnline ? onlineToggleActiveStyle : onlineToggleInactiveStyle}
        >
          {isOnline ? (
            <>
              <ToggleRight size={22} />
              <span>DUTY ONLINE</span>
            </>
          ) : (
            <>
              <ToggleLeft size={22} />
              <span>DUTY OFFLINE</span>
            </>
          )}
        </button>
        </div>
      </header>

      {isOnline ? (
        <div style={gridStyle}>
          {/* Left Column: Driver navigation or task board */}
          <div style={colStyle}>
            {activeOrder && activeTripId ? (
              (() => {
                const activeTrip = logisticsTrips.find(t => t.id === activeTripId);
                const isTripAccepted = activeTrip?.status === 'accepted';
                return (
                  <div style={activeJobCardStyle} className="glass-panel">
                    <div style={activeJobHeaderStyle}>
                      <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Rider Assigned Route</h3>
                        <span style={orderSerialLabelStyle}>Order #{activeOrder.id.toUpperCase().slice(-6)}</span>
                      </div>
                      <span style={statusBadgeStyle}>{isTripAccepted ? 'AT WAREHOUSE' : 'ON ROAD'}</span>
                    </div>

                <div style={routePointsWidgetStyle}>
                  <div style={routePointRowStyle}>
                    <span style={pointIndicatorStyle('var(--primary)')}>H</span>
                    <div>
                      <div style={pointTitleStyle}>FlashGO Warehouse Hub</div>
                      <div style={pointSubStyle}>Aisle Loading Zone, Box #{activeOrder.bag_number}</div>
                    </div>
                  </div>
                  <div style={routeConnectorLineStyle} />
                  <div style={routePointRowStyle}>
                    <span style={pointIndicatorStyle('var(--danger)')}>D</span>
                    <div>
                      <div style={pointTitleStyle}>Customer Dropoff</div>
                      <div style={pointSubStyle}>{activeOrder.delivery_address}</div>
                    </div>
                  </div>
                </div>

                  {/* Telemetry info */}
                  {isDriverActive && !isTripAccepted && (
                    <div style={telemetryBoxStyle}>
                      <span className="pulse-active" style={telemetryIndicatorStyle}>● LIVE GPS TRACKING ACTIVE</span>
                      <p style={{ fontSize: '0.68rem', marginTop: '2px' }}>Your vector coordinates are currently sharing in real-time with customer dashboard.</p>
                    </div>
                  )}

                  {isTripAccepted ? (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You must physically confirm pickup at the warehouse before delivering.</p>
                      <button 
                        onClick={() => handleStartTrip(activeTripId)}
                        style={{ ...verifyButtonStyle, padding: '12px', fontSize: '0.9rem' }}
                        disabled={isActionLoading}
                      >
                        {isActionLoading ? 'Confirming...' : 'Confirm Pickup & Start Trip'}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleVerifyOTP} style={verifyOtpFormStyle}>
                      <label style={formLabelStyle}>Customer Verification OTP Code</label>
                      <div style={otpInputGroupStyle}>
                        <input 
                          type="text" 
                          maxLength={6}
                          placeholder="e.g. 540987" 
                          value={otpInput} 
                          onChange={e => setOtpInput(e.target.value)} 
                          style={otpInputFieldStyle}
                          disabled={isActionLoading}
                          required 
                        />
                        <button type="submit" style={verifyButtonStyle} disabled={isActionLoading}>
                          {isActionLoading ? 'Verifying...' : 'Verify & Dropoff'}
                        </button>
                      </div>
                      {otpError && <div style={otpErrorStyle}>{otpError}</div>}
                    </form>
                  )}
                </div>
              );
            })()
          ) : (
              <>
                {/* Active claimed deliveries */}
                {myAssignedTrips.length > 0 && (
                  <div style={sectionStyle}>
                    <div style={sectionTitleStyle}>Your Assigned Deliveries</div>
                    {myAssignedTrips.map(t => {
                      const tripOrders = orders.filter(o => o.trip_id === t.id);
                      const nextOrder = tripOrders.sort((a,b) => (a.delivery_sequence || 0) - (b.delivery_sequence || 0)).find(o => o.status !== 'delivered');
                      return (
                        <div key={t.id} style={activeJobTaskCardStyle} onClick={() => { setActiveTripId(t.id); if (nextOrder) setActiveOrderId(nextOrder.id); }}>
                          <div style={taskCardHeaderStyle}>
                            <span style={{ fontWeight: 700 }}>Trip #{t.id.toUpperCase().slice(-6)}</span>
                            <span style={orangeBadgeStyle}>{t.status.toUpperCase()}</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Orders: {tripOrders.length}</div>
                          {nextOrder && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Next Dropoff: {nextOrder.delivery_address}</div>}
                          <button style={resumeNavButtonStyle}>
                            Resume Map Navigation →
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Available job board list */}
                <div style={sectionStyle}>
                  <div style={sectionTitleStyle}>Available Deliveries Near Store</div>
                  {availableTrips.length > 0 ? (
                    availableTrips.map(t => {
                      const tripOrders = orders.filter(o => o.trip_id === t.id);
                      return (
                        <div key={t.id} style={availableJobCardStyle}>
                          <div style={taskCardHeaderStyle}>
                            <span style={{ fontWeight: 700 }}>Trip #{t.id.toUpperCase().slice(-6)}</span>
                            <span style={greenBadgeStyle}>READY TO DISPATCH</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Contains {tripOrders.length} orders</div>
                          <div style={availableJobFooterStyle}>
                            <span>Batched Route</span>
                            <button 
                              onClick={() => handleClaimTrip(t.id)} 
                              style={acceptJobButtonStyle}
                              disabled={isActionLoading}
                            >
                              {isActionLoading ? 'Claiming...' : 'Claim Trip & Drive'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={emptyDeliveriesStyle} className="glass-panel">
                      <Navigation size={28} color="var(--text-muted)" />
                      <div>No packets in loading dock. Check back in a minute!</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right Column: Interactive Navigation telemetry map or Earnings dashboard */}
          <div style={colStyle}>
            {activeOrder && activeOrder.status === 'out_for_delivery' ? (
              <div style={{ height: '420px' }}>
                <PremiumMap 
                  riderLat={realDriverCoords?.lat || activeOrder.delivery_lat} 
                  riderLng={realDriverCoords?.lng || activeOrder.delivery_lng}
                  destLat={activeOrder.delivery_lat}
                  destLng={activeOrder.delivery_lng}
                  destAddress={activeOrder.delivery_address}
                  isSimulating={false}
                />
              </div>
            ) : (
              <div style={earningsCardStyle} className="glass-panel">
                <div style={earningsHeaderStyle}>
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 800 }}>Rider Earnings Summary</h3>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Daily logs and commissions paid</div>
                  </div>
                  <IndianRupee size={24} color="var(--primary)" />
                </div>

                <div style={statsRowStyle}>
                  <div style={statColStyle}>
                    <div style={statLabelStyle}>Total Commissions</div>
                    <div style={statValStyle}>₹{totalEarned.toFixed(2)}</div>
                  </div>
                  <div style={statColStyle}>
                    <div style={statLabelStyle}>Completed Drops</div>
                    <div style={statValStyle}>{totalCompletedCount} drops</div>
                  </div>
                </div>

                {/* Cash Reconciliation drop-down */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: 'var(--bg-base)', borderRadius: '6px', border: '1px solid var(--border-light)', marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>COD CASH ON HAND (WALLET LIABILITY)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: cashOnHand > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                        ₹{cashOnHand.toFixed(2)}
                      </div>
                    </div>
                    {cashOnHand > 0 && (
                      <button 
                        onClick={handleReconcileCash}
                        style={{
                          backgroundColor: 'var(--primary)',
                          color: 'var(--bg-surface)',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        Settle Cash drop
                      </button>
                    )}
                  </div>
                </div>

                <div style={ledgerWrapperStyle}>
                  <div style={ledgerTitleStyle}>Payout History</div>
                  {driverEarnings.length > 0 ? (
                    driverEarnings.map(e => (
                      <div key={e.id} style={ledgerRowStyle}>
                        <div>
                          <div style={ledgerDetailsStyle}>Order #{e.order_id.toUpperCase().slice(-6)}</div>
                          <div style={ledgerDateStyle}>{new Date(e.created_at).toLocaleTimeString()}</div>
                        </div>
                        <span style={ledgerAmtStyle}>+₹{Number(e.earning_amount).toFixed(2)}</span>
                      </div>
                    ))
                  ) : (
                    <div style={emptyHistoryStyle}>No payout entries yet. Complete a dropoff!</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={offlineNoticeStyle} className="glass-panel">
          <ShieldAlert size={48} color="var(--text-secondary)" />
          <h3>Rider Offline</h3>
          <p>Please slide the duty toggle to ONLINE at the top of your console to claim active delivery routes and earn commissions.</p>
        </div>
      )}
    </div>
  );
};

// --- STYLING COEFFICIENTS ---
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 24px',
  borderRadius: 'var(--border-radius-md)'
};

const onlineToggleActiveStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--primary-light)',
  color: 'var(--primary)',
  border: '1px solid var(--primary)',
  padding: '6px 16px',
  borderRadius: '20px',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 800,
  transition: 'all var(--transition-fast)'
};

const onlineToggleInactiveStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  backgroundColor: 'var(--border-light)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-light)',
  padding: '6px 16px',
  borderRadius: '20px',
  cursor: 'pointer',
  fontSize: '0.72rem',
  fontWeight: 800,
  transition: 'all var(--transition-fast)'
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.3fr',
  gap: '24px',
  alignItems: 'start'
};

const colStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const activeJobCardStyle: React.CSSProperties = {
  padding: '20px',
  backgroundColor: 'var(--bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const activeJobHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '12px'
};

const orderSerialLabelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  fontFamily: 'monospace',
  display: 'block',
  marginTop: '2px'
};

const statusBadgeStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-glow)',
  color: 'var(--accent)',
  fontSize: '0.62rem',
  fontWeight: 800,
  padding: '3px 8px',
  borderRadius: '10px'
};

const routePointsWidgetStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  paddingLeft: '10px'
};

const routePointRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '14px',
  alignItems: 'center'
};

const pointIndicatorStyle = (color: string): React.CSSProperties => ({
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  backgroundColor: color,
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.7rem',
  fontWeight: 800,
  zIndex: 2
});

const pointTitleStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700
};

const pointSubStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: 'var(--text-secondary)'
};

const routeConnectorLineStyle: React.CSSProperties = {
  width: '2px',
  height: '24px',
  backgroundColor: 'var(--border-light)',
  position: 'absolute',
  left: '21px',
  top: '24px',
  zIndex: 1
};

const telemetryBoxStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary-glow)',
  padding: '10px',
  borderRadius: '6px',
  border: '1px dashed var(--primary)'
};

const telemetryIndicatorStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 800,
  color: 'var(--primary)',
  display: 'block'
};

const verifyOtpFormStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border-light)',
  paddingTop: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const formLabelStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--text-secondary)'
};

const otpInputGroupStyle: React.CSSProperties = {
  display: 'flex',
  border: '1px solid var(--border-light)',
  borderRadius: '6px',
  overflow: 'hidden',
  height: '38px',
  backgroundColor: 'var(--bg-base)'
};

const otpInputFieldStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  width: '100%',
  padding: '0 12px',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
  outline: 'none',
  fontWeight: 800,
  letterSpacing: '0.1em'
};

const verifyButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  padding: '0 16px',
  fontWeight: 700,
  fontSize: '0.75rem',
  cursor: 'pointer'
};

const otpErrorStyle: React.CSSProperties = {
  color: 'var(--danger)',
  fontSize: '0.7rem',
  fontWeight: 600,
  textAlign: 'center',
  marginTop: '4px'
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--text-muted)'
};

const activeJobTaskCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary-glow)',
  border: '1px solid var(--primary)',
  borderRadius: 'var(--border-radius-sm)',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  cursor: 'pointer'
};

const taskCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.8rem'
};

const orangeBadgeStyle: React.CSSProperties = {
  backgroundColor: 'var(--accent-glow)',
  color: 'var(--accent)',
  fontSize: '0.6rem',
  fontWeight: 800,
  padding: '1px 6px',
  borderRadius: '4px'
};

const resumeNavButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  color: 'var(--primary)',
  fontSize: '0.72rem',
  fontWeight: 800,
  textAlign: 'left',
  padding: 0,
  cursor: 'pointer',
  marginTop: '4px'
};

const availableJobCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--border-radius-sm)',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const greenBadgeStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary-glow)',
  color: 'var(--primary)',
  fontSize: '0.6rem',
  fontWeight: 800,
  padding: '1px 6px',
  borderRadius: '4px'
};

const availableJobFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderTop: '1px solid var(--border-light)',
  paddingTop: '8px',
  marginTop: '4px',
  fontSize: '0.7rem',
  color: 'var(--text-secondary)'
};

const acceptJobButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--primary)',
  color: '#ffffff',
  border: 'none',
  padding: '4px 10px',
  borderRadius: '4px',
  fontSize: '0.68rem',
  fontWeight: 700,
  cursor: 'pointer'
};

const emptyDeliveriesStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: '8px',
  padding: '30px',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  backgroundColor: 'var(--bg-surface)'
};

const earningsCardStyle: React.CSSProperties = {
  padding: '20px',
  backgroundColor: 'var(--bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px'
};

const earningsHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '12px'
};

const statsRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px'
};

const statColStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-base)',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid var(--border-light)'
};

const statLabelStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--text-secondary)',
  fontWeight: 600
};

const statValStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 800
};

const ledgerWrapperStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border-light)',
  paddingTop: '12px'
};

const ledgerTitleStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  marginBottom: '8px'
};

const ledgerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '8px',
  marginBottom: '8px',
  fontSize: '0.72rem'
};

const ledgerDetailsStyle: React.CSSProperties = {
  fontWeight: 700
};

const ledgerDateStyle: React.CSSProperties = {
  fontSize: '0.62rem',
  color: 'var(--text-muted)'
};

const ledgerAmtStyle: React.CSSProperties = {
  color: 'var(--primary)',
  fontWeight: 800
};

const emptyHistoryStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '20px',
  fontSize: '0.7rem',
  color: 'var(--text-muted)'
};

const offlineNoticeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: '10px',
  padding: '40px',
  backgroundColor: 'var(--bg-surface)'
};

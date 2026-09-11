import React, { useState, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import { supabase } from '../../../services/api/supabaseClient';
import { ShieldCheck, User, X, Check, Eye } from 'lucide-react';
import '../../../styles/AdminStyles.css';

export const DriverApprovals: React.FC = () => {
  const { currentUser } = useApp();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [signedSelfieUrl, setSignedSelfieUrl] = useState<string | null>(null);

  // Actions
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [isChangesRequest, setIsChangesRequest] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      // Fetch submitted and under_review
      let query = supabase
        .from('driver_onboarding')
        .select(`
          *,
          profiles!inner(
            full_name, email, phone,
            driver_payout_details(*),
            driver_nominee_details(*),
            driver_agreement_acceptances(agreement_version)
          ),
          warehouses(name)
        `)
        .in('status', ['submitted', 'under_review'])
        .order('submission_time', { ascending: false });

      if (currentUser?.warehouse_id) {
        query = query.eq('warehouse_id', currentUser.warehouse_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Map embedded relations from profiles back to root level to match existing UI
      const mappedData = (data || []).map((app: any) => {
        if (app.profiles) {
          app.driver_payout_details = app.profiles.driver_payout_details;
          app.driver_nominee_details = app.profiles.driver_nominee_details;
          app.driver_agreement_acceptances = app.profiles.driver_agreement_acceptances;
        }
        return app;
      });

      setApplications(mappedData);
    } catch (e: any) {
      console.error('DriverApprovals fetch error:', e);
      alert(`Failed to load applications:\nCode: ${e.code}\nMessage: ${e.message}\nDetails: ${e.details}\nHint: ${e.hint}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const openApplication = async (app: any) => {
    // Clone app so we don't mutate state directly until we set it
    const appData = { ...app };
    setSelectedApp(appData);
    setSignedSelfieUrl(null);

    try {
      // 1. Explicitly fetch payout details
      const { data: payout } = await supabase.from('driver_payout_details').select('*').eq('driver_id', app.id).single();
      appData.explicit_payout = payout;

      // 2. Explicitly fetch nominee details
      const { data: nominee } = await supabase.from('driver_nominee_details').select('*').eq('driver_id', app.id).single();
      appData.explicit_nominee = nominee;

      // 3. Explicitly fetch agreement acceptances
      const { data: agreement } = await supabase.from('driver_agreement_acceptances').select('*').eq('driver_id', app.id).order('accepted_at', { ascending: false }).limit(1).single();
      appData.explicit_agreement = agreement;

      // Update the selected app with these explicit details
      setSelectedApp(appData);

      // 4. Handle Selfie URL correctly
      if (app.selfie_url) {
        const { data, error } = await supabase.storage.from('driver_documents').createSignedUrl(app.selfie_url, 3600);
        if (error) {
          console.error("Selfie signed URL error:", error);
        }
        if (data?.signedUrl) {
          setSignedSelfieUrl(data.signedUrl);
        }
      }
      
      // Mark as under review if it's submitted
      if (app.status === 'submitted') {
        await supabase.from('driver_onboarding').update({ status: 'under_review' }).eq('id', app.id);
        fetchApplications();
      }
    } catch (e) {
      console.error("Error fetching explicit driver details:", e);
    }
  };

  const handleApprove = async (app: any) => {
    if (!window.confirm(`Approve ${app.profiles.full_name} as a FlashGO Driver?`)) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc('approve_driver_application', {
        p_driver_id: app.id,
        p_action: 'approve'
      });
      if (error) throw error;
      alert('Driver approved successfully!');
      setSelectedApp(null);
      fetchApplications();
    } catch (e: any) {
      console.error(e);
      alert(`Approval failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOrRequestChanges = async () => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason');
      return;
    }
    setActionLoading(true);
    try {
      const action = isChangesRequest ? 'request_changes' : 'reject';
      const { error } = await supabase.rpc('approve_driver_application', {
        p_driver_id: selectedApp.id,
        p_action: action,
        p_reason: rejectReason.trim()
      });
      if (error) throw error;
      alert(isChangesRequest ? 'Changes requested.' : 'Application rejected.');
      setShowRejectModal(false);
      setSelectedApp(null);
      fetchApplications();
    } catch (e: any) {
      console.error(e);
      alert(`Action failed: ${e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Driver Approvals</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Review pending driver applications</p>
        </div>
        <button onClick={fetchApplications} className="btn-secondary">
          Refresh
        </button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : applications.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
          <User size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>No Pending Applications</h3>
          <p style={{ color: 'var(--text-secondary)' }}>All caught up!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', alignItems: 'start' }}>
          
          <div className="glass-panel" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>Pending Queue</h3>
            {applications.map(app => (
              <div 
                key={app.id}
                onClick={() => openApplication(app)}
                style={{ 
                  padding: '16px', 
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  backgroundColor: selectedApp?.id === app.id ? 'var(--bg-secondary)' : 'transparent',
                  borderLeft: selectedApp?.id === app.id ? '4px solid var(--primary)' : '4px solid transparent'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{app.profiles.full_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{app.warehouses?.name || 'Unknown Store'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{new Date(app.submission_time).toLocaleString()}</div>
                <span className={`status-badge ${app.status === 'under_review' ? 'status-warning' : 'status-info'}`} style={{ marginTop: '8px' }}>
                  {app.status.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          {selectedApp ? (
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>Application Review</h3>
                <button onClick={() => setSelectedApp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                
                <div>
                  <h4 style={{ color: 'var(--primary)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Driver Details</h4>
                  <div style={{ marginBottom: '12px' }}><strong>Name:</strong> {selectedApp.profiles.full_name}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Email:</strong> {selectedApp.profiles.email}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Phone:</strong> {selectedApp.profiles.phone || 'N/A'}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Language:</strong> {selectedApp.language_pref}</div>
                  
                  <h4 style={{ color: 'var(--primary)', marginTop: '24px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Work Preferences</h4>
                  <div style={{ marginBottom: '12px' }}><strong>Vehicle:</strong> {selectedApp.vehicle_type}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Work Type:</strong> {selectedApp.work_type}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Warehouse:</strong> {selectedApp.warehouses?.name}</div>
                  
                  <h4 style={{ color: 'var(--primary)', marginTop: '24px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Nominee</h4>
                  <div style={{ marginBottom: '12px' }}><strong>Name:</strong> {selectedApp.explicit_nominee?.nominee_name || 'N/A'}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Relation:</strong> {selectedApp.explicit_nominee?.relationship || 'N/A'}</div>
                  <div style={{ marginBottom: '12px' }}><strong>Mobile:</strong> {selectedApp.explicit_nominee?.mobile || 'N/A'}</div>
                </div>

                <div>
                  <h4 style={{ color: 'var(--primary)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Selfie</h4>
                  {signedSelfieUrl ? (
                    <img src={signedSelfieUrl} alt="Driver Selfie" style={{ width: '100%', maxWidth: '200px', borderRadius: '12px', border: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ padding: '24px', background: 'var(--bg-secondary)', borderRadius: '12px', textAlign: 'center' }}>Loading...</div>
                  )}

                  <h4 style={{ color: 'var(--primary)', marginTop: '24px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Payout</h4>
                  {selectedApp.explicit_payout?.payout_method_type === 'upi' ? (
                    <div style={{ marginBottom: '12px' }}><strong>UPI ID:</strong> {selectedApp.explicit_payout.upi_id}</div>
                  ) : selectedApp.explicit_payout ? (
                    <>
                      <div style={{ marginBottom: '12px' }}><strong>Bank:</strong> {selectedApp.explicit_payout.bank_name}</div>
                      <div style={{ marginBottom: '12px' }}><strong>Account:</strong> {selectedApp.explicit_payout.account_number ? 'xxxx' + selectedApp.explicit_payout.account_number.slice(-4) : 'N/A'}</div>
                      <div style={{ marginBottom: '12px' }}><strong>IFSC:</strong> {selectedApp.explicit_payout.ifsc}</div>
                    </>
                  ) : (
                    <div style={{ marginBottom: '12px' }}><strong>Status:</strong> Not Available</div>
                  )}

                  <h4 style={{ color: 'var(--primary)', marginTop: '24px', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>Compliance</h4>
                  <div style={{ marginBottom: '12px' }}>
                    <ShieldCheck size={16} color="var(--primary)" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                    Terms Version: {selectedApp.explicit_agreement?.agreement_version || 'Missing'}
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', gap: '16px', marginTop: '48px', borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <button 
                  className="btn-primary" 
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={() => handleApprove(selectedApp)}
                  disabled={actionLoading}
                >
                  <Check size={20} />
                  Approve Driver
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ flex: 1 }}
                  onClick={() => { setIsChangesRequest(true); setRejectReason(''); setShowRejectModal(true); }}
                  disabled={actionLoading}
                >
                  Request Changes
                </button>
                <button 
                  className="btn-danger" 
                  style={{ flex: 1 }}
                  onClick={() => { setIsChangesRequest(false); setRejectReason(''); setShowRejectModal(true); }}
                  disabled={actionLoading}
                >
                  Reject
                </button>
              </div>

              {/* Reject / Changes Modal inside the view */}
              {showRejectModal && (
                <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <h4 style={{ marginBottom: '12px', color: isChangesRequest ? 'var(--warning)' : 'var(--danger)' }}>
                    {isChangesRequest ? 'Request Changes' : 'Reject Application'}
                  </h4>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Provide a reason..."
                    style={{ width: '100%', padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px', color: '#fff', minHeight: '100px', marginBottom: '16px' }}
                  />
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button className="btn-secondary" onClick={() => setShowRejectModal(false)} disabled={actionLoading}>Cancel</button>
                    <button 
                      className={isChangesRequest ? 'btn-warning' : 'btn-danger'} 
                      onClick={handleRejectOrRequestChanges}
                      disabled={actionLoading}
                    >
                      {actionLoading ? 'Saving...' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Eye size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                <p>Select an application to review</p>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

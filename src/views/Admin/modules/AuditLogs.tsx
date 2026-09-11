import React, { useState, useEffect } from 'react';
import { supabase } from '../../../services/api/supabaseClient';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import './PlatformSettings.css';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (!supabase) return;
      let query = supabase.from('admin_audit_logs').select('*, admin:profiles(full_name, email)').order('created_at', { ascending: false }).limit(100);
      
      if (actionFilter) query = query.eq('action_type', actionFilter);
      if (entityFilter) query = query.eq('entity_type', entityFilter);

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (e) {
      console.error('Failed to load audit logs', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLog(prev => prev === id ? null : id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
        <input 
          type="text" 
          placeholder="Filter by Action Type (e.g. REFUND_APPROVED)" 
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none' }}
        />
        <input 
          type="text" 
          placeholder="Filter by Entity Type (e.g. products)" 
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border-light)', borderRadius: '6px', background: 'var(--bg-base)', color: 'var(--text-primary)', outline: 'none' }}
        />
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Timestamp</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Admin</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Action</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Entity</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading audit logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>No audit logs found.</td></tr>
            ) : (
              logs.map(log => (
                <React.Fragment key={log.id}>
                  <tr 
                    onClick={() => toggleExpand(log.id)}
                    style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background-color 0.2s' }}
                    className="hover-row"
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{log.admin?.full_name || log.admin_id}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ padding: '4px 8px', backgroundColor: 'var(--primary-transparent)', color: 'var(--primary)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {log.action_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{log.entity_type} ({log.entity_id})</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {expandedLog === log.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                  </tr>
                  {expandedLog === log.id && (
                    <tr style={{ backgroundColor: 'var(--bg-base)', borderBottom: '1px solid var(--border-light)' }}>
                      <td colSpan={5} style={{ padding: '16px 24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                          {log.before_state && (
                            <div>
                              <h5 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Before</h5>
                              <pre style={{ margin: 0, padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-muted)' }}>
                                {JSON.stringify(log.before_state, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.after_state && (
                            <div>
                              <h5 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>After</h5>
                              <pre style={{ margin: 0, padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem', overflowX: 'auto', color: '#10b981' }}>
                                {JSON.stringify(log.after_state, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                        {log.metadata && (
                          <div style={{ marginTop: '16px' }}>
                            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Metadata</h5>
                            <pre style={{ margin: 0, padding: '12px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem', overflowX: 'auto', color: 'var(--text-primary)' }}>
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

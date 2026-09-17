import React, { useState, useEffect } from 'react';
import './SupportSettings.css';
import { useApp } from '../../../context/AppContext';
import { 
  Settings, 
  HelpCircle, 
  Send, 
  Check, 
  Sliders, 
  ToggleLeft, 
  ToggleRight,
  Key,
  CreditCard,
  MapPin,
  MessageSquare,
  Eye,
  EyeOff,
  Terminal
} from 'lucide-react';
import { FlashGoDB } from '../../../services/db';
import { SupportService } from '../../../services/api/SupportService';
import type { SupportTicket, SupportTicketMessage } from '../../../services/api/SupportService';
import { WalletService } from '../../../services/api/WalletService';

export const SupportSettings: React.FC = () => {
  const { addToast, currentUser } = useApp();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [chatReply, setChatReply] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  
  // Track messages manually
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [refundDetails, setRefundDetails] = useState<any>(null);
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundQtyInput, setRefundQtyInput] = useState('');

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const data = await SupportService.getTickets();
      setTickets(data);
      if (data.length > 0 && !selectedTicketId) setSelectedTicketId(data[0].id);
    } catch (e) {
      console.error('Failed to load support tickets', e);
    }
  };

  useEffect(() => {
    if (selectedTicketId) {
      SupportService.getTicketMessages(selectedTicketId).then(setMessages);
      const ticket = tickets.find(t => t.id === selectedTicketId);
      if (ticket?.order_item_id) {
        fetchRefundDetails(ticket.order_item_id);
      } else {
        setRefundDetails(null);
      }
    }
  }, [selectedTicketId, tickets]);

  const fetchRefundDetails = async (orderItemId: string) => {
    try {
      const { supabase } = await import('../../../services/api/supabaseClient');
      const { data: item } = await supabase.from('order_items').select('*, product:products(name)').eq('id', orderItemId).single();
      if (!item) return;
      const { data: refunds } = await supabase.from('refunds').select('amount, refunded_quantity').eq('order_item_id', orderItemId).eq('status', 'completed');
      
      const totalRefundedAmount = refunds?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) || 0;
      const totalRefundedQty = refunds?.reduce((sum: number, r: any) => sum + Number(r.refunded_quantity), 0) || 0;
      
      const maxQty = item.quantity - totalRefundedQty;
      const maxAmt = (item.quantity * item.price) - totalRefundedAmount;
      
      setRefundDetails({
        item,
        totalRefundedAmount,
        totalRefundedQty,
        maxQty,
        maxAmt
      });
      setRefundQtyInput(maxQty.toString());
      setRefundAmountInput(maxAmt.toString());
    } catch (e) {
      console.error(e);
    }
  };

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const activeTickets = tickets.filter(
    t => t.status === 'open' || t.status === 'in_progress'
  );

  const triggerPhysicalReturn = async (ticket: any) => {
    if (!ticket.related_order_id) return addToast('No order attached', 'error');
    try {
      const { supabase } = await import('../../../services/api/supabaseClient');
      const warehouseId = prompt('Enter Destination Warehouse ID:');
      if (!warehouseId) return;
      const { error } = await supabase.rpc('trigger_physical_customer_return', {
        p_ticket_id: ticket.id,
        p_order_id: ticket.related_order_id,
        p_warehouse_id: warehouseId,
        p_user_id: currentUser!.id
      });
      if (error) throw error;
      addToast('Physical return created successfully', 'success');
      loadTickets();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // Send reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatReply.trim() || !selectedTicket || !currentUser) return;

    try {
      await SupportService.createMessage(selectedTicket.id, currentUser.id, chatReply);
      setChatReply('');
      addToast('Response dispatched successfully', 'success');
      // Reload messages
      const msgs = await SupportService.getTicketMessages(selectedTicket.id);
      setMessages(msgs);
    } catch (e: any) {
      addToast('Failed to send message: ' + e.message, 'error');
    }
  };

  // Resolve Ticket
  const handleResolveTicket = async (id: string) => {
    try {
      await SupportService.resolveTicket(id);
      addToast('Ticket marked as RESOLVED', 'success');
      loadTickets();
    } catch (e: any) {
      addToast('Failed to resolve ticket: ' + (e.message || e.toString()), 'error');
      console.error("Resolve ticket error:", e);
    }
  };

  const handleApproveRefund = async () => {
    if (!selectedTicket || !refundDetails) return;
    try {
      const amt = Number(refundAmountInput);
      const qty = Number(refundQtyInput);
      if (amt <= 0 || qty <= 0) {
        addToast('Invalid refund amount or quantity', 'error');
        return;
      }
      await SupportService.resolveAndRefund(selectedTicket.id, amt, qty, "Refund approved via Admin");
      addToast('Refund processed successfully', 'success');
      loadTickets();
      if (selectedTicket.order_item_id) {
        fetchRefundDetails(selectedTicket.order_item_id);
      }
    } catch (e: any) {
      addToast('Failed to process refund: ' + e.message, 'error');
    }
  };

  const handleViewOrder = (orderId: string) => {
    // Dispatch event to switch to orders tab in AdminView
    window.dispatchEvent(new CustomEvent('NAVIGATE_ADMIN_TAB', { detail: 'orders' }));
  };


  return (
    <div className="container">

          {/* Header */}
      <div className="welcome-banner">
        <div>
          <h2 className="title">Customer Support Ticket Desk</h2>
          <p className="subtitle">Moderate support complaint tickets, trace delivery delays, and resolve wallet refund requests.</p>
        </div>
        <MessageSquare size={36} color="var(--primary)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginTop: '16px' }}>
        {/* Ticket Workspace */}
        <div className="panel-card">
          <div className="panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HelpCircle size={18} color="var(--primary)" />
              <h3 className="panel-title">Active Complaint Roster</h3>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Removed demo data button */}
              <span className="ticket-badge">{activeTickets.length} Open Tickets</span>
            </div>
          </div>

          <div className="workspace-grid">
            {/* Ticket Roster list */}
            <div className="ticket-list">
              {activeTickets.map(t => (
                <div 
                  key={t.id} 
                  onClick={() => setSelectedTicketId(t.id)}
                  style={ticketItemStyle(selectedTicketId === t.id)}
                >
                  <div className="ticket-item-header">
                    <span style={ticketCatStyle(t.category)}>{t.category.toUpperCase()}</span>
                    <span style={ticketPriorityStyle(t.priority)}>{t.priority}</span>
                  </div>
                  <h4 className="ticket-subject">{t.subject}</h4>
                  <div className="ticket-meta-row">
                    <span>User: {t.customer_name}</span>
                    <span style={statusTextLabel(t.status)}>{t.status.toUpperCase()}</span>
                  </div>
                  {t.status === 'resolved' && (
                    <div style={{ marginTop: '8px' }}>
                      <button 
                        className="btn-secondary"
                        onClick={(e) => { e.stopPropagation(); triggerPhysicalReturn(t); }}
                        style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-light)', cursor: 'pointer', backgroundColor: 'transparent' }}
                      >
                        Create Physical Return
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Chat Simulator Workspace */}
            <div className="chat-column">
              {selectedTicket ? (
                <div className="chat-box">
                  <div className="chat-box-header">
                    <div>
                      <h4 className="chat-user-title">{selectedTicket.customer_name}</h4>
                      <p className="chat-user-subtitle">Subject: {selectedTicket.subject}</p>
                    </div>

                    {selectedTicket.status !== 'resolved' ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {selectedTicket.related_order_id && (
                          <button 
                            onClick={() => handleViewOrder(selectedTicket.related_order_id!)}
                            style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={12} /> View Order
                          </button>
                        )}
                        <button 
                          onClick={() => handleResolveTicket(selectedTicket.id)}
                          className="resolve-btn"
                        >
                          <Check size={12} /> Resolve Ticket
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 800 }}>✓ RESOLVED</span>
                    )}
                  </div>

                  {selectedTicket.related_order_id && (
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid var(--border-light)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div><strong style={{ color: 'var(--text-primary)' }}>Order ID:</strong> {selectedTicket.related_order_id}</div>
                      </div>
                      
                      {selectedTicket.order_item_id && refundDetails && (
                        <div style={{ padding: '12px', backgroundColor: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Issue Item:</strong> {refundDetails.item.product?.name || 'Unknown'} <br/>
                            Purchased: {refundDetails.item.quantity} (₹{refundDetails.item.price} each)
                          </div>
                          
                          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '0.8rem' }}>
                            <div>
                              <strong>Reported Qty:</strong> {selectedTicket.affected_quantity}
                            </div>
                            <div>
                              <strong>Prev Refunded:</strong> {refundDetails.totalRefundedQty} qty (₹{refundDetails.totalRefundedAmount})
                            </div>
                            <div style={{ color: 'var(--success)' }}>
                              <strong>Remaining Max:</strong> {refundDetails.maxQty} qty (₹{refundDetails.maxAmt})
                            </div>
                          </div>

                          {selectedTicket.status !== 'resolved' && refundDetails.maxAmt > 0 && (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-light)', paddingTop: '12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700 }}>Refund Qty</label>
                                <input type="number" min="1" max={refundDetails.maxQty} value={refundQtyInput} onChange={e => setRefundQtyInput(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-light)', width: '70px' }} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '0.7rem', fontWeight: 700 }}>Refund Amt (₹)</label>
                                <input type="number" min="0.01" max={refundDetails.maxAmt} step="0.01" value={refundAmountInput} onChange={e => setRefundAmountInput(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border-light)', width: '90px' }} />
                              </div>
                              <button 
                                onClick={handleApproveRefund}
                                style={{ padding: '6px 16px', backgroundColor: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                              >
                                Approve & Refund
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message Stream */}
                  <div className="message-stream">
                    {messages.map((m, idx) => (
                      <div key={idx} style={messageWrapperStyle(m.sender_id !== selectedTicket.customer_id)}>
                        <div style={messageBubbleStyle(m.sender_id !== selectedTicket.customer_id)}>
                          <div className="message-text">{m.message}</div>
                          <div className="message-time">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Form input */}
                  {selectedTicket.status !== 'resolved' ? (
                    <form onSubmit={handleSendReply} className="reply-form">
                      <input 
                        type="text" 
                        value={chatReply} 
                        placeholder="Type standard response..."
                        onChange={(e) => setChatReply(e.target.value)} 
                        className="reply-input" 
                      />
                      <button type="submit" className="reply-btn">
                        <Send size={14} />
                      </button>
                    </form>
                  ) : (
                    <div className="chat-closed-banner">This ticket has been marked resolved. Log is read-only.</div>
                  )}
                </div>
              ) : (
                <div className="empty-state">Select a customer complaint ticket to initiate live simulator</div>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div 
          onClick={() => setFullscreenImage(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={fullscreenImage} alt="Fullscreen Attachment" style={{ maxHeight: '90vh', maxWidth: '90vw', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }} />
        </div>
      )}
    </div>
  );
};

// --- STYLING CONSTANTS ---


























const ticketItemStyle = (active: boolean): React.CSSProperties => ({
  padding: '12px',
  backgroundColor: 'var(--bg-base)',
  border: active ? '1px solid var(--primary)' : '1px solid var(--border-light)',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'all 0.15s'
});



const ticketCatStyle = (cat: string): React.CSSProperties => ({
  fontSize: '0.52rem',
  fontWeight: 900,
  padding: '2px 4px',
  borderRadius: '3px',
  backgroundColor: cat === 'refund' ? 'rgba(16, 185, 129, 0.12)' : cat === 'damaged' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
  color: cat === 'refund' ? '#10b981' : cat === 'damaged' ? 'var(--danger)' : 'var(--info)'
});

const ticketPriorityStyle = (pri: string): React.CSSProperties => ({
  fontSize: '0.52rem',
  fontWeight: 800,
  color: pri === 'urgent' || pri === 'high' ? 'var(--danger)' : 'var(--text-muted)'
});





const statusTextLabel = (status: string): React.CSSProperties => ({
  fontWeight: 900,
  color: status === 'resolved' ? '#10b981' : '#f59e0b'
});















const messageWrapperStyle = (isSupport: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: isSupport ? 'flex-end' : 'flex-start'
});

const messageBubbleStyle = (isSupport: boolean): React.CSSProperties => ({
  maxWidth: '80%',
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: isSupport ? 'var(--primary-glow)' : 'var(--bg-surface)',
  border: isSupport ? '1px solid var(--primary)' : '1px solid var(--border-light)'
});









































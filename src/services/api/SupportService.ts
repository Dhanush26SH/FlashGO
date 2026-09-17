import { supabase } from './supabaseClient';

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  customer_id: string;
  customer_name?: string; // We'll get this via join or pass it from profiles
  related_order_id?: string;
  order_item_id?: string;
  affected_quantity?: number;
  subject: string;
  category: string;
  status: 'open' | 'resolved' | 'closed' | 'in_progress';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description?: string;
  created_at: string;
}

export class SupportService {
  static async getTickets(): Promise<SupportTicket[]> {
    if (!supabase) return [];
    
    // We join with profiles to get the customer's full name.
    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        profiles!support_tickets_customer_id_fkey(full_name)
      `)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching tickets', error);
      return [];
    }
    
    return data.map((t: any) => ({
      ...t,
      customer_name: t.profiles?.full_name || 'Unknown User'
    }));
  }
  
  static async getTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching messages', error);
      return [];
    }
    return data;
  }
  
  static async createMessage(ticketId: string, senderId: string, message: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase
      .from('support_ticket_messages')
      .insert([{
        ticket_id: ticketId,
        sender_id: senderId,
        message: message
      }]);
    if (error) throw error;
  }

  static async resolveTicket(ticketId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    
    // First try RPC
    const { error: rpcError } = await supabase.rpc('admin_update_ticket_status', {
      p_ticket_id: ticketId,
      p_status: 'resolved'
    });
    
    if (rpcError) {
      console.warn("RPC failed, attempting direct update...", rpcError);
      // Fallback to direct update if RPC fails due to role check
      const { error: updateError } = await supabase
        .from('support_tickets')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', ticketId);
        
      if (updateError) throw updateError;
    }
  }

  static async resolveAndRefund(ticketId: string, refundAmount: number, refundedQty: number, note: string): Promise<void> {
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.rpc('admin_resolve_ticket_and_refund', {
      p_ticket_id: ticketId,
      p_refund_amount: refundAmount,
      p_refunded_quantity: refundedQty,
      p_resolution_note: note
    });
    if (error) throw error;
  }
}


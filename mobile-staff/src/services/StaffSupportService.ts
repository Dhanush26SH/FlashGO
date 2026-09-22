import { supabase } from '../lib/supabase';

export interface StaffSupportTicket {
  id: string;
  staff_id: string;
  category: string;
  subject: string;
  description: string;
  status: 'open' | 'resolved' | 'closed';
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface StaffSupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

export const StaffSupportService = {
  async getTickets(): Promise<StaffSupportTicket[]> {
    const { data, error } = await supabase
      .from('staff_support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  },

  async createTicket(payload: { category: string; subject: string; description: string }): Promise<StaffSupportTicket> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('staff_support_tickets')
      .insert({
        ...payload,
        staff_id: user.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getMessages(ticketId: string): Promise<StaffSupportMessage[]> {
    const { data, error } = await supabase
      .from('staff_support_messages')
      .select('*, sender:profiles(id, role)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async sendMessage(ticketId: string, message: string): Promise<StaffSupportMessage> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('staff_support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        message
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

import { supabase } from './supabaseClient';

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
  staff?: {
    full_name: string;
    role: string;
    employee_id?: string;
  };
}

export interface StaffSupportMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender?: {
    role: string;
  };
}

export const StaffSupportAdminService = {
  async getAllActiveTickets(): Promise<StaffSupportTicket[]> {
    const { data, error } = await supabase
      .from('staff_support_tickets')
      .select('*, staff:profiles(full_name, role, employee_id)')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    // Map to single object if array returned
    return data?.map((d: any) => ({
      ...d,
      staff: Array.isArray(d.staff) ? d.staff[0] : d.staff
    })) || [];
  },

  async getTicketMessages(ticketId: string): Promise<StaffSupportMessage[]> {
    const { data, error } = await supabase
      .from('staff_support_messages')
      .select('*, sender:profiles(role)')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data?.map((d: any) => ({
      ...d,
      sender: Array.isArray(d.sender) ? d.sender[0] : d.sender
    })) || [];
  },

  async sendReply(ticketId: string, message: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('staff_support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        message
      });

    if (error) throw error;
  },

  async resolveTicket(ticketId: string): Promise<void> {
    const { error, data } = await supabase
      .from('staff_support_tickets')
      .update({ status: 'resolved' })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    console.log("Resolved ticket:", data);

    if (error) throw error;
  }
};

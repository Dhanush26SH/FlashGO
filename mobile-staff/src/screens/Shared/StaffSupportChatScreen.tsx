import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ArrowLeft, Send } from 'lucide-react-native';
import { StaffSupportService, StaffSupportMessage, StaffSupportTicket } from '../../services/StaffSupportService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function StaffSupportChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { profile } = useAuth() as any;
  const { ticketId } = route.params;

  const [ticket, setTicket] = useState<StaffSupportTicket | null>(null);
  const [messages, setMessages] = useState<StaffSupportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadTicketAndMessages();

    const subscription = supabase
      .channel(`staff_support_messages_${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_support_messages', filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as StaffSupportMessage]);
        }
      )
      .subscribe();

    const ticketSub = supabase
      .channel(`staff_support_ticket_${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'staff_support_tickets', filter: `id=eq.${ticketId}` },
        (payload) => {
          setTicket((prev) => prev ? { ...prev, ...payload.new } as StaffSupportTicket : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
      supabase.removeChannel(ticketSub);
    };
  }, [ticketId]);

  const loadTicketAndMessages = async () => {
    try {
      setLoading(true);
      const [tData, mData] = await Promise.all([
        supabase.from('staff_support_tickets').select('*').eq('id', ticketId).single(),
        StaffSupportService.getMessages(ticketId)
      ]);
      if (tData.data) setTicket(tData.data);
      setMessages(mData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!reply.trim() || sending) return;
    try {
      setSending(true);
      await StaffSupportService.sendMessage(ticketId, reply.trim());
      setReply('');
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: StaffSupportMessage & { sender?: { role: string } } }) => {
    const isAdmin = item.sender?.role === 'admin';
    return (
      <View style={[styles.messageWrapper, isAdmin ? styles.messageWrapperAdmin : styles.messageWrapperSelf]}>
        <View style={[styles.messageBubble, isAdmin ? styles.messageBubbleAdmin : styles.messageBubbleSelf]}>
          <Text style={[styles.messageText, isAdmin ? styles.messageTextAdmin : styles.messageTextSelf]}>
            {item.message}
          </Text>
          <Text style={[styles.timeText, isAdmin ? styles.timeTextAdmin : styles.timeTextSelf]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading || !ticket) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const isClosed = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerSubject} numberOfLines={1}>{ticket.subject}</Text>
          <Text style={styles.headerStatus}>{ticket.status.toUpperCase()}</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.chatArea}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListHeaderComponent={() => (
          <View style={styles.initialIssueContainer}>
            <Text style={styles.initialIssueLabel}>Original Request</Text>
            <Text style={styles.initialIssueText}>{ticket.description}</Text>
          </View>
        )}
      />

      {isClosed ? (
        <View style={styles.closedBanner}>
          <Text style={styles.closedText}>This ticket is marked as {ticket.status.toUpperCase()}. Replies are disabled.</Text>
        </View>
      ) : (
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={reply}
            onChangeText={setReply}
            multiline
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity 
            style={[styles.sendBtn, (!reply.trim() || sending) && { opacity: 0.5 }]} 
            onPress={handleSend}
            disabled={!reply.trim() || sending}
          >
            {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Send size={20} color="#FFF" />}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 60, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 8, marginLeft: -8 },
  headerSubject: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerStatus: { fontSize: 12, color: '#6B7280', fontWeight: '500', marginTop: 2 },
  chatArea: { padding: 16, paddingBottom: 32 },
  initialIssueContainer: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#E5E7EB' },
  initialIssueLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 4 },
  initialIssueText: { fontSize: 14, color: '#1F2937', lineHeight: 20 },
  messageWrapper: { marginBottom: 16, flexDirection: 'row' },
  messageWrapperSelf: { justifyContent: 'flex-end' },
  messageWrapperAdmin: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 12 },
  messageBubbleSelf: { backgroundColor: '#10B981', borderBottomRightRadius: 2 },
  messageBubbleAdmin: { backgroundColor: '#FFF', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: '#E5E7EB' },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTextSelf: { color: '#FFF' },
  messageTextAdmin: { color: '#1F2937' },
  timeText: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  timeTextSelf: { color: '#D1FAE5' },
  timeTextAdmin: { color: '#9CA3AF' },
  inputArea: { flexDirection: 'row', padding: 16, paddingBottom: 32, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15, maxHeight: 100, color: '#111827' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  closedBanner: { padding: 16, paddingBottom: 32, backgroundColor: '#F3F4F6', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  closedText: { color: '#6B7280', fontSize: 13, fontWeight: '500' }
});

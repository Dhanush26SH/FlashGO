import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Modal } from 'react-native';
import { HeadphonesIcon, Plus, Send, ChevronLeft, MessageSquare, Clock, CheckCircle, Paperclip, X } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { getSupportTickets, createSupportTicket, getSupportMessages, sendSupportMessage } from '../services/api';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';

export default function SupportScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const activeTicketIdParam = route.params?.activeTicketId;
  const { sessionUser } = useMobileAppContext();
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);

  const validateImage = async (uri: string) => {
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      if (blob.size > 2097152) {
        Alert.alert('File too large', 'The selected image exceeds the 2 MB limit. Please try another image.');
        return false;
      }
    } catch (e) {
      console.error('Validation error:', e);
    }
    return true;
  };

  const launchCamera = async () => {
    setShowAttachmentMenu(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission denied', 'Camera access is required.');
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });
    if (!result.canceled) {
       const valid = await validateImage(result.assets[0].uri);
       if (valid) setSelectedImage(result.assets[0].uri);
    }
  };

  const launchGallery = async () => {
    setShowAttachmentMenu(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission denied', 'Gallery access is required.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });
    if (!result.canceled) {
       const valid = await validateImage(result.assets[0].uri);
       if (valid) setSelectedImage(result.assets[0].uri);
    }
  };

  const handlePickImage = () => {
    setShowAttachmentMenu(true);
  };

  useEffect(() => {
    messages.forEach(async (m) => {
      if (m.media_path && !signedUrls[m.media_path]) {
        try {
          const { data, error } = await supabase.storage.from('support_evidence').createSignedUrl(m.media_path, 3600);
          if (data?.signedUrl) {
            setSignedUrls(prev => ({ ...prev, [m.media_path]: data.signedUrl }));
          }
        } catch (e) {
          console.error(e);
        }
      }
    });
  }, [messages]);

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    if (!activeTicket) return;
    loadMessages(activeTicket.id);
    
    const sub = supabase
      .channel(`ticket-${activeTicket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${activeTicket.id}` }, (payload) => {
        setMessages(prev => {
          const updated = [...prev, payload.new];
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          return updated;
        });
      })
      .subscribe();
      
    return () => { sub.unsubscribe(); };
  }, [activeTicket]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      const data = await getSupportTickets();
      setTickets(data);
      if (activeTicketIdParam) {
        const found = data.find((t: any) => t.id === activeTicketIdParam);
        if (found) {
          setActiveTicket(found);
          navigation.setParams({ activeTicketId: undefined });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (ticketId: string) => {
    try {
      setLoading(true);
      const data = await getSupportMessages(ticketId);
      setMessages(data);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!newMsg.trim() && !selectedImage) || !activeTicket) return;
    try {
      setSending(true);
      let mediaPath = undefined;
      
      if (selectedImage) {
        const ext = selectedImage.split('.').pop() || 'jpg';
        const filename = `${sessionUser?.id}/${activeTicket.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        
        const resp = await fetch(selectedImage);
        const blob = await resp.blob();
        const { data, error: uploadErr } = await supabase.storage.from('support_evidence').upload(filename, blob);
        
        if (uploadErr) throw new Error('Failed to upload image: ' + uploadErr.message);
        mediaPath = filename;
      }
      
      await sendSupportMessage({ 
        ticket_id: activeTicket.id, 
        message: newMsg.trim() || '', 
        sender_id: sessionUser?.id,
        media_path: mediaPath,
        media_type: mediaPath ? 'image' : undefined
      });
      
      setNewMsg('');
      setSelectedImage(null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSending(false);
    }
  };

  const handleCreateTicket = async () => {
    try {
      setLoading(true);
      // category CHECK: 'Missing Item'|'Wrong Item'|'Damaged Item'|'Late Delivery'|'Payment'|'Refund'|'Other'|'Quality Issue'
      // priority CHECK: 'low'|'medium'|'high'|'urgent' (default: 'low')
      // status default: 'open'
      // customer_id: required by RLS WITH CHECK (auth.uid() = customer_id)
      const t = await createSupportTicket({
        customer_id: sessionUser?.id,
        subject: 'New Issue / Query',
        description: 'User requested assistance.',
        category: 'Other',
        priority: 'low',
        status: 'open',
      });
      loadTickets();
      setActiveTicket(t);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return theme.colors.warning;
      case 'in_progress': return theme.colors.primary;
      case 'resolved': return theme.colors.success;
      case 'closed': return theme.colors.textMuted;
      default: return theme.colors.primary;
    }
  };

  if (activeTicket) {
    return (
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <Modal visible={showAttachmentMenu} transparent animationType="fade">
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowAttachmentMenu(false)} activeOpacity={1}>
            <View style={{ width: '80%', backgroundColor: theme.colors.surface, borderRadius: 12, overflow: 'hidden' }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: theme.colors.text }}>Attach Evidence</Text>
              </View>
              <TouchableOpacity style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }} onPress={launchCamera}>
                <Text style={{ fontSize: 16, color: theme.colors.primary }}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }} onPress={launchGallery}>
                <Text style={{ fontSize: 16, color: theme.colors.primary }}>Choose from Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ padding: 16 }} onPress={() => setShowAttachmentMenu(false)}>
                <Text style={{ fontSize: 16, color: theme.colors.danger, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backIconBtn} onPress={() => setActiveTicket(null)}>
            <ChevronLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle} numberOfLines={1}>{activeTicket.subject}</Text>
            <Text style={styles.headerSub}>Ticket #{activeTicket.id.split('-')[0].toUpperCase()}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {activeTicket.related_order_id && (
          <View style={{ padding: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>
              Order #{activeTicket.related_order_id.split('-')[0].toUpperCase()}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
              Related to this support ticket
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isCustomer = item.sender_id === sessionUser?.id;
              return (
                <View style={[styles.msgWrapper, isCustomer ? styles.msgWrapperRight : styles.msgWrapperLeft]}>
                  {!isCustomer && (
                    <Text style={{ fontSize: 10, color: theme.colors.textMuted, marginBottom: 4, fontWeight: '600' }}>FlashGO Support</Text>
                  )}
                  <View style={[styles.msgBubble, isCustomer ? styles.msgCustomer : styles.msgAdmin]}>
                    {item.media_path && signedUrls[item.media_path] && (
                      <Image 
                        source={{ uri: signedUrls[item.media_path] }} 
                        style={{ width: 200, height: 200, borderRadius: 8, marginBottom: item.message ? 8 : 0 }} 
                      />
                    )}
                    {item.message ? (
                      <Text style={[styles.msgText, isCustomer && { color: theme.colors.surface }]}>{item.message}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.msgTime}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MessageSquare size={48} color={theme.colors.border} />
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptySub}>An agent will be with you shortly.</Text>
              </View>
            }
          />
        )}

        {selectedImage && activeTicket.status !== 'resolved' && (
          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface, flexDirection: 'row', alignItems: 'center' }}>
            <Image source={{ uri: selectedImage }} style={{ width: 60, height: 60, borderRadius: 8 }} />
            <TouchableOpacity onPress={() => setSelectedImage(null)} style={{ marginLeft: 12, backgroundColor: theme.colors.border, padding: 4, borderRadius: 16 }}>
              <X size={16} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputArea}>
          {activeTicket.status !== 'resolved' && (
            <TouchableOpacity onPress={handlePickImage} style={{ marginRight: 8, padding: 8 }} disabled={sending}>
              <Paperclip size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
          <TextInput 
            style={styles.chatInput} 
            value={newMsg} 
            onChangeText={setNewMsg} 
            placeholder="Type your message..." 
            placeholderTextColor={theme.colors.textMuted}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendBtn, ((!newMsg.trim() && !selectedImage) || sending) && styles.sendBtnDisabled]} 
            onPress={handleSend}
            disabled={(!newMsg.trim() && !selectedImage) || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.surface} />
            ) : (
              <Send size={20} color={theme.colors.surface} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {navigation.canGoBack() && (
          <TouchableOpacity style={styles.backIconBtn} onPress={() => navigation.goBack()}>
            <ChevronLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.supportBanner}>
          <HeadphonesIcon size={32} color={theme.colors.primaryDark} />
          <View style={styles.bannerTextCol}>
            <Text style={styles.bannerTitle}>How can we help?</Text>
            <Text style={styles.bannerSub}>Create a ticket and our support team will assist you shortly.</Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Tickets</Text>
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateTicket}>
            <Plus size={16} color={theme.colors.primary} />
            <Text style={styles.createText}>New Ticket</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={tickets}
            keyExtractor={t => t.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 80 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.ticketCard} onPress={() => setActiveTicket(item)}>
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketId}>#{item.id.split('-')[0].toUpperCase()}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status.replace(/_/g, ' ').toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
                
                <View style={styles.ticketFooter}>
                  <View style={styles.ticketMeta}>
                    <Clock size={14} color={theme.colors.textMuted} />
                    <Text style={styles.metaText}>{new Date(item.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.replyText}>View replies &rarr;</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MessageSquare size={48} color={theme.colors.border} />
                <Text style={styles.emptyTitle}>No support tickets</Text>
                <Text style={styles.emptySub}>You don't have any active support requests.</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: theme.colors.background 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backIconBtn: {
    padding: 4,
  },
  headerTitleBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  headerSub: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  supportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  bannerTextCol: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primaryDark,
  },
  bannerSub: {
    fontSize: 13,
    color: theme.colors.primaryDark,
    marginTop: 4,
    opacity: 0.8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  createBtn: { 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface, 
    paddingHorizontal: 12, 
    paddingVertical: 8,
    borderRadius: theme.radius.full, 
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  createText: { 
    color: theme.colors.primary, 
    fontWeight: 'bold',
    fontSize: 13,
  },
  ticketCard: { 
    padding: theme.spacing.md, 
    backgroundColor: theme.colors.surface,
    borderWidth: 1, 
    borderColor: theme.colors.border, 
    borderRadius: theme.radius.md, 
    marginBottom: theme.spacing.md,
    shadowColor: theme.shadows.sm.shadowColor,
    shadowOffset: theme.shadows.sm.shadowOffset,
    shadowOpacity: theme.shadows.sm.shadowOpacity,
    elevation: theme.shadows.sm.elevation,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketId: { 
    fontWeight: 'bold', 
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
  },
  ticketMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  replyText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    padding: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  emptyTitle: {
    marginTop: theme.spacing.md,
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  emptySub: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  chatContent: {
    padding: theme.spacing.md,
  },
  msgWrapper: {
    marginBottom: 16,
    maxWidth: '85%',
  },
  msgWrapperLeft: {
    alignSelf: 'flex-start',
  },
  msgWrapperRight: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  msgBubble: {
    padding: 12, 
    borderRadius: 16, 
  },
  msgCustomer: { 
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  msgAdmin: { 
    backgroundColor: '#f1f5f9',
    borderBottomLeftRadius: 4,
  },
  msgText: { 
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  msgTime: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  inputArea: { 
    flexDirection: 'row', 
    alignItems: 'flex-end',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  chatInput: { 
    flex: 1, 
    borderWidth: 1, 
    borderColor: theme.colors.border, 
    borderRadius: 20, 
    paddingHorizontal: 16, 
    paddingTop: 12,
    paddingBottom: 12,
    marginRight: 12, 
    backgroundColor: theme.colors.background,
    minHeight: 44,
    maxHeight: 100,
    color: theme.colors.text,
  },
  sendBtn: { 
    backgroundColor: theme.colors.primary, 
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22, 
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.border,
  }
});

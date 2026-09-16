import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Layers, Calendar, Edit2, X, AlertTriangle } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface Batch {
  id: string;
  batch_number: string;
  product_id: string;
  available_quantity: number;
  expiry_date: string;
  status: string;
  products: {
    name: string;
  };
}

export default function WarehouseBatches() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<Batch[]>([]);
  
  // Modal State
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [adjustReason, setAdjustReason] = useState<'damaged' | 'expired' | 'lost' | 'correction'>('damaged');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const fetchBatches = async () => {
    if (!profile?.warehouse_id) return;
    try {
      const { data, error } = await supabase
        .from('product_batches')
        .select(`
          id,
          batch_number,
          product_id,
          available_quantity,
          expiry_date,
          status,
          products (name)
        `)
        .eq('warehouse_id', profile.warehouse_id)
        .order('expiry_date', { ascending: true });

      if (error) throw error;
      setBatches((data as any) || []);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", "Failed to fetch batches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
    
    if (profile?.warehouse_id) {
      const channelName = `batches_ws_${profile.warehouse_id}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_batches', filter: `warehouse_id=eq.${profile.warehouse_id}` }, fetchBatches)
        .subscribe();
      
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [profile?.warehouse_id]);

  const handleAdjustSubmit = async () => {
    if (!selectedBatch || !profile) return;
    
    const qtyToRemove = parseInt(adjustQty, 10);
    if (isNaN(qtyToRemove) || qtyToRemove <= 0) {
      Alert.alert("Validation Error", "Please enter a positive integer for the quantity to remove.");
      return;
    }

    setAdjusting(true);
    try {
      // Pass the negative value to the backend since we are removing
      const { error } = await supabase.rpc('adjust_batch_stock', {
        p_batch_id: selectedBatch.id,
        p_quantity_change: -qtyToRemove,
        p_reason: adjustReason,
        p_user_id: profile.id
      });

      if (error) throw error;

      Alert.alert("Success", "Batch stock adjusted successfully.");
      setModalVisible(false);
      setAdjustQty('');
      fetchBatches(); // Refetch strictly
    } catch (err: any) {
      console.error(err);
      Alert.alert("Adjustment Failed", err.message || "An unknown error occurred.");
    } finally {
      setAdjusting(false);
    }
  };

  const openAdjustModal = (batch: Batch) => {
    setSelectedBatch(batch);
    setAdjustQty('');
    setAdjustReason('damaged');
    setModalVisible(true);
  };

  if (!profile?.warehouse_id) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No warehouse assigned.</Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: Batch }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>{item.products?.name || 'Unknown'}</Text>
          <Text style={styles.batchNumber}>Batch: {item.batch_number}</Text>
        </View>
        <View style={[styles.statusBadge, item.status === 'depleted' && styles.statusDepleted, item.status === 'expired' && styles.statusExpired]}>
          <Text style={[styles.statusText, item.status === 'depleted' && styles.statusTextDepleted, item.status === 'expired' && styles.statusTextExpired]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Available</Text>
          <Text style={styles.infoValue}>{item.available_quantity}</Text>
        </View>
        <View style={styles.infoCol}>
          <Text style={styles.infoLabel}>Expiry</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Calendar size={14} color="#94a3b8" />
            <Text style={styles.infoValueDate}>{new Date(item.expiry_date).toLocaleDateString()}</Text>
          </View>
        </View>
      </View>

      {item.available_quantity > 0 && (
        <TouchableOpacity style={styles.actionBtn} onPress={() => openAdjustModal(item)}>
          <Edit2 size={16} color="#3b82f6" />
          <Text style={styles.actionText}>Adjust Stock</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Batch Management</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : batches.length === 0 ? (
        <View style={styles.centerContainer}>
          <Layers size={48} color="#334155" />
          <Text style={styles.emptyText}>No batches found</Text>
        </View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adjust Batch Stock</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} disabled={adjusting}>
                <X size={24} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {selectedBatch && (
              <View style={styles.modalBody}>
                <Text style={styles.modalProductName}>{selectedBatch.products?.name}</Text>
                <Text style={styles.modalBatchInfo}>Batch: {selectedBatch.batch_number} • Avail: {selectedBatch.available_quantity}</Text>

                <Text style={styles.label}>Reason for removal</Text>
                <View style={styles.reasonRow}>
                  {(['damaged', 'expired', 'lost', 'correction'] as const).map(reason => (
                    <TouchableOpacity
                      key={reason}
                      style={[styles.reasonChip, adjustReason === reason && styles.reasonChipActive]}
                      onPress={() => setAdjustReason(reason)}
                    >
                      <Text style={[styles.reasonText, adjustReason === reason && styles.reasonTextActive]}>
                        {reason.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Quantity to remove</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 3"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  value={adjustQty}
                  onChangeText={setAdjustQty}
                />

                <TouchableOpacity 
                  style={[styles.submitBtn, adjusting && styles.submitBtnDisabled]}
                  onPress={handleAdjustSubmit}
                  disabled={adjusting}
                >
                  {adjusting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <AlertTriangle size={20} color="#ffffff" />
                      <Text style={styles.submitBtnText}>Remove Stock</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  listContent: { padding: 16, gap: 12 },
  card: { backgroundColor: '#0f172a', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  productName: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  batchNumber: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  statusBadge: { backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  statusText: { color: '#10b981', fontSize: 10, fontWeight: 'bold' },
  statusDepleted: { backgroundColor: 'rgba(148, 163, 184, 0.1)', borderColor: 'rgba(148, 163, 184, 0.3)' },
  statusTextDepleted: { color: '#94a3b8' },
  statusExpired: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' },
  statusTextExpired: { color: '#ef4444' },
  cardBody: { flexDirection: 'row', backgroundColor: '#030712', borderRadius: 8, padding: 12, marginBottom: 12 },
  infoCol: { flex: 1 },
  infoLabel: { color: '#64748b', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
  infoValue: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  infoValueDate: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 1, borderColor: '#3b82f6', borderRadius: 8, paddingVertical: 10 },
  actionText: { color: '#3b82f6', fontSize: 14, fontWeight: 'bold' },
  errorText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' },
  emptyText: { color: '#64748b', fontSize: 16, marginTop: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  modalTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  modalBody: { padding: 20 },
  modalProductName: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  modalBatchInfo: { color: '#94a3b8', fontSize: 13, marginBottom: 20 },
  label: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#1e293b', color: '#ffffff', borderRadius: 12, padding: 16, fontSize: 16, marginBottom: 24 },
  reasonRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  reasonChip: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  reasonChipActive: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' },
  reasonText: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  reasonTextActive: { color: '#ef4444' },
  submitBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: '#ef4444', padding: 16, borderRadius: 12 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' }
});

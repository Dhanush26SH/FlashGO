import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { ArrowDownToLine, Package, Calendar, Tag, Hash } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

interface Product {
  id: string;
  name: string;
  barcode: string | null;
}

export default function WarehouseReceive() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Form State
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [batchNumber, setBatchNumber] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, barcode')
        .order('name');
      
      if (error) throw error;
      setProducts(data || []);
      if (data && data.length > 0) {
        setSelectedProductId(data[0].id);
      }
    } catch (err: any) {
      Alert.alert("Error", "Failed to load products: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = async () => {
    if (!profile?.warehouse_id) {
      Alert.alert("Error", "No warehouse assigned.");
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert("Validation Error", "Quantity must be a positive integer.");
      return;
    }

    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      Alert.alert("Validation Error", "Please provide a valid Expiry Date in YYYY-MM-DD format.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('inward_stock_batch', {
        p_warehouse_id: profile.warehouse_id,
        p_product_id: selectedProductId,
        p_quantity: qty,
        p_expiry_date: expiryDate,
        p_batch_number: batchNumber || null,
        p_admin_id: profile.id
      });

      if (error) throw error;

      Alert.alert("Success", "Stock received and batch created successfully.");
      
      // Reset form
      setQuantity('');
      setBatchNumber('');
      setExpiryDate('');
    } catch (err: any) {
      console.error(err);
      Alert.alert("Failed to Receive Stock", err.message || "An unknown error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile?.warehouse_id) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No warehouse assigned.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Receive Stock</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.card}>
          
          <Text style={styles.label}>Select Product</Text>
          <View style={styles.inputContainer}>
            <Package size={20} color="#64748b" style={styles.inputIcon} />
            {/* Simple Picker alternative since RN Picker is external. We will just use a simple mock selection for now, or just show the ID. For simplicity, we just list buttons or basic input. Given standard RN, let's just do a simple vertical scroll map if it's small, or a TextInput to filter. Let's do a basic custom picker */}
            <ScrollView horizontal style={{ paddingVertical: 12 }}>
              {products.map(p => (
                <TouchableOpacity 
                  key={p.id}
                  style={[styles.chip, selectedProductId === p.id && styles.chipActive]}
                  onPress={() => setSelectedProductId(p.id)}
                >
                  <Text style={[styles.chipText, selectedProductId === p.id && styles.chipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.label}>Quantity to Receive</Text>
          <View style={styles.inputContainer}>
            <Hash size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="e.g., 100"
              placeholderTextColor="#64748b"
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
            />
          </View>

          <Text style={styles.label}>Batch Number (Optional)</Text>
          <View style={styles.inputContainer}>
            <Tag size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Leave blank to auto-generate"
              placeholderTextColor="#64748b"
              value={batchNumber}
              onChangeText={setBatchNumber}
            />
          </View>

          <Text style={styles.label}>Expiry Date</Text>
          <View style={styles.inputContainer}>
            <Calendar size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#64748b"
              value={expiryDate}
              onChangeText={setExpiryDate}
            />
          </View>

          <TouchableOpacity 
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleReceive}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <ArrowDownToLine size={20} color="#ffffff" />
                <Text style={styles.submitBtnText}>Inward Stock</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  header: { padding: 20, paddingTop: 60, backgroundColor: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  scrollBody: { padding: 16 },
  card: { backgroundColor: '#0f172a', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b' },
  label: { color: '#ffffff', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#ffffff', fontSize: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#334155', marginRight: 8 },
  chipActive: { backgroundColor: '#10b981' },
  chipText: { color: '#94a3b8', fontWeight: 'bold' },
  chipTextActive: { color: '#ffffff' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', padding: 16, borderRadius: 12, marginTop: 32 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  errorText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' }
});

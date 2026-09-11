import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { theme } from '../theme';
import { Check, X, AlertTriangle } from 'lucide-react-native';
import { respondToSubstitution } from '../services/api';

interface Substitution {
  id: string;
  quantity: number;
  original_item_id: string;
  suggested_product_id: string;
  products: {
    name: string;
    image_url: string;
    price: number;
  };
}

interface Props {
  visible: boolean;
  substitution: Substitution | null;
  onResolved: () => void;
}

export default function SubstitutionModal({ visible, substitution, onResolved }: Props) {
  const [loading, setLoading] = useState(false);

  if (!substitution) return null;

  const handleResponse = async (status: 'approved' | 'rejected') => {
    setLoading(true);
    try {
      await respondToSubstitution(substitution.id, status);
      Alert.alert(
        status === 'approved' ? "Substitution Approved" : "Substitution Rejected",
        status === 'approved' 
          ? "The new item has been added to your order."
          : "The original item will be refunded."
      );
      onResolved();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update substitution.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <AlertTriangle size={24} color={theme.colors.warning} />
            <Text style={styles.title}>Item Out of Stock</Text>
          </View>
          
          <Text style={styles.subtitle}>
            Your picker has suggested a substitute for an item that is currently unavailable.
          </Text>

          <View style={styles.productCard}>
            <Image 
              source={substitution.products?.image_url ? { uri: substitution.products.image_url } : require('../../assets/product-placeholder.png')} 
              style={styles.image} 
            />
            <View style={styles.info}>
              <Text style={styles.suggestedLabel}>Suggested Substitute</Text>
              <Text style={styles.name}>{substitution.products?.name}</Text>
              <Text style={styles.details}>
                Qty: {substitution.quantity} • ₹{substitution.products?.price}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.btn, styles.rejectBtn, loading && styles.disabledBtn]} 
              onPress={() => handleResponse('rejected')}
              disabled={loading}
            >
              <X size={20} color={theme.colors.danger} />
              <Text style={[styles.btnText, { color: theme.colors.danger }]}>Reject & Refund</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.btn, styles.approveBtn, loading && styles.disabledBtn]} 
              onPress={() => handleResponse('approved')}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Check size={20} color="#fff" />
                  <Text style={[styles.btnText, { color: '#fff' }]}>Accept Substitute</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  content: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 300
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 24,
    lineHeight: 20
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#fff'
  },
  info: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center'
  },
  suggestedLabel: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 4
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 4
  },
  details: {
    fontSize: 14,
    color: theme.colors.textMuted
  },
  actions: {
    flexDirection: 'row',
    gap: 12
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8
  },
  rejectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.danger
  },
  approveBtn: {
    backgroundColor: theme.colors.primary
  },
  btnText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  disabledBtn: {
    opacity: 0.6
  }
});

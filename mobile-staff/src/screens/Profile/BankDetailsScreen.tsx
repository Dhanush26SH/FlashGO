import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Pencil } from 'lucide-react-native';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useIsFocused } from '@react-navigation/native';

export default function BankDetailsScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  const isFocused = useIsFocused();

  const [bankDetails, setBankDetails] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    const fetchBankDetails = async () => {
      if (!profile?.id) return;
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('staff_payout_details')
          .select('*')
          .eq('staff_id', profile.id)
          .maybeSingle();
        
        if (isMounted) {
          if (data && !error) {
            setBankDetails(data);
          } else {
            setBankDetails(null);
          }
        }
      } catch (err) {
        console.error("Failed to load bank details", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    if (isFocused) {
      fetchBankDetails();
    }
    return () => { isMounted = false; };
  }, [isFocused, profile?.id]);

  const isDriver = profile?.role === 'driver';

  return (
    <SafeAreaView style={[styles.container, isDriver && { backgroundColor: '#0f172a' }]}>
      {/* Header */}
      <View style={[styles.header, isDriver && { backgroundColor: '#0f172a', borderBottomColor: '#1e293b' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={isDriver ? "#ffffff" : "#1f2937"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDriver && { color: '#ffffff' }]}>Bank details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mainHeadingContainer}>
          <Text style={[styles.mainHeading, isDriver && { color: '#ffffff' }]}>Bank Account Details</Text>
          <TouchableOpacity 
            style={[styles.editBtn, isDriver && { backgroundColor: '#10b98120' }]} 
            onPress={() => navigation.navigate('EditBankDetails', { existingDetails: bankDetails })}
          >
            <Pencil size={18} color="#10b981" />
          </TouchableOpacity>
        </View>

        <View style={[styles.detailsCard, isDriver && { backgroundColor: '#1e293b', borderColor: '#334155' }]}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDriver && { color: '#94a3b8' }]}>Bank account number</Text>
            <Text style={[styles.detailValue, isDriver && { color: '#ffffff' }]}>{bankDetails?.account_number || 'Not added'}</Text>
          </View>
          <View style={[styles.divider, isDriver && { backgroundColor: '#334155' }]} />
          
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDriver && { color: '#94a3b8' }]}>IFSC code</Text>
            <Text style={[styles.detailValue, isDriver && { color: '#ffffff' }]}>{bankDetails?.ifsc || 'Not added'}</Text>
          </View>
          <View style={[styles.divider, isDriver && { backgroundColor: '#334155' }]} />
          
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDriver && { color: '#94a3b8' }]}>Branch</Text>
            <Text style={[styles.detailValue, isDriver && { color: '#ffffff' }]}>{bankDetails?.branch_name || 'Not added'}</Text>
          </View>
          <View style={[styles.divider, isDriver && { backgroundColor: '#334155' }]} />
          
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDriver && { color: '#94a3b8' }]}>Bank</Text>
            <Text style={[styles.detailValue, isDriver && { color: '#ffffff' }]}>{bankDetails?.bank_name || 'Not added'}</Text>
          </View>
          <View style={[styles.divider, isDriver && { backgroundColor: '#334155' }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, isDriver && { color: '#94a3b8' }]}>Account Holder</Text>
            <Text style={[styles.detailValue, isDriver && { color: '#ffffff' }]}>{bankDetails?.account_holder || 'Not added'}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6', // Clean light-grey background matching Picker Profile
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    padding: 16,
  },
  mainHeadingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  mainHeading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  editBtn: {
    padding: 8,
    backgroundColor: '#ecfdf5', // Light green tint
    borderRadius: 8,
  },
  detailsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
  },
  detailRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginLeft: 16,
  },
});

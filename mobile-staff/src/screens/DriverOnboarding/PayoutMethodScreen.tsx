import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Wallet, Building } from 'lucide-react-native';

export default function PayoutMethodScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  
  const [method, setMethod] = useState<'upi' | 'bank' | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState('');
  const [accHolder, setAccHolder] = useState('');
  const [accNum, setAccNum] = useState('');
  const [ifsc, setIfsc] = useState('');

  const handleNext = async () => {
    if (!session?.user?.id || !method) return;

    if (method === 'upi' && !upiId) {
      alert('Please enter a valid UPI ID');
      return;
    }
    if (method === 'bank' && (!bankName || !accHolder || !accNum || !ifsc)) {
      alert('Please fill in all bank details');
      return;
    }

    setLoading(true);
    try {
      // Upsert into driver_payout_details (Strict RLS)
      await supabase
        .from('driver_payout_details')
        .upsert({
          driver_id: session.user.id,
          payout_method_type: method,
          upi_id: method === 'upi' ? upiId : null,
          bank_name: method === 'bank' ? bankName : null,
          account_holder: method === 'bank' ? accHolder : null,
          account_number: method === 'bank' ? accNum : null,
          ifsc: method === 'bank' ? ifsc : null
        });
        
      alert('Payout details saved successfully');
      navigation.replace('SelfieCapture');
    } catch (e) {
      console.error(e);
      alert('Failed to save payout details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Payout Method</Text>
      <Text style={styles.subtitle}>Where should we send your earnings?</Text>

      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, method === 'upi' && styles.tabActive]}
          onPress={() => setMethod('upi')}
        >
          <Wallet size={20} color={method === 'upi' ? '#10b981' : '#94a3b8'} style={{ marginBottom: 8 }}/>
          <Text style={[styles.tabText, method === 'upi' && styles.tabTextActive]}>UPI</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, method === 'bank' && styles.tabActive]}
          onPress={() => setMethod('bank')}
        >
          <Building size={20} color={method === 'bank' ? '#10b981' : '#94a3b8'} style={{ marginBottom: 8 }}/>
          <Text style={[styles.tabText, method === 'bank' && styles.tabTextActive]}>Bank Account</Text>
        </TouchableOpacity>
      </View>

      {method === 'upi' && (
        <View style={styles.form}>
          <Text style={styles.label}>UPI ID</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. yourname@upi"
            placeholderTextColor="#475569"
            value={upiId}
            onChangeText={setUpiId}
            autoCapitalize="none"
          />
        </View>
      )}

      {method === 'bank' && (
        <View style={styles.form}>
          <Text style={styles.label}>Bank Name</Text>
          <TextInput style={styles.input} placeholderTextColor="#475569" value={bankName} onChangeText={setBankName} />
          
          <Text style={styles.label}>Account Holder Name</Text>
          <TextInput style={styles.input} placeholderTextColor="#475569" value={accHolder} onChangeText={setAccHolder} />
          
          <Text style={styles.label}>Account Number</Text>
          <TextInput style={styles.input} placeholderTextColor="#475569" value={accNum} onChangeText={setAccNum} keyboardType="numeric" secureTextEntry />
          
          <Text style={styles.label}>IFSC Code</Text>
          <TextInput style={styles.input} placeholderTextColor="#475569" value={ifsc} onChangeText={setIfsc} autoCapitalize="characters" />
        </View>
      )}

      <TouchableOpacity 
        style={[styles.button, !method && styles.buttonDisabled]} 
        onPress={handleNext}
        disabled={!method || loading}
      >
        {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.buttonText}>Save Payout Details</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    padding: 24,
    paddingTop: 48
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 32
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 32,
    gap: 16
  },
  tab: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)'
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: 'bold'
  },
  tabTextActive: {
    color: '#10b981'
  },
  form: {
    marginBottom: 24
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600'
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    color: '#fff',
    padding: 16,
    fontSize: 16,
    marginBottom: 20
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center'
  },
  buttonDisabled: {
    backgroundColor: '#064e3b',
    opacity: 0.5
  },
  buttonText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

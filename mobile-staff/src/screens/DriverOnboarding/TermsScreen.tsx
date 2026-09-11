import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Square, CheckSquare } from 'lucide-react-native';

const CURRENT_VERSION = 'v1.0';

export default function TermsScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!accepted || !session?.user?.id) return;
    setLoading(true);
    try {
      await supabase
        .from('driver_agreement_acceptances')
        .upsert({
          driver_id: session.user.id,
          agreement_version: CURRENT_VERSION
        });

      navigation.replace('VerificationDashboard');
    } catch (e) {
      console.error(e);
      alert('Failed to save agreement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Driver Agreement</Text>

      <ScrollView style={styles.content}>
        <Text style={styles.text}>
          Welcome to FlashGO! By proceeding, you agree to our Terms and Conditions for delivery partners.
        </Text>
        <Text style={styles.text}>
          1. Independent Contractor: You operate as an independent contractor, not an employee of FlashGO.
        </Text>
        <Text style={styles.text}>
          2. Conduct: You agree to treat all customers, warehouse staff, and fellow drivers with respect.
        </Text>
        <Text style={styles.text}>
          3. Vehicle Maintenance: You are responsible for ensuring your vehicle is safe and legally registered.
        </Text>
        <Text style={styles.text}>
          4. Payments: Earnings will be disbursed to your provided payout method according to the agreed schedule.
        </Text>
        <Text style={styles.text}>
          5. Cash on Delivery (COD): You are fully liable for safely handling and depositing any COD amounts collected.
        </Text>
        <Text style={styles.text}>
          This is version {CURRENT_VERSION}.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.checkboxContainer} onPress={() => setAccepted(!accepted)}>
          {accepted ? <CheckSquare size={24} color="#10b981" /> : <Square size={24} color="#94a3b8" />}
          <Text style={styles.checkboxLabel}>I have read and agree to the FlashGO Driver Agreement</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, !accepted && styles.buttonDisabled]} 
          onPress={handleNext}
          disabled={!accepted || loading}
        >
          {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.buttonText}>Accept & Continue</Text>}
        </TouchableOpacity>
      </View>
    </View>
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
    marginBottom: 24
  },
  content: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  text: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 16
  },
  footer: {
    marginTop: 24
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingRight: 16
  },
  checkboxLabel: {
    color: '#f8fafc',
    fontSize: 14,
    marginLeft: 12,
    flex: 1
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

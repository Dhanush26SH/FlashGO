import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Check, Bike, Zap, Truck } from 'lucide-react-native';

const vehicleTypes = [
  { id: 'Electric Bike', icon: Zap, label: 'Electric Bike' },
  { id: 'Petrol Bike', icon: Bike, label: 'Petrol Bike' },
  { id: 'Scooter', icon: Truck, label: 'Scooter' }
];

export default function PersonalDetailsScreen({ navigation, route }: any) {
  const { profile } = useAuth();
  
  const [selectedType, setSelectedType] = useState<string>((profile as any)?.vehicle_type || '');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    async function fetchVehicleDetails() {
      if (!profile?.id) return;
      try {
        setLoading(true);
        const { data: comp } = await supabase
          .from('driver_compliance')
          .select('dl_number')
          .eq('driver_id', profile.id)
          .single();
        if (comp?.dl_number) setDlNumber(comp.dl_number);

        const { data: veh } = await supabase
          .from('vehicles')
          .select('license_plate')
          .eq('owner_driver_id', profile.id)
          .eq('ownership_type', 'driver_owned')
          .single();
        if (veh) setVehicleNumber(veh.license_plate || '');
      } catch (err) {
        // Just ignore, it's fine if they don't have records yet
      } finally {
        setLoading(false);
      }
    }
    fetchVehicleDetails();
  }, [profile?.id]);

  const handleNext = async () => {
    if (!selectedType || !profile?.id) return;
    
    // Format validation
    const vNum = vehicleNumber.toUpperCase().replace(/\s+|-+/g, '');
    const dlNum = dlNumber.toUpperCase().trim();
    
    if (vNum.length < 4 || dlNum.length < 5) {
      alert('Please enter valid Vehicle Registration and Driving Licence numbers');
      return;
    }

    setLoading(true);
    try {
      // Save vehicle type to onboarding
      await supabase
        .from('driver_onboarding')
        .update({ vehicle_type: selectedType })
        .eq('id', profile.id);
        
      // Save vehicle details to fleet
      const { data, error } = await supabase.rpc('submit_driver_vehicle_details', {
        p_vehicle_number: vNum,
        p_dl_number: dlNum
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to submit vehicle details');

      navigation.replace('VerificationDashboard');
    } catch (e: any) {
      const msg = e.message || e.details || 'Failed to save vehicle details. Please try again.';
      alert(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={styles.title}>Your Vehicle Details</Text>
      <Text style={styles.subtitle}>What vehicle will you use for deliveries?</Text>

      <ScrollView style={styles.list}>
        {vehicleTypes.map(v => (
          <TouchableOpacity
            key={v.label}
            style={[styles.item, selectedType === v.id && styles.itemSelected]}
            onPress={() => setSelectedType(v.id)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <v.icon size={24} color={selectedType === v.id ? '#10b981' : '#94a3b8'} style={{ marginRight: 16 }} />
              <Text style={[styles.itemText, selectedType === v.id && styles.itemTextSelected]}>
                {v.label}
              </Text>
            </View>
            {selectedType === v.id && <Check size={20} color="#10b981" />}
          </TouchableOpacity>
        ))}
        
        {selectedType && (
          <View style={styles.formSection}>
            <Text style={styles.label}>Vehicle Registration Number *</Text>
            <TextInput 
              style={styles.input} 
              placeholderTextColor="#475569" 
              placeholder="e.g. KA20AB1234"
              value={vehicleNumber} 
              onChangeText={setVehicleNumber}
              autoCapitalize="characters"
            />
            
            <Text style={styles.label}>Driving Licence Number *</Text>
            <TextInput 
              style={styles.input} 
              placeholderTextColor="#475569" 
              placeholder="e.g. KA20201234567"
              value={dlNumber} 
              onChangeText={setDlNumber}
              autoCapitalize="characters"
            />
          </View>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={[styles.button, (!selectedType || !vehicleNumber || !dlNumber) && styles.buttonDisabled]} 
        onPress={handleNext}
        disabled={!selectedType || !vehicleNumber || !dlNumber || loading}
      >
        {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.buttonText}>Next</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
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
  list: {
    flex: 1
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  itemSelected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)'
  },
  itemText: {
    color: '#f8fafc',
    fontSize: 18
  },
  itemTextSelected: {
    color: '#10b981',
    fontWeight: 'bold'
  },
  formSection: {
    marginTop: 16,
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
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 24
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

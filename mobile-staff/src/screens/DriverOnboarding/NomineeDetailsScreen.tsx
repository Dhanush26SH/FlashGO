import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { UserCheck } from 'lucide-react-native';

export default function NomineeDetailsScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [dob, setDob] = useState(''); // simple YYYY-MM-DD for now
  const [mobile, setMobile] = useState('');
  const [emergency, setEmergency] = useState('');

  useEffect(() => {
    const fetchExisting = async () => {
      if (!session?.user?.id) return;
      const { data } = await supabase.from('driver_nominee_details').select('*').eq('driver_id', session.user.id).single();
      if (data) {
        setName(data.nominee_name || '');
        setRelationship(data.relationship || '');
        setDob(data.dob || '');
        setMobile(data.mobile || '');
        setEmergency(data.emergency_mobile || '');
      }
    };
    fetchExisting();
  }, [session]);

  const handleSave = async () => {
    if (!session?.user?.id) return;

    if (!name || !relationship || !dob || !mobile) {
      alert('Please fill in all required fields');
      return;
    }

    // Basic date validation YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      alert('Please enter DOB in YYYY-MM-DD format');
      return;
    }

    setSaving(true);
    try {
      await supabase
        .from('driver_nominee_details')
        .upsert({
          driver_id: session.user.id,
          nominee_name: name,
          relationship: relationship,
          dob: dob,
          mobile: mobile,
          emergency_mobile: emergency || null
        });
        
      alert('Nominee details saved');
      navigation.goBack();
    } catch (e) {
      console.error(e);
      alert('Failed to save nominee details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <UserCheck size={32} color="#10b981" />
        <Text style={styles.title}>Nominee Details</Text>
      </View>
      <Text style={styles.subtitle}>Please provide details of your nominee.</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Nominee Name *</Text>
        <TextInput style={styles.input} placeholderTextColor="#475569" value={name} onChangeText={setName} />
        
        <Text style={styles.label}>Relationship *</Text>
        <TextInput style={styles.input} placeholderTextColor="#475569" placeholder="e.g. Spouse, Parent" value={relationship} onChangeText={setRelationship} />
        
        <Text style={styles.label}>Date of Birth *</Text>
        <TextInput style={styles.input} placeholderTextColor="#475569" placeholder="YYYY-MM-DD" value={dob} onChangeText={setDob} />
        
        <Text style={styles.label}>Mobile Number *</Text>
        <TextInput style={styles.input} placeholderTextColor="#475569" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
        
        <Text style={styles.label}>Emergency Mobile Number (Optional)</Text>
        <TextInput style={styles.input} placeholderTextColor="#475569" value={emergency} onChangeText={setEmergency} keyboardType="phone-pad" />
      </View>

      <TouchableOpacity 
        style={[styles.button, saving && styles.buttonDisabled]} 
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#030712" /> : <Text style={styles.buttonText}>Save Details</Text>}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff'
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 32
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

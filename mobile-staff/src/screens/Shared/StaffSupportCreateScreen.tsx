import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { StaffSupportService } from '../../services/StaffSupportService';
import { useAuth } from '../../context/AuthContext';

export default function StaffSupportCreateScreen() {
  const navigation = useNavigation<any>();
  const { role } = useAuth() as any;
  
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getCategories = () => {
    switch(role) {
      case 'picker': return ['Task/Picking', 'Shift/Attendance', 'Payment/Payout', 'Scanner/App', 'Account/Profile', 'Other'];
      case 'driver': return ['Delivery/Order', 'Shift/Check-in', 'Payment/Payout', 'Vehicle', 'GPS/App', 'Account/Profile', 'Other'];
      case 'warehouse_staff': return ['Warehouse Task', 'Shift/Attendance', 'Salary/Payroll', 'Scanner/App', 'Account/Profile', 'Other'];
      default: return ['Other'];
    }
  };

  const categories = getCategories();

  const submittingRef = React.useRef(false);

  const handleSubmit = async () => {
    if (!category || !subject.trim() || !description.trim()) {
      Alert.alert('Missing Fields', 'Please fill in all fields before submitting.');
      return;
    }
    
    if (submittingRef.current) return;

    try {
      submittingRef.current = true;
      setSubmitting(true);
      const ticket = await StaffSupportService.createTicket({ category, subject, description });
      
      // Reset state so it's clean if mounted again
      setCategory('');
      setSubject('');
      setDescription('');
      
      // Immediately navigate to the newly created ticket chat
      navigation.replace('StaffSupportChat', { ticketId: ticket.id });
    } catch (e: any) {
      submittingRef.current = false;
      setSubmitting(false);
      Alert.alert('Error', e.message || 'Failed to submit ticket');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>New Request</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryGrid}>
          {categories.map(cat => (
            <TouchableOpacity 
              key={cat} 
              style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          placeholder="Brief summary of the issue"
          value={subject}
          onChangeText={setSubject}
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Provide details about your issue..."
          value={description}
          onChangeText={setDescription}
          multiline
          textAlignVertical="top"
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity 
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]} 
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Ticket</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 8, marginLeft: -8 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  categoryBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: 'transparent' },
  categoryBtnActive: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  categoryText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  categoryTextActive: { color: '#059669', fontWeight: '700' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 15, color: '#111827' },
  textArea: { height: 120, paddingTop: 12 },
  submitBtn: { backgroundColor: '#10B981', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 32 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' }
});

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import { ArrowLeft, MapPin } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { theme } from '../theme';
import { addAddress } from '../services/api';
import { useMobileAppContext } from '../context/MobileAppContext';

type AddressDetailsRouteProp = RouteProp<RootStackParamList, 'AddressDetails'>;

export default function AddressDetailsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<AddressDetailsRouteProp>();
  const { lat, lng, name, address } = route.params;

  const { sessionUser, setCheckoutAddress, refreshAddresses } = useMobileAppContext();

  const [forWhom, setForWhom] = useState<'myself' | 'someone_else'>('myself');
  const [receiverName, setReceiverName] = useState(sessionUser?.user_metadata?.full_name || '');
  const [receiverPhone, setReceiverPhone] = useState(sessionUser?.phone || '');
  
  const [saveAs, setSaveAs] = useState<'Home' | 'Work' | 'Hotel' | 'Other'>('Home');
  const [flatNo, setFlatNo] = useState('');
  const [floor, setFloor] = useState('');
  const [landmark, setLandmark] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!flatNo.trim()) {
      Alert.alert('Required Field', 'Please enter Flat / House No / Building name');
      return;
    }
    if (forWhom === 'someone_else' && (!receiverName.trim() || !receiverPhone.trim())) {
      Alert.alert('Required Field', 'Please provide receiver details');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        customer_id: sessionUser.id,
        label: saveAs,
        address_line: address || name,
        street_address: address,
        locality: name,
        lat,
        lng,
        flat_house_no: flatNo,
        floor,
        landmark,
        receiver_name: forWhom === 'someone_else' ? receiverName : sessionUser?.user_metadata?.full_name || '',
        receiver_phone: forWhom === 'someone_else' ? receiverPhone : sessionUser?.phone || ''
      };

      const newAddress = await addAddress(payload);
      await refreshAddresses();
      setCheckoutAddress(newAddress);
      
      navigation.reset({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          { name: 'Cart' }
        ],
      });
    } catch (err: any) {
      console.error('Save Address Error:', err);
      const errorMsg = err?.message || err?.details || err?.hint || JSON.stringify(err);
      Alert.alert('Failed to save address', typeof errorMsg === 'string' ? errorMsg : 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Enter complete address</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.locationSummary}>
            <MapPin size={24} color={theme.colors.primary} style={{ marginTop: 4 }} />
            <View style={styles.locTextCol}>
              <Text style={styles.locTitle}>{name}</Text>
              <Text style={styles.locSubtitle}>{address}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.changeBtn}>Change</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          <Text style={styles.label}>Who are you ordering for?</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.pill, forWhom === 'myself' && styles.pillActive]} onPress={() => setForWhom('myself')}>
              <Text style={[styles.pillText, forWhom === 'myself' && styles.pillTextActive]}>Myself</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.pill, forWhom === 'someone_else' && styles.pillActive]} onPress={() => setForWhom('someone_else')}>
              <Text style={[styles.pillText, forWhom === 'someone_else' && styles.pillTextActive]}>Someone else</Text>
            </TouchableOpacity>
          </View>

          {forWhom === 'someone_else' && (
            <View style={styles.inputGroup}>
              <TextInput style={styles.input} placeholder="Receiver Name *" value={receiverName} onChangeText={setReceiverName} />
              <TextInput style={styles.input} placeholder="Receiver Phone *" value={receiverPhone} onChangeText={setReceiverPhone} keyboardType="phone-pad" />
            </View>
          )}

          <Text style={styles.label}>Save address as</Text>
          <View style={styles.row}>
            {['Home', 'Work', 'Hotel', 'Other'].map(type => (
              <TouchableOpacity key={type} style={[styles.pill, saveAs === type && styles.pillActive]} onPress={() => setSaveAs(type as any)}>
                <Text style={[styles.pillText, saveAs === type && styles.pillTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <TextInput style={styles.input} placeholder="Flat / House No / Building name *" value={flatNo} onChangeText={setFlatNo} />
            <TextInput style={styles.input} placeholder="Floor (Optional)" value={floor} onChangeText={setFloor} />
            <TextInput style={styles.input} placeholder="Nearby landmark (Optional)" value={landmark} onChangeText={setLandmark} />
          </View>

        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save address</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  locationSummary: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  locTextCol: { flex: 1, marginLeft: 12, marginRight: 12 },
  locTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  locSubtitle: { fontSize: 13, color: theme.colors.textMuted },
  changeBtn: { fontSize: 14, fontWeight: '700', color: theme.colors.primary, marginTop: 4 },
  divider: { height: 1, backgroundColor: theme.colors.border, marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginBottom: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  pillActive: { backgroundColor: '#F0FDF4', borderColor: theme.colors.primary },
  pillText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  pillTextActive: { color: theme.colors.primary },
  inputGroup: { gap: 12, marginBottom: 24 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 14, fontSize: 15, color: theme.colors.text },
  footer: { padding: 16, paddingBottom: Platform.OS === 'android' ? 24 : 16, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});

import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { MapPin, Home as HomeIcon, Briefcase, Trash2, Plus, ChevronLeft, CheckCircle2, User, Phone } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { addAddress, deleteAddress } from '../services/api';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import * as Location from 'expo-location';

export default function AddressesScreen() {
  const navigation = useNavigation<any>();
  const { addresses, activeAddress, setActiveAddress, refreshAddresses, sessionUser } = useMobileAppContext();
  
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  
  const activeAddressId = activeAddress?.id || null;

  // Form states
  const [forWhom, setForWhom] = useState<'myself' | 'someone_else'>('myself');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  
  const [city, setCity] = useState('');
  const [locality, setLocality] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [label, setLabel] = useState('Home');
  const [tempLat, setTempLat] = useState<number | null>(null);
  const [tempLng, setTempLng] = useState<number | null>(null);

  const startAddAddress = async () => {
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permissions are required to accurately set your city and area.');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setTempLat(location.coords.latitude);
      setTempLng(location.coords.longitude);

      const [geocode] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (geocode) {
        setCity(geocode.city || geocode.subregion || geocode.region || '');
        setLocality(geocode.street || geocode.name || geocode.subregion || '');
      } else {
        setCity('');
        setLocality('');
      }
      
      // Reset fields
      setStreetAddress('');
      setForWhom('myself');
      setReceiverName('');
      setReceiverPhone('');
      setLabel('Home');
      
      setAdding(true);
    } catch (err: any) {
      Alert.alert('Location Error', 'Could not fetch your location. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!streetAddress.trim()) {
        return Alert.alert('Missing Info', 'Complete Address is required.');
      }
      if (forWhom === 'someone_else') {
        if (!receiverName.trim() || !receiverPhone.trim()) {
          return Alert.alert('Missing Info', 'Receiver Name and Phone are required for Someone else.');
        }
        if (receiverPhone.replace(/\D/g, '').length < 10) {
          return Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
        }
      }

      // Prepare payload to exactly match the remote schema
      // Valid columns: customer_id, label, address_line, lat, lng, city, locality, 
      //                street_address, receiver_name, receiver_phone, zip_code
      // customer_id MUST equal auth.uid() per RLS WITH CHECK constraint
      const payload: any = {
        customer_id: sessionUser.id,  // Required: RLS WITH CHECK (auth.uid() = customer_id)
        label: label,
        address_line: `${streetAddress}, ${locality}, ${city}`.trim(),
        street_address: streetAddress.trim(),
        city: city || null,
        locality: locality || null,
        lat: tempLat,
        lng: tempLng,
      };

      if (forWhom === 'someone_else') {
        payload.receiver_name = receiverName.trim();
        payload.receiver_phone = receiverPhone.trim();
      } else {
        payload.receiver_name = null;
        payload.receiver_phone = null;
      }

      setLoading(true);
      const newAddress = await addAddress(payload);
      
      await refreshAddresses();
      if (newAddress) {
        setActiveAddress(newAddress);
      }
      
      setAdding(false);
      navigation.navigate('MainTabs', { screen: 'Home' });
      
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      "Delete Address",
      "Are you sure you want to remove this address?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: async () => {
            try {
              setLoading(true);
              await deleteAddress(id);
              await refreshAddresses();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const getLabelIcon = (l: string) => {
    const txt = l.toLowerCase();
    if (txt.includes('home')) return <HomeIcon size={20} color={theme.colors.text} />;
    if (txt.includes('work') || txt.includes('office')) return <Briefcase size={20} color={theme.colors.text} />;
    return <MapPin size={20} color={theme.colors.text} />;
  };

  const renderAddressCard = (item: any) => {
    const isActive = activeAddressId === item.id;
    // Fallback display logic: street_address -> locality -> city -> address_line
    const line1 = item.street_address || item.address_line1 || item.address_line;
    const line2 = [item.locality, item.city].filter(Boolean).join(', ');
    
    return (
      <TouchableOpacity 
        style={[styles.addressCard, isActive && styles.addressCardActive]}
        onPress={() => setActiveAddress(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.labelRow}>
            <View style={styles.iconCircle}>
              {getLabelIcon(item.label)}
            </View>
            <Text style={styles.cardLabel}>{item.label}</Text>
          </View>
          {isActive && <CheckCircle2 size={24} color={theme.colors.primary} />}
        </View>
        
        <View style={styles.cardBody}>
          <Text style={styles.addressTextPrimary}>{line1}</Text>
          {line2 ? <Text style={styles.addressTextSecondary}>{line2}</Text> : null}
          {item.receiver_name ? (
            <Text style={styles.receiverText}>Receiving: {item.receiver_name} • {item.receiver_phone}</Text>
          ) : null}
        </View>
        
        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.delBtn} onPress={() => handleDelete(item.id)}>
            <Trash2 size={16} color={theme.colors.danger} />
            <Text style={styles.delBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backIconBtn} onPress={() => {
            if (adding) setAdding(false);
            else if (navigation.canGoBack()) navigation.goBack();
          }}>
            <ChevronLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{adding ? 'Add address details' : 'My Addresses'}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.content}>
          {adding ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex:1}}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formScroll}>
                
                {/* Location Readonly Context */}
                <View style={styles.locationContextBox}>
                  <MapPin size={24} color={theme.colors.primary} style={{marginRight: 12}} />
                  <View style={{flex: 1}}>
                    <Text style={styles.readOnlyLocality}>{locality || 'Current Area'}</Text>
                    <Text style={styles.readOnlyCity}>{city || 'Current City'}</Text>
                  </View>
                </View>

                {/* Complete Address Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Complete address*</Text>
                  <TextInput 
                    style={[styles.input, styles.textArea]} 
                    placeholder="House / Flat / Building / Street / Landmark" 
                    placeholderTextColor={theme.colors.textMuted} 
                    value={streetAddress} 
                    onChangeText={setStreetAddress} 
                    multiline
                  />
                </View>

                {/* Contact Details */}
                <Text style={styles.sectionTitle}>Contact Details</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, forWhom === 'myself' && styles.toggleBtnActive]}
                    onPress={() => setForWhom('myself')}
                  >
                    <User size={16} color={forWhom === 'myself' ? theme.colors.primary : '#6B7280'} style={{marginRight: 6}} />
                    <Text style={[styles.toggleBtnText, forWhom === 'myself' && styles.toggleBtnTextActive]}>Myself</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.toggleBtn, forWhom === 'someone_else' && styles.toggleBtnActive]}
                    onPress={() => setForWhom('someone_else')}
                  >
                    <User size={16} color={forWhom === 'someone_else' ? theme.colors.primary : '#6B7280'} style={{marginRight: 6}} />
                    <Text style={[styles.toggleBtnText, forWhom === 'someone_else' && styles.toggleBtnTextActive]}>Someone else</Text>
                  </TouchableOpacity>
                </View>

                {forWhom === 'someone_else' && (
                  <View style={styles.someoneElseBox}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Receiver Name*</Text>
                      <TextInput 
                        style={styles.input} 
                        placeholder="John Doe" 
                        placeholderTextColor={theme.colors.textMuted} 
                        value={receiverName} 
                        onChangeText={setReceiverName} 
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Receiver Phone Number*</Text>
                      <TextInput 
                        style={styles.input} 
                        placeholder="10-digit mobile number" 
                        keyboardType="phone-pad"
                        placeholderTextColor={theme.colors.textMuted} 
                        value={receiverPhone} 
                        onChangeText={setReceiverPhone} 
                      />
                    </View>
                  </View>
                )}

                {/* Address Label */}
                <Text style={styles.sectionTitle}>Save as address</Text>
                <View style={styles.toggleRow}>
                  {['Home', 'Work', 'Other'].map(lbl => (
                    <TouchableOpacity 
                      key={lbl}
                      style={[styles.labelBtn, label === lbl && styles.labelBtnActive]}
                      onPress={() => setLabel(lbl)}
                    >
                      <Text style={[styles.labelBtnText, label === lbl && styles.labelBtnTextActive]}>{lbl}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                
                <View style={{height: 100}} />
              </ScrollView>
              
              <View style={styles.bottomBar}>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Address</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <>
              {loading && !adding ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={addresses}
                  keyExtractor={a => a.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.listContainer}
                  renderItem={({ item }) => renderAddressCard(item)}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <MapPin size={48} color={theme.colors.border} />
                      <Text style={styles.emptyTitle}>No saved addresses</Text>
                      <Text style={styles.emptySub}>Add an address to checkout faster.</Text>
                    </View>
                  }
                  ListFooterComponent={
                    <TouchableOpacity style={styles.addBtn} onPress={startAddAddress}>
                      <Plus size={20} color={theme.colors.primary} />
                      <Text style={styles.addBtnText}>Add New Address</Text>
                    </TouchableOpacity>
                  }
                />
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F3F4F6' 
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1024 : undefined,
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backIconBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formScroll: {
    padding: 16,
  },
  locationContextBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  readOnlyLocality: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 2,
  },
  readOnlyCity: {
    fontSize: 14,
    color: '#4B5563',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginTop: 8,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    borderRadius: 12,
  },
  toggleBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F4FAF6',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  toggleBtnTextActive: {
    color: theme.colors.primary,
  },
  someoneElseBox: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  labelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
    borderRadius: 12,
  },
  labelBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  labelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  labelBtnTextActive: {
    color: '#ffffff',
  },
  bottomBar: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  listContainer: {
    padding: 16,
  },
  addressCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  addressCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F9FCFA',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  cardBody: {
    marginBottom: 16,
    paddingLeft: 42,
  },
  addressTextPrimary: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  addressTextSecondary: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  receiverText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  delBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  delBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.danger,
    marginLeft: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primary,
    marginLeft: 8,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: '#6B7280',
  }
});

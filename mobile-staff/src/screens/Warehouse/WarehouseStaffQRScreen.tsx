import React from 'react';
import { View, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import SharedWarehouseQRScanner from '../../components/SharedWarehouseQRScanner';

export default function WarehouseStaffQRScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const shiftId = route.params?.shiftId;

  const handleScan = async (data: string) => {
    if (!data) throw new Error('Invalid QR code format');

    const { data: rpcData, error } = await supabase.rpc('warehouse_staff_shift_check_in', {
      p_shift_id: shiftId,
      p_qr_token: data
    });

    if (error) {
      if (error.message && error.message.includes('belong to your booked store')) {
        Alert.alert('Scan Failed', 'This QR does not belong to your booked store.');
      } else {
        Alert.alert('Scan Failed', error.message || 'Invalid QR Code');
      }
      throw error;
    }
    
    // On success, reset navigation so we don't leave the scanner in the back stack.
    // The WarehouseTaskScreen will fetch the newly active shift.
    navigation.reset({
      index: 0,
      routes: [{ name: 'WarehouseMainTabs' }]
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <SharedWarehouseQRScanner 
        onScan={handleScan} 
        title="Check-In"
        subtitle="Scan the QR code to start your shift"
        loadingMessage="Checking in..."
      />
    </View>
  );
}

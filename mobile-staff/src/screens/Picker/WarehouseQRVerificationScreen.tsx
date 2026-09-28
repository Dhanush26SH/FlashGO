import React from 'react';
import { View, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import SharedWarehouseQRScanner from '../../components/SharedWarehouseQRScanner';

export default function WarehouseQRVerificationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const shiftId = route.params?.shiftId;

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleScan = async (data: string) => {
    if (!data) throw new Error('Invalid QR code format');
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const { data: rpcData, error } = await supabase.rpc('picker_shift_check_in', {
      p_shift_id: shiftId,
      p_qr_token: data
    });

      if (error) {
        if (error.message && error.message.includes('belong to your booked store')) {
          Alert.alert('Scan Failed', 'This QR does not belong to your booked store.');
        } else {
          Alert.alert('Scan Failed', error.message || 'Invalid QR Code');
        }
        setIsSubmitting(false);
        throw error;
      }
      
      // Success - reset directly to the authoritative Picker Dashboard (MainTabs -> Task)
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err) {
      setIsSubmitting(false);
      throw err;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <SharedWarehouseQRScanner 
        onScan={handleScan} 
        title="Warehouse Verification"
        subtitle="Scan the QR code displayed at your warehouse"
        loadingMessage="Verifying shift..."
      />
    </View>
  );
}

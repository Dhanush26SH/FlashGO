import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

export function useBankDetailsForm(existingDetails?: any) {
  const navigation = useNavigation<any>();
  const { profile } = useAuth();
  
  const [accountNumber, setAccountNumber] = useState(existingDetails?.account_number || '');
  const [ifsc, setIfsc] = useState(existingDetails?.ifsc || '');
  const [branchName, setBranchName] = useState(existingDetails?.branch_name || '');
  const [bankName, setBankName] = useState(existingDetails?.bank_name || '');
  const [accountHolder, setAccountHolder] = useState(existingDetails?.account_holder || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleVerifyAndSave = async () => {
    if (!profile?.id) return;
    
    // Basic validation
    if (!accountNumber.trim() || !ifsc.trim() || !branchName.trim() || !bankName.trim() || !accountHolder.trim()) {
      setErrorMsg('Please fill in all fields');
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    
    try {
      const { error } = await supabase
        .from('staff_payout_details')
        .upsert({
          staff_id: profile.id,
          account_number: accountNumber.trim(),
          ifsc: ifsc.trim().toUpperCase(),
          branch_name: branchName.trim(),
          bank_name: bankName.trim(),
          account_holder: accountHolder.trim(),
          payout_method_type: existingDetails?.payout_method_type || 'bank',
          upi_id: existingDetails?.upi_id || null
        });
        
      if (error) {
        throw error;
      }
      
      navigation.goBack();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to save bank details');
    } finally {
      setLoading(false);
    }
  };

  return {
    accountNumber, setAccountNumber,
    ifsc, setIfsc,
    branchName, setBranchName,
    bankName, setBankName,
    accountHolder, setAccountHolder,
    loading, errorMsg,
    handleVerifyAndSave,
    navigation
  };
}

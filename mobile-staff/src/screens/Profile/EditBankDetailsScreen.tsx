import React from 'react';
import { useRoute } from '@react-navigation/native';
import BankDetailsForm from '../../components/BankDetailsForm';

export default function EditBankDetailsScreen() {
  const route = useRoute<any>();
  const existingDetails = route.params?.existingDetails || null;

  return (
    <BankDetailsForm 
      title="Enter Bank Details" 
      buttonText="Save Bank Details" 
      existingDetails={existingDetails} 
    />
  );
}

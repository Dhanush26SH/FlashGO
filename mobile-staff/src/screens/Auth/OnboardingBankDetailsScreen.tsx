import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useBankDetailsForm } from '../../hooks/useBankDetailsForm';

export default function OnboardingBankDetailsScreen() {
  const {
    accountNumber, setAccountNumber,
    ifsc, setIfsc,
    branchName, setBranchName,
    bankName, setBankName,
    accountHolder, setAccountHolder,
    loading, errorMsg,
    handleVerifyAndSave,
    navigation
  } = useBankDetailsForm();

  return (
    <View style={styles.container}>
      <Text style={styles.logoText}>⚡ FLASH<Text style={{ color: '#10b981' }}>GO</Text> STAFF</Text>
      
      <View style={styles.card}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} disabled={loading}>
            <ChevronLeft size={24} color="#94a3b8" />
          </TouchableOpacity>
          <Text style={styles.title}>Add Bank Details</Text>
        </View>

        <Text style={styles.description}>
          Please provide your bank details to complete your request.
        </Text>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.label}>Bank Account Number</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter account number"
              placeholderTextColor="#4b5563"
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="numeric"
              editable={!loading}
            />
          </View>

          <Text style={styles.label}>IFSC Code</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter IFSC code"
              placeholderTextColor="#4b5563"
              value={ifsc}
              onChangeText={setIfsc}
              autoCapitalize="characters"
              editable={!loading}
            />
          </View>

          <Text style={styles.label}>Branch</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter branch name"
              placeholderTextColor="#4b5563"
              value={branchName}
              onChangeText={setBranchName}
              editable={!loading}
            />
          </View>

          <Text style={styles.label}>Bank Name</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter bank name"
              placeholderTextColor="#4b5563"
              value={bankName}
              onChangeText={setBankName}
              editable={!loading}
            />
          </View>
          
          <Text style={styles.label}>Account Holder Name</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Enter account holder name"
              placeholderTextColor="#4b5563"
              value={accountHolder}
              onChangeText={setAccountHolder}
              editable={!loading}
            />
          </View>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          
          <TouchableOpacity 
            style={styles.submitBtn} 
            onPress={handleVerifyAndSave}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.submitBtnText}>Save & Continue</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingTop: 60,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    marginBottom: 24
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#1e293b',
    flex: 1,
    maxHeight: 700
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
    marginLeft: -4
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  description: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20
  },
  content: {
    paddingBottom: 24
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52
  },
  textInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    height: '100%'
  },
  submitBtn: {
    backgroundColor: '#10b981',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32
  },
  submitBtnText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
});

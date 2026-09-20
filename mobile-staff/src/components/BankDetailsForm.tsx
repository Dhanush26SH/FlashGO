import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useBankDetailsForm } from '../hooks/useBankDetailsForm';

interface BankDetailsFormProps {
  title: string;
  buttonText: string;
  existingDetails?: any;
}

export default function BankDetailsForm({ title, buttonText, existingDetails }: BankDetailsFormProps) {
  const {
    accountNumber, setAccountNumber,
    ifsc, setIfsc,
    branchName, setBranchName,
    bankName, setBankName,
    accountHolder, setAccountHolder,
    loading, errorMsg,
    handleVerifyAndSave,
    navigation
  } = useBankDetailsForm(existingDetails);

  const { profile } = useAuth();
  const isDriver = profile?.role === 'driver';

  return (
    <SafeAreaView style={[styles.container, isDriver && { backgroundColor: '#0f172a' }]}>
      {/* Header */}
      <View style={[styles.header, isDriver && { borderBottomColor: '#1e293b' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} disabled={loading}>
          <ChevronLeft size={28} color={isDriver ? "#ffffff" : "#1f2937"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isDriver && { color: '#ffffff' }]}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.formGroup}>
          <Text style={[styles.label, isDriver && { color: '#94a3b8' }]}>Bank Account Number</Text>
          <TextInput
            style={[styles.input, isDriver && { backgroundColor: '#1e293b', borderColor: '#334155', color: '#ffffff' }]}
            placeholderTextColor={isDriver ? "#64748b" : "#9ca3af"}
            placeholder="Enter account number"
            value={accountNumber}
            onChangeText={setAccountNumber}
            keyboardType="numeric"
            editable={!loading}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, isDriver && { color: '#94a3b8' }]}>IFSC Code</Text>
          <TextInput
            style={[styles.input, isDriver && { backgroundColor: '#1e293b', borderColor: '#334155', color: '#ffffff' }]}
            placeholderTextColor={isDriver ? "#64748b" : "#9ca3af"}
            placeholder="Enter IFSC code"
            value={ifsc}
            onChangeText={setIfsc}
            autoCapitalize="characters"
            editable={!loading}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, isDriver && { color: '#94a3b8' }]}>Branch</Text>
          <TextInput
            style={[styles.input, isDriver && { backgroundColor: '#1e293b', borderColor: '#334155', color: '#ffffff' }]}
            placeholderTextColor={isDriver ? "#64748b" : "#9ca3af"}
            placeholder="Enter branch name"
            value={branchName}
            onChangeText={setBranchName}
            editable={!loading}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={[styles.label, isDriver && { color: '#94a3b8' }]}>Bank Name</Text>
          <TextInput
            style={[styles.input, isDriver && { backgroundColor: '#1e293b', borderColor: '#334155', color: '#ffffff' }]}
            placeholderTextColor={isDriver ? "#64748b" : "#9ca3af"}
            placeholder="Enter bank name"
            value={bankName}
            onChangeText={setBankName}
            editable={!loading}
          />
        </View>
        
        <View style={styles.formGroup}>
          <Text style={[styles.label, isDriver && { color: '#94a3b8' }]}>Account Holder Name</Text>
          <TextInput
            style={[styles.input, isDriver && { backgroundColor: '#1e293b', borderColor: '#334155', color: '#ffffff' }]}
            placeholderTextColor={isDriver ? "#64748b" : "#9ca3af"}
            placeholder="Enter account holder name"
            value={accountHolder}
            onChangeText={setAccountHolder}
            editable={!loading}
          />
        </View>

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        
      </ScrollView>

      <View style={[styles.footer, isDriver && { backgroundColor: '#0f172a', borderTopColor: '#1e293b' }]}>
        <TouchableOpacity 
          style={[styles.verifyBtn, isDriver && { backgroundColor: '#10b981' }, loading && styles.verifyBtnDisabled, loading && isDriver && { backgroundColor: '#059669' }]} 
          onPress={handleVerifyAndSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.verifyBtnText}>{buttonText}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  content: {
    padding: 24,
    paddingBottom: 100,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#f8fafc',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  verifyBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  verifyBtnDisabled: {
    backgroundColor: '#93c5fd',
  },
  verifyBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Mail, KeyRound } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (email.trim() === '') {
      Alert.alert('Email Required', 'Please enter your email address.');
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim()
      });

      if (error) {
        throw error;
      }
      
      setStep('otp');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.trim() === '') {
      Alert.alert('OTP Required', 'Please enter the login code.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: 'email'
      });

      if (error) {
        throw error;
      }
      // On success, AuthContext will automatically detect the session and route the user!
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Invalid code.');
      setLoading(false);
    }
  };

  return (
    <View style={styles.authContainer}>
      <Text style={styles.logoText}>⚡ FLASH<Text style={{ color: '#10b981' }}>GO</Text> STAFF</Text>
      <Text style={styles.authSubtitle}>Unified Employee Operations Terminal</Text>

      <View style={styles.authCard}>
        <Text style={styles.authHeader}>{step === 'email' ? 'Staff Login' : 'Verify Identity'}</Text>
        
        {step === 'email' ? (
          <>
            <Text style={styles.instructions}>Enter your email address to receive a secure login code.</Text>
            <View style={styles.inputBox}>
              <Mail size={16} color="#94a3b8" />
              <TextInput
                style={styles.textInput}
                placeholder="staff@flashgo.com"
                placeholderTextColor="#4b5563"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity 
              style={styles.loginBtn} 
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.loginBtnText}>Send Login Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.instructions}>We've sent a secure code to {email}.</Text>
            <View style={styles.inputBox}>
              <KeyRound size={16} color="#94a3b8" />
              <TextInput
                style={styles.textInput}
                placeholder="Enter login code"
                placeholderTextColor="#4b5563"
                value={otp}
                onChangeText={setOtp}
                keyboardType="default"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity 
              style={styles.loginBtn} 
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.loginBtnText}>Verify & Login</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.backBtn} 
              onPress={() => setStep('email')}
              disabled={loading}
            >
              <Text style={styles.backBtnText}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}

      </View>

      <Text style={styles.footerText}>Secure Access • Platform V4.2</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    marginBottom: 8
  },
  authSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 40
  },
  authCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10
  },
  authHeader: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center'
  },
  instructions: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#030712',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 10
  },
  loginBtn: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8
  },
  loginBtnText: {
    color: '#030712',
    fontWeight: 'bold',
    fontSize: 15
  },
  backBtn: {
    marginTop: 16,
    alignItems: 'center'
  },
  backBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500'
  },
  footerText: {
    color: '#4b5563',
    fontSize: 12,
    position: 'absolute',
    bottom: 40
  }
});

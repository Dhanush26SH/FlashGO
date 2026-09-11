import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions, Alert } from 'react-native';
import { theme } from '../theme';
import { supabase } from '../lib/supabase';
import { useMobileAppContext } from '../context/MobileAppContext';

export default function AuthScreen() {
  const { width } = useWindowDimensions();
  const { isLoadingSession } = useMobileAppContext();

  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSendOtp = async () => {
    if (!email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }
    setIsAuthenticating(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setIsAuthenticating(false);
    
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    
    setOtpSent(true);
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit code');
      return;
    }
    setIsAuthenticating(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otpCode, type: 'email' });
    setIsAuthenticating(false);
    if (error) { Alert.alert('Verification Failed', error.message); return; }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoBox}>
          <Text style={{ fontSize: 32 }}>⚡</Text>
        </View>
        
        <Text style={styles.title}>Welcome to FlashGO</Text>
        <Text style={styles.subtitle}>Quick Commerce Delivered Fast</Text>

        {isLoadingSession ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: 20 }} />
        ) : !otpSent ? (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <TouchableOpacity 
              style={[styles.primaryBtn, (isAuthenticating || !email) && { opacity: 0.7 }]} 
              onPress={handleSendOtp}
              disabled={isAuthenticating || !email}
            >
              <Text style={styles.primaryBtnText}>{isAuthenticating ? 'Sending...' : 'Continue with Email'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={otpCode}
                onChangeText={setOtpCode}
              />
            </View>
            <TouchableOpacity 
              style={[styles.primaryBtn, (isAuthenticating || otpCode.length < 6) && { opacity: 0.7 }]} 
              onPress={handleVerifyOtp}
              disabled={isAuthenticating || otpCode.length < 6}
            >
              <Text style={styles.primaryBtnText}>{isAuthenticating ? 'Verifying...' : 'Verify & Continue'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setOtpSent(false)}>
              <Text style={styles.secondaryBtnText}>Change Email</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={handleSendOtp} disabled={resendCooldown > 0 || isAuthenticating}>
              <Text style={[styles.resendText, resendCooldown > 0 && { color: theme.colors.textMuted }]}>
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryLight || '#E5F7ED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    marginBottom: 40,
    lineHeight: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 24,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    height: 56,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: theme.colors.surface,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    height: 56,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#ffffff',
  },
  secondaryBtnText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  resendText: {
    color: theme.colors.primary,
    fontWeight: '700',
  }
});

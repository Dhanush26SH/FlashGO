import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { User, Briefcase, ChevronDown } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useIsFocused, useNavigation } from '@react-navigation/native';

export default function RequestAccessScreen() {
  const { setRole, profile, setProfile } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [requestedRole, setRequestedRole] = useState<'picker' | 'driver' | 'warehouse_staff'>('picker');
  const [loading, setLoading] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  
  const [bankDetailsComplete, setBankDetailsComplete] = useState(false);

  React.useEffect(() => {
    let isMounted = true;
    const checkBankDetails = async () => {
      if (!profile?.id) return;
      try {
        const { data, error } = await supabase
          .from('staff_payout_details')
          .select('*')
          .eq('staff_id', profile.id)
          .maybeSingle();
        
        if (isMounted) {
          if (data && !error) {
            const isComplete = Boolean(
              data.account_number && data.ifsc && data.branch_name && data.bank_name && data.account_holder
            );
            setBankDetailsComplete(isComplete);
          } else {
            setBankDetailsComplete(false);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    if (isFocused) {
      checkBankDetails();
    }
    return () => { isMounted = false; };
  }, [isFocused, profile?.id, requestedRole]);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Alert.alert('Required', 'Please enter your full name.');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number.');
      return;
    }
    if (!bankDetailsComplete) {
      Alert.alert('Required', 'Please complete your Bank Details.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('request_staff_access', {
        p_full_name: fullName.trim(),
        p_requested_role: requestedRole,
        p_phone: phone.trim()
      });

      if (error) throw error;

      // Update local context
      if (profile) {
        setProfile({ ...profile, full_name: fullName.trim(), requested_role: requestedRole, is_pending_staff: true } as any);
      }
      
      if (requestedRole === 'driver') {
        setRole('driver_onboarding' as any);
      } else {
        setRole('pending' as any);
      }
      
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const roleLabels = {
    picker: 'Warehouse Picker',
    driver: 'Delivery Rider',
    warehouse_staff: 'Warehouse Staff'
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logoText}>⚡ FLASH<Text style={{ color: '#10b981' }}>GO</Text> STAFF</Text>
      
      <View style={styles.card}>
        <Text style={styles.title}>Request Access</Text>
        <Text style={styles.description}>
          Your account has been created. Please provide your details to request staff access.
        </Text>

        <View style={styles.inputBox}>
          <User size={16} color="#94a3b8" />
          <TextInput
            style={styles.textInput}
            placeholder="Full Name"
            placeholderTextColor="#4b5563"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />
        </View>

        <Text style={styles.label}>Requested Role</Text>
        <TouchableOpacity 
          style={styles.dropdownBtn}
          onPress={() => setShowRoleDropdown(!showRoleDropdown)}
        >
          <Briefcase size={16} color="#94a3b8" />
          <Text style={styles.dropdownText}>{roleLabels[requestedRole]}</Text>
          <ChevronDown size={16} color="#94a3b8" />
        </TouchableOpacity>

        {showRoleDropdown && (
          <View style={styles.dropdownMenu}>
            {(Object.keys(roleLabels) as Array<keyof typeof roleLabels>).map(r => (
              <TouchableOpacity 
                key={r} 
                style={styles.dropdownItem}
                onPress={() => { setRequestedRole(r); setShowRoleDropdown(false); }}
              >
                <Text style={styles.dropdownItemText}>{roleLabels[r]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.inputBox, { marginTop: 16 }]}>
          <Text style={{ color: '#94a3b8', marginRight: 8 }}>📞</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Phone Number"
            placeholderTextColor="#4b5563"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <TouchableOpacity 
          style={[styles.dropdownBtn, { marginTop: 16, justifyContent: 'space-between' }]}
          onPress={() => navigation.navigate('OnboardingBankDetails')}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#94a3b8', marginRight: 12 }}>🏦</Text>
              <Text style={styles.dropdownText}>
                Bank Details
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {bankDetailsComplete && <Text style={{ color: '#10b981', marginRight: 8, fontSize: 12 }}>Added ✓</Text>}
              {!bankDetailsComplete && <Text style={{ color: '#94a3b8', marginRight: 8, fontSize: 12 }}>Add</Text>}
              <Text style={{ color: '#94a3b8' }}>→</Text>
            </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.submitBtn} 
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.submitBtnText}>Submit Request</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.backBtn} onPress={handleLogout}>
          <Text style={styles.backBtnText}>Logout</Text>
        </TouchableOpacity>
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
    padding: 24
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
    borderColor: '#1e293b'
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8
  },
  description: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 24,
    lineHeight: 20
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
    marginLeft: 12,
    height: '100%'
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52
  },
  dropdownText: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    marginLeft: 12
  },
  dropdownMenu: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden'
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  dropdownItemText: {
    color: '#f8fafc',
    fontSize: 15
  },
  submitBtn: {
    backgroundColor: '#10b981',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24
  },
  submitBtnText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  },
  backBtn: {
    marginTop: 16,
    alignItems: 'center',
    padding: 12
  },
  backBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600'
  }
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock, RefreshCcw, LogOut } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function PendingScreen() {
  const { session, profile, setRole, setProfile } = useAuth() as any;

  // Extract requested role from profile
  let requestedRoleDisplay = "a Role";
  if (profile?.requested_role) {
    const roleMap: any = {
      'picker': 'Picker',
      'driver': 'Delivery Rider',
      'warehouse_staff': 'Warehouse Staff'
    };
    requestedRoleDisplay = roleMap[profile.requested_role] || profile.requested_role;
  }

  const handleRefresh = async () => {
    if (session?.user?.id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (data) {
        setProfile(data);
        if (data.role !== 'customer') {
          setRole(data.role);
        } else if (data.is_pending_staff && data.requested_role === 'driver') {
          setRole('driver_onboarding');
        } else {
          alert("Your account is still pending approval.");
        }
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Clock size={48} color="#eab308" style={{ marginBottom: 16 }} />
        <Text style={styles.title}>Pending Approval</Text>
        <Text style={styles.description}>
          Your request to join as a <Text style={{fontWeight: 'bold', color: '#fff'}}>{requestedRoleDisplay}</Text> is pending approval from an Administrator. Please wait until your account is activated.
        </Text>

        <TouchableOpacity style={styles.btn} onPress={handleRefresh}>
          <RefreshCcw size={18} color="#030712" />
          <Text style={styles.btnText}>Check Status</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={16} color="#94a3b8" />
          <Text style={styles.logoutText}>Logout</Text>
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
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    width: '100%',
    maxWidth: 400
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center'
  },
  description: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32
  },
  btn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    gap: 8,
    marginBottom: 16
  },
  btnText: {
    color: '#030712',
    fontWeight: 'bold',
    fontSize: 15
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8
  },
  logoutText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500'
  }
});

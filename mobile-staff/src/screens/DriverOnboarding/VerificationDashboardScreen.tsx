import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { CheckCircle, AlertCircle, Clock, UserCheck, ShieldAlert, FileText } from 'lucide-react-native';

export default function VerificationDashboardScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [missingRequirements, setMissingRequirements] = useState<string[]>([]);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      // 1. Onboarding base
      const { data: obData } = await supabase.from('driver_onboarding').select('*').eq('id', session.user.id).single();
      const { data: whData } = obData?.warehouse_id ? await supabase.from('warehouses').select('name').eq('id', obData.warehouse_id).single() : { data: null };
      
      // 2. Nominee
      const { data: nominee } = await supabase.from('driver_nominee_details').select('driver_id').eq('driver_id', session.user.id).single();
      
      const missing = [];
      if (!nominee) missing.push('Nominee Details');

      setData({
        ...obData,
        warehouseName: whData?.name,
        hasNominee: !!nominee
      });
      setMissingRequirements(missing);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  const handleSubmit = async () => {
    if (!session?.user?.id) return;
    if (missingRequirements.length > 0) {
      alert(`Please complete: ${missingRequirements.join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('submit_driver_application');
      if (error) throw error;
      if (data?.success) {
        await fetchData();
        alert(data.message);
      } else {
        alert('Failed to submit application: ' + (data?.message || 'Unknown error'));
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBanner = () => {
    if (!data) return null;
    const { status, rejection_reason } = data;

    if (status === 'submitted' || status === 'under_review') {
      return (
        <View style={[styles.banner, styles.bannerInfo]}>
          <Clock size={24} color="#3b82f6" />
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Waiting for Warehouse Approval</Text>
            <Text style={styles.bannerDesc}>Please visit your selected FlashGO warehouse and meet the Manager for final verification.</Text>
          </View>
        </View>
      );
    }
    if (status === 'changes_requested') {
      return (
        <View style={[styles.banner, styles.bannerWarn]}>
          <AlertCircle size={24} color="#f59e0b" />
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Changes Requested</Text>
            <Text style={styles.bannerDesc}>{rejection_reason}</Text>
          </View>
        </View>
      );
    }
    if (status === 'rejected') {
      return (
        <View style={[styles.banner, styles.bannerError]}>
          <ShieldAlert size={24} color="#ef4444" />
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Application Rejected</Text>
            <Text style={styles.bannerDesc}>{rejection_reason}</Text>
          </View>
        </View>
      );
    }
    return null;
  };

  if (loading) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#10b981" /></View>;
  }

  const isEditable = ['in_progress', 'ready_to_submit', 'changes_requested'].includes(data?.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.title}>Verification Dashboard</Text>
      
      {renderStatusBanner()}

      <View style={styles.profileCard}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{session?.user?.email?.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.profileName}>{session?.user?.user_metadata?.full_name || 'Driver'}</Text>
          <Text style={styles.profileStore}>{data?.warehouseName || 'No Store Selected'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Required Steps</Text>
        
        <TouchableOpacity 
          style={styles.taskCard} 
          onPress={() => isEditable ? navigation.navigate('NomineeDetails') : null}
          disabled={!isEditable}
        >
          <View style={styles.taskCardLeft}>
            <UserCheck size={24} color={data?.hasNominee ? '#10b981' : '#94a3b8'} />
            <Text style={styles.taskCardText}>Nominee Details</Text>
          </View>
          {data?.hasNominee ? <CheckCircle size={20} color="#10b981" /> : <Text style={styles.actionText}>Add</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recheck Your Details</Text>
        <TouchableOpacity style={styles.taskCard} onPress={() => isEditable ? navigation.navigate('RecheckDetails') : null} disabled={!isEditable}>
          <View style={styles.taskCardLeft}>
            <FileText size={24} color="#94a3b8" />
            <Text style={styles.taskCardText}>Store, Work & Vehicle Details</Text>
          </View>
          {isEditable && <Text style={styles.actionText}>Review</Text>}
        </TouchableOpacity>
      </View>

      {isEditable && (
        <TouchableOpacity 
          style={[styles.submitButton, missingRequirements.length > 0 && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={missingRequirements.length > 0 || submitting}
        >
          {submitting ? <ActivityIndicator color="#030712" /> : <Text style={styles.submitButtonText}>Submit for Verification</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity 
        style={styles.logoutButton}
        onPress={() => supabase.auth.signOut()}
      >
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    padding: 24,
    paddingTop: 48
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24
  },
  banner: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'flex-start'
  },
  bannerInfo: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1
  },
  bannerWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1
  },
  bannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1
  },
  bannerTextContainer: {
    marginLeft: 12,
    flex: 1
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4
  },
  bannerDesc: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 20
  },
  profileCard: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc'
  },
  profileName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4
  },
  profileStore: {
    color: '#94a3b8',
    fontSize: 14
  },
  section: {
    marginBottom: 32
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16
  },
  taskCard: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  taskCardLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  taskCardText: {
    color: '#e2e8f0',
    fontSize: 16,
    marginLeft: 16,
    fontWeight: '500'
  },
  actionText: {
    color: '#3b82f6',
    fontWeight: 'bold'
  },
  submitButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16
  },
  submitButtonDisabled: {
    backgroundColor: '#064e3b',
    opacity: 0.5
  },
  submitButtonText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  },
  logoutButton: {
    paddingVertical: 16,
    alignItems: 'center'
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

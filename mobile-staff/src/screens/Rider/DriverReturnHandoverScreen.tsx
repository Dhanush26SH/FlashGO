import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, RefreshCw, CheckCircle, Package } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import QRCode from 'react-native-qrcode-svg';

export default function DriverReturnHandoverScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { taskId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    init();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const init = async () => {
    try {
      const { data, error } = await supabase.rpc('driver_get_return_handover_status', { p_task_id: taskId });
      if (error) throw error;
      setStatus(data);

      const isScanningOrDone = data?.intake_status === 'scanning' || data?.qr_consumed || data?.intake_status === 'completed' || data?.task_status === 'completed';
      
      if (!isScanningOrDone) {
        await generateToken();
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const generateToken = async () => {
    try {
      setGenerating(true);
      const { data, error } = await supabase.rpc('generate_return_handover_qr', { p_task_id: taskId });
      if (error) throw error;
      setToken(data);
      await pollStatus();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const pollStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('driver_get_return_handover_status', { p_task_id: taskId });
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const isScanning = status?.intake_status === 'scanning' || status?.qr_consumed;
  const isCompleted = status?.intake_status === 'completed' || status?.intake_status === 'discrepancy' || status?.task_status === 'completed';
  const isVoided = status?.task_status === 'voided' || status?.intake_status === 'voided';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', left: 16, top: 16 }}>
          <ArrowLeft color="#fff" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>Return Handover</Text>
      </View>

      <View style={styles.content}>
        {isCompleted ? (
          <View style={styles.stateContainer}>
            <CheckCircle color="#10b981" size={64} style={{ marginBottom: 16 }} />
            <Text style={styles.stateTitle}>Handover Completed</Text>
            <Text style={styles.stateDesc}>The warehouse staff has finished receiving your items.</Text>
            
            <TouchableOpacity 
              style={[styles.primaryBtn, { backgroundColor: '#10b981' }]} 
              onPress={() => navigation.replace('DriverOperationsMapScreen')}
            >
              <Text style={styles.primaryBtnText}>Return to Map</Text>
            </TouchableOpacity>
          </View>
        ) : isVoided ? (
          <View style={styles.stateContainer}>
            <Package color="#ef4444" size={64} style={{ marginBottom: 16 }} />
            <Text style={styles.stateTitle}>Return verification cancelled</Text>
            <Text style={styles.stateDesc}>The warehouse staff has closed this invalid intake.</Text>
            
            <TouchableOpacity 
              style={[styles.primaryBtn, { backgroundColor: '#ef4444' }]} 
              onPress={() => navigation.replace('DriverOperationsMapScreen')}
            >
              <Text style={styles.primaryBtnText}>Return to Map</Text>
            </TouchableOpacity>
          </View>
        ) : isScanning ? (
          <View style={styles.stateContainer}>
            <Package color="#3b82f6" size={64} style={{ marginBottom: 16 }} />
            <Text style={styles.stateTitle}>Warehouse Verification in Progress</Text>
            <Text style={styles.stateDesc}>Return handover started. Warehouse Staff is verifying the returned products.</Text>
            
            <View style={styles.progressBox}>
              <Text style={styles.progressText}>
                Received: {status.received_quantity || 0} / {status.expected_quantity || 0}
              </Text>
            </View>
            <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 24 }} />
          </View>
        ) : (
          <View style={styles.stateContainer}>
            <Text style={styles.stateTitle}>Show this QR to Warehouse Staff</Text>
            <Text style={styles.stateDesc}>They will scan it to begin the return intake.</Text>

            <View style={styles.qrWrapper}>
              {token ? (
                <QRCode value={token} size={250} backgroundColor="#fff" color="#000" />
              ) : (
                <ActivityIndicator size="large" color="#3b82f6" />
              )}
            </View>

            <TouchableOpacity 
              style={styles.refreshBtn} 
              onPress={generateToken}
              disabled={generating}
            >
              <RefreshCw color={generating ? '#6b7280' : '#3b82f6'} size={20} />
              <Text style={[styles.refreshBtnText, generating && { color: '#6b7280' }]}>
                {generating ? 'Refreshing...' : 'Refresh QR'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  loadingContainer: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f1f23', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1, padding: 24 },
  
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12
  },
  stateDesc: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16
  },
  qrWrapper: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 32,
    width: 282,
    height: 282,
    alignItems: 'center',
    justifyContent: 'center'
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1e3a8a30',
    borderWidth: 1,
    borderColor: '#3b82f680'
  },
  refreshBtnText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600'
  },
  progressBox: {
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  progressText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  primaryBtn: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginTop: 24
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  }
});

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Edit2, MapPin, Briefcase, Store, Bike } from 'lucide-react-native';

export default function RecheckDetailsScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFocused) {
      fetchData();
    }
  }, [isFocused]);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      const { data: obData } = await supabase.from('driver_onboarding').select('*').eq('id', session.user.id).single();
      const { data: whData } = obData?.warehouse_id ? await supabase.from('warehouses').select('name').eq('id', obData.warehouse_id).single() : { data: null };
      
      setData({
        ...obData,
        warehouseName: whData?.name
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#10b981" /></View>;
  }

  const onChange = (screenName: string) => {
    navigation.navigate(screenName);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recheck Details</Text>
      <Text style={styles.subtitle}>Review your selections before final submission.</Text>

      <ScrollView style={styles.list}>
        <View style={styles.card}>
          <View style={styles.cardInfo}>
            <Store size={20} color="#94a3b8" />
            <View style={{ marginLeft: 16 }}>
              <Text style={styles.label}>Your Store</Text>
              <Text style={styles.value}>{data.warehouseName || 'Not selected'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => onChange('WarehouseSelection')}>
            <Text style={styles.changeBtn}>Change</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardInfo}>
            <Briefcase size={20} color="#94a3b8" />
            <View style={{ marginLeft: 16 }}>
              <Text style={styles.label}>Work Type</Text>
              <Text style={styles.value}>{data.work_type || 'Not selected'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => onChange('WorkType')}>
            <Text style={styles.changeBtn}>Change</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardInfo}>
            <Bike size={20} color="#94a3b8" />
            <View style={{ marginLeft: 16 }}>
              <Text style={styles.label}>Your Vehicle</Text>
              <Text style={styles.value}>{data.vehicle_type || 'Not selected'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => onChange('VehicleType')}>
            <Text style={styles.changeBtn}>Change</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.card}>
          <View style={styles.cardInfo}>
            <MapPin size={20} color="#94a3b8" />
            <View style={{ marginLeft: 16 }}>
              <Text style={styles.label}>Work Area</Text>
              <Text style={styles.value}>{data.work_area || 'Not selected'}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => onChange('WorkArea')}>
            <Text style={styles.changeBtn}>Change</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TouchableOpacity 
        style={styles.button} 
        onPress={() => navigation.navigate('VerificationDashboard')}
      >
        <Text style={styles.buttonText}>All Good</Text>
      </TouchableOpacity>
    </View>
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
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginBottom: 32
  },
  list: {
    flex: 1
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 2
  },
  value: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold'
  },
  changeBtn: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: 14
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16
  },
  buttonText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

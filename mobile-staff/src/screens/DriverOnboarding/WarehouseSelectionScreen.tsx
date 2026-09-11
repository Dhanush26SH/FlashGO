import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Store, Check } from 'lucide-react-native';

interface Warehouse {
  id: string;
  name: string;
  address: string;
}

export default function WarehouseSelectionScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const { data: onboarding } = await supabase.from('driver_onboarding').select('work_area').eq('id', session?.user?.id).single();
        const userArea = onboarding?.work_area || '';

        const { data, error } = await supabase
          .from('warehouses')
          .select('id, name, address, work_area')
          .eq('is_active', true)
          .eq('work_area', userArea);
          
        if (error) throw error;
        
        setWarehouses(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchWarehouses();
  }, [session]);

  const handleNext = async () => {
    if (!selected || !session?.user?.id) return;
    setSaving(true);
    try {
      await supabase
        .from('driver_onboarding')
        .update({ warehouse_id: selected })
        .eq('id', session.user.id);
      navigation.replace('PayoutMethod');
    } catch (e) {
      console.error(e);
      alert('Failed to save warehouse.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Store</Text>
      <Text style={styles.subtitle}>Choose your preferred FlashGO dark store.</Text>

      <ScrollView style={styles.list}>
        {warehouses.map(w => (
          <TouchableOpacity
            key={w.id}
            style={[styles.item, selected === w.id && styles.itemSelected]}
            onPress={() => setSelected(w.id)}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              <Store size={24} color={selected === w.id ? '#10b981' : '#94a3b8'} style={{ marginRight: 16 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemText, selected === w.id && styles.itemTextSelected]}>
                  {w.name}
                </Text>
                <Text style={styles.itemAddress}>{w.address}</Text>
              </View>
            </View>
            {selected === w.id && <Check size={20} color="#10b981" />}
          </TouchableOpacity>
        ))}
        {warehouses.length === 0 && (
          <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>No warehouses available in this area.</Text>
        )}
      </ScrollView>

      <TouchableOpacity 
        style={[styles.button, !selected && styles.buttonDisabled]} 
        onPress={handleNext}
        disabled={!selected || saving}
      >
        {saving ? <ActivityIndicator color="#030712" /> : <Text style={styles.buttonText}>Next</Text>}
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
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e293b'
  },
  itemSelected: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)'
  },
  itemText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4
  },
  itemTextSelected: {
    color: '#10b981'
  },
  itemAddress: {
    color: '#64748b',
    fontSize: 14
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16
  },
  buttonDisabled: {
    backgroundColor: '#064e3b',
    opacity: 0.5
  },
  buttonText: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

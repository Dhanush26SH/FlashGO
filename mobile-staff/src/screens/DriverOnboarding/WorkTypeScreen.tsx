import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Check, Clock } from 'lucide-react-native';

const TYPES = ['Full Time', 'Part Time'];

export default function WorkTypeScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!selected || !session?.user?.id) return;
    setLoading(true);
    try {
      await supabase
        .from('driver_onboarding')
        .update({ work_type: selected })
        .eq('id', session.user.id);
      navigation.replace('WarehouseSelection');
    } catch (e) {
      console.error(e);
      alert('Failed to save work type.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Work Type</Text>
      <Text style={styles.subtitle}>How do you want to work with FlashGO?</Text>

      <ScrollView style={styles.list}>
        {TYPES.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.item, selected === t && styles.itemSelected]}
            onPress={() => setSelected(t)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Clock size={24} color={selected === t ? '#10b981' : '#94a3b8'} style={{ marginRight: 16 }} />
              <Text style={[styles.itemText, selected === t && styles.itemTextSelected]}>
                {t}
              </Text>
            </View>
            {selected === t && <Check size={20} color="#10b981" />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity 
        style={[styles.button, !selected && styles.buttonDisabled]} 
        onPress={handleNext}
        disabled={!selected || loading}
      >
        {loading ? <ActivityIndicator color="#030712" /> : <Text style={styles.buttonText}>Next</Text>}
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
    fontSize: 18
  },
  itemTextSelected: {
    color: '#10b981',
    fontWeight: 'bold'
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

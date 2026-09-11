import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Check, Map } from 'lucide-react-native';

export default function WorkAreaScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  const [areas, setAreas] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const { data, error } = await supabase
          .from('warehouses')
          .select('work_area')
          .eq('is_active', true)
          .not('work_area', 'is', null);
          
        if (error) throw error;
        
        const extracted = new Set<string>();
        data.forEach(wh => {
          if (wh.work_area) {
            extracted.add(wh.work_area);
          }
        });
        
        setAreas(Array.from(extracted));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAreas();
  }, []);

  const handleNext = async () => {
    if (!selected || !session?.user?.id) return;
    setSaving(true);
    try {
      await supabase
        .from('driver_onboarding')
        .update({ work_area: selected })
        .eq('id', session.user.id);
      navigation.replace('WorkType');
    } catch (e) {
      console.error(e);
      alert('Failed to save work area.');
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
      <Text style={styles.title}>Operating Area</Text>
      <Text style={styles.subtitle}>Which city/area would you like to deliver in?</Text>

      <ScrollView style={styles.list}>
        {areas.map(area => (
          <TouchableOpacity
            key={area}
            style={[styles.item, selected === area && styles.itemSelected]}
            onPress={() => setSelected(area)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Map size={24} color={selected === area ? '#10b981' : '#94a3b8'} style={{ marginRight: 16 }} />
              <Text style={[styles.itemText, selected === area && styles.itemTextSelected]}>
                {area}
              </Text>
            </View>
            {selected === area && <Check size={20} color="#10b981" />}
          </TouchableOpacity>
        ))}
        {areas.length === 0 && (
          <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>No active areas found.</Text>
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

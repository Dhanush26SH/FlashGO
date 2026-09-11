import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Check } from 'lucide-react-native';

const LANGUAGES = [
  'English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Malayalam', 'Bengali'
];

export default function LanguageSelectionScreen() {
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
        .update({ language_pref: selected })
        .eq('id', session.user.id);
      navigation.replace('VehicleType');
    } catch (e) {
      console.error(e);
      alert('Failed to save language preference.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Language</Text>
      <Text style={styles.subtitle}>Select the language you are most comfortable with.</Text>

      <ScrollView style={styles.list}>
        {LANGUAGES.map(lang => (
          <TouchableOpacity
            key={lang}
            style={[styles.item, selected === lang && styles.itemSelected]}
            onPress={() => setSelected(lang)}
          >
            <Text style={[styles.itemText, selected === lang && styles.itemTextSelected]}>
              {lang}
            </Text>
            {selected === lang && <Check size={20} color="#10b981" />}
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

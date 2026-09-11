import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Wifi, Clock, Smartphone, ScanLine, Scan } from 'lucide-react-native';

export default function TroubleshootScreen() {
  const navigation = useNavigation();

  const troubleshootItems = [
    { id: '1', title: 'Internet not working.', icon: Wifi },
    { id: '2', title: 'Date/Time Mismatch', icon: Clock },
    { id: '3', title: 'Keyboard not working', icon: Smartphone },
    { id: '4', title: 'Scanner not working', icon: ScanLine },
    { id: '5', title: 'NFC not working', icon: Scan },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Troubleshoot</Text>
      </View>

      <ScrollView style={styles.listContainer}>
        {troubleshootItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <TouchableOpacity key={item.id} style={styles.card} activeOpacity={0.7}>
              <View style={styles.cardLeft}>
                <IconComponent size={24} color="#4b5563" style={styles.icon} />
                <Text style={styles.cardTitle}>{item.title}</Text>
              </View>
              <ChevronRight size={20} color="#9ca3af" />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55, // For status bar
    paddingBottom: 16,
    backgroundColor: '#10b981', // Solid FlashGO Green Header
    borderBottomWidth: 0,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 10
  },
  headerBtn: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#f8fafc', // Premium FlashGO light background
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 16,
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '700',
  },
});

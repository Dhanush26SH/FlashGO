import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function OffersScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Offers</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.text}>Offers and rewards go here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { color: '#94a3b8' }
});

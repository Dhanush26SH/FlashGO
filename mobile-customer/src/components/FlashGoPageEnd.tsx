import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function FlashGoPageEnd() {
  return (
    <View style={styles.container}>
      <View style={styles.divider} />
      <Text style={styles.signatureTitle}>FlashGO</Text>
      <Text style={styles.signatureSub}>Fast when it matters. ♡</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  divider: {
    height: 1,
    width: '60%',
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginBottom: 24,
  },
  signatureTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  signatureSub: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  }
});

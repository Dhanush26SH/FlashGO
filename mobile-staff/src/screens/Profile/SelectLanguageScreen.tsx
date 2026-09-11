import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Circle, CheckCircle2 } from 'lucide-react-native';

export default function SelectLanguageScreen() {
  const navigation = useNavigation();
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

  const languages = [
    { id: 'en', title: 'English' },
    { id: 'hi', title: 'हिन्दी', subtitle: 'Hindi' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Language</Text>
      </View>

      <View style={styles.content}>
        {languages.map((lang) => {
          const isSelected = selectedLanguage === lang.id;
          return (
            <TouchableOpacity 
              key={lang.id} 
              style={styles.languageCard}
              activeOpacity={0.7}
              onPress={() => setSelectedLanguage(lang.id)}
            >
              <View style={styles.radioContainer}>
                {isSelected ? (
                  <CheckCircle2 size={24} color="#1f2937" />
                ) : (
                  <Circle size={24} color="#1f2937" />
                )}
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.languageTitle}>{lang.title}</Text>
                {lang.subtitle && (
                  <Text style={styles.languageSubtitle}>{lang.subtitle}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.selectBtn, selectedLanguage ? styles.selectBtnActive : styles.selectBtnInactive]}
          disabled={!selectedLanguage}
        >
          <Text style={[styles.selectBtnText, selectedLanguage ? styles.selectBtnTextActive : styles.selectBtnTextInactive]}>
            Select
          </Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 16,
    paddingTop: 50, // For status bar
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000000',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6edf5', // light grayish blue from screenshot
    padding: 20,
    borderRadius: 12,
    marginBottom: 12,
  },
  radioContainer: {
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  languageTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  languageSubtitle: {
    fontSize: 14,
    color: '#4b5563',
    marginTop: 4,
  },
  footer: {
    padding: 16,
    paddingBottom: 32, // safe area padding for bottom
  },
  selectBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  selectBtnInactive: {
    backgroundColor: '#e6edf5', // Matches inactive state in screenshot
  },
  selectBtnActive: {
    backgroundColor: '#1f2937', // Dark color for active state
  },
  selectBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectBtnTextInactive: {
    color: '#9ca3af',
  },
  selectBtnTextActive: {
    color: '#ffffff',
  },
});

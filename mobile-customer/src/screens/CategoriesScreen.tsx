import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { useMobileAppContext } from '../context/MobileAppContext';
import FloatingCartBar from '../components/FloatingCartBar';

export default function CategoriesScreen() {
  const navigation = useNavigation<any>();
  const { categories, products } = useMobileAppContext();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All Categories</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.categoryGridRow}>
          {categories.map((cat: any) => {
            // Re-use Home collage logic
            const catProducts = products.filter((p: any) => p.category_id === cat.id);
            
            const displayedProducts = catProducts.slice(0, 4);
            const collageImages = displayedProducts.map((p: any) => p.image_url || null);
            
            while (collageImages.length < 4) {
              collageImages.push(null);
            }

            const remainingCount = catProducts.length - 4;

            return (
              <TouchableOpacity 
                key={cat.id} 
                style={styles.categoryGridItem}
                onPress={() => navigation.navigate('CategoryBrowser', { categoryId: cat.id })}
              >
                <View style={styles.collageContainer}>
                  {collageImages.map((imgUrl, idx) => (
                    <View key={idx} style={styles.collageCell}>
                      <Image 
                        source={imgUrl ? { uri: imgUrl as string } : require('../../assets/product-placeholder.png')}
                        style={styles.collageImg}
                      />
                    </View>
                  ))}
                  {remainingCount > 0 && (
                    <View style={styles.moreBadge}>
                      <Text style={styles.moreBadgeText}>+{remainingCount} more</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.categoryGridText} numberOfLines={2}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <FloatingCartBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FAF9F6',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  scrollContent: {
    padding: 12,
  },
  categoryGridRow: { 
    flexDirection: 'row', 
    flexWrap: 'wrap',
  },
  categoryGridItem: { 
    width: '33.33%', 
    paddingHorizontal: 6, 
    marginBottom: 20, 
    alignItems: 'center',
  },
  collageContainer: { 
    width: '100%', 
    aspectRatio: 1, 
    backgroundColor: '#F3F4F6', 
    borderRadius: 16, 
    padding: 4, 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    justifyContent: 'space-between', 
    alignContent: 'space-between' 
  },
  collageCell: { 
    width: '48%', 
    height: '48%', 
    backgroundColor: '#ffffff', 
    borderRadius: 8, 
    padding: 4 
  },
  collageImg: { 
    width: '100%', 
    height: '100%', 
    resizeMode: 'contain' 
  },
  moreBadge: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10
  },
  moreBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563'
  },
  categoryGridText: { 
    marginTop: 8, 
    fontSize: 13, 
    fontWeight: '700', 
    color: '#1F2937', 
    textAlign: 'center', 
    lineHeight: 16, 
    paddingHorizontal: 4 
  }
});

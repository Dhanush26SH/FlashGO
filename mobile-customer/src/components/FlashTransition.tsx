import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, ActivityIndicator } from 'react-native';
import { theme } from '../theme';

interface FlashTransitionProps {
  children: React.ReactNode;
  isReady?: boolean;
}

export default function FlashTransition({ children, isReady = true }: FlashTransitionProps) {
  const [showTransition, setShowTransition] = useState(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  
  useEffect(() => {
    // Subtle entry spring
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 60,
    }).start();

    if (isReady) {
      // 750ms visible + 250ms fade = 1000ms total (1 second max)
      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true
        }).start(() => {
          setShowTransition(false);
        });
      }, 750); 
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  return (
    <View style={styles.container}>
      {/* Render children underneath so they can mount and trigger their own entrance animations if any */}
      {children}
      
      {showTransition && (
        <Animated.View style={[styles.overlay, { opacity }]}>
          <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
            <View style={styles.loadingWrapper}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
            <Text style={styles.tagline}>Your essentials, just a Flash away.</Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAF9F6', 
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999, 
  },
  content: {
    alignItems: 'center',
  },
  loadingWrapper: {
    marginBottom: 16,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: '#9CA3AF',
    opacity: 0.8,
  }
});

import React from 'react';
import { View, Text, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      {/* Top Left Wave */}
      <View style={styles.topLeftWaveContainer}>
        <Svg width={width} height={300} viewBox={`0 0 ${width} 300`}>
          <Path
            d={`M0 0 L${width * 0.6} 0 Q${width * 0.4} 150 0 250 Z`}
            fill="#d1fae5"
            opacity={0.6}
          />
          <Path
            d={`M0 0 L${width * 0.4} 0 Q${width * 0.2} 100 0 150 Z`}
            fill="#a7f3d0"
            opacity={0.6}
          />
        </Svg>
      </View>

      {/* Main Content */}
      <View style={styles.contentContainer}>
        {/* Star Logo */}
        <View style={styles.logoIconContainer}>
          <Svg width={80} height={80} viewBox="0 0 100 100">
            {/* The four-pointed rounded star */}
            <Path
              d="M50 10 C50 35 35 50 10 50 C35 50 50 65 50 90 C50 65 65 50 90 50 C65 50 50 35 50 10 Z"
              stroke="#10b981"
              strokeWidth="8"
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="transparent"
            />
            {/* Small dot/circle at bottom left */}
            <Circle cx="25" cy="75" r="7" fill="#10b981" />
          </Svg>
        </View>

        {/* FlashGO Text */}
        <View style={styles.brandTextContainer}>
          <Text style={styles.brandTextFlash}>Flash</Text>
          <Text style={styles.brandTextGo}>GO</Text>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>Faster Essentials.</Text>
        <Text style={styles.subtitle}>Closer to You.</Text>
      </View>

      {/* Bottom Loading Area */}
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>

      {/* Bottom Waves */}
      <View style={styles.bottomWaveContainer}>
        <Svg width={width} height={200} viewBox={`0 0 ${width} 200`}>
          <Path
            d={`M0 100 Q${width * 0.25} 50 ${width * 0.5} 120 T${width} 80 L${width} 200 L0 200 Z`}
            fill="#6ee7b7"
            opacity={0.6}
          />
          <Path
            d={`M0 150 Q${width * 0.3} 100 ${width * 0.6} 160 T${width} 120 L${width} 200 L0 200 Z`}
            fill="#34d399"
            opacity={0.8}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topLeftWaveContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  contentContainer: {
    alignItems: 'center',
    marginTop: -50, // Shift up slightly to balance bottom waves
    zIndex: 10,
  },
  logoIconContainer: {
    marginBottom: 16,
  },
  brandTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandTextFlash: {
    fontSize: 42,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -1,
  },
  brandTextGo: {
    fontSize: 42,
    fontWeight: '900',
    color: '#10b981',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 24,
  },
  loadingContainer: {
    position: 'absolute',
    bottom: 180,
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomWaveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
});

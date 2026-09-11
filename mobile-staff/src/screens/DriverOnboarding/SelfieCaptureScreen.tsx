import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Camera as CameraIcon, RefreshCw, Check, Info } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export default function SelfieCaptureScreen() {
  const { session } = useAuth();
  const navigation = useNavigation<any>();
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const takePicture = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
      setPhotoUri(photo.uri);
      if (photo.base64) {
        setPhotoBase64(photo.base64);
      }
    }
  };

  const uploadAndSave = async () => {
    if (!photoUri || !session?.user?.id) return;
    setLoading(true);
    try {
      let buffer: ArrayBuffer;
      
      if (photoBase64) {
        const b64 = photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64;
        buffer = decode(b64);
      } else if (photoUri.startsWith('data:')) {
        const b64 = photoUri.split(',')[1];
        buffer = decode(b64);
      } else {
        // Fallback for native/web if base64 isn't available
        const res = await fetch(photoUri);
        buffer = await res.arrayBuffer();
      }
      
      const fileName = `${session.user.id}/selfie_${Date.now()}.jpg`;

      // Upload to private bucket
      const { data, error: uploadError } = await supabase.storage
        .from('driver_documents')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: false // Ensure we use INSERT only to avoid missing UPDATE policy
        });

      if (uploadError) throw uploadError;

      // Save path
      const { error: dbError } = await supabase
        .from('driver_onboarding')
        .update({ selfie_url: data.path })
        .eq('id', session.user.id);
        
      if (dbError) throw dbError;

      alert('Selfie submitted successfully');
      navigation.replace('Terms');
    } catch (e: any) {
      console.error("Upload error details:", e);
      alert('Failed to upload selfie. ' + (e.message || JSON.stringify(e)));
    } finally {
      setLoading(false);
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><ActivityIndicator color="#10b981" /></View>;
  }
  if (hasPermission === false) {
    return <View style={styles.container}><Text style={{color: 'white'}}>No access to camera</Text></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Take a Selfie</Text>

      <View style={styles.guidelines}>
        <Info size={20} color="#3b82f6" style={{ marginTop: 2 }} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.guidelineText}>• Face must be clearly visible</Text>
          <Text style={styles.guidelineText}>• Ensure adequate lighting</Text>
          <Text style={styles.guidelineText}>• Plain or clear background</Text>
          <Text style={styles.guidelineText}>• No sunglasses or masks</Text>
        </View>
      </View>

      <View style={styles.cameraContainer}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.camera} />
        ) : (
          <CameraView style={styles.camera} facing="front" ref={cameraRef} />
        )}
      </View>

      <View style={styles.actions}>
        {photoUri ? (
          <>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => setPhotoUri(null)} disabled={loading}>
              <RefreshCw size={24} color="#f8fafc" />
              <Text style={styles.btnTextSecondary}>Retake</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={uploadAndSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#030712" /> : (
                <>
                  <Check size={24} color="#030712" />
                  <Text style={styles.btnTextPrimary}>Submit</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={takePicture}>
            <CameraIcon size={24} color="#030712" />
            <Text style={styles.btnTextPrimary}>Capture Photo</Text>
          </TouchableOpacity>
        )}
      </View>
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
    marginBottom: 24
  },
  guidelines: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1
  },
  guidelineText: {
    color: '#bfdbfe',
    fontSize: 14,
    marginBottom: 4,
    lineHeight: 20
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#0f172a'
  },
  camera: {
    flex: 1
  },
  actions: {
    flexDirection: 'row',
    gap: 16
  },
  btn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  btnPrimary: {
    backgroundColor: '#10b981'
  },
  btnSecondary: {
    backgroundColor: '#334155'
  },
  btnTextPrimary: {
    color: '#030712',
    fontSize: 16,
    fontWeight: 'bold'
  },
  btnTextSecondary: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold'
  }
});

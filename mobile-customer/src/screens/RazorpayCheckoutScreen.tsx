import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, SafeAreaView, Text, TouchableOpacity, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { theme } from '../theme';
import { failPendingPayment } from '../services/api';
import { useMobileAppContext } from '../context/MobileAppContext';

export default function RazorpayCheckoutScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { orderId, amount, isConversion } = route.params || {};
  const { refreshServerCart } = useMobileAppContext();

  const [rzpOrderId, setRzpOrderId] = useState<string | null>(null);
  const [rzpKeyId, setRzpKeyId] = useState<string>('rzp_test_NgwEwXk1hnhpL6');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initiateRazorpayOrder();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.type) {
            handleWebViewMessage({ nativeEvent: { data: JSON.stringify(data) } });
          }
        } catch (e) {
          // ignore non-matching messages
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }, [orderId, amount, rzpOrderId]);

  const initiateRazorpayOrder = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: { orderId: orderId, amount: amount }
      });
      if (error) {
        let msg = error.message;
        if ((error as any)?.context) {
          try {
            const body = await (error as any).context.json();
            if (body?.error) msg = body.error;
          } catch (e) {}
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (data?.orderId === undefined) throw new Error("Failed to get Razorpay order ID");
      
      if (data?.keyId) setRzpKeyId(data.keyId);
      setRzpOrderId(data.orderId);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Could not initialize payment");
    } finally {
      setLoading(false);
    }
  };

  const handleWebViewMessage = async (event: any) => {
    const message = typeof event.nativeEvent.data === 'string' 
      ? JSON.parse(event.nativeEvent.data) 
      : event.nativeEvent.data;
    
    if (message.type === 'SUCCESS') {
      try {
        setLoading(true);
        const { data, error } = await supabase.functions.invoke('verify-razorpay-payment', {
          body: {
            order_id: orderId,
            razorpay_order_id: message.razorpay_order_id,
            razorpay_payment_id: message.razorpay_payment_id,
            razorpay_signature: message.razorpay_signature,
            amount: amount
          }
        });

        if (error) {
          let msg = error.message;
          if ((error as any)?.context) {
            try {
              const body = await (error as any).context.json();
              if (body?.error) msg = body.error;
            } catch (e) {}
          }
          throw new Error(msg);
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        // Successfully paid!
        await refreshServerCart();

        if (isConversion) {
          navigation.goBack();
        } else {
          navigation.replace('OrderPlaced', { orderId });
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Payment verification failed");
        setLoading(false);
        try {
          await failPendingPayment(orderId);
          await refreshServerCart();
        } catch (e) {
          console.error("Failed to restore cart on verification failure:", e);
        }
      }
    } else if (message.type === 'DISMISSED') {
      try {
        await failPendingPayment(orderId);
        await refreshServerCart();
      } catch (e) {
        console.error("Failed to restore cart on dismiss:", e);
      }
      navigation.goBack();
    } else if (message.type === 'ERROR') {
      try {
        await failPendingPayment(orderId);
        await refreshServerCart();
      } catch (e) {
        console.error("Failed to restore cart on error:", e);
      }
      setError(message.error || "Payment failed");
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeft size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Error</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={initiateRazorpayOrder} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
          body { display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f9fafb; margin: 0; font-family: sans-serif; }
          .loader { border: 4px solid #f3f3f3; border-top: 4px solid #047857; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="loader" id="loader"></div>
        <script>
          function sendMsg(data) {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(JSON.stringify(data));
            } else if (window.parent && window.parent !== window) {
              window.parent.postMessage(JSON.stringify(data), '*');
            }
          }

          setTimeout(() => {
            var options = {
              "key": "${rzpKeyId}",
              "amount": "${Math.round(amount * 100)}", 
              "currency": "INR",
              "name": "FlashGO Private Limited",
              "description": "Order Payment",
              "image": "https://szpfuommfvrfdliloxcg.supabase.co/storage/v1/object/public/product-images/logo.png",
              ${rzpOrderId ? `"order_id": "${rzpOrderId}",` : ''}
              "handler": function (response) {
                sendMsg({
                  type: 'SUCCESS',
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature
                });
              },
              "prefill": {
                "name": "FlashGO Customer",
                "email": "customer@flashgo.in",
                "contact": "9999999999"
              },
              "theme": {
                "color": "#047857"
              },
              "modal": {
                "ondismiss": function() {
                  sendMsg({ type: 'DISMISSED' });
                }
              }
            };
            
            var rzp = new Razorpay(options);
            rzp.on('payment.failed', function (response){
              sendMsg({ type: 'ERROR', error: response.error.description });
            });
            document.getElementById('loader').style.display = 'none';
            rzp.open();
          }, 500);
        </script>
      </body>
    </html>
  `;

  return (
    <SafeAreaView style={styles.container}>
      {loading && !rzpOrderId ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Initializing secure payment...</Text>
        </View>
      ) : Platform.OS === 'web' ? (
        // @ts-ignore
        <iframe
          srcDoc={htmlContent}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      ) : (
        <WebView
          source={{ html: htmlContent }}
          onMessage={handleWebViewMessage}
          style={{ flex: 1 }}
        />
      )}
      
      {/* Loading overlay for verification */}
      {loading && rzpOrderId && (
         <View style={StyleSheet.absoluteFillObject}>
           <View style={[styles.center, { backgroundColor: 'rgba(255,255,255,0.9)', flex: 1 }]}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Verifying payment...</Text>
           </View>
         </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 16, color: theme.colors.textMuted },
  errorText: { fontSize: 16, color: theme.colors.danger, textAlign: 'center', marginBottom: 24 },
  retryBtn: {
    backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: 'bold' }
});

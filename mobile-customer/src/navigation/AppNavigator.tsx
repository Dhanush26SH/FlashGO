import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Package, HeadphonesIcon, User, RotateCcw, Grid, Printer, Heart } from 'lucide-react-native';
import { View, ActivityIndicator } from 'react-native';
import SplashScreen from '../components/SplashScreen';

import { useMobileAppContext } from '../context/MobileAppContext';
import { theme } from '../theme';

// Screens
import AuthScreen from '../screens/AuthScreen';
import HomeScreen from '../screens/HomeScreen';
import OrdersScreen from '../screens/OrdersScreen';
import SupportScreen from '../screens/SupportScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TrackingScreen from '../screens/TrackingScreen';
import AddressesScreen from '../screens/AddressesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProductDetailsScreen from '../screens/ProductDetailsScreen';
import OrderDetailsScreen from '../screens/OrderDetailsScreen';
import CategoryBrowserScreen from '../screens/CategoryBrowserScreen';
import OrderAgainScreen from '../screens/OrderAgainScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import PrintScreen from '../screens/PrintScreen';
import WishlistScreen from '../screens/WishlistScreen';
import LocationSelectorSheet from '../components/LocationSelectorSheet';
import ConfirmLocationScreen from '../screens/ConfirmLocationScreen';
import SeasonalBrowserScreen from '../screens/SeasonalBrowserScreen';
import DepartmentBrowserScreen from '../screens/DepartmentBrowserScreen';
import CartScreen from '../screens/CartScreen';
import PaymentOptionsScreen from '../screens/PaymentOptionsScreen';
import AddressDetailsScreen from '../screens/AddressDetailsScreen';
import OrderPlacedScreen from '../screens/OrderPlacedScreen';
import RazorpayCheckoutScreen from '../screens/RazorpayCheckoutScreen';
import AboutFlashGoScreen from '../screens/AboutFlashGoScreen';

// Types
export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  ProductDetails: { product: any };
  Tracking: { orderId: string | null };
  Addresses: { origin?: 'home' | 'checkout_address' } | undefined;
  Notifications: undefined;
  OrderDetails: { order: any };
  CategoryBrowser: { categoryId: string };
  DepartmentBrowser: { 
    departmentName: string; 
    categoryNames?: string[]; 
    filterTag?: string; 
    filterOrigin?: string;
  };
  SeasonalBrowser: { config: any };
  ConfirmLocation: { lat: number, lng: number, name: string, address: string, origin?: 'home' | 'checkout_address' };
  Profile: undefined;
  OrdersStack: undefined;
  SupportStack: undefined;
  Cart: undefined;
  PaymentOptions: { quote: any, couponCode: string | null, deliveryInstruction: string };
  LocationSelector: { origin?: 'home' | 'checkout_address' } | undefined;
  AddressDetails: { lat: number, lng: number, name: string, address: string, existingAddress?: any };
  OrderPlaced: { orderId: string };
  RazorpayCheckout: { orderId: string; amount: number; isConversion?: boolean };
  Print: undefined;
  AboutFlashGo: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  OrderAgain: undefined;
  Categories: undefined;
  Wishlist: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabNavigator() {
  return (
    <Tab.Navigator
      id="MainTabsNavigator"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          minHeight: 65,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 2,
          paddingBottom: 4,
        }
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />
        }}
      />
      <Tab.Screen 
        name="OrderAgain" 
        component={OrderAgainScreen} 
        options={{
          tabBarLabel: 'Order Again',
          tabBarIcon: ({ color, size }) => <RotateCcw size={size} color={color} />
        }}
      />
      <Tab.Screen 
        name="Categories" 
        component={CategoriesScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Grid size={size} color={color} />
        }}
      />
      <Tab.Screen 
        name="Wishlist" 
        component={WishlistScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Heart size={size} color={color} />
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { sessionUser, isLoadingSession } = useMobileAppContext();

  if (isLoadingSession) {
    return <SplashScreen />;
  }

  return (
    <>
      <Stack.Navigator id="RootStackNavigator" screenOptions={{ headerShown: false }}>
        {!sessionUser ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen name="Tracking" component={TrackingScreen} />
            <Stack.Screen name="Addresses" component={AddressesScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
            <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
            <Stack.Screen 
              name="CategoryBrowser" 
              component={CategoryBrowserScreen} 
              options={{ 
                presentation: 'transparentModal', 
                animation: 'slide_from_bottom' 
              }} 
            />
            <Stack.Screen 
              name="DepartmentBrowser" 
              component={DepartmentBrowserScreen} 
              options={{ 
                presentation: 'transparentModal', 
                animation: 'slide_from_bottom' 
              }} 
            />
            <Stack.Screen 
              name="SeasonalBrowser" 
              component={SeasonalBrowserScreen} 
              options={{ presentation: 'card' }}
            />
            <Stack.Screen 
              name="ConfirmLocation" 
              component={ConfirmLocationScreen} 
              options={{ 
                presentation: 'fullScreenModal',
                animation: 'slide_from_bottom'
              }} 
            />
            <Stack.Screen name="AddressDetails" component={AddressDetailsScreen} />
            <Stack.Screen 
              name="Profile" 
              component={ProfileScreen} 
              options={{ 
                presentation: 'transparentModal', 
                animation: 'slide_from_bottom' 
              }} 
            />
            <Stack.Screen name="AboutFlashGo" component={AboutFlashGoScreen} />
            <Stack.Screen name="OrdersStack" component={OrdersScreen} />
            <Stack.Screen name="SupportStack" component={SupportScreen} />
            <Stack.Screen name="Cart" component={CartScreen} />
            <Stack.Screen name="Print" component={PrintScreen} />
            <Stack.Screen name="PaymentOptions" component={PaymentOptionsScreen} />
            <Stack.Screen name="OrderPlaced" component={OrderPlacedScreen} />
            <Stack.Screen name="RazorpayCheckout" component={RazorpayCheckoutScreen} />
            <Stack.Screen 
              name="LocationSelector" 
              component={LocationSelectorSheet} 
              options={{ 
                presentation: 'transparentModal',
                animation: 'slide_from_bottom'
              }} 
            />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/Auth/LoginScreen';
import RequestAccessScreen from '../screens/Auth/RequestAccessScreen';
import PendingScreen from '../screens/Auth/PendingScreen';
import ProfileScreen from '../screens/Rider/DriverProfileScreen';
import MainTabs from './MainTabs';
import DriverMainTabs from './DriverMainTabs';
import WarehouseMainTabs from './WarehouseMainTabs';
import RiderDashboard from '../screens/Rider/RiderDashboard';
import SlotDetailsScreen from '../screens/Slots/SlotDetailsScreen';
import ScannerScreen from '../screens/Scanner/ScannerScreen';
import HandoverScreen from '../screens/Scanner/HandoverScreen';
import NotificationScreen from '../screens/Picker/NotificationScreen';
import TroubleshootScreen from '../screens/Picker/TroubleshootScreen';
import SelectLanguageScreen from '../screens/Profile/SelectLanguageScreen';
import PayoutsScreen from '../screens/Profile/PayoutsScreen';
import WarningsScreen from '../screens/Performance/WarningsScreen';
import PickerFaceVerificationScreen from '../screens/Picker/PickerFaceVerificationScreen';
import PickerFacePreviewScreen from '../screens/Picker/PickerFacePreviewScreen';
import WarehouseQRVerificationScreen from '../screens/Picker/WarehouseQRVerificationScreen';
import PickerShiftScreen from '../screens/Picker/PickerShiftScreen';
import PickingScreen from '../screens/Picker/PickingScreen';
import HandoverToDriverScreen from '../screens/Picker/HandoverToDriverScreen';
import DriverOnboardingNavigator from '../screens/DriverOnboarding/DriverOnboardingNavigator';
import DriverCheckInScreen from '../screens/Rider/DriverCheckInScreen';
import NavigationScreen from '../screens/Rider/NavigationScreen';
import DriverPickupScreen from '../screens/Rider/DriverPickupScreen';
import DriverReachDropScreen from '../screens/Rider/DriverReachDropScreen';
import DriverDropOrderScreen from '../screens/Rider/DriverDropOrderScreen';
import DriverDeliveryCompleteScreen from '../screens/Rider/DriverDeliveryCompleteScreen';
import DriverReturnToStoreScreen from '../screens/Rider/DriverReturnToStoreScreen';
import { View, Text } from 'react-native';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { role, profile, isLoading, session } = useAuth() as any;

  if (isLoading || (session && !profile)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{color: '#10b981', fontWeight: 'bold'}}>Loading FlashGO...</Text>
      </View>
    );
  }

  const renderScreens = () => {
    switch (role) {
      case 'auth':
        return <Stack.Screen name="Login" component={LoginScreen} />;
      case 'request_access':
        return <Stack.Screen name="RequestAccess" component={RequestAccessScreen} />;
      case 'pending':
        return <Stack.Screen name="Pending" component={PendingScreen} />;
      case 'driver_onboarding':
        return <Stack.Screen name="DriverOnboarding" component={DriverOnboardingNavigator} />;
      case 'driver':
        return (
          <>
            <Stack.Screen name="DriverMainTabs" component={DriverMainTabs} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="RiderDashboard" component={RiderDashboard} />
            <Stack.Screen name="Scanner" component={ScannerScreen} />
            <Stack.Screen name="Notification" component={NotificationScreen} />
            <Stack.Screen name="Troubleshoot" component={TroubleshootScreen} />
            <Stack.Screen name="SelectLanguage" component={SelectLanguageScreen} />
            <Stack.Screen name="Payouts" component={PayoutsScreen} />
            <Stack.Screen name="Warnings" component={WarningsScreen} />
            <Stack.Screen name="SlotDetails" component={SlotDetailsScreen} />
            <Stack.Screen name="DriverCheckInScreen" component={DriverCheckInScreen} />
            <Stack.Screen name="DriverOperationsMapScreen" component={require('../screens/Rider/DriverOperationsMapScreen').default} />
            <Stack.Screen name="DriverPickup" component={DriverPickupScreen} />
            <Stack.Screen name="DriverReachDropScreen" component={DriverReachDropScreen} />
            <Stack.Screen name="DriverDropOrderScreen" component={DriverDropOrderScreen} />
            <Stack.Screen name="DriverDeliveryCompleteScreen" component={DriverDeliveryCompleteScreen} />
            <Stack.Screen name="DriverReturnToStoreScreen" component={DriverReturnToStoreScreen} />
            <Stack.Screen name="NavigationScreen" component={NavigationScreen} />
            <Stack.Screen name="VehicleType" component={require('../screens/DriverOnboarding/UpdateVehicleDetailsScreen').default} />
          </>
        );
      case 'warehouse_staff':
        return (
          <>
            <Stack.Screen name="WarehouseMainTabs" component={WarehouseMainTabs} />
            <Stack.Screen name="Scanner" component={ScannerScreen} />
            <Stack.Screen name="Troubleshoot" component={TroubleshootScreen} />
          </>
        );
      case 'picker':
        return (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Scanner" component={ScannerScreen} />
            <Stack.Screen name="Handover" component={HandoverScreen} />
            <Stack.Screen name="Notification" component={NotificationScreen} />
            <Stack.Screen name="Troubleshoot" component={TroubleshootScreen} />
            <Stack.Screen name="SelectLanguage" component={SelectLanguageScreen} />
            <Stack.Screen name="Payouts" component={PayoutsScreen} />
            <Stack.Screen name="Warnings" component={WarningsScreen} />
            <Stack.Screen name="SlotDetails" component={SlotDetailsScreen} />
            <Stack.Screen name="PickerFaceVerification" component={PickerFaceVerificationScreen} />
            <Stack.Screen name="PickerFacePreview" component={PickerFacePreviewScreen} />
            <Stack.Screen name="WarehouseQRVerification" component={WarehouseQRVerificationScreen} />
            <Stack.Screen name="PickerShift" component={PickerShiftScreen} />
            <Stack.Screen name="Picking" component={PickingScreen} />
            <Stack.Screen name="HandoverToDriver" component={HandoverToDriverScreen} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <NavigationContainer fallback={<Text>Nav Loading...</Text>}>
      <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
        {renderScreens()}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

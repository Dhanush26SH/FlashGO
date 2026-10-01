import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/Auth/LoginScreen';
import RequestAccessScreen from '../screens/Auth/RequestAccessScreen';
import PendingScreen from '../screens/Auth/PendingScreen';
import RetiredScreen from '../screens/Auth/RetiredScreen';
import ProfileScreen from '../screens/Rider/DriverProfileScreen';
import MainTabs from './MainTabs';
import DriverMainTabs from './DriverMainTabs';
import WarehouseMainTabs from './WarehouseMainTabs';
import RiderDashboard from '../screens/Rider/RiderDashboard';
import DriverPayoutsScreen from '../screens/Rider/DriverPayoutsScreen';
import SlotDetailsScreen from '../screens/Slots/SlotDetailsScreen';
import ScannerScreen from '../screens/Scanner/ScannerScreen';
import HandoverScreen from '../screens/Scanner/HandoverScreen';
import NotificationScreen from '../screens/Picker/NotificationScreen';
import TroubleshootScreen from '../screens/Picker/TroubleshootScreen';
import WarehousePayrollScreen from '../screens/Warehouse/WarehousePayrollScreen';
import SelectLanguageScreen from '../screens/Profile/SelectLanguageScreen';
import PayoutsScreen from '../screens/Profile/PayoutsScreen';
import BankDetailsScreen from '../screens/Profile/BankDetailsScreen';
import EditBankDetailsScreen from '../screens/Profile/EditBankDetailsScreen';
import WarningsScreen from '../screens/Performance/WarningsScreen';
import PickerFaceVerificationScreen from '../screens/Picker/PickerFaceVerificationScreen';
import PickerFacePreviewScreen from '../screens/Picker/PickerFacePreviewScreen';
import WarehouseQRVerificationScreen from '../screens/Picker/WarehouseQRVerificationScreen';
import PickerShiftScreen from '../screens/Picker/PickerShiftScreen';
import PickingScreen from '../screens/Picker/PickingScreen';
import HandoverToDriverScreen from '../screens/Picker/HandoverToDriverScreen';
import WeeklyItemTargetScreen from '../screens/Offers/WeeklyItemTargetScreen';
import PickerBonusOfferDetailScreen from '../screens/Offers/PickerBonusOfferDetailScreen';
import DriverOnboardingNavigator from '../screens/DriverOnboarding/DriverOnboardingNavigator';
import DriverCheckInScreen from '../screens/Rider/DriverCheckInScreen';
import NavigationScreen from '../screens/Rider/NavigationScreen';
import DriverPickupScreen from '../screens/Rider/DriverPickupScreen';
import DriverReachDropScreen from '../screens/Rider/DriverReachDropScreen';
import DriverDropOrderScreen from '../screens/Rider/DriverDropOrderScreen';
import DriverDeliveryCompleteScreen from '../screens/Rider/DriverDeliveryCompleteScreen';
import DriverReturnToStoreScreen from '../screens/Rider/DriverReturnToStoreScreen';
import CustomerReturnPickupScreen from '../screens/Rider/CustomerReturnPickupScreen';
import DeliveryHistoryScreen from '../screens/Rider/DeliveryHistoryScreen';
import WarehouseStaffQRScreen from '../screens/Warehouse/WarehouseStaffQRScreen';
import WarehouseReturnQRScannerScreen from '../screens/Warehouse/WarehouseReturnQRScannerScreen';
import ReturnIntakeSummaryScreen from '../screens/Warehouse/ReturnIntakeSummaryScreen';
import ReturnItemScannerScreen from '../screens/Warehouse/ReturnItemScannerScreen';
import CustomerReturnIntakePreviewScreen from '../screens/Warehouse/CustomerReturnIntakePreviewScreen';
import DriverReturnHandoverScreen from '../screens/Rider/DriverReturnHandoverScreen';
import OnboardingBankDetailsScreen from '../screens/Auth/OnboardingBankDetailsScreen';
import StaffSupportListScreen from '../screens/Shared/StaffSupportListScreen';
import StaffSupportCreateScreen from '../screens/Shared/StaffSupportCreateScreen';
import StaffSupportChatScreen from '../screens/Shared/StaffSupportChatScreen';
import StaffRatingScreen from '../screens/Profile/StaffRatingScreen';
import { View, Text } from 'react-native';
import SplashScreen from '../components/SplashScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { role, profile, isLoading, session } = useAuth() as any;

  if (isLoading || (session && !profile)) {
    return <SplashScreen />;
  }

  const renderScreens = () => {
    switch (role) {
      case 'auth':
        return <Stack.Screen name="Login" component={LoginScreen} />;
      case 'request_access':
        return (
          <>
            <Stack.Screen name="RequestAccess" component={RequestAccessScreen} />
            <Stack.Screen name="OnboardingBankDetails" component={OnboardingBankDetailsScreen} />
          </>
        );
      case 'pending':
        return <Stack.Screen name="Pending" component={PendingScreen} />;
      case 'retired':
        return <Stack.Screen name="Retired" component={RetiredScreen} />;
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
            <Stack.Screen name="BankDetails" component={BankDetailsScreen} />
            <Stack.Screen name="EditBankDetails" component={EditBankDetailsScreen} />
            <Stack.Screen name="DriverPayouts" component={DriverPayoutsScreen} />
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
            <Stack.Screen name="CustomerReturnPickupScreen" component={CustomerReturnPickupScreen} />
            <Stack.Screen name="DriverReturnHandoverScreen" component={DriverReturnHandoverScreen} />
            <Stack.Screen name="NavigationScreen" component={NavigationScreen} />
            <Stack.Screen name="VehicleType" component={require('../screens/DriverOnboarding/UpdateVehicleDetailsScreen').default} />
            <Stack.Screen name="DeliveryHistory" component={DeliveryHistoryScreen} />
            <Stack.Screen name="DriverDropZoneScanScreen" component={require('../screens/Rider/DriverDropZoneScanScreen').default} />
            <Stack.Screen name="StaffSupportList" component={StaffSupportListScreen} />
            <Stack.Screen name="StaffSupportCreate" component={StaffSupportCreateScreen} />
            <Stack.Screen name="StaffSupportChat" component={StaffSupportChatScreen} />
            <Stack.Screen name="StaffRating" component={StaffRatingScreen} />
          </>
        );
      case 'warehouse_staff':
        return (
          <>
            <Stack.Screen name="WarehouseMainTabs" component={WarehouseMainTabs} />
            <Stack.Screen name="WarehouseStaffQRScreen" component={WarehouseStaffQRScreen} />
            <Stack.Screen name="WarehouseReturnQRScannerScreen" component={WarehouseReturnQRScannerScreen} />
            <Stack.Screen name="ReturnIntakeSummaryScreen" component={ReturnIntakeSummaryScreen} />
            <Stack.Screen name="CustomerReturnIntakePreviewScreen" component={CustomerReturnIntakePreviewScreen} />
            <Stack.Screen name="ReturnItemScannerScreen" component={ReturnItemScannerScreen} />
            <Stack.Screen name="Scanner" component={ScannerScreen} />
            <Stack.Screen name="Troubleshoot" component={TroubleshootScreen} />
            <Stack.Screen name="BankDetails" component={BankDetailsScreen} />
            <Stack.Screen name="EditBankDetails" component={EditBankDetailsScreen} />
            <Stack.Screen name="WarehousePayroll" component={WarehousePayrollScreen} />
            <Stack.Screen name="StaffSupportList" component={StaffSupportListScreen} />
            <Stack.Screen name="StaffSupportCreate" component={StaffSupportCreateScreen} />
            <Stack.Screen name="StaffSupportChat" component={StaffSupportChatScreen} />
            <Stack.Screen name="StaffRating" component={StaffRatingScreen} />
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
            <Stack.Screen name="BankDetails" component={BankDetailsScreen} />
            <Stack.Screen name="EditBankDetails" component={EditBankDetailsScreen} />
            <Stack.Screen name="Payouts" component={PayoutsScreen} />
            <Stack.Screen name="Warnings" component={WarningsScreen} />
            <Stack.Screen name="SlotDetails" component={SlotDetailsScreen} />
            <Stack.Screen name="PickerFaceVerification" component={PickerFaceVerificationScreen} />
            <Stack.Screen name="PickerFacePreview" component={PickerFacePreviewScreen} />
            <Stack.Screen name="WarehouseQRVerification" component={WarehouseQRVerificationScreen} />
            <Stack.Screen name="PickerShift" component={PickerShiftScreen} />
            <Stack.Screen name="Picking" component={PickingScreen} />
            <Stack.Screen name="HandoverToDriver" component={HandoverToDriverScreen} />
            <Stack.Screen name="WeeklyItemTargetScreen" component={WeeklyItemTargetScreen} />
            <Stack.Screen name="PickerBonusOfferDetailScreen" component={PickerBonusOfferDetailScreen} />
            <Stack.Screen name="PickerDropZoneScanScreen" component={require('../screens/Picker/PickerDropZoneScanScreen').default} />
            <Stack.Screen name="StaffSupportList" component={StaffSupportListScreen} />
            <Stack.Screen name="StaffSupportCreate" component={StaffSupportCreateScreen} />
            <Stack.Screen name="StaffSupportChat" component={StaffSupportChatScreen} />
            <Stack.Screen name="StaffRating" component={StaffRatingScreen} />
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

import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

import LocationPermissionScreen from './LocationPermissionScreen';
import NotificationPermissionScreen from './NotificationPermissionScreen';
import LanguageSelectionScreen from './LanguageSelectionScreen';
import WorkAreaScreen from './WorkAreaScreen';
import WorkTypeScreen from './WorkTypeScreen';
import WarehouseSelectionScreen from './WarehouseSelectionScreen';
import PayoutMethodScreen from './PayoutMethodScreen';
import SelfieCaptureScreen from './SelfieCaptureScreen';
import TermsScreen from './TermsScreen';
import VerificationDashboardScreen from './VerificationDashboardScreen';
import NomineeDetailsScreen from './NomineeDetailsScreen';
import RecheckDetailsScreen from './RecheckDetailsScreen';

export type DriverOnboardingStackParamList = {
  LocationPermission: undefined;
  NotificationPermission: undefined;
  LanguageSelection: undefined;
  PersonalDetails: undefined;
  WorkArea: undefined;
  WorkType: undefined;
  WarehouseSelection: undefined;
  PayoutMethod: undefined;
  SelfieCapture: undefined;
  Terms: undefined;
  NomineeDetails: undefined;
  VerificationDashboard: undefined;
  RecheckDetails: undefined;
};

const Stack = createStackNavigator<DriverOnboardingStackParamList>();

export default function DriverOnboardingNavigator() {
  const { session } = useAuth();
  const [initialRoute, setInitialRoute] = useState<keyof DriverOnboardingStackParamList | null>(null);

  useEffect(() => {
    const fetchProgress = async () => {
      if (!session?.user?.id) return;
      
      const { data, error } = await supabase
        .from('driver_onboarding')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // No record yet, create one
        await supabase.from('driver_onboarding').insert({ id: session.user.id, status: 'in_progress' });
        setInitialRoute('LocationPermission');
        return;
      }

      if (data) {
        if (['submitted', 'under_review', 'approved', 'rejected', 'changes_requested'].includes(data.status)) {
          setInitialRoute('VerificationDashboard');
          return;
        }

        // Determine resume point based on completed fields
        if (!data.location_permission_granted) { setInitialRoute('LocationPermission'); return; }
        if (!data.notification_permission_granted) { setInitialRoute('NotificationPermission'); return; }
        if (!data.language_pref) { setInitialRoute('LanguageSelection'); return; }
        if (!data.vehicle_type) { setInitialRoute('PersonalDetails'); return; }
        if (!data.work_area) { setInitialRoute('WorkArea'); return; }
        if (!data.work_type) { setInitialRoute('WorkType'); return; }
        if (!data.warehouse_id) { setInitialRoute('WarehouseSelection'); return; }
        
        // Next, check payout details
        const { data: payout } = await supabase.from('driver_payout_details').select('driver_id').eq('driver_id', session.user.id).single();
        if (!payout) { setInitialRoute('PayoutMethod'); return; }

        if (!data.selfie_url) { setInitialRoute('SelfieCapture'); return; }
        
        // Terms
        const { data: terms } = await supabase.from('driver_agreement_acceptances').select('driver_id').eq('driver_id', session.user.id).single();
        if (!terms) { setInitialRoute('Terms'); return; }

        // If we reach here, base onboarding is done, but they might be missing nominee.
        // We route them to VerificationDashboard where they can complete the rest.
        setInitialRoute('VerificationDashboard');
      }
    };
    fetchProgress();
  }, [session]);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <Stack.Navigator id="DriverOnboardingStack" initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LocationPermission" component={LocationPermissionScreen} />
      <Stack.Screen name="NotificationPermission" component={NotificationPermissionScreen} />
      <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
      <Stack.Screen name="PersonalDetails" component={require('./PersonalDetailsScreen').default} />
      <Stack.Screen name="WorkArea" component={WorkAreaScreen} />
      <Stack.Screen name="WorkType" component={WorkTypeScreen} />
      <Stack.Screen name="WarehouseSelection" component={WarehouseSelectionScreen} />
      <Stack.Screen name="PayoutMethod" component={PayoutMethodScreen} />
      <Stack.Screen name="SelfieCapture" component={SelfieCaptureScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="VerificationDashboard" component={VerificationDashboardScreen} />
      <Stack.Screen name="NomineeDetails" component={NomineeDetailsScreen} />
      <Stack.Screen name="RecheckDetails" component={RecheckDetailsScreen} />
    </Stack.Navigator>
  );
}

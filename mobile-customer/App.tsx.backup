import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { MobileAppProvider } from './src/context/MobileAppContext';
import AppNavigator from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';

export default function App() {
  return (
    <MobileAppProvider>
      <NavigationContainer ref={navigationRef}>
        <AppNavigator />
      </NavigationContainer>
    </MobileAppProvider>
  );
}

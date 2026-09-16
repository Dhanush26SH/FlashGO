import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClipboardList, TrendingUp, Percent, User, Calendar } from 'lucide-react-native';
import PickerDashboard from '../screens/Picker/PickerDashboard';
import SlotsScreen from '../screens/Slots/SlotsScreen';
import ProfileScreen from '../screens/Rider/DriverProfileScreen';
import PickerProfileScreen from '../screens/Picker/PickerProfileScreen';
import OffersScreen from '../screens/Offers/OffersScreen';
import { useAuth } from '../context/AuthContext';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  const { profile } = useAuth();

  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
        },
        tabBarActiveTintColor: '#1f2937',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tab.Screen 
        name="Task" 
        component={PickerDashboard} 
        options={{
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Slots" 
        component={SlotsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />
        }}
      />

      <Tab.Screen 
        name="Offers" 
        component={OffersScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Percent color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={profile?.role === 'picker' ? PickerProfileScreen : ProfileScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />
        }}
      />
    </Tab.Navigator>
  );
}

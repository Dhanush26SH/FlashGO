import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { List, Wallet, CalendarDays } from 'lucide-react-native';
import FeedScreen from '../screens/Rider/FeedScreen';
import PocketScreen from '../screens/Rider/PocketScreen';
import GigsScreen from '../screens/Rider/GigsScreen';

const Tab = createBottomTabNavigator();

export default function DriverMainTabs() {
  return (
    <Tab.Navigator
      id="DriverTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopWidth: 1,
          borderTopColor: '#262626',
          paddingBottom: 4,
          paddingTop: 4,
          height: 60,
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#737373',
      }}
    >
      <Tab.Screen 
        name="Feed" 
        component={FeedScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Pocket" 
        component={PocketScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Gigs" 
        component={GigsScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />
        }}
      />
    </Tab.Navigator>
  );
}

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, Package, Layers, User } from 'lucide-react-native';
import WarehouseTaskScreen from '../screens/Warehouse/WarehouseTaskScreen';

import WarehouseProfile from '../screens/Warehouse/WarehouseProfile';

const Tab = createBottomTabNavigator();

export default function WarehouseMainTabs() {
  return (
    <Tab.Navigator
      id="WarehouseMainTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopWidth: 1,
          borderTopColor: '#1e293b',
        },
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tab.Screen 
        name="Task" 
        component={WarehouseTaskScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={WarehouseProfile} 
        options={{
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />
        }}
      />
    </Tab.Navigator>
  );
}

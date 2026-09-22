import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, Package, Layers, User } from 'lucide-react-native';
import WarehouseTaskScreen from '../screens/Warehouse/WarehouseTaskScreen';

import WarehouseProfileScreen from '../screens/Warehouse/WarehouseProfileScreen';

const Tab = createBottomTabNavigator();

export default function WarehouseMainTabs() {
  return (
    <Tab.Navigator
      id="WarehouseMainTabs"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
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
        component={WarehouseProfileScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />
        }}
      />
    </Tab.Navigator>
  );
}

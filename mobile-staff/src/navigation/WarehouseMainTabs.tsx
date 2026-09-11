import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, Package, ArrowDownToLine, Layers, User } from 'lucide-react-native';
import WarehouseDashboard from '../screens/Warehouse/WarehouseDashboard';
import WarehouseInventory from '../screens/Warehouse/WarehouseInventory';
import WarehouseReceive from '../screens/Warehouse/WarehouseReceive';
import WarehouseBatches from '../screens/Warehouse/WarehouseBatches';
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
        name="Dashboard" 
        component={WarehouseDashboard} 
        options={{
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Inventory" 
        component={WarehouseInventory} 
        options={{
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Inward" 
        component={WarehouseReceive} 
        options={{
          tabBarIcon: ({ color, size }) => <ArrowDownToLine color={color} size={size} />
        }}
      />
      <Tab.Screen 
        name="Batches" 
        component={WarehouseBatches} 
        options={{
          tabBarIcon: ({ color, size }) => <Layers color={color} size={size} />
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

import { supabase } from './supabaseClient';

export interface Vehicle {
  id: string;
  license_plate: string;
  vehicle_type: string;
  warehouse_id?: string | null;
  ownership_type?: 'driver_owned' | 'company_owned';
  owner_driver_id?: string | null;
  status: 'active' | 'maintenance' | 'inactive' | 'pending';
  created_at?: string;
  updated_at?: string;
}

export interface DriverCompliance {
  driver_id: string;
  dl_number?: string;
  dl_expiry?: string | null;
  insurance_expiry?: string | null;
  rc_expiry?: string | null;
  bg_check_status: 'pending' | 'cleared' | 'failed';
}

export class FleetService {
  static async getVehicles(): Promise<Vehicle[]> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching vehicles:', error);
      throw error;
    }
    
    return data as Vehicle[];
  }

  static async getDriverComplianceRecords(): Promise<DriverCompliance[]> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase
      .from('driver_compliance')
      .select('*');
      
    if (error) {
      console.error('Error fetching driver compliance:', error);
      throw error;
    }
    
    return data as DriverCompliance[];
  }

  static async getDriverCompliance(driverId: string): Promise<DriverCompliance | null> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase
      .from('driver_compliance')
      .select('*')
      .eq('driver_id', driverId)
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned
      console.error('Error fetching driver compliance:', error);
      throw error;
    }
    
    return data as DriverCompliance | null;
  }

  static async addVehicle(vehicle: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>): Promise<Vehicle> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase
      .from('vehicles')
      .insert(vehicle)
      .select()
      .single();
      
    if (error) {
      console.error('Error adding vehicle:', error);
      throw error;
    }
    
    return data as Vehicle;
  }

  static async updateVehicle(id: string, updates: Partial<Vehicle>): Promise<Vehicle> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase
      .from('vehicles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating vehicle:', error);
      throw error;
    }
    
    return data as Vehicle;
  }

  static async upsertDriverCompliance(compliance: DriverCompliance): Promise<DriverCompliance> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { data, error } = await supabase
      .from('driver_compliance')
      .upsert(compliance)
      .select()
      .single();
      
    if (error) {
      console.error('Error upserting driver compliance:', error);
      throw error;
    }
    
    return data as DriverCompliance;
  }

  static async assignVehicle(driverId: string, vehicleId: string | null): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    const { error } = await supabase.rpc('assign_vehicle', {
      p_driver_id: driverId,
      p_vehicle_id: vehicleId
    });
    
    if (error) {
      console.error('Error assigning vehicle:', error);
      throw error;
    }
  }

  static async approveDriverVehicle(driverId: string, vehicleId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');
    
    // Set vehicle to active
    await this.updateVehicle(vehicleId, { status: 'active' });
    
    // Assign vehicle
    await this.assignVehicle(driverId, vehicleId);
  }
}

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { WorkSlotService } from '../services/api/WorkSlotService';
import type { WorkSlot } from '../services/api/WorkSlotService';
import { Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

export const WorkSlotScheduler: React.FC = () => {
  const { addToast } = useApp();
  const [activeTab, setActiveTab] = useState<'available' | 'myslots'>('available');
  const [availableSlots, setAvailableSlots] = useState<WorkSlot[]>([]);
  const [mySlots, setMySlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const avail = await WorkSlotService.getAvailableWorkSlots();
      setAvailableSlots(avail);
      
      const mine = await WorkSlotService.getMyWorkSlots();
      setMySlots(mine);
    } catch (e: any) {
      console.error(e);
      // fallback handled gracefully by UI
    } finally {
      setLoading(false);
    }
  };

  const handleBook = async (slotId: string) => {
    try {
      await WorkSlotService.workerBookSlot(slotId);
      addToast('Slot booked successfully!', 'success');
      loadData();
    } catch (e: any) {
      addToast(e.message || 'Failed to book slot', 'error');
    }
  };

  const handleCancel = async (shiftId: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    try {
      await WorkSlotService.workerCancelBooking(shiftId);
      addToast('Booking cancelled', 'success');
      loadData();
    } catch (e: any) {
      addToast(e.message || 'Failed to cancel booking', 'error');
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Calendar size={24} color="var(--primary)" />
        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Schedule & Work Slots</h3>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button 
          onClick={() => setActiveTab('available')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'available' ? 'var(--primary)' : 'transparent', color: activeTab === 'available' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Available Slots
        </button>
        <button 
          onClick={() => setActiveTab('myslots')}
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: activeTab === 'myslots' ? 'var(--primary)' : 'transparent', color: activeTab === 'myslots' ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          My Bookings
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>Loading schedule...</div>
      ) : activeTab === 'available' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {availableSlots.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px', backgroundColor: 'var(--bg-base)', borderRadius: '8px' }}>
              No available slots found for your role and warehouse.
            </div>
          ) : (
            availableSlots.map(slot => (
              <div key={slot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0' }}>{new Date(slot.start_time).toLocaleDateString()}</h4>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {new Date(slot.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(slot.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '4px', fontWeight: 'bold' }}>
                    {slot.capacity - slot.booked_count} spots left
                  </div>
                </div>
                <button 
                  onClick={() => handleBook(slot.id)}
                  style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Book Slot
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mySlots.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px', backgroundColor: 'var(--bg-base)', borderRadius: '8px' }}>
              You have no upcoming or past bookings.
            </div>
          ) : (
            mySlots.map(shift => (
              <div key={shift.shift_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-base)', borderRadius: '8px', border: '1px solid var(--border-light)', opacity: shift.status === 'cancelled' ? 0.6 : 1 }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0' }}>{new Date(shift.shift_start).toLocaleDateString()}</h4>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {new Date(shift.shift_start).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(shift.shift_end).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', marginTop: '4px', fontWeight: 'bold', color: shift.status === 'scheduled' ? 'var(--info)' : shift.status === 'cancelled' ? 'var(--danger)' : '#10b981' }}>
                    {shift.status === 'scheduled' && <Calendar size={12} />}
                    {shift.status === 'cancelled' && <AlertCircle size={12} />}
                    {(shift.status === 'present' || shift.status === 'absent') && <CheckCircle2 size={12} />}
                    {shift.status.toUpperCase()}
                  </div>
                </div>
                {shift.status === 'scheduled' && new Date(shift.shift_start) > new Date() && (
                  <button 
                    onClick={() => handleCancel(shift.shift_id)}
                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

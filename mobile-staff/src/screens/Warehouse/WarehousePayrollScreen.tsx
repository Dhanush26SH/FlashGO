import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { ChevronLeft, ChevronRight, ReceiptText, CheckCircle2, Clock } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function WarehousePayrollScreen() {
  const navigation = useNavigation();
  const { profile } = useAuth();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [payrollRecord, setPayrollRecord] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPayrollForMonth(selectedDate);
  }, [profile, selectedDate]);

  const fetchPayrollForMonth = async (date: Date) => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      
      const year = date.getFullYear();
      const month = date.getMonth();
      const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('warehouse_staff_payroll')
        .select(`
          id,
          salary_month,
          base_salary,
          additions,
          deductions,
          net_salary,
          status,
          paid_at
        `)
        .eq('staff_id', profile.id)
        .gte('salary_month', startOfMonth)
        .lte('salary_month', endOfMonth)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setPayrollRecord(data);
    } catch (error) {
      console.error('Error fetching payroll', error);
      setPayrollRecord(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  const formatCurrency = (amount: number) => {
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  };

  const formatMonth = (date: Date) => {
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Pending';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const renderMonthSelector = () => (
    <View style={styles.monthSelector}>
      <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowButton}>
        <ChevronLeft size={24} color="#374151" />
      </TouchableOpacity>
      <Text style={styles.monthSelectorText}>{formatMonth(selectedDate)}</Text>
      <TouchableOpacity onPress={handleNextMonth} style={styles.arrowButton}>
        <ChevronRight size={24} color="#374151" />
      </TouchableOpacity>
    </View>
  );

  const renderPayrollRecord = () => {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      );
    }

    if (!payrollRecord) {
      return (
        <View style={styles.emptyContainer}>
          <ReceiptText size={48} color="#9ca3af" />
          <Text style={styles.emptyTitle}>No Payroll Record</Text>
          <Text style={styles.emptyText}>No payroll generated for this month.</Text>
        </View>
      );
    }

    const item = payrollRecord;
    const isPaid = item.status === 'paid';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <ReceiptText size={20} color="#10b981" />
            </View>
            <Text style={styles.monthText}>Salary Details</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: isPaid ? '#d1fae5' : '#fef3c7' }]}>
            {isPaid ? (
              <CheckCircle2 size={12} color="#059669" style={{ marginRight: 4 }} />
            ) : (
              <Clock size={12} color="#d97706" style={{ marginRight: 4 }} />
            )}
            <Text style={[styles.statusText, { color: isPaid ? '#059669' : '#d97706' }]}>
              {isPaid ? 'Paid' : 'Pending'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Base Salary</Text>
            <Text style={styles.detailValue}>{formatCurrency(item.base_salary)}</Text>
          </View>
          
          {(item.additions > 0 || item.deductions > 0) && (
            <>
              {item.additions > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Additions</Text>
                  <Text style={[styles.detailValue, { color: '#10b981' }]}>+{formatCurrency(item.additions)}</Text>
                </View>
              )}
              {item.deductions > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Deductions</Text>
                  <Text style={[styles.detailValue, { color: '#ef4444' }]}>-{formatCurrency(item.deductions)}</Text>
                </View>
              )}
            </>
          )}

          <View style={[styles.detailRow, styles.netRow]}>
            <Text style={styles.netLabel}>Net Pay</Text>
            <Text style={styles.netValue}>{formatCurrency(item.net_salary)}</Text>
          </View>
        </View>

        {isPaid && item.paid_at && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>Paid on {formatDate(item.paid_at)}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color="#111827" /> Payments
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {renderMonthSelector()}
        {renderPayrollRecord()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
  },
  center: {
    padding: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  monthSelectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  arrowButton: {
    padding: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  detailsContainer: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  netRow: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    marginBottom: 0,
  },
  netLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  netValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  footer: {
    backgroundColor: '#f9fafb',
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  footerText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});

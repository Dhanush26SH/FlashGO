import React, { useState, useMemo } from 'react';
import { Search, Download, ChevronUp, ChevronDown, Filter, Calendar } from 'lucide-react';
import { AdminInput, AdminSelect, AdminButton } from './FormComponents';

export interface ColumnDef<T> {
  key: Extract<keyof T, string> | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;
  searchPlaceholder?: string;
  onBulkAction?: (action: string, selectedIds: string[]) => void;
  bulkActions?: { label: string; value: string }[];
  exportFilename?: string;
  filterableColumns?: { key: Extract<keyof T, string>; label: string; options: { label: string; value: string }[] }[];
  onRowClick?: (row: T) => void;
  selectedRowId?: string;
  dateFilterMode?: 'none' | 'single' | 'range';
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  searchPlaceholder = 'Search...',
  onBulkAction,
  bulkActions = [],
  exportFilename = 'export',
  filterableColumns = [],
  onRowClick,
  selectedRowId,
  dateFilterMode = 'range'
}: DataTableProps<T>) {
  
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedBulkAction, setSelectedBulkAction] = useState('');
  
  // Filtering states
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const rowsPerPage = 10;

  // Compute processed data (filter -> sort -> paginate)
  const processedData = useMemo(() => {
    let filteredData = data;

    // 1. Global Search
    if (search.trim()) {
      const q = search.toLowerCase();
      filteredData = filteredData.filter(row => 
        Object.values(row).some(val => String(val).toLowerCase().includes(q))
      );
    }

    // 2. Column Filters
    Object.entries(filters).forEach(([key, val]) => {
      if (val) {
        filteredData = filteredData.filter(row => String(row[key]) === val);
      }
    });

    // 3. Date Range (assuming rows have a created_at or date field)
    if (dateRange.start || dateRange.end) {
      filteredData = filteredData.filter(row => {
        const rowDateStr = row.created_at || row.date || row.timestamp;
        if (!rowDateStr) return true; // skip if no date field
        const rowTime = new Date(rowDateStr).getTime();
        
        // Parse explicitly using +05:30 (IST) boundaries regardless of device timezone
        const start = dateRange.start ? new Date(`${dateRange.start}T00:00:00+05:30`).getTime() : 0;
        const end = dateRange.end ? new Date(`${dateRange.end}T23:59:59.999+05:30`).getTime() : Infinity;
        
        return rowTime >= start && rowTime <= end;
      });
    }

    // 4. Sort
    if (sortConfig) {
      filteredData.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filteredData;
  }, [data, search, sortConfig, filters, dateRange]);

  const totalPages = Math.ceil(processedData.length / rowsPerPage);
  const paginatedData = processedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedData.length && paginatedData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map(keyExtractor)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleApplyBulkAction = () => {
    if (onBulkAction && selectedBulkAction && selectedIds.size > 0) {
      onBulkAction(selectedBulkAction, Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectedBulkAction('');
    }
  };

  const exportCSV = () => {
    if (processedData.length === 0) return;
    const headers = columns.map(c => c.header).join(',');
    const csvRows = processedData.map(row => 
      columns.map(c => {
        let val = row[c.key];
        // Handle objects or arrays roughly
        if (typeof val === 'object') val = JSON.stringify(val) as any;
        // Escape quotes
        const strVal = String(val).replace(/"/g, '""');
        return `"${strVal}"`;
      }).join(',')
    );
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${exportFilename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-panel" style={{ padding: '0', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', borderBottom: '1px solid var(--border-light)' }}>
        
        {/* Search */}
        <div style={{ flex: '1 1 250px', position: 'relative' }}>
          <Search size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '10px', top: '35px' }} />
          <AdminInput 
            label="Search" 
            placeholder={searchPlaceholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '32px' }}
          />
        </div>

        {/* Dynamic Filters */}
        {filterableColumns.map(col => (
          <div key={col.key as string} style={{ width: '150px' }}>
            <AdminSelect 
              label={col.label}
              options={col.options}
              value={filters[col.key as string] || ''}
              onChange={e => setFilters(prev => ({ ...prev, [col.key as string]: e.target.value }))}
            />
          </div>
        ))}

        {/* Date Filter */}
        {dateFilterMode === 'range' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <AdminInput 
              type="date" 
              label="Start Date" 
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            />
            <AdminInput 
              type="date" 
              label="End Date" 
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            />
          </div>
        )}
        
        {dateFilterMode === 'single' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <AdminInput 
              type="date" 
              label="Date" 
              value={dateRange.start}
              onChange={e => setDateRange({ start: e.target.value, end: e.target.value })}
            />
          </div>
        )}

        <AdminButton onClick={exportCSV} icon={<Download size={14} />}>
          Export CSV
        </AdminButton>
      </div>

      {/* Bulk Actions */}
      {bulkActions.length > 0 && selectedIds.size > 0 && (
        <div style={{ padding: '12px 16px', backgroundColor: 'var(--primary-glow)', display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--border-light)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
            {selectedIds.size} selected
          </span>
          <div style={{ width: '220px' }}>
            <AdminSelect 
              label=""
              value={selectedBulkAction}
              onChange={e => setSelectedBulkAction(e.target.value)}
              options={bulkActions}
              style={{ height: '32px', padding: '4px 8px' }}
            />
          </div>
          <AdminButton variant="primary" onClick={handleApplyBulkAction} disabled={!selectedBulkAction}>
            Apply
          </AdminButton>
        </div>
      )}

      {/* Table Wrapper */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-light)', backgroundColor: 'var(--bg-base)' }}>
              {bulkActions.length > 0 && (
                <th style={{ padding: '12px 16px', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={paginatedData.length > 0 && selectedIds.size === paginatedData.length}
                    onChange={toggleSelectAll}
                  />
                </th>
              )}
              {columns.map(col => (
                <th 
                  key={col.key as string}
                  style={{ 
                    padding: '12px 16px', 
                    fontSize: '0.7rem', 
                    fontWeight: 800, 
                    color: 'var(--text-secondary)',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => col.sortable && handleSort(col.key as string)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {col.header}
                    {col.sortable && sortConfig?.key === col.key && (
                      sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? paginatedData.map(row => {
              const id = keyExtractor(row);
              const isSelected = selectedIds.has(id);
              const isRowActive = selectedRowId === id;
              return (
                <tr 
                  key={id} 
                  onClick={() => onRowClick && onRowClick(row)}
                  style={{ 
                    borderBottom: '1px solid var(--border-light)',
                    backgroundColor: isSelected || isRowActive ? 'var(--primary-glow)' : 'transparent',
                    transition: 'background-color 0.2s',
                    cursor: onRowClick ? 'pointer' : 'default'
                  }}
                >
                  {bulkActions.length > 0 && (
                    <td style={{ padding: '12px 16px' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleSelect(id)}
                      />
                    </td>
                  )}
                  {columns.map(col => (
                    <td key={col.key as string} style={{ padding: '16px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      {col.render ? col.render(row) : (row[col.key] as any)}
                    </td>
                  ))}
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={columns.length + (bulkActions.length > 0 ? 1 : 0)} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No data found matching current criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-base)', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            Showing {(currentPage - 1) * rowsPerPage + 1} to {Math.min(currentPage * rowsPerPage, processedData.length)} of {processedData.length} entries
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <AdminButton 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Previous
            </AdminButton>
            <AdminButton 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </AdminButton>
          </div>
        </div>
      )}
    </div>
  );
}

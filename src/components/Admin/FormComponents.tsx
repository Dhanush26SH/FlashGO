import React, { useState, useRef, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';

interface AdminInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const AdminInput: React.FC<AdminInputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }} className={className}>
      <label className="admin-label">{label}</label>
      <input 
        className={`admin-input ${error ? 'error' : ''}`}
        style={error ? { borderColor: 'var(--danger)' } : {}}
        {...props} 
      />
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.65rem', marginTop: '4px', fontWeight: 600 }}>{error}</span>}
    </div>
  );
};

interface AdminSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { label: string; value: string }[];
  error?: string;
}

export const AdminSelect: React.FC<AdminSelectProps> = ({ label, options, error, className = '', value, onChange, ...props }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    if (onChange) {
      onChange({ target: { value: val } } as any);
    }
    setIsOpen(false);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }} className={className} ref={dropdownRef}>
      <label className="admin-label">{label}</label>
      
      <div 
        className={`admin-input ${error ? 'error' : ''}`}
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          backgroundColor: 'var(--bg-base)',
          userSelect: 'none',
          ...(error ? { borderColor: 'var(--danger)' } : {})
        }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ color: selectedOption ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {selectedOption ? selectedOption.label : 'Select an option...'}
        </span>
        <ChevronDown size={14} color="var(--text-secondary)" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-light)',
          borderRadius: '6px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          zIndex: 50,
          maxHeight: '220px',
          overflowY: 'auto'
        }}>
          <div 
            onClick={() => handleSelect('')}
            style={{ padding: '10px 12px', fontSize: '0.78rem', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-base)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Select an option...
          </div>
          {options.map(opt => (
            <div 
              key={opt.value} 
              onClick={() => handleSelect(opt.value)}
              style={{ 
                padding: '10px 12px', 
                fontSize: '0.78rem', 
                cursor: 'pointer',
                backgroundColor: value === opt.value ? 'var(--primary-light)' : 'transparent',
                color: value === opt.value ? 'var(--primary)' : 'var(--text-primary)',
                fontWeight: value === opt.value ? 700 : 500
              }}
              onMouseEnter={(e) => { if (value !== opt.value) e.currentTarget.style.backgroundColor = 'var(--bg-base)' }}
              onMouseLeave={(e) => { if (value !== opt.value) e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
      
      {error && <span style={{ color: 'var(--danger)', fontSize: '0.65rem', marginTop: '4px', fontWeight: 600 }}>{error}</span>}
    </div>
  );
};

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const AdminButton: React.FC<AdminButtonProps> = ({ 
  children, 
  variant = 'secondary', 
  isLoading, 
  icon,
  className = '',
  disabled,
  ...props 
}) => {
  
  let btnClass = 'admin-btn';
  if (variant === 'primary') btnClass += ' admin-btn-primary';
  
  let customStyle: React.CSSProperties = {};
  if (variant === 'danger') {
    customStyle = { backgroundColor: 'var(--danger)', color: '#fff', border: 'none' };
  } else if (variant === 'success') {
    customStyle = { backgroundColor: '#10b981', color: '#fff', border: 'none' };
  }

  return (
    <button 
      className={`${btnClass} ${className}`}
      style={customStyle}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
};

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  isDestructive?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  isDestructive = false
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)'
    }}>
      <div className="admin-panel animate-slide-up" style={{ maxWidth: '400px', width: '90%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          {isDestructive ? <AlertCircle color="var(--danger)" /> : <CheckCircle2 color="var(--primary)" />}
          <h3 className="admin-panel-title">{title}</h3>
        </div>
        <p className="admin-panel-desc" style={{ fontSize: '0.85rem' }}>{message}</p>
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <AdminButton onClick={onCancel}>Cancel</AdminButton>
          <AdminButton variant={isDestructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </AdminButton>
        </div>
      </div>
    </div>
  );
};

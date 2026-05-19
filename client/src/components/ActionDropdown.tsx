import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

type ActionDropdownItem = {
  type?: 'item';
  key: string;
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  destructive?: boolean;
};

type ActionDropdownDivider = {
  key: string;
  type: 'divider';
};

type ActionDropdownEntry = ActionDropdownItem | ActionDropdownDivider;

interface ActionDropdownProps {
  label: string;
  items: ActionDropdownEntry[];
  buttonIcon?: ReactNode;
  buttonClassName?: string;
  menuMinWidth?: number;
  disabled?: boolean;
  disabledTitle?: string;
}

export default function ActionDropdown({
  label,
  items,
  buttonIcon,
  buttonClassName = 'btn btn-secondary btn-sm',
  menuMinWidth = 190,
  disabled = false,
  disabledTitle,
}: ActionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside both the trigger and the portal menu
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  const calcPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuH = Math.min(items.length * 40 + 20, 360);

    let top = rect.bottom + 6;
    if (top + menuH > vh - 8) top = rect.top - menuH - 6;

    const rightAligned = rect.right - menuMinWidth >= 0;
    const style: React.CSSProperties = {
      position: 'fixed',
      top: `${top}px`,
      zIndex: 9999,
    };
    if (rightAligned) {
      style.right = `${vw - rect.right}px`;
    } else {
      style.left = `${rect.left}px`;
    }
    setMenuStyle(style);
  }, [items.length, menuMinWidth]);

  useEffect(() => {
    if (open) calcPosition();
  }, [open, calcPosition]);

  function handleActionClick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {buttonIcon}
        {label}
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            ...menuStyle,
            minWidth: `${menuMinWidth}px`,
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.12)',
          }}
        >
          {items.map((item) => {
            if (item.type === 'divider') {
              return (
                <div
                  key={item.key}
                  role="separator"
                  style={{
                    height: '1px',
                    backgroundColor: '#e2e8f0',
                    margin: '6px 6px',
                  }}
                />
              );
            }

            const menuItem = item;
            return (
              <button
                key={menuItem.key}
                type="button"
                role="menuitem"
                disabled={menuItem.disabled}
                onClick={() => handleActionClick(menuItem.onSelect)}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  cursor: menuItem.disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  fontSize: '13px',
                  opacity: menuItem.disabled ? 0.5 : 1,
                  color: menuItem.destructive ? '#b91c1c' : '#0f172a',
                }}
                onMouseEnter={(e) => {
                  if (!menuItem.disabled) {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = menuItem.destructive ? '#fef2f2' : '#f1f5f9';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                {menuItem.icon}
                {menuItem.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

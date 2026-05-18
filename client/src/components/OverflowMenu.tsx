import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface OverflowMenuItem {
  type?: 'item';
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

export interface OverflowMenuDivider {
  type: 'divider';
  key: string;
}

interface OverflowMenuProps {
  items: Array<OverflowMenuItem | OverflowMenuDivider>;
  ariaLabel?: string;
}

export default function OverflowMenu({ items, ariaLabel = 'More actions' }: OverflowMenuProps) {
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

  // Recalculate position whenever the menu opens
  const calcPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 160;
    const menuH = Math.min(items.length * 34 + 16, 320);

    let top = rect.bottom + 4;
    if (top + menuH > vh - 8) top = rect.top - menuH - 4;

    const leftAligned = rect.left + menuW <= vw - 8;
    const style: React.CSSProperties = {
      position: 'fixed',
      top: `${top}px`,
      zIndex: 9999,
    };
    if (leftAligned) {
      style.left = `${rect.left}px`;
    } else {
      style.right = `${vw - rect.right}px`;
    }
    setMenuStyle(style);
  }, [items.length]);

  useEffect(() => {
    if (open) calcPosition();
  }, [open, calcPosition]);

  function handleTriggerClick(event: React.MouseEvent) {
    event.stopPropagation();
    setOpen((prev) => !prev);
  }

  function handleItemClick(event: React.MouseEvent, item: OverflowMenuItem) {
    event.stopPropagation();
    setOpen(false);
    item.onClick();
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px',
          minWidth: '20px',
          height: '20px',
          border: '1px solid transparent',
          borderRadius: '5px',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          color: '#64748b',
          transition: 'border-color 80ms, background-color 80ms',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#cbd5e1';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <MoreHorizontal size={14} strokeWidth={2} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            ...menuStyle,
            minWidth: '148px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
            padding: '4px',
            overflow: 'hidden',
          }}
        >
          {items.map((item, index) => {
            if ('type' in item && item.type === 'divider') {
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

            const Icon = item.icon;
            return (
              <button
                key={`${item.label}-${index}`}
                type="button"
                role="menuitem"
                onClick={(e) => handleItemClick(e, item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  width: '100%',
                  padding: '6px 8px',
                  border: 'none',
                  borderRadius: '5px',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: item.danger ? '#dc2626' : '#0f172a',
                  textAlign: 'left',
                  transition: 'background-color 80ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = item.danger ? '#fef2f2' : '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                }}
              >
                {Icon ? <Icon size={12} strokeWidth={2} /> : null}
                {item.label}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

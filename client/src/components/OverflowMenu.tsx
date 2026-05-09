import { useCallback, useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOutsideClick } from '../hooks/useOutsideClick';

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
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);
  const containerRef = useOutsideClick(open, handleClose);

  // Flip menu to left side if near right viewport edge
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !menuRef.current || !containerRef.current) return;

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    if (menuRect.right > viewportWidth - 8) {
      menuRef.current.style.left = 'auto';
      menuRef.current.style.right = '0';
    } else {
      menuRef.current.style.left = '0';
      menuRef.current.style.right = 'auto';
    }
  }, [open]);

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
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <button
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

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '3px',
            minWidth: '148px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
            zIndex: 9999,
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
        </div>
      )}
    </div>
  );
}

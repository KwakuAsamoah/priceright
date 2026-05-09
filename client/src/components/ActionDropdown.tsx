import { useCallback, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useOutsideClick } from '../hooks/useOutsideClick';

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
}

export default function ActionDropdown({
  label,
  items,
  buttonIcon,
  buttonClassName = 'btn btn-secondary btn-sm',
  menuMinWidth = 190,
}: ActionDropdownProps) {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);
  const containerRef = useOutsideClick(open, handleClose);

  function handleActionClick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => setOpen((prev) => !prev)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {buttonIcon}
        {label}
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '6px',
            zIndex: 60,
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '6px',
            minWidth: `${menuMinWidth}px`,
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
                  fontSize: '12px',
                  opacity: menuItem.disabled ? 0.5 : 1,
                  color: menuItem.destructive ? '#b91c1c' : '#0f172a',
                }}
              >
                {menuItem.icon}
                {menuItem.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

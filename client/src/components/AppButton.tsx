import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';

type ButtonSize = 'sm' | 'md';

interface AppButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

function variantClass(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return 'btn-primary';
    case 'secondary':
      return 'btn-secondary';
    case 'ghost':
      return 'btn-ghost';
    case 'danger':
      return 'btn-danger';
    case 'success':
      return 'btn-success';
    case 'warning':
      return 'btn-warning';
    default:
      return 'btn-secondary';
  }
}

export default function AppButton({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  style,
  title,
  ariaLabel,
  disabled,
  type = 'button',
  onClick,
}: AppButtonProps) {
  const classes = ['btn', variantClass(variant), size === 'sm' ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      style={style}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

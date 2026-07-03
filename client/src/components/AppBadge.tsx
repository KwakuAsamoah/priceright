import type { CSSProperties, ReactNode } from 'react';

type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'muted'
  | 'active'
  | 'inactive'
  | 'approved'
  | 'pending'
  | 'needs-review';

type BadgeSize = 'sm' | 'md';

interface AppBadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  title?: string;
  style?: CSSProperties;
}

function variantClass(variant: BadgeVariant) {
  switch (variant) {
    case 'success':
      return 'app-badge-success';
    case 'warning':
      return 'app-badge-warning';
    case 'danger':
      return 'app-badge-danger';
    case 'info':
      return 'app-badge-info';
    case 'muted':
      return 'app-badge-muted';
    case 'active':
      return 'app-badge-active';
    case 'inactive':
      return 'app-badge-inactive';
    case 'approved':
      return 'app-badge-approved';
    case 'pending':
      return 'app-badge-pending';
    case 'needs-review':
      return 'app-badge-needs-review';
    default:
      return 'app-badge-muted';
  }
}

export default function AppBadge({
  children,
  variant = 'muted',
  size = 'md',
  className = '',
  title,
  style,
}: AppBadgeProps) {
  const classes = ['app-badge', `app-badge-${size}`, variantClass(variant), className]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} title={title} style={style}>
      {children}
    </span>
  );
}

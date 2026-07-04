import type { LucideIcon } from 'lucide-react';
import { BarChart2, CheckCircle, Compass, FileText, Package, Settings } from 'lucide-react';

export const HELP_CATEGORIES = [
  'Getting Started',
  'Products and Materials',
  'Pricing and Approvals',
  'Price Lists and Exports',
  'Reports and Analysis',
  'Settings and Data',
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export const HELP_CATEGORY_ICONS: Record<HelpCategory, LucideIcon> = {
  'Getting Started': Compass,
  'Products and Materials': Package,
  'Pricing and Approvals': CheckCircle,
  'Price Lists and Exports': FileText,
  'Reports and Analysis': BarChart2,
  'Settings and Data': Settings,
};

export const HELP_CONTEXT_CATEGORY: Record<string, HelpCategory> = {
  products: 'Products and Materials',
  materials: 'Products and Materials',
  'price-levels': 'Price Lists and Exports',
  reports: 'Reports and Analysis',
  settings: 'Settings and Data',
  dashboard: 'Getting Started',
};

export const GETTING_STARTED_FEATURED: Array<{ id: string; label: string }> = [
  { id: 'overhead-and-margin', label: 'How PriceRight calculates profit' },
  { id: 'adding-materials', label: 'Setting up your materials' },
  { id: 'building-product-bom', label: 'Creating your first product' },
  { id: 'price-level-wizard', label: 'Building a price list' },
  { id: 'how-approval-works', label: 'Approving prices and exporting' },
];

export const HELP_FEEDBACK_STORAGE_KEY = 'priceright-help-feedback';

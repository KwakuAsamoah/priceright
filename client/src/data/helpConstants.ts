import type { LucideIcon } from 'lucide-react';
import {
  BarChart2,
  Box,
  CheckCircle,
  Compass,
  DollarSign,
  Download,
  FileText,
  List,
  Package,
  Settings,
} from 'lucide-react';

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

export const WHERE_TO_START_STEPS: Array<{
  step: number;
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    step: 1,
    id: 'first-setup',
    title: 'Set your base currency',
    description: 'Choose your local currency in Settings before adding materials or products.',
    icon: DollarSign,
  },
  {
    step: 2,
    id: 'adding-materials',
    title: 'Add your raw materials',
    description: 'Enter ingredients, packaging, and bulk purchase prices for accurate unit costs.',
    icon: Package,
  },
  {
    step: 3,
    id: 'building-product-bom',
    title: 'Create your products',
    description: 'Build each product with a bill of materials, overhead, and markup.',
    icon: Box,
  },
  {
    step: 4,
    id: 'how-approval-works',
    title: 'Approve your prices',
    description: 'Review production cost and optimal price, then set an approved base price.',
    icon: CheckCircle,
  },
  {
    step: 5,
    id: 'price-level-wizard',
    title: 'Build a price list',
    description: 'Create a price level for wholesale, retail, or a named customer.',
    icon: List,
  },
  {
    step: 6,
    id: 'generating-price-list',
    title: 'Export to your customer',
    description: 'Export approved price list prices to Excel or PDF when ready to share.',
    icon: Download,
  },
];

export const HELP_FEEDBACK_STORAGE_KEY = 'priceright-help-feedback';

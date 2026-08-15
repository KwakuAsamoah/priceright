import { useSearchParams } from 'react-router-dom';
import ApprovalsListsHub from './hubs/ApprovalsListsHub';
import CostChangesHub from './hubs/CostChangesHub';
import MaterialCostsHub from './hubs/MaterialCostsHub';
import PricingHealthHub from './hubs/PricingHealthHub';

/**
 * Hub shell entry point. Routes to the active hub based on ?hub= URL param.
 */
export default function ReportsPage() {
  const [searchParams] = useSearchParams();
  const hub = searchParams.get('hub');

  if (hub === 'pricing-health') {
    return <PricingHealthHub />;
  }

  if (hub === 'approvals-lists') {
    return <ApprovalsListsHub />;
  }

  if (hub === 'cost-changes') {
    return <CostChangesHub />;
  }

  if (hub === 'material-costs') {
    return <MaterialCostsHub />;
  }

  return null;
}

import ProductsAnalysisTab from '../../../components/ProductsAnalysisTab';
import type { PricingHealthReportResultMap } from '../types';

type MarginHealthViewProps = {
  data: PricingHealthReportResultMap['margin-health'];
  lowMarginThreshold: number;
};

export default function MarginHealthView({ data, lowMarginThreshold }: MarginHealthViewProps) {
  return (
    <div id="reporting-centre-print-area">
      <ProductsAnalysisTab
        products={data.products}
        lowMarginThreshold={lowMarginThreshold}
      />
    </div>
  );
}

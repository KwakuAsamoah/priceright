import { useState, useEffect } from 'react';
import { getBaseCurrency } from '../utils/currency';

export function useBaseCurrency() {
  const [baseCurrency, setBaseCurrency] = useState<string>('GHS');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBaseCurrency().then((code) => {
      setBaseCurrency(code);
      setLoading(false);
    });
  }, []);

  return { baseCurrency, loading };
}

import React from 'react';
import { formatCurrency, formatCOP } from '../utils/format';

interface AmountDisplayProps {
  amount: number;
  currencySymbol: string;
  currencyCode: string;
  amountCOP?: number;
  exchangeRate?: number;
  className?: string;
  showCOPInline?: boolean;
}

const AmountDisplay: React.FC<AmountDisplayProps> = ({
  amount,
  currencySymbol,
  currencyCode,
  amountCOP,
  exchangeRate,
  className = '',
  showCOPInline = true
}) => {
  const originalAmount = formatCurrency(amount, currencySymbol);
  
  // Si es COP, solo mostrar el monto original
  if (currencyCode === 'COP') {
    return (
      <span className={`font-medium ${className}`}>
        {originalAmount}
      </span>
    );
  }

  // Si no hay conversión a COP disponible
  if (!amountCOP) {
    return (
      <span className={`font-medium ${className}`}>
        {originalAmount}
        <span className="text-xs text-gray-500 ml-1">(Sin conversión)</span>
      </span>
    );
  }

  const copAmount = formatCOP(amountCOP);

  if (showCOPInline) {
    return (
      <div className={`${className}`}>
        <span className="font-medium">{originalAmount}</span>
        <span className="text-sm text-gray-600 ml-2">≈ {copAmount}</span>
        {exchangeRate && (
          <div className="text-xs text-gray-500">
            Tasa: {exchangeRate.toFixed(4)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="font-medium">{originalAmount}</div>
      <div className="text-sm text-gray-600">≈ {copAmount}</div>
      {exchangeRate && (
        <div className="text-xs text-gray-500">
          Tasa: {exchangeRate.toFixed(4)}
        </div>
      )}
    </div>
  );
};

export default AmountDisplay;
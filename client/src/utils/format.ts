import { format, parseISO } from 'date-fns';

export const formatCurrency = (amount: number, currencySymbol: string): string => {
  return `${currencySymbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatCOP = (amount: number): string => {
  return `$${amount.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} COP`;
};

export const formatAmountWithCOP = (
  amount: number, 
  currencySymbol: string, 
  currencyCode: string,
  amountCOP?: number
): string => {
  const originalAmount = formatCurrency(amount, currencySymbol);
  
  if (currencyCode === 'COP' || !amountCOP) {
    return originalAmount;
  }
  
  const copAmount = formatCOP(amountCOP);
  return `${originalAmount} (${copAmount})`;
};

export const formatDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'MMM dd, yyyy');
  } catch {
    return dateString;
  }
};

export const formatDateShort = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'MMM dd');
  } catch {
    return dateString;
  }
};

export const formatDateInput = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    return format(date, 'yyyy-MM-dd');
  } catch {
    return dateString;
  }
};

export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('')
    .substring(0, 2);
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
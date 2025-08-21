export interface User {
  id: number;
  username: string;
  email: string;
  created_at?: string | null;
  updated_at?: string | null;
  reportEmailsEnabled?: boolean;
  paymentCycle?: 'weekly' | 'biweekly' | 'monthly';
  reminderDaysBefore?: number;
}

export interface Category {
  id: number;
  user_id: number;
  name: string;
  color: string;
  icon: string;
  expense_count?: number;
  total_amount?: number;
  created_at: string;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  updated_at: string;
}

export interface Expense {
  id: number;
  user_id: number;
  category_id: number;
  currency_id: number;
  amount: number;
  description: string;
  date: string;
  is_recurring: boolean;
  recurring_frequency?: string;
  next_due_date?: string;
  created_at: string;
  updated_at: string;
  category_name: string;
  category_color: string;
  category_icon: string;
  currency_code: string;
  currency_symbol: string;
}

export interface ExpenseFormData {
  categoryId: number;
  currencyId: number;
  amount: number;
  description: string;
  date: string;
  isRecurring: boolean;
  recurringFrequency?: string;
}

export interface ExpenseStats {
  categoryStats: Array<{
    category_name: string;
    category_color: string;
    expense_count: number;
    total_amount: number;
    avg_amount: number;
  }>;
  totalStats: {
    total_expenses: number;
    total_amount: number;
    avg_amount: number;
  };
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

export interface ExpenseFilters {
  category?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}
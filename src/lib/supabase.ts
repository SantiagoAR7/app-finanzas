import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(supabaseUrl || 'https://example.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type FinanceTransaction = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  account: string;
  note: string | null;
  recurring_transaction_id: string | null;
  occurred_at: string;
  created_at: string;
};

export type MonthlyBudget = {
  id: string;
  month: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type CategoryBudget = {
  id: string;
  month: string;
  category: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type RecurringTransaction = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  account: string;
  note: string | null;
  day_of_month: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SavingsBox = {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

export type SavingsMovement = {
  id: string;
  savings_box_id: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  note: string | null;
  created_at: string;
};

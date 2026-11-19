import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputChangeEvent,
  View,
} from 'react-native';

import { useAppLock } from '../context/AppLockContext';
import { useAuth } from '../context/AuthContext';
import {
  CategoryBudget,
  FinanceTransaction,
  MonthlyBudget,
  RecurringTransaction,
  SavingsBox,
  SavingsMovement,
  hasSupabaseConfig,
  supabase,
} from '../lib/supabase';

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const expenseCategories = ['Comida', 'Transporte', 'Casa', 'Servicios', 'Salud', 'Educacion', 'Deudas', 'Ocio', 'Otro'];
const incomeCategories = ['Salario', 'Ingreso extra', 'Prestamo pagado', 'Venta', 'Regalo', 'Rendimientos', 'Otro ingreso'];

const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
const currentDate = new Date().toISOString().slice(0, 10);
type FinanceTab = 'home' | 'transactions' | 'savings' | 'reports' | 'security';
type TransactionFilter = 'all' | 'income' | 'expense';
type MonthlySnapshot = {
  balance: number;
  expense: number;
  income: number;
  savingsDeposits: number;
  savingsWithdrawals: number;
};

function confirmDestructive(title: string, message: string, confirmText: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: confirmText,
      style: 'destructive',
      onPress: onConfirm,
    },
  ]);
}

function handleTextChange(setter: (value: string) => void) {
  return (event: TextInputChangeEvent) => {
    const webTarget = event.target as unknown as { value?: string };
    setter(event.nativeEvent.text ?? webTarget.value ?? '');
  };
}

function toDateInputValue(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function toTransactionTimestamp(dateValue: string) {
  return new Date(`${dateValue || currentDate}T12:00:00`).toISOString();
}

function isValidDateInput(value: string) {
  if (!value) {
    return true;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function toMonthStart(monthValue: string) {
  return `${monthValue || currentDate.slice(0, 7)}-01`;
}

function monthKeyFromOffset(offset: number) {
  const date = new Date(`${currentDate.slice(0, 7)}-15T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthLabel(monthValue: string) {
  return new Date(`${monthValue}-15T12:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

function monthsUntilDate(dateValue: string | null) {
  if (!dateValue) {
    return null;
  }

  const today = new Date(`${currentDate}T12:00:00`);
  const target = new Date(`${dateValue}T12:00:00`);
  const monthDiff = (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth();
  return Math.max(1, monthDiff + 1);
}

function recurringDateForMonth(monthValue: string, dayOfMonth: number) {
  const [year, month] = (monthValue || currentDate.slice(0, 7)).split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(dayOfMonth, 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function monthRange(monthValue: string) {
  const monthKey = monthValue || currentDate.slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(year, month - 1, 1, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0);

  return { end: end.toISOString(), start: start.toISOString() };
}

function csvCell(value: string | number | null) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function csvSection(title: string, header: string[], rows: (string | number | null)[][]) {
  return [`# ${title}`, header.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}

export default function HomeScreen() {
  const { initializing, session } = useAuth();
  const appLock = useAppLock();

  if (!hasSupabaseConfig) {
    return <SetupScreen />;
  }

  if (initializing || appLock.initializing) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#246BFE" />
        <Text style={styles.muted}>Cargando sesion segura...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return appLock.locked ? <LockScreen /> : <FinanceScreen />;
}

function SetupScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.setup}>
        <Text style={styles.logo}>App Finanzas</Text>
        <Text style={styles.title}>Conecta Supabase para empezar</Text>
        <Text style={styles.body}>
          Crea un archivo .env con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY. Luego pega el SQL de
          supabase/schema.sql en el SQL Editor de Supabase.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const submit = async () => {
    setMessage(null);

    if (!email || password.length < 6) {
      const text = 'Usa un correo valido y una clave de minimo 6 caracteres.';
      setMessage({ tone: 'error', text });
      Alert.alert('Revisa los datos', text);
      return;
    }

    setLoading(true);
    const error = mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);

    if (error) {
      setMessage({ tone: 'error', text: error });
      Alert.alert('No se pudo continuar', error);
      return;
    }

    if (mode === 'signup') {
      const text = 'Cuenta creada. Si Supabase pide confirmacion, revisa el correo antes de iniciar sesion.';
      setMessage({ tone: 'success', text });
      Alert.alert('Cuenta creada', text);
      setMode('signin');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>App Finanzas</Text>
        <Text style={styles.title}>{mode === 'signin' ? 'Ingresa a tu cuenta' : 'Crea tu cuenta privada'}</Text>
        <Text style={styles.body}>
          Cada usuario tiene sus propios movimientos. Supabase bloquea el acceso a filas de otras personas con RLS.
        </Text>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChange={handleTextChange(setEmail)}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            style={styles.input}
            value={email}
          />
          <TextInput
            onChange={handleTextChange(setPassword)}
            onChangeText={setPassword}
            placeholder="Clave"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable disabled={loading} onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>{loading ? 'Procesando...' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}</Text>
          </Pressable>
          {message && (
            <Text style={[styles.formMessage, message.tone === 'error' ? styles.errorMessage : styles.successMessage]}>
              {message.text}
            </Text>
          )}
          <Pressable
            onPress={() => {
              setMessage(null);
              setMode(mode === 'signin' ? 'signup' : 'signin');
            }}
            style={styles.textButton}
          >
            <Text style={styles.textButtonText}>{mode === 'signin' ? 'Crear una cuenta nueva' : 'Ya tengo cuenta'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LockScreen() {
  const { biometricAvailable, unlockWithBiometrics, unlockWithPin } = useAppLock();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const submitPin = async () => {
    setLoading(true);
    const error = await unlockWithPin(pin);
    setLoading(false);

    if (error) {
      Alert.alert('No se pudo desbloquear', error);
      return;
    }

    setPin('');
  };

  const submitBiometrics = async () => {
    setLoading(true);
    const error = await unlockWithBiometrics();
    setLoading(false);

    if (error) {
      Alert.alert('No se pudo desbloquear', error);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.lockContent}>
        <Text style={styles.logo}>App Finanzas</Text>
        <Text style={styles.title}>App bloqueada</Text>
        <Text style={styles.body}>Desbloquea para ver tu informacion financiera.</Text>
        {biometricAvailable ? (
          <Pressable disabled={loading} onPress={submitBiometrics} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Usar biometria</Text>
          </Pressable>
        ) : null}
        <TextInput
          inputMode="numeric"
          maxLength={8}
          onChange={handleTextChange(setPin)}
          onChangeText={setPin}
          placeholder="PIN"
          secureTextEntry
          style={styles.input}
          value={pin}
        />
        <Pressable disabled={loading} onPress={submitPin} style={({ pressed }) => [styles.secondaryButtonWide, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Desbloquear con PIN</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function FinanceScreen() {
  const { session, signOut } = useAuth();
  const { biometricAvailable, disablePin, lock, pinEnabled, setPin } = useAppLock();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [categoryBudgetsUnavailable, setCategoryBudgetsUnavailable] = useState(false);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [recurringUnavailable, setRecurringUnavailable] = useState(false);
  const [savingsBoxes, setSavingsBoxes] = useState<SavingsBox[]>([]);
  const [savingsMovements, setSavingsMovements] = useState<SavingsMovement[]>([]);
  const [savingsMovementsUnavailable, setSavingsMovementsUnavailable] = useState(false);
  const [savingsUnavailable, setSavingsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBox, setSavingBox] = useState(false);
  const [savingBoxActionId, setSavingBoxActionId] = useState<string | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingCategoryBudget, setSavingCategoryBudget] = useState(false);
  const [savingRecurring, setSavingRecurring] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [category, setCategory] = useState(expenseCategories[0]);
  const [account, setAccount] = useState('Principal');
  const [note, setNote] = useState('');
  const [transactionDate, setTransactionDate] = useState(currentDate);
  const [budgetCategory, setBudgetCategory] = useState(expenseCategories[0]);
  const [budgetCategoryAmount, setBudgetCategoryAmount] = useState('');
  const [recurringType, setRecurringType] = useState<'income' | 'expense'>('expense');
  const [recurringAmount, setRecurringAmount] = useState('');
  const [recurringCategory, setRecurringCategory] = useState(expenseCategories[0]);
  const [recurringAccount, setRecurringAccount] = useState('Principal');
  const [recurringNote, setRecurringNote] = useState('');
  const [recurringDay, setRecurringDay] = useState('1');
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState(currentDate.slice(0, 7));
  const [reportMonth, setReportMonth] = useState(currentDate.slice(0, 7));
  const [boxName, setBoxName] = useState('');
  const [boxTarget, setBoxTarget] = useState('');
  const [boxCurrent, setBoxCurrent] = useState('');
  const [boxTargetDate, setBoxTargetDate] = useState('');
  const [newPin, setNewPin] = useState('');
  const [activeTab, setActiveTab] = useState<FinanceTab>('home');
  const transactionCategories = type === 'income' ? incomeCategories : expenseCategories;
  const recurringCategories = recurringType === 'income' ? incomeCategories : expenseCategories;
  const allCategories = useMemo(
    () =>
      Array.from(
        new Set([
          ...expenseCategories,
          ...incomeCategories,
          ...transactions.map((item) => item.category),
          ...recurringTransactions.map((item) => item.category),
        ]),
      ),
    [recurringTransactions, transactions],
  );

  const monthlySnapshots = useMemo(() => {
    const buildSnapshot = (monthValue: string): MonthlySnapshot => {
      const monthTransactions = transactions.filter((item) => item.occurred_at.slice(0, 7) === monthValue);
      const monthSavingsMovements = savingsMovements.filter((item) => item.created_at.slice(0, 7) === monthValue);
      const income = monthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
      const expense = monthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
      const savingsDeposits = monthSavingsMovements
        .filter((item) => item.type === 'deposit')
        .reduce((sum, item) => sum + Number(item.amount), 0);
      const savingsWithdrawals = monthSavingsMovements
        .filter((item) => item.type === 'withdraw')
        .reduce((sum, item) => sum + Number(item.amount), 0);

      return { balance: income - expense, expense, income, savingsDeposits, savingsWithdrawals };
    };

    return {
      current: buildSnapshot(monthKeyFromOffset(0)),
      previous: buildSnapshot(monthKeyFromOffset(-1)),
    };
  }, [savingsMovements, transactions]);

  const totals = useMemo(() => {
    const income = monthlySnapshots.current.income;
    const expense = monthlySnapshots.current.expense;
    const monthlyBudget = Number(budget?.amount ?? 0);
    const remaining = monthlyBudget > 0 ? monthlyBudget - expense : 0;
    const usage = monthlyBudget > 0 ? Math.min(100, Math.round((expense / monthlyBudget) * 100)) : 0;
    return { income, expense, balance: income - expense, monthlyBudget, remaining, usage };
  }, [budget, monthlySnapshots]);

  const reportData = useMemo(() => {
    const monthTransactions = transactions.filter((item) => !reportMonth || item.occurred_at.slice(0, 7) === reportMonth);
    const income = monthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
    const expense = monthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
    const expenses = monthTransactions.filter((item) => item.type === 'expense');
    const incomes = monthTransactions.filter((item) => item.type === 'income');
    const byCategory = expenses.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + Number(item.amount);
      return acc;
    }, {});
    const incomeByCategory = incomes.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + Number(item.amount);
      return acc;
    }, {});
    const categoriesByAmount = Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const incomeCategoriesByAmount = Object.entries(incomeByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    const maxExpense = Math.max(...categoriesByAmount.map((item) => item.value), 1);
    const maxIncome = Math.max(...incomeCategoriesByAmount.map((item) => item.value), 1);
    const averageExpense = expenses.length > 0 ? expense / expenses.length : 0;
    const topCategory = categoriesByAmount[0] ?? null;
    const topIncomeCategory = incomeCategoriesByAmount[0] ?? null;

    return {
      averageExpense,
      balance: income - expense,
      categoriesByAmount,
      expense,
      income,
      incomeCategoriesByAmount,
      maxExpense,
      maxIncome,
      monthTransactions,
      topCategory,
      topIncomeCategory,
    };
  }, [reportMonth, transactions]);

  const currentExpenseCategories = useMemo(() => {
    const currentMonthKey = monthKeyFromOffset(0);
    const byCategory = transactions
      .filter((item) => item.type === 'expense' && item.occurred_at.slice(0, 7) === currentMonthKey)
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.category] = (acc[item.category] ?? 0) + Number(item.amount);
        return acc;
      }, {});

    return Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const homeInsights = (() => {
    const expenseDelta = monthlySnapshots.current.expense - monthlySnapshots.previous.expense;
    const incomeDelta = monthlySnapshots.current.income - monthlySnapshots.previous.income;
    const topExpense = currentExpenseCategories[0] ?? null;
    const monthName = monthLabel(monthKeyFromOffset(0));
    const previousMonthName = monthLabel(monthKeyFromOffset(-1));
    const budgetMessage =
      totals.monthlyBudget <= 0
        ? 'Define un presupuesto para ver cuanto queda disponible.'
        : totals.remaining >= 0
          ? `Te quedan ${currency.format(totals.remaining)} para gastar en ${monthName}.`
          : `Estas ${currency.format(Math.abs(totals.remaining))} por encima del presupuesto de ${monthName}.`;
    const expenseMessage =
      monthlySnapshots.previous.expense <= 0
        ? `Gastos registrados en ${monthName}: ${currency.format(monthlySnapshots.current.expense)}.`
        : expenseDelta === 0
          ? `Tus gastos van iguales frente a ${previousMonthName}.`
          : expenseDelta > 0
            ? `Has gastado ${currency.format(expenseDelta)} mas que en ${previousMonthName}.`
            : `Has gastado ${currency.format(Math.abs(expenseDelta))} menos que en ${previousMonthName}.`;
    const incomeMessage =
      monthlySnapshots.previous.income <= 0
        ? `Ingresos registrados en ${monthName}: ${currency.format(monthlySnapshots.current.income)}.`
        : incomeDelta >= 0
          ? `Tus ingresos van ${currency.format(incomeDelta)} arriba frente a ${previousMonthName}.`
          : `Tus ingresos van ${currency.format(Math.abs(incomeDelta))} abajo frente a ${previousMonthName}.`;

    return {
      budgetMessage,
      expenseMessage,
      incomeMessage,
      savingsMessage: `Este mes moviste ${currency.format(monthlySnapshots.current.savingsDeposits)} hacia cajas de ahorro.`,
      topExpenseMessage: topExpense
        ? `Categoria que mas pesa: ${topExpense.name} con ${currency.format(topExpense.value)}.`
        : 'Aun no hay gastos para detectar categoria principal.',
    };
  })();

  const savingsTotals = useMemo(() => {
    const saved = savingsBoxes.reduce((sum, item) => sum + Number(item.current_amount), 0);
    const target = savingsBoxes.reduce((sum, item) => sum + Number(item.target_amount), 0);
    const progress = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    return { saved, target, progress };
  }, [savingsBoxes]);

  const categoryBudgetRows = useMemo(
    () =>
      categoryBudgets.filter((item) => !reportMonth || item.month.slice(0, 7) === reportMonth).map((item) => {
        const spent = reportData.categoriesByAmount.find((expense) => expense.name === item.category)?.value ?? 0;
        const amount = Number(item.amount);
        const usage = amount > 0 ? Math.min(100, Math.round((spent / amount) * 100)) : 0;

        return { ...item, amount, remaining: amount - spent, spent, usage };
      }),
    [categoryBudgets, reportData.categoriesByAmount, reportMonth],
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((item) => {
        const itemMonth = item.occurred_at.slice(0, 7);
        const matchesType = transactionFilter === 'all' || item.type === transactionFilter;
        const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
        const matchesMonth = !monthFilter || itemMonth === monthFilter;

        return matchesType && matchesCategory && matchesMonth;
      }),
    [categoryFilter, monthFilter, transactionFilter, transactions],
  );

  const visibleTransactions = activeTab === 'home' ? transactions.slice(0, 3) : activeTab === 'transactions' ? filteredTransactions : [];
  const recurringMonth = monthFilter || reportMonth || currentDate.slice(0, 7);
  const recurringStatusById = useMemo(() => {
    const nextStatus = new Map<string, FinanceTransaction>();

    transactions.forEach((transaction) => {
      if (transaction.recurring_transaction_id && transaction.occurred_at.slice(0, 7) === recurringMonth) {
        nextStatus.set(transaction.recurring_transaction_id, transaction);
      }
    });

    return nextStatus;
  }, [recurringMonth, transactions]);

  const changeType = (nextType: 'income' | 'expense') => {
    setType(nextType);
    setCategory(nextType === 'income' ? incomeCategories[0] : expenseCategories[0]);
  };

  const changeRecurringType = (nextType: 'income' | 'expense') => {
    setRecurringType(nextType);
    setRecurringCategory(nextType === 'income' ? incomeCategories[0] : expenseCategories[0]);
  };

  const loadFinanceData = async () => {
    setLoading(true);
    const [transactionsResult, budgetResult, savingsResult, savingsMovementsResult, categoryBudgetsResult, recurringResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,type,amount,category,account,note,recurring_transaction_id,occurred_at,created_at')
        .order('occurred_at', { ascending: false })
        .limit(200),
      supabase.from('monthly_budgets').select('id,month,amount,created_at,updated_at').eq('month', currentMonth).maybeSingle(),
      supabase
        .from('savings_boxes')
        .select('id,name,target_amount,current_amount,target_date,created_at,updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('savings_movements')
        .select('id,savings_box_id,type,amount,note,created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('category_budgets')
        .select('id,month,category,amount,created_at,updated_at')
        .order('month', { ascending: false })
        .limit(200),
      supabase
        .from('recurring_transactions')
        .select('id,type,amount,category,account,note,day_of_month,active,created_at,updated_at')
        .order('created_at', { ascending: false }),
    ]);
    setLoading(false);

    if (transactionsResult.error) {
      Alert.alert('No se pudieron cargar los datos', transactionsResult.error.message);
      return;
    }

    if (budgetResult.error) {
      Alert.alert('No se pudo cargar el presupuesto', budgetResult.error.message);
      return;
    }

    const nextBudget = (budgetResult.data ?? null) as MonthlyBudget | null;
    setTransactions((transactionsResult.data ?? []) as FinanceTransaction[]);
    setBudget(nextBudget);
    setBudgetAmount(nextBudget ? String(Number(nextBudget.amount)) : '');

    if (savingsResult.error) {
      if (savingsResult.error.code === '42P01') {
        setSavingsUnavailable(true);
        setSavingsBoxes([]);
        return;
      }

      Alert.alert('No se pudieron cargar las cajas de ahorro', savingsResult.error.message);
      return;
    }

    setSavingsUnavailable(false);
    setSavingsBoxes((savingsResult.data ?? []) as SavingsBox[]);

    if (savingsMovementsResult.error) {
      if (savingsMovementsResult.error.code === '42P01') {
        setSavingsMovementsUnavailable(true);
        setSavingsMovements([]);
      } else {
        Alert.alert('No se pudo cargar el historial de ahorros', savingsMovementsResult.error.message);
      }
    } else {
      setSavingsMovementsUnavailable(false);
      setSavingsMovements((savingsMovementsResult.data ?? []) as SavingsMovement[]);
    }

    if (categoryBudgetsResult.error) {
      if (categoryBudgetsResult.error.code === '42P01') {
        setCategoryBudgetsUnavailable(true);
        setCategoryBudgets([]);
      } else {
        Alert.alert('No se pudieron cargar los presupuestos por categoria', categoryBudgetsResult.error.message);
      }
    } else {
      setCategoryBudgetsUnavailable(false);
      setCategoryBudgets((categoryBudgetsResult.data ?? []) as CategoryBudget[]);
    }

    if (recurringResult.error) {
      if (recurringResult.error.code === '42P01') {
        setRecurringUnavailable(true);
        setRecurringTransactions([]);
      } else {
        Alert.alert('No se pudieron cargar los movimientos recurrentes', recurringResult.error.message);
      }
      return;
    }

    setRecurringUnavailable(false);
    setRecurringTransactions((recurringResult.data ?? []) as RecurringTransaction[]);
  };

  useEffect(() => {
    // Remote data load: state changes happen after Supabase responds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFinanceData();
  }, []);

  const saveBudget = async () => {
    const cleanAmount = Number(budgetAmount.replace(/[^\d.]/g, ''));

    if (Number.isNaN(cleanAmount) || cleanAmount < 0) {
      Alert.alert('Presupuesto invalido', 'Ingresa un valor valido para el mes.');
      return;
    }

    setSavingBudget(true);
    const { error } = await supabase
      .from('monthly_budgets')
      .upsert({ month: currentMonth, amount: cleanAmount }, { onConflict: 'user_id,month' });
    setSavingBudget(false);

    if (error) {
      Alert.alert('No se pudo guardar el presupuesto', error.message);
      return;
    }

    await loadFinanceData();
  };

  const saveCategoryBudget = async () => {
    const cleanAmount = Number(budgetCategoryAmount.replace(/[^\d.]/g, ''));

    if (!cleanAmount || cleanAmount < 0) {
      Alert.alert('Presupuesto invalido', 'Ingresa un valor valido para la categoria.');
      return;
    }

    setSavingCategoryBudget(true);
    const { error } = await supabase.from('category_budgets').upsert(
      {
        amount: cleanAmount,
        category: budgetCategory,
        month: toMonthStart(reportMonth),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,month,category' },
    );
    setSavingCategoryBudget(false);

    if (error) {
      Alert.alert('No se pudo guardar el presupuesto por categoria', error.message);
      return;
    }

    setBudgetCategoryAmount('');
    await loadFinanceData();
  };

  const deleteCategoryBudget = async (item: CategoryBudget) => {
    confirmDestructive('Eliminar presupuesto', 'Esta accion quitara el presupuesto de esa categoria.', 'Eliminar', async () => {
      const { error } = await supabase.from('category_budgets').delete().eq('id', item.id);

      if (error) {
        Alert.alert('No se pudo eliminar el presupuesto', error.message);
        return;
      }

      await loadFinanceData();
    });
  };

  const saveRecurringTransaction = async () => {
    const cleanAmount = Number(recurringAmount.replace(/[^\d.]/g, ''));
    const cleanDay = Number(recurringDay.replace(/[^\d]/g, ''));

    if (!cleanAmount || cleanAmount <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un valor mayor a cero.');
      return;
    }

    if (!cleanDay || cleanDay < 1 || cleanDay > 31) {
      Alert.alert('Dia invalido', 'Ingresa un dia entre 1 y 31.');
      return;
    }

    setSavingRecurring(true);
    const { error } = await supabase.from('recurring_transactions').insert({
      type: recurringType,
      amount: cleanAmount,
      category: recurringCategory,
      account: recurringAccount.trim() || 'Principal',
      note: recurringNote.trim() || null,
      day_of_month: cleanDay,
    });
    setSavingRecurring(false);

    if (error) {
      Alert.alert('No se pudo guardar el recurrente', error.message);
      return;
    }

    setRecurringAmount('');
    setRecurringNote('');
    setRecurringDay('1');
    await loadFinanceData();
  };

  const registerRecurringTransaction = async (item: RecurringTransaction) => {
    const targetMonth = monthFilter || reportMonth || currentDate.slice(0, 7);
    const { start, end } = monthRange(targetMonth);
    const { data: existing, error: existingError } = await supabase
      .from('transactions')
      .select('id')
      .eq('recurring_transaction_id', item.id)
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .limit(1);

    if (existingError) {
      Alert.alert('No se pudo validar el recurrente', existingError.message);
      return;
    }

    if ((existing ?? []).length > 0) {
      Alert.alert('Ya registrado', `Este recurrente ya fue registrado en ${monthLabel(targetMonth)}.`);
      await loadFinanceData();
      return;
    }

    const { error } = await supabase.from('transactions').insert({
      type: item.type,
      amount: Number(item.amount),
      category: item.category,
      account: item.account,
      note: item.note ? `${item.note} (recurrente)` : 'Recurrente',
      recurring_transaction_id: item.id,
      occurred_at: toTransactionTimestamp(recurringDateForMonth(targetMonth, item.day_of_month)),
    });

    if (error) {
      Alert.alert('No se pudo registrar el recurrente', error.message);
      return;
    }

    await loadFinanceData();
  };

  const deleteRecurringTransaction = async (item: RecurringTransaction) => {
    confirmDestructive('Eliminar recurrente', 'Esta accion quitara la plantilla recurrente.', 'Eliminar', async () => {
      const { error } = await supabase.from('recurring_transactions').delete().eq('id', item.id);

      if (error) {
        Alert.alert('No se pudo eliminar el recurrente', error.message);
        return;
      }

      await loadFinanceData();
    });
  };

  const updateRecurringTransaction = async (
    item: RecurringTransaction,
    nextData: {
      account: string;
      amount: string;
      category: string;
      day: string;
      note: string;
      type: 'income' | 'expense';
    },
  ) => {
    const cleanAmount = Number(nextData.amount.replace(/[^\d.]/g, ''));
    const cleanDay = Number(nextData.day.replace(/[^\d]/g, ''));

    if (!cleanAmount || cleanAmount <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un valor mayor a cero.');
      return false;
    }

    if (!cleanDay || cleanDay < 1 || cleanDay > 31) {
      Alert.alert('Dia invalido', 'Ingresa un dia entre 1 y 31.');
      return false;
    }

    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        type: nextData.type,
        amount: cleanAmount,
        category: nextData.category,
        account: nextData.account.trim() || 'Principal',
        note: nextData.note.trim() || null,
        day_of_month: cleanDay,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (error) {
      Alert.alert('No se pudo editar el recurrente', error.message);
      return false;
    }

    await loadFinanceData();
    return true;
  };

  const saveTransaction = async () => {
    const cleanAmount = Number(amount.replace(/[^\d.]/g, ''));

    if (!cleanAmount || cleanAmount <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un valor mayor a cero.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('transactions').insert({
      type,
      amount: cleanAmount,
      category,
      account: account.trim() || 'Principal',
      note: note.trim() || null,
      occurred_at: toTransactionTimestamp(transactionDate),
    });
    setSaving(false);

    if (error) {
      Alert.alert('No se pudo guardar', error.message);
      return;
    }

    setAmount('');
    setNote('');
    setTransactionDate(currentDate);
    await loadFinanceData();
  };

  const updateTransaction = async (
    transaction: FinanceTransaction,
    nextData: {
      account: string;
      amount: string;
      category: string;
      date: string;
      note: string;
      type: 'income' | 'expense';
    },
  ) => {
    const cleanAmount = Number(nextData.amount.replace(/[^\d.]/g, ''));

    if (!cleanAmount || cleanAmount <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un valor mayor a cero.');
      return false;
    }

    const { error } = await supabase
      .from('transactions')
      .update({
        type: nextData.type,
        amount: cleanAmount,
        category: nextData.category,
        account: nextData.account.trim() || 'Principal',
        note: nextData.note.trim() || null,
        occurred_at: toTransactionTimestamp(nextData.date),
      })
      .eq('id', transaction.id);

    if (error) {
      Alert.alert('No se pudo editar el movimiento', error.message);
      return false;
    }

    await loadFinanceData();
    return true;
  };

  const deleteTransaction = async (transaction: FinanceTransaction) => {
    confirmDestructive('Eliminar movimiento', 'Esta accion quitara el movimiento de tu historial.', 'Eliminar', async () => {
      const { error } = await supabase.from('transactions').delete().eq('id', transaction.id);

      if (error) {
        Alert.alert('No se pudo eliminar', error.message);
        return;
      }

      await loadFinanceData();
    });
  };

  const saveSavingsBox = async () => {
    const cleanTarget = Number(boxTarget.replace(/[^\d.]/g, ''));
    const cleanCurrent = Number(boxCurrent.replace(/[^\d.]/g, '')) || 0;
    const cleanName = boxName.trim();

    if (!cleanName) {
      Alert.alert('Nombre requerido', 'Ponle un nombre a la caja de ahorro.');
      return;
    }

    if (!cleanTarget || cleanTarget <= 0 || cleanCurrent < 0) {
      Alert.alert('Meta invalida', 'Ingresa una meta mayor a cero y un ahorro actual valido.');
      return;
    }

    if (!isValidDateInput(boxTargetDate)) {
      Alert.alert('Fecha invalida', 'Usa el formato AAAA-MM-DD para la fecha objetivo.');
      return;
    }

    setSavingBox(true);
    const { error } = await supabase.from('savings_boxes').insert({
      name: cleanName,
      target_amount: cleanTarget,
      current_amount: cleanCurrent,
      target_date: boxTargetDate || null,
    });
    setSavingBox(false);

    if (error) {
      Alert.alert('No se pudo guardar la caja', error.message);
      return;
    }

    setBoxName('');
    setBoxTarget('');
    setBoxCurrent('');
    setBoxTargetDate('');
    await loadFinanceData();
  };

  const deleteSavingsBox = async (box: SavingsBox) => {
    confirmDestructive('Eliminar caja', 'Esta accion quitara la meta de ahorro.', 'Eliminar', async () => {
      const { error } = await supabase.from('savings_boxes').delete().eq('id', box.id);

      if (error) {
        Alert.alert('No se pudo eliminar la caja', error.message);
        return;
      }

      await loadFinanceData();
    });
  };

  const adjustSavingsBox = async (box: SavingsBox, direction: 'deposit' | 'withdraw', rawAmount: string) => {
    const cleanAmount = Number(rawAmount.replace(/[^\d.]/g, ''));
    const currentAmount = Number(box.current_amount);
    const nextAmount = direction === 'deposit' ? currentAmount + cleanAmount : currentAmount - cleanAmount;

    if (!cleanAmount || cleanAmount <= 0) {
      Alert.alert('Monto invalido', 'Ingresa un valor mayor a cero.');
      return;
    }

    if (nextAmount < 0) {
      Alert.alert('Saldo insuficiente', 'No puedes retirar mas de lo que hay en la caja.');
      return;
    }

    setSavingBoxActionId(box.id);
    const { error } = await supabase
      .from('savings_boxes')
      .update({ current_amount: nextAmount, updated_at: new Date().toISOString() })
      .eq('id', box.id);

    if (error) {
      setSavingBoxActionId(null);
      Alert.alert('No se pudo actualizar la caja', error.message);
      return;
    }

    if (!savingsMovementsUnavailable) {
      const movementNote = direction === 'deposit' ? 'Transferencia interna a caja' : 'Retiro interno desde caja';
      const { error: movementError } = await supabase.from('savings_movements').insert({
        savings_box_id: box.id,
        type: direction,
        amount: cleanAmount,
        note: movementNote,
      });

      if (movementError && movementError.code !== '42P01') {
        setSavingBoxActionId(null);
        Alert.alert('Caja actualizada, pero no se guardo el historial', movementError.message);
        await loadFinanceData();
        return;
      }

      if (movementError?.code === '42P01') {
        setSavingsMovementsUnavailable(true);
      }
    }

    setSavingBoxActionId(null);

    await loadFinanceData();
  };

  const updateSavingsBox = async (box: SavingsBox, nextName: string, nextTarget: string, nextTargetDate: string) => {
    const cleanName = nextName.trim();
    const cleanTarget = Number(nextTarget.replace(/[^\d.]/g, ''));

    if (!cleanName) {
      Alert.alert('Nombre requerido', 'Ponle un nombre a la caja de ahorro.');
      return false;
    }

    if (!cleanTarget || cleanTarget <= 0) {
      Alert.alert('Meta invalida', 'Ingresa una meta mayor a cero.');
      return false;
    }

    if (!isValidDateInput(nextTargetDate)) {
      Alert.alert('Fecha invalida', 'Usa el formato AAAA-MM-DD para la fecha objetivo.');
      return false;
    }

    setSavingBoxActionId(box.id);
    const { error } = await supabase
      .from('savings_boxes')
      .update({ name: cleanName, target_amount: cleanTarget, target_date: nextTargetDate || null, updated_at: new Date().toISOString() })
      .eq('id', box.id);
    setSavingBoxActionId(null);

    if (error) {
      Alert.alert('No se pudo editar la caja', error.message);
      return false;
    }

    await loadFinanceData();
    return true;
  };

  const savePin = async () => {
    const error = await setPin(newPin);

    if (error) {
      Alert.alert('No se pudo guardar el PIN', error);
      return;
    }

    setNewPin('');
    Alert.alert('PIN activado', 'La app se bloqueara cuando salgas o la pongas en segundo plano.');
  };

  const removePin = () => {
    confirmDestructive('Desactivar bloqueo local', 'La app seguira protegida por login, pero no pedira PIN al abrir.', 'Desactivar', async () => {
      await disablePin();
    });
  };

  const exportTransactionsCsv = () => {
    const sections = [
      csvSection(
        'movimientos',
        ['fecha', 'tipo', 'categoria', 'cuenta', 'nota', 'monto', 'recurrente_id'],
        transactions.map((item) => [
          toDateInputValue(item.occurred_at),
          item.type === 'income' ? 'ingreso' : 'gasto',
          item.category,
          item.account,
          item.note,
          Number(item.amount),
          item.recurring_transaction_id,
        ]),
      ),
      csvSection(
        'cajas_ahorro',
        ['nombre', 'meta_total', 'ahorrado', 'fecha_objetivo', 'creado'],
        savingsBoxes.map((item) => [
          item.name,
          Number(item.target_amount),
          Number(item.current_amount),
          item.target_date,
          toDateInputValue(item.created_at),
        ]),
      ),
      csvSection(
        'historial_ahorros',
        ['caja_id', 'fecha', 'tipo', 'nota', 'monto'],
        savingsMovements.map((item) => [
          item.savings_box_id,
          toDateInputValue(item.created_at),
          item.type === 'deposit' ? 'aporte' : 'retiro',
          item.note,
          Number(item.amount),
        ]),
      ),
      csvSection(
        'presupuesto_mensual',
        ['mes', 'monto'],
        budget ? [[budget.month.slice(0, 7), Number(budget.amount)]] : [],
      ),
      csvSection(
        'presupuestos_categoria',
        ['mes', 'categoria', 'monto'],
        categoryBudgets.map((item) => [item.month.slice(0, 7), item.category, Number(item.amount)]),
      ),
      csvSection(
        'recurrentes',
        ['tipo', 'categoria', 'cuenta', 'nota', 'monto', 'dia_mes', 'activo'],
        recurringTransactions.map((item) => [
          item.type === 'income' ? 'ingreso' : 'gasto',
          item.category,
          item.account,
          item.note,
          Number(item.amount),
          item.day_of_month,
          item.active ? 'si' : 'no',
        ]),
      ),
    ];
    const csv = sections.join('\n\n');

    if (Platform.OS !== 'web') {
      Alert.alert('Exportacion preparada', 'La descarga directa se activara cuando terminemos el empaque movil.');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `app-finanzas-respaldo-${currentDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        ListHeaderComponent={
          <View style={styles.content}>
            <View style={styles.header}>
              <View>
                <Text style={styles.logo}>App Finanzas</Text>
                <Text style={styles.muted}>Tus datos privados</Text>
              </View>
              <Pressable onPress={signOut} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Salir</Text>
              </Pressable>
            </View>

            <View style={styles.tabBar}>
              <TabButton active={activeTab === 'home'} label="Inicio" onPress={() => setActiveTab('home')} />
              <TabButton active={activeTab === 'transactions'} label="Movimientos" onPress={() => setActiveTab('transactions')} />
              <TabButton active={activeTab === 'savings'} label="Ahorros" onPress={() => setActiveTab('savings')} />
              <TabButton active={activeTab === 'reports'} label="Reportes" onPress={() => setActiveTab('reports')} />
              <TabButton active={activeTab === 'security'} label="Perfil" onPress={() => setActiveTab('security')} />
            </View>

            {activeTab === 'home' ? (
              <>
                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Resumen de {monthLabel(monthKeyFromOffset(0))}</Text>
                  <Text style={styles.body}>{homeInsights.budgetMessage}</Text>
                </View>

                <View style={styles.summaryGrid}>
                  <Summary label="Ingresos" value={totals.income} tone="good" />
                  <Summary label="Gastos" value={totals.expense} tone="bad" />
                  <Summary label="Balance" value={totals.balance} tone={totals.balance >= 0 ? 'good' : 'bad'} />
                  <Summary label="Disponible" value={totals.remaining} tone={totals.remaining >= 0 ? 'good' : 'bad'} />
                  <Summary label="Ahorros" value={savingsTotals.saved} tone="good" />
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Lectura rapida</Text>
                  <View style={styles.insightList}>
                    <Insight text={homeInsights.expenseMessage} />
                    <Insight text={homeInsights.incomeMessage} />
                    <Insight text={homeInsights.topExpenseMessage} />
                    <Insight text={homeInsights.savingsMessage} />
                  </View>
                </View>

                <View style={styles.panel}>
                  <View style={styles.budgetHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Presupuesto mensual</Text>
                      <Text style={styles.muted}>{totals.monthlyBudget > 0 ? `${totals.usage}% usado` : 'Sin presupuesto para este mes'}</Text>
                    </View>
                    <Text style={styles.budgetValue}>{currency.format(totals.monthlyBudget)}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${totals.usage}%` }]} />
                  </View>
                  <View style={styles.inlineForm}>
                    <TextInput
                      inputMode="decimal"
                      onChange={handleTextChange(setBudgetAmount)}
                      onChangeText={setBudgetAmount}
                      placeholder="Presupuesto del mes"
                      style={[styles.input, styles.inlineInput]}
                      value={budgetAmount}
                    />
                    <Pressable
                      disabled={savingBudget}
                      onPress={saveBudget}
                      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.smallButtonText}>{savingBudget ? '...' : 'Guardar'}</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Movimientos recientes</Text>
              </>
            ) : null}

            {activeTab === 'transactions' ? (
              <>
                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Nuevo movimiento</Text>
                  <View style={styles.segment}>
                    <Choice active={type === 'expense'} label="Gasto" onPress={() => changeType('expense')} />
                    <Choice active={type === 'income'} label="Ingreso" onPress={() => changeType('income')} />
                  </View>
                  <TextInput
                    inputMode="decimal"
                    onChange={handleTextChange(setAmount)}
                    onChangeText={setAmount}
                    placeholder="Monto"
                    style={styles.input}
                    value={amount}
                  />
                  <TextInput
                    inputMode="numeric"
                    onChange={handleTextChange(setTransactionDate)}
                    onChangeText={setTransactionDate}
                    placeholder="Fecha AAAA-MM-DD"
                    style={styles.input}
                    value={transactionDate}
                  />
                  <Text style={styles.subsectionTitle}>{type === 'income' ? 'Tipo de ingreso' : 'Categoria del gasto'}</Text>
                  <View style={styles.chips}>
                    {transactionCategories.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => setCategory(item)}
                        style={[styles.chip, category === item && styles.activeChip]}
                      >
                        <Text style={[styles.chipText, category === item && styles.activeChipText]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    onChange={handleTextChange(setAccount)}
                    onChangeText={setAccount}
                    placeholder="Cuenta"
                    style={styles.input}
                    value={account}
                  />
                  <TextInput
                    onChange={handleTextChange(setNote)}
                    onChangeText={setNote}
                    placeholder="Nota opcional"
                    style={styles.input}
                    value={note}
                  />
                  <Pressable disabled={saving} onPress={saveTransaction} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                    <Text style={styles.primaryButtonText}>{saving ? 'Guardando...' : 'Guardar movimiento'}</Text>
                  </Pressable>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Filtrar historial</Text>
                  <View style={styles.segment}>
                    <Choice active={transactionFilter === 'all'} label="Todo" onPress={() => setTransactionFilter('all')} />
                    <Choice active={transactionFilter === 'expense'} label="Gastos" onPress={() => setTransactionFilter('expense')} />
                    <Choice active={transactionFilter === 'income'} label="Ingresos" onPress={() => setTransactionFilter('income')} />
                  </View>
                  <TextInput
                    inputMode="numeric"
                    onChange={handleTextChange(setMonthFilter)}
                    onChangeText={setMonthFilter}
                    placeholder="Mes AAAA-MM"
                    style={styles.input}
                    value={monthFilter}
                  />
                  <Text style={styles.subsectionTitle}>Categoria</Text>
                  <View style={styles.chips}>
                    <Pressable onPress={() => setCategoryFilter('all')} style={[styles.chip, categoryFilter === 'all' && styles.activeChip]}>
                      <Text style={[styles.chipText, categoryFilter === 'all' && styles.activeChipText]}>Todas</Text>
                    </Pressable>
                    {allCategories.map((item) => (
                      <Pressable
                        key={item}
                        onPress={() => setCategoryFilter(item)}
                        style={[styles.chip, categoryFilter === item && styles.activeChip]}
                      >
                        <Text style={[styles.chipText, categoryFilter === item && styles.activeChipText]}>{item}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable
                    onPress={() => {
                      setTransactionFilter('all');
                      setCategoryFilter('all');
                      setMonthFilter('');
                    }}
                    style={styles.textButton}
                  >
                    <Text style={styles.textButtonText}>Limpiar filtros</Text>
                  </Pressable>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Movimientos recurrentes</Text>
                  {recurringUnavailable ? (
                    <Text style={styles.emptyText}>Falta aplicar el bloque de recurring_transactions en Supabase.</Text>
                  ) : (
                    <>
                      <View style={styles.segment}>
                        <Choice active={recurringType === 'expense'} label="Gasto" onPress={() => changeRecurringType('expense')} />
                        <Choice active={recurringType === 'income'} label="Ingreso" onPress={() => changeRecurringType('income')} />
                      </View>
                      <TextInput
                        inputMode="decimal"
                        onChange={handleTextChange(setRecurringAmount)}
                        onChangeText={setRecurringAmount}
                        placeholder="Monto recurrente"
                        style={styles.input}
                        value={recurringAmount}
                      />
                      <TextInput
                        inputMode="numeric"
                        maxLength={2}
                        onChange={handleTextChange(setRecurringDay)}
                        onChangeText={setRecurringDay}
                        placeholder="Dia del mes"
                        style={styles.input}
                        value={recurringDay}
                      />
                      <Text style={styles.subsectionTitle}>{recurringType === 'income' ? 'Tipo de ingreso' : 'Categoria del gasto'}</Text>
                      <View style={styles.chips}>
                        {recurringCategories.map((item) => (
                          <Pressable
                            key={item}
                            onPress={() => setRecurringCategory(item)}
                            style={[styles.chip, recurringCategory === item && styles.activeChip]}
                          >
                            <Text style={[styles.chipText, recurringCategory === item && styles.activeChipText]}>{item}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <TextInput
                        onChange={handleTextChange(setRecurringAccount)}
                        onChangeText={setRecurringAccount}
                        placeholder="Cuenta"
                        style={styles.input}
                        value={recurringAccount}
                      />
                      <TextInput
                        onChange={handleTextChange(setRecurringNote)}
                        onChangeText={setRecurringNote}
                        placeholder="Nota opcional"
                        style={styles.input}
                        value={recurringNote}
                      />
                      <Pressable
                        disabled={savingRecurring}
                        onPress={saveRecurringTransaction}
                        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.primaryButtonText}>{savingRecurring ? 'Guardando...' : 'Crear recurrente'}</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                {!recurringUnavailable && recurringTransactions.length > 0 ? (
                  recurringTransactions.map((item) => (
                    <RecurringRow
                      alreadyRegistered={recurringStatusById.has(item.id)}
                      item={item}
                      key={item.id}
                      month={recurringMonth}
                      onDelete={() => deleteRecurringTransaction(item)}
                      onRegister={() => registerRecurringTransaction(item)}
                      onUpdate={(nextData) => updateRecurringTransaction(item, nextData)}
                    />
                  ))
                ) : !loading && !recurringUnavailable ? (
                  <Text style={styles.emptyText}>Todavia no tienes movimientos recurrentes.</Text>
                ) : null}

                <Text style={styles.sectionTitle}>Historial ({filteredTransactions.length})</Text>
              </>
            ) : null}

            {activeTab === 'savings' ? (
              <>
                <View style={styles.panel}>
                  <View style={styles.budgetHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Cajas de ahorro</Text>
                      <Text style={styles.muted}>
                        {savingsBoxes.length > 0 ? `${savingsTotals.progress}% del total de metas` : 'Crea metas separadas para tus objetivos'}
                      </Text>
                    </View>
                    <Text style={styles.budgetValue}>{currency.format(savingsTotals.saved)}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.categoryFill, { width: `${savingsTotals.progress}%` }]} />
                  </View>
                  {savingsUnavailable ? (
                    <Text style={styles.emptyText}>
                      Falta aplicar el bloque de savings_boxes en Supabase para activar este modulo.
                    </Text>
                  ) : (
                    <>
                      <TextInput
                        onChange={handleTextChange(setBoxName)}
                        onChangeText={setBoxName}
                        placeholder="Nombre: Viaje, moto, emergencia..."
                        style={styles.input}
                        value={boxName}
                      />
                      <TextInput
                        inputMode="decimal"
                        onChange={handleTextChange(setBoxTarget)}
                        onChangeText={setBoxTarget}
                        placeholder="Meta total"
                        style={styles.input}
                        value={boxTarget}
                      />
                      <TextInput
                        inputMode="decimal"
                        onChange={handleTextChange(setBoxCurrent)}
                        onChangeText={setBoxCurrent}
                        placeholder="Ya ahorrado"
                        style={styles.input}
                        value={boxCurrent}
                      />
                      <TextInput
                        inputMode="numeric"
                        onChange={handleTextChange(setBoxTargetDate)}
                        onChangeText={setBoxTargetDate}
                        placeholder="Fecha objetivo AAAA-MM-DD"
                        style={styles.input}
                        value={boxTargetDate}
                      />
                      <Pressable
                        disabled={savingBox}
                        onPress={saveSavingsBox}
                        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.primaryButtonText}>{savingBox ? 'Guardando...' : 'Crear caja'}</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                {savingsBoxes.length > 0 ? (
                  savingsBoxes.map((item) => (
                    <SavingsBoxRow
                      item={item}
                      key={item.id}
                      loading={savingBoxActionId === item.id}
                      movements={savingsMovements.filter((movement) => movement.savings_box_id === item.id)}
                      movementsUnavailable={savingsMovementsUnavailable}
                      onAdjust={(direction, rawAmount) => adjustSavingsBox(item, direction, rawAmount)}
                      onDelete={() => deleteSavingsBox(item)}
                      onUpdate={(nextName, nextTarget, nextTargetDate) => updateSavingsBox(item, nextName, nextTarget, nextTargetDate)}
                    />
                  ))
                ) : !loading && !savingsUnavailable ? (
                  <Text style={styles.emptyText}>Todavia no tienes cajas de ahorro.</Text>
                ) : null}
              </>
            ) : null}

            {activeTab === 'reports' ? (
              <View style={styles.panel}>
                <Text style={styles.sectionTitle}>Reportes del mes</Text>
                <TextInput
                  inputMode="numeric"
                  onChange={handleTextChange(setReportMonth)}
                  onChangeText={setReportMonth}
                  placeholder="Mes AAAA-MM"
                  style={styles.input}
                  value={reportMonth}
                />
                <View style={styles.reportGrid}>
                  <ReportStat label="Ingresos" value={currency.format(reportData.income)} />
                  <ReportStat label="Gastos" value={currency.format(reportData.expense)} />
                  <ReportStat label="Balance" value={currency.format(reportData.balance)} />
                  <ReportStat label="Categoria principal" value={reportData.topCategory?.name ?? 'Sin gastos'} />
                  <ReportStat label="Ingreso principal" value={reportData.topIncomeCategory?.name ?? 'Sin ingresos'} />
                  <ReportStat label="Promedio por gasto" value={currency.format(reportData.averageExpense)} />
                  <ReportStat label="Movimientos" value={String(reportData.monthTransactions.length)} />
                </View>
                <Text style={styles.subsectionTitle}>Presupuestos por categoria</Text>
                {categoryBudgetsUnavailable ? (
                  <Text style={styles.emptyText}>Falta aplicar el bloque de category_budgets en Supabase.</Text>
                ) : (
                  <>
                    <View style={styles.inlineForm}>
                      <TextInput
                        inputMode="decimal"
                        onChange={handleTextChange(setBudgetCategoryAmount)}
                        onChangeText={setBudgetCategoryAmount}
                        placeholder="Presupuesto"
                        style={[styles.input, styles.inlineInput]}
                        value={budgetCategoryAmount}
                      />
                      <Pressable
                        disabled={savingCategoryBudget}
                        onPress={saveCategoryBudget}
                        style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
                      >
                        <Text style={styles.smallButtonText}>{savingCategoryBudget ? '...' : 'Guardar'}</Text>
                      </Pressable>
                    </View>
                    <View style={styles.chips}>
                      {expenseCategories.map((item) => (
                        <Pressable
                          key={item}
                          onPress={() => setBudgetCategory(item)}
                          style={[styles.chip, budgetCategory === item && styles.activeChip]}
                        >
                          <Text style={[styles.chipText, budgetCategory === item && styles.activeChipText]}>{item}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {categoryBudgetRows.length > 0 ? (
                      categoryBudgetRows.map((item) => (
                        <CategoryBudgetRow item={item} key={item.id} onDelete={() => deleteCategoryBudget(item)} />
                      ))
                    ) : (
                      <Text style={styles.emptyText}>Crea presupuestos por categoria para este mes.</Text>
                    )}
                  </>
                )}
                <Text style={styles.subsectionTitle}>Gastos por categoria</Text>
                {reportData.categoriesByAmount.length > 0 ? (
                  reportData.categoriesByAmount.map((item) => (
                    <View key={item.name} style={styles.reportRow}>
                      <View style={styles.reportRowHeader}>
                        <Text style={styles.reportLabel}>{item.name}</Text>
                        <Text style={styles.reportValue}>{currency.format(item.value)}</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.categoryFill, { width: `${Math.max(8, (item.value / reportData.maxExpense) * 100)}%` }]} />
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Agrega gastos para ver reportes por categoria.</Text>
                )}
                <Text style={styles.subsectionTitle}>Ingresos por categoria</Text>
                {reportData.incomeCategoriesByAmount.length > 0 ? (
                  reportData.incomeCategoriesByAmount.map((item) => (
                    <View key={item.name} style={styles.reportRow}>
                      <View style={styles.reportRowHeader}>
                        <Text style={styles.reportLabel}>{item.name}</Text>
                        <Text style={styles.reportValue}>{currency.format(item.value)}</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.incomeFill, { width: `${Math.max(8, (item.value / reportData.maxIncome) * 100)}%` }]} />
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>Agrega ingresos para ver reportes por categoria.</Text>
                )}
              </View>
            ) : null}

            {activeTab === 'security' ? (
              <>
                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Perfil</Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Correo</Text>
                    <Text style={styles.infoValue}>{session?.user.email ?? 'Sin correo'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Movimientos</Text>
                    <Text style={styles.infoValue}>{transactions.length}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Cajas de ahorro</Text>
                    <Text style={styles.infoValue}>{savingsBoxes.length}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Mes de reportes</Text>
                    <Text style={styles.infoValue}>{reportMonth || 'Todos'}</Text>
                  </View>
                </View>

                <View style={styles.panel}>
                  <View style={styles.budgetHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Seguridad local</Text>
                      <Text style={styles.muted}>
                        {pinEnabled
                          ? `PIN activo${biometricAvailable ? ' + biometria disponible' : ''}`
                          : 'Activa un PIN para bloquear la app en este telefono'}
                      </Text>
                    </View>
                    {pinEnabled ? (
                      <Pressable onPress={lock} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Bloquear</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.inlineForm}>
                    <TextInput
                      inputMode="numeric"
                      maxLength={8}
                      onChange={handleTextChange(setNewPin)}
                      onChangeText={setNewPin}
                      placeholder={pinEnabled ? 'Cambiar PIN' : 'PIN nuevo'}
                      secureTextEntry
                      style={[styles.input, styles.inlineInput]}
                      value={newPin}
                    />
                    <Pressable onPress={savePin} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
                      <Text style={styles.smallButtonText}>{pinEnabled ? 'Cambiar' : 'Activar'}</Text>
                    </Pressable>
                  </View>
                  {pinEnabled ? (
                    <Pressable onPress={removePin} style={styles.textButton}>
                      <Text style={styles.dangerText}>Desactivar bloqueo local</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.panel}>
                  <Text style={styles.sectionTitle}>Privacidad</Text>
                  <Text style={styles.body}>
                    Tus datos se guardan por usuario y las reglas de Supabase impiden que otra cuenta lea tus movimientos, presupuestos o cajas.
                  </Text>
                  <Pressable onPress={exportTransactionsCsv} style={({ pressed }) => [styles.secondaryButtonWide, pressed && styles.pressed]}>
                    <Text style={styles.secondaryButtonText}>Exportar respaldo CSV</Text>
                  </Pressable>
                  <Pressable onPress={signOut} style={styles.textButton}>
                    <Text style={styles.dangerText}>Cerrar sesion</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {loading && <ActivityIndicator color="#246BFE" />}
          </View>
        }
        contentContainerStyle={styles.listContent}
        data={visibleTransactions}
        ListEmptyComponent={
          activeTab === 'transactions' && !loading ? <Text style={styles.emptyText}>Todavia no hay movimientos.</Text> : undefined
        }
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionRow item={item} onDelete={() => deleteTransaction(item)} onUpdate={(nextData) => updateTransaction(item, nextData)} />
        )}
      />
    </SafeAreaView>
  );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.activeTabButton]}>
      <Text style={[styles.tabButtonText, active && styles.activeTabButtonText]}>{label}</Text>
    </Pressable>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reportStat}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.reportStatValue}>{value}</Text>
    </View>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, tone === 'good' ? styles.good : styles.bad]}>{currency.format(value)}</Text>
    </View>
  );
}

function Insight({ text }: { text: string }) {
  return (
    <View style={styles.insightItem}>
      <Text style={styles.insightText}>{text}</Text>
    </View>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.activeChoice]}>
      <Text style={[styles.choiceText, active && styles.activeChoiceText]}>{label}</Text>
    </Pressable>
  );
}

function CategoryBudgetRow({
  item,
  onDelete,
}: {
  item: CategoryBudget & { amount: number; remaining: number; spent: number; usage: number };
  onDelete: () => void;
}) {
  return (
    <View style={styles.reportRow}>
      <View style={styles.reportRowHeader}>
        <View style={styles.transactionText}>
          <Text style={styles.reportLabel}>{item.category}</Text>
          <Text style={styles.transactionMeta}>
            {currency.format(item.spent)} de {currency.format(item.amount)}
          </Text>
        </View>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Eliminar</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[item.remaining >= 0 ? styles.categoryFill : styles.overBudgetFill, { width: `${Math.max(8, item.usage)}%` }]} />
      </View>
      <Text style={[styles.transactionMeta, item.remaining >= 0 ? styles.good : styles.bad]}>
        {item.remaining >= 0 ? `${currency.format(item.remaining)} disponible` : `${currency.format(Math.abs(item.remaining))} por encima`}
      </Text>
    </View>
  );
}

function RecurringRow({
  alreadyRegistered,
  item,
  month,
  onDelete,
  onRegister,
  onUpdate,
}: {
  alreadyRegistered: boolean;
  item: RecurringTransaction;
  month: string;
  onDelete: () => void;
  onRegister: () => void;
  onUpdate: (nextData: {
    account: string;
    amount: string;
    category: string;
    day: string;
    note: string;
    type: 'income' | 'expense';
  }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<'income' | 'expense'>(item.type);
  const [editAmount, setEditAmount] = useState(String(Number(item.amount)));
  const [editCategory, setEditCategory] = useState(item.category);
  const [editAccount, setEditAccount] = useState(item.account);
  const [editNote, setEditNote] = useState(item.note ?? '');
  const [editDay, setEditDay] = useState(String(item.day_of_month));
  const [savingEdit, setSavingEdit] = useState(false);
  const editCategories = editType === 'income' ? incomeCategories : expenseCategories;

  const changeEditType = (nextType: 'income' | 'expense') => {
    setEditType(nextType);
    setEditCategory(nextType === 'income' ? incomeCategories[0] : expenseCategories[0]);
  };

  const cancelEdit = () => {
    setEditType(item.type);
    setEditAmount(String(Number(item.amount)));
    setEditCategory(item.category);
    setEditAccount(item.account);
    setEditNote(item.note ?? '');
    setEditDay(String(item.day_of_month));
    setEditing(false);
  };

  const submitEdit = async () => {
    setSavingEdit(true);
    const saved = await onUpdate({
      account: editAccount,
      amount: editAmount,
      category: editCategory,
      day: editDay,
      note: editNote,
      type: editType,
    });
    setSavingEdit(false);

    if (saved) {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <View style={styles.editTransactionRow}>
        <View style={styles.segment}>
          <Choice active={editType === 'expense'} label="Gasto" onPress={() => changeEditType('expense')} />
          <Choice active={editType === 'income'} label="Ingreso" onPress={() => changeEditType('income')} />
        </View>
        <TextInput
          inputMode="decimal"
          onChange={handleTextChange(setEditAmount)}
          onChangeText={setEditAmount}
          placeholder="Monto recurrente"
          style={styles.input}
          value={editAmount}
        />
        <TextInput
          inputMode="numeric"
          maxLength={2}
          onChange={handleTextChange(setEditDay)}
          onChangeText={setEditDay}
          placeholder="Dia del mes"
          style={styles.input}
          value={editDay}
        />
        <Text style={styles.subsectionTitle}>{editType === 'income' ? 'Tipo de ingreso' : 'Categoria del gasto'}</Text>
        <View style={styles.chips}>
          {editCategories.map((categoryOption) => (
            <Pressable
              key={categoryOption}
              onPress={() => setEditCategory(categoryOption)}
              style={[styles.chip, editCategory === categoryOption && styles.activeChip]}
            >
              <Text style={[styles.chipText, editCategory === categoryOption && styles.activeChipText]}>{categoryOption}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          onChange={handleTextChange(setEditAccount)}
          onChangeText={setEditAccount}
          placeholder="Cuenta"
          style={styles.input}
          value={editAccount}
        />
        <TextInput
          onChange={handleTextChange(setEditNote)}
          onChangeText={setEditNote}
          placeholder="Nota opcional"
          style={styles.input}
          value={editNote}
        />
        <View style={styles.savingsActions}>
          <Pressable disabled={savingEdit} onPress={submitEdit} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Text style={styles.actionButtonText}>{savingEdit ? '...' : 'Guardar'}</Text>
          </Pressable>
          <Pressable disabled={savingEdit} onPress={cancelEdit} style={styles.editButton}>
            <Text style={styles.editButtonText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.savingsRow}>
      <View style={styles.reportRowHeader}>
        <View style={styles.transactionText}>
          <Text style={styles.transactionTitle}>{item.category}</Text>
          <Text style={styles.transactionMeta}>
            Dia {item.day_of_month} · {item.account}
          </Text>
          <Text style={[styles.transactionMeta, alreadyRegistered ? styles.good : styles.warningText]}>
            {alreadyRegistered ? `Registrado en ${monthLabel(month)}` : `Pendiente en ${monthLabel(month)}`}
          </Text>
          {item.note ? <Text style={styles.transactionNote}>{item.note}</Text> : null}
        </View>
        <Text style={[styles.transactionAmount, item.type === 'income' ? styles.good : styles.bad]}>
          {item.type === 'income' ? '+' : '-'}
          {currency.format(Number(item.amount))}
        </Text>
      </View>
      <View style={styles.savingsActions}>
        <Pressable
          disabled={alreadyRegistered}
          onPress={onRegister}
          style={({ pressed }) => [alreadyRegistered ? styles.disabledActionButton : styles.actionButton, pressed && styles.pressed]}
        >
          <Text style={styles.actionButtonText}>{alreadyRegistered ? 'Registrado' : 'Registrar mes'}</Text>
        </Pressable>
        <Pressable onPress={() => setEditing(true)} style={styles.editButton}>
          <Text style={styles.editButtonText}>Editar</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Eliminar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TransactionRow({
  item,
  onDelete,
  onUpdate,
}: {
  item: FinanceTransaction;
  onDelete: () => void;
  onUpdate: (nextData: {
    account: string;
    amount: string;
    category: string;
    date: string;
    note: string;
    type: 'income' | 'expense';
  }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<'income' | 'expense'>(item.type);
  const [editAmount, setEditAmount] = useState(String(Number(item.amount)));
  const [editCategory, setEditCategory] = useState(item.category);
  const [editAccount, setEditAccount] = useState(item.account);
  const [editNote, setEditNote] = useState(item.note ?? '');
  const [editDate, setEditDate] = useState(toDateInputValue(item.occurred_at));
  const [savingEdit, setSavingEdit] = useState(false);
  const date = new Date(item.occurred_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  const editCategories = editType === 'income' ? incomeCategories : expenseCategories;

  const changeEditType = (nextType: 'income' | 'expense') => {
    setEditType(nextType);
    setEditCategory(nextType === 'income' ? incomeCategories[0] : expenseCategories[0]);
  };

  const cancelEdit = () => {
    setEditType(item.type);
    setEditAmount(String(Number(item.amount)));
    setEditCategory(item.category);
    setEditAccount(item.account);
    setEditNote(item.note ?? '');
    setEditDate(toDateInputValue(item.occurred_at));
    setEditing(false);
  };

  const submitEdit = async () => {
    setSavingEdit(true);
    const saved = await onUpdate({
      account: editAccount,
      amount: editAmount,
      category: editCategory,
      date: editDate,
      note: editNote,
      type: editType,
    });
    setSavingEdit(false);

    if (saved) {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <View style={styles.editTransactionRow}>
        <View style={styles.segment}>
          <Choice active={editType === 'expense'} label="Gasto" onPress={() => changeEditType('expense')} />
          <Choice active={editType === 'income'} label="Ingreso" onPress={() => changeEditType('income')} />
        </View>
        <TextInput
          inputMode="decimal"
          onChange={handleTextChange(setEditAmount)}
          onChangeText={setEditAmount}
          placeholder="Monto"
          style={styles.input}
          value={editAmount}
        />
        <TextInput
          inputMode="numeric"
          onChange={handleTextChange(setEditDate)}
          onChangeText={setEditDate}
          placeholder="Fecha AAAA-MM-DD"
          style={styles.input}
          value={editDate}
        />
        <Text style={styles.subsectionTitle}>{editType === 'income' ? 'Tipo de ingreso' : 'Categoria del gasto'}</Text>
        <View style={styles.chips}>
          {editCategories.map((categoryOption) => (
            <Pressable
              key={categoryOption}
              onPress={() => setEditCategory(categoryOption)}
              style={[styles.chip, editCategory === categoryOption && styles.activeChip]}
            >
              <Text style={[styles.chipText, editCategory === categoryOption && styles.activeChipText]}>{categoryOption}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          onChange={handleTextChange(setEditAccount)}
          onChangeText={setEditAccount}
          placeholder="Cuenta"
          style={styles.input}
          value={editAccount}
        />
        <TextInput
          onChange={handleTextChange(setEditNote)}
          onChangeText={setEditNote}
          placeholder="Nota opcional"
          style={styles.input}
          value={editNote}
        />
        <View style={styles.savingsActions}>
          <Pressable disabled={savingEdit} onPress={submitEdit} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
            <Text style={styles.actionButtonText}>{savingEdit ? '...' : 'Guardar'}</Text>
          </Pressable>
          <Pressable disabled={savingEdit} onPress={cancelEdit} style={styles.editButton}>
            <Text style={styles.editButtonText}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.transactionRow}>
      <View style={styles.transactionText}>
        <Text style={styles.transactionTitle}>{item.category}</Text>
        <Text style={styles.transactionMeta}>
          {date} · {item.account}
        </Text>
        {item.note ? <Text style={styles.transactionNote}>{item.note}</Text> : null}
      </View>
      <Text style={[styles.transactionAmount, item.type === 'income' ? styles.good : styles.bad]}>
        {item.type === 'income' ? '+' : '-'}
        {currency.format(Number(item.amount))}
      </Text>
      <View style={styles.rowButtons}>
        <Pressable onPress={() => setEditing(true)} style={styles.editButton}>
          <Text style={styles.editButtonText}>Editar</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Eliminar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SavingsBoxRow({
  item,
  loading,
  movements,
  movementsUnavailable,
  onAdjust,
  onDelete,
  onUpdate,
}: {
  item: SavingsBox;
  loading: boolean;
  movements: SavingsMovement[];
  movementsUnavailable: boolean;
  onAdjust: (direction: 'deposit' | 'withdraw', rawAmount: string) => Promise<void>;
  onDelete: () => void;
  onUpdate: (nextName: string, nextTarget: string, nextTargetDate: string) => Promise<boolean>;
}) {
  const [adjustment, setAdjustment] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editTarget, setEditTarget] = useState(String(Number(item.target_amount)));
  const [editTargetDate, setEditTargetDate] = useState(item.target_date ?? '');
  const target = Number(item.target_amount);
  const current = Number(item.current_amount);
  const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const remaining = Math.max(target - current, 0);
  const monthsLeft = monthsUntilDate(item.target_date);
  const monthlyNeeded = monthsLeft ? Math.ceil(remaining / monthsLeft) : null;

  const submitAdjustment = async (direction: 'deposit' | 'withdraw') => {
    await onAdjust(direction, adjustment);
    setAdjustment('');
  };

  const submitEdit = async () => {
    const saved = await onUpdate(editName, editTarget, editTargetDate);

    if (saved) {
      setEditing(false);
    }
  };

  const cancelEdit = () => {
    setEditName(item.name);
    setEditTarget(String(Number(item.target_amount)));
    setEditTargetDate(item.target_date ?? '');
    setEditing(false);
  };

  return (
    <View style={styles.savingsRow}>
      <View style={styles.reportRowHeader}>
        {editing ? (
          <View style={styles.transactionText}>
            <TextInput
              onChange={handleTextChange(setEditName)}
              onChangeText={setEditName}
              placeholder="Nombre de la caja"
              style={styles.input}
              value={editName}
            />
            <TextInput
              inputMode="decimal"
              onChange={handleTextChange(setEditTarget)}
              onChangeText={setEditTarget}
              placeholder="Meta"
              style={styles.input}
              value={editTarget}
            />
            <TextInput
              inputMode="numeric"
              onChange={handleTextChange(setEditTargetDate)}
              onChangeText={setEditTargetDate}
              placeholder="Fecha objetivo AAAA-MM-DD"
              style={styles.input}
              value={editTargetDate}
            />
          </View>
        ) : (
          <View style={styles.transactionText}>
            <Text style={styles.transactionTitle}>{item.name}</Text>
            <Text style={styles.transactionMeta}>
              {currency.format(current)} de {currency.format(target)}
            </Text>
            <Text style={styles.transactionMeta}>
              {item.target_date
                ? `Objetivo: ${item.target_date.slice(0, 10)} · ${currency.format(monthlyNeeded ?? 0)} al mes`
                : 'Sin fecha objetivo'}
            </Text>
          </View>
        )}
        <Pressable disabled={loading} onPress={editing ? cancelEdit : () => setEditing(true)} style={styles.editButton}>
          <Text style={styles.editButtonText}>{editing ? 'Cancelar' : 'Editar'}</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.categoryFill, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.transactionMeta}>{progress}% completado</Text>
      <Text style={styles.subsectionTitle}>Transferencias internas</Text>
      {movementsUnavailable ? (
        <Text style={styles.transactionMeta}>Falta aplicar el bloque de savings_movements en Supabase.</Text>
      ) : movements.length > 0 ? (
        movements.slice(0, 4).map((movement) => {
          const movementDate = new Date(movement.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

          return (
            <View key={movement.id} style={styles.movementRow}>
              <View style={styles.transactionText}>
                <Text style={styles.transactionMeta}>
                  {movement.type === 'deposit' ? 'Aporte' : 'Retiro'} · {movementDate}
                </Text>
                {movement.note ? <Text style={styles.transactionNote}>{movement.note}</Text> : null}
              </View>
              <Text style={[styles.transactionAmount, movement.type === 'deposit' ? styles.good : styles.bad]}>
                {movement.type === 'deposit' ? '+' : '-'}
                {currency.format(Number(movement.amount))}
              </Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.transactionMeta}>Sin transferencias registradas todavia.</Text>
      )}
      {editing ? (
        <Pressable disabled={loading} onPress={submitEdit} style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}>
          <Text style={styles.smallButtonText}>{loading ? 'Guardando...' : 'Guardar cambios'}</Text>
        </Pressable>
      ) : (
        <>
          <TextInput
            inputMode="decimal"
            onChange={handleTextChange(setAdjustment)}
            onChangeText={setAdjustment}
            placeholder="Monto para mover"
            style={styles.input}
            value={adjustment}
          />
          <View style={styles.savingsActions}>
            <Pressable
              disabled={loading}
              onPress={() => submitAdjustment('deposit')}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            >
              <Text style={styles.actionButtonText}>{loading ? '...' : 'Transferir a caja'}</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={() => submitAdjustment('withdraw')}
              style={({ pressed }) => [styles.withdrawButton, pressed && styles.pressed]}
            >
              <Text style={styles.withdrawButtonText}>Retirar</Text>
            </Pressable>
            <Pressable disabled={loading} onPress={onDelete} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>Eliminar</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  centered: {
    alignItems: 'center',
    backgroundColor: '#F7F8FA',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  setup: {
    gap: 14,
    padding: 24,
  },
  authContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  lockContent: {
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    gap: 18,
    padding: 18,
  },
  listContent: {
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tabBar: {
    backgroundColor: '#E9EEF6',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  tabButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
  },
  tabButtonText: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '800',
  },
  activeTabButtonText: {
    color: '#172033',
  },
  logo: {
    color: '#172033',
    fontSize: 28,
    fontWeight: '800',
  },
  title: {
    color: '#172033',
    fontSize: 24,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#172033',
    fontSize: 18,
    fontWeight: '800',
  },
  subsectionTitle: {
    color: '#344054',
    fontSize: 15,
    fontWeight: '800',
  },
  body: {
    color: '#667085',
    fontSize: 16,
    lineHeight: 23,
  },
  muted: {
    color: '#667085',
    fontSize: 14,
  },
  form: {
    gap: 12,
    marginTop: 18,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D9DEE8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#172033',
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#246BFE',
    borderRadius: 8,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  formMessage: {
    borderRadius: 8,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorMessage: {
    backgroundColor: '#FDEBE8',
    color: '#9D2A22',
  },
  successMessage: {
    backgroundColor: '#EAF7EF',
    color: '#226B3A',
  },
  secondaryButton: {
    borderColor: '#CCD4E0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonWide: {
    alignItems: 'center',
    borderColor: '#CCD4E0',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#172033',
    fontWeight: '700',
  },
  textButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  textButtonText: {
    color: '#246BFE',
    fontWeight: '700',
  },
  dangerText: {
    color: '#C0362C',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.82,
  },
  summaryGrid: {
    gap: 10,
  },
  summaryItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E8F0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  summaryLabel: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E8F0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  reportGrid: {
    gap: 10,
  },
  reportStat: {
    backgroundColor: '#F7F9FC',
    borderColor: '#E3E8F0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  reportStatValue: {
    color: '#172033',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  reportRow: {
    gap: 8,
  },
  reportRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reportLabel: {
    color: '#172033',
    fontWeight: '800',
  },
  reportValue: {
    color: '#344054',
    fontWeight: '800',
  },
  budgetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  budgetValue: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '900',
  },
  progressTrack: {
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#246BFE',
    borderRadius: 999,
    height: '100%',
  },
  categoryFill: {
    backgroundColor: '#087443',
    borderRadius: 999,
    height: '100%',
  },
  overBudgetFill: {
    backgroundColor: '#C0362C',
    borderRadius: 999,
    height: '100%',
  },
  incomeFill: {
    backgroundColor: '#246BFE',
    borderRadius: 999,
    height: '100%',
  },
  insightList: {
    gap: 8,
  },
  insightItem: {
    backgroundColor: '#F7F9FC',
    borderColor: '#E3E8F0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  insightText: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: '#EEF2F7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  infoLabel: {
    color: '#667085',
    fontWeight: '800',
  },
  infoValue: {
    color: '#172033',
    flex: 1,
    fontWeight: '800',
    textAlign: 'right',
  },
  inlineForm: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  inlineInput: {
    flex: 1,
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#172033',
    borderRadius: 8,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  segment: {
    backgroundColor: '#EEF2F7',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  choice: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    paddingVertical: 10,
  },
  activeChoice: {
    backgroundColor: '#FFFFFF',
  },
  choiceText: {
    color: '#667085',
    fontWeight: '800',
  },
  activeChoiceText: {
    color: '#172033',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderColor: '#D9DEE8',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  activeChip: {
    backgroundColor: '#E8F0FF',
    borderColor: '#246BFE',
  },
  chipText: {
    color: '#667085',
    fontWeight: '700',
  },
  activeChipText: {
    color: '#174EA6',
  },
  transactionRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E8F0',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginHorizontal: 18,
    marginTop: 10,
    padding: 14,
  },
  editTransactionRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B7C7F3',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 14,
  },
  savingsRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E8F0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginHorizontal: 18,
    marginTop: 10,
    padding: 14,
  },
  savingsActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#087443',
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  disabledActionButton: {
    alignItems: 'center',
    backgroundColor: '#98A2B3',
    borderRadius: 8,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  withdrawButton: {
    alignItems: 'center',
    backgroundColor: '#FDEBE8',
    borderColor: '#F3B7B0',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  withdrawButtonText: {
    color: '#C0362C',
    fontWeight: '800',
  },
  editButton: {
    alignSelf: 'flex-start',
    borderColor: '#B7C7F3',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  editButtonText: {
    color: '#174EA6',
    fontSize: 12,
    fontWeight: '800',
  },
  transactionText: {
    flex: 1,
    gap: 4,
  },
  transactionTitle: {
    color: '#172033',
    fontSize: 16,
    fontWeight: '800',
  },
  transactionMeta: {
    color: '#667085',
    fontSize: 13,
  },
  transactionNote: {
    color: '#4B5565',
    fontSize: 13,
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '900',
  },
  rowButtons: {
    alignItems: 'flex-end',
    gap: 8,
  },
  movementRow: {
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 10,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    borderColor: '#F3B7B0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deleteButtonText: {
    color: '#C0362C',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    fontSize: 14,
    marginHorizontal: 18,
    marginTop: 10,
  },
  good: {
    color: '#087443',
  },
  bad: {
    color: '#C0362C',
  },
  warningText: {
    color: '#A15C07',
  },
});

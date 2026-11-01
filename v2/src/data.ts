export type FinanceRecord = Record<string, unknown> & { id: string };

export type FinanceData = {
  transactions: FinanceRecord[];
  budgets: FinanceRecord[];
  accounts: FinanceRecord[];
  categories: FinanceRecord[];
  investments: FinanceRecord[];
  recurring: FinanceRecord[];
  savingsBuckets: FinanceRecord[];
  debts: FinanceRecord[];
  creditScoreHistory: FinanceRecord[];
  creditScore: FinanceRecord | null;
  budgetGroups: FinanceRecord[];
};

export const DOMAIN_TABLES = {
  transactions: 'transactions',
  budgets: 'budgets',
  accounts: 'accounts',
  categories: 'categories',
  investments: 'investments',
  recurring: 'recurring_rules',
  savingsBuckets: 'savings_buckets',
  debts: 'debts',
  creditScoreHistory: 'credit_score_history',
} as const;

export const DEFAULT_CATEGORIES: FinanceRecord[] = [
  { id: 'v2-income-salary', key: 'salary', name: '💰 Salary', kind: 'income', default: true },
  { id: 'v2-income-freelance', key: 'freelance', name: '💼 Freelance', kind: 'income', default: true },
  { id: 'v2-income-interest', key: 'interest', name: '🏦 Interest', kind: 'income', default: true },
  { id: 'v2-income-dividends', key: 'dividends', name: '💹 Dividends', kind: 'income', default: true },
  { id: 'v2-income-gifts', key: 'gifts', name: '🎁 Gifts', kind: 'income', default: true },
  { id: 'v2-expense-me', key: 'me', name: '👤 Me', kind: 'expense', default: true, groupId: 'grp-lifestyle' },
  { id: 'v2-expense-home', key: 'home', name: '🏠 Home', kind: 'expense', default: true, groupId: 'grp-commitments' },
  { id: 'v2-expense-fuel', key: 'fuel', name: '⛽ Fuel', kind: 'expense', default: true, groupId: 'grp-lifestyle' },
  { id: 'v2-expense-investments', key: 'investments', name: '📈 Investments', kind: 'expense', default: true, groupId: 'grp-investments' },
  { id: 'v2-expense-subscriptions', key: 'subscriptions', name: '🔁 Subscriptions', kind: 'expense', default: true, groupId: 'grp-commitments' },
  { id: 'v2-expense-emi', key: 'emis', name: '✂️ EMIs', kind: 'expense', default: false, groupId: 'grp-commitments' },
  { id: 'v2-income-refund', key: 'refund', name: '💵 Refund', kind: 'income', default: false },
  { id: 'v2-expense-lent', key: 'lent', name: '🧾 Lent', kind: 'expense', default: false, groupId: '' },
  { id: 'v2-expense-surplus', key: 'surplus', name: '💳 Surplus', kind: 'expense', default: false, groupId: 'grp-investments' },
  { id: 'v2-expense-surplus-investment', key: 'surplus-investment', name: '🚀 Surplus Investment', kind: 'expense', default: true, groupId: 'grp-investments' },
];

export const DEFAULT_BUDGET_GROUPS: FinanceRecord[] = [
  { id: 'grp-lifestyle', name: 'Lifestyle', icon: '🏖️' },
  { id: 'grp-investments', name: 'Investments', icon: '📈' },
  { id: 'grp-commitments', name: 'Commitments', icon: '📋' },
  { id: 'grp-savings', name: 'Savings', icon: '💰' },
];

function guessBudgetGroup(categoryName: string): string {
  const lower = categoryName.toLocaleLowerCase();
  const groups: Array<[string, string[]]> = [
    ['grp-lifestyle', ['food', 'dining', 'entertainment', 'shopping', 'travel', 'fuel', 'personal care', 'hobby', 'hobbies']],
    ['grp-investments', ['sip', 'mutual fund', 'stock', 'gold', 'epf', 'retirement', 'invest']],
    ['grp-commitments', ['rent', 'emi', 'insurance', 'bill', 'subscription', 'donation', 'loan', 'home']],
    ['grp-savings', ['emergency fund', 'vacation fund', 'gadget fund', 'house fund', 'cash saving', 'saving']],
  ];
  return groups.find(([, terms]) => terms.some((term) => lower.includes(term)))?.[0] ?? '';
}

export function emptyFinanceData(): FinanceData {
  return {
    transactions: [],
    budgets: [],
    accounts: [],
    categories: DEFAULT_CATEGORIES.map((row) => ({ ...row })),
    investments: [],
    recurring: [],
    savingsBuckets: [],
    debts: [],
    creditScoreHistory: [],
    creditScore: null,
    budgetGroups: [...DEFAULT_BUDGET_GROUPS],
  };
}

export function normalizeBackup(value: unknown): FinanceData | null {
  if (!value || typeof value !== 'object') return null;
  const backup = value as Record<string, unknown>;
  const requiredLists = ['transactions', 'budgets', 'accounts', 'categories', 'investments', 'recurring'];
  if (!requiredLists.every((key) => Array.isArray(backup[key]))) return null;

  const list = (key: string): FinanceRecord[] =>
    Array.isArray(backup[key])
      ? (backup[key] as unknown[]).filter(
          (record): record is FinanceRecord =>
            Boolean(record && typeof record === 'object' && typeof (record as FinanceRecord).id === 'string'),
        )
      : [];

  const categories = list('categories');
  if (!categories.some((row) => recordText(row.name).toLocaleLowerCase().includes('surplus investment') || row.key === 'surplus_investment')) {
    categories.push({ id: 'cat-surplus-investment', key: 'surplus_investment', name: '🚀 Surplus Investment', kind: 'expense', default: true, groupId: 'grp-investments', createdAt: Date.now() });
  }
  categories.forEach((row) => {
    if (row.kind === 'expense' && row.groupId === undefined) row.groupId = guessBudgetGroup(recordText(row.name));
  });
  return {
    transactions: list('transactions'),
    budgets: list('budgets'),
    accounts: list('accounts'),
    categories,
    investments: list('investments'),
    recurring: list('recurring'),
    savingsBuckets: list('savingsBuckets'),
    debts: list('debts'),
    creditScoreHistory: list('creditScoreHistory'),
    creditScore: backup.creditScore && typeof backup.creditScore === 'object'
      ? backup.creditScore as FinanceRecord
      : null,
    budgetGroups: list('budgetGroups').length ? list('budgetGroups') : [...DEFAULT_BUDGET_GROUPS],
  };
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function recordText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function recordNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function todayISO(): string {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

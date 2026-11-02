import { createClient } from '@supabase/supabase-js';
import { DEFAULT_BUDGET_GROUPS, DEFAULT_CATEGORIES, DOMAIN_TABLES, type FinanceData, type FinanceRecord } from './data';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : null;

export async function loadFinanceData(userId: string): Promise<FinanceData | null> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const entries = await Promise.all(
    Object.entries(DOMAIN_TABLES).map(async ([key, table]) => {
      const { data, error } = await supabase!
        .from(table)
        .select('data')
        .eq('user_id', userId);
      if (error) throw error;
      return [key, (data ?? []).map((row) => row.data as FinanceRecord)] as const;
    }),
  );
  const { data: preferences, error } = await supabase
    .from('finance_preferences')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  const domains = Object.fromEntries(entries) as Record<string, FinanceRecord[]>;
  const hasAnyData = entries.some(([, rows]) => rows.length > 0) || Boolean(preferences);
  if (!hasAnyData) return null;
  return {
    transactions: domains.transactions ?? [],
    budgets: domains.budgets ?? [],
    accounts: domains.accounts ?? [],
    categories: domains.categories?.length ? domains.categories : DEFAULT_CATEGORIES.map((row) => ({ ...row })),
    investments: domains.investments ?? [],
    recurring: domains.recurring ?? [],
    savingsBuckets: domains.savingsBuckets ?? [],
    debts: domains.debts ?? [],
    creditScoreHistory: domains.creditScoreHistory ?? [],
    creditScore: preferences?.data?.creditScore && typeof preferences.data.creditScore === 'object'
      ? preferences.data.creditScore as FinanceRecord
      : null,
    budgetGroups: Array.isArray(preferences?.data?.budgetGroups) && preferences.data.budgetGroups.length ? preferences.data.budgetGroups : [...DEFAULT_BUDGET_GROUPS],
  };
}

export async function saveInitialFinanceData(userId: string, state: FinanceData): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  await saveDomains(userId, state);
}

export async function saveDomains(userId: string, state: FinanceData): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  for (const [key, table] of Object.entries(DOMAIN_TABLES)) {
    const records = state[key as keyof typeof DOMAIN_TABLES];
    for (let offset = 0; offset < records.length; offset += 250) {
      const rows = records.slice(offset, offset + 250).map((record) => ({ user_id: userId, id: record.id, data: record }));
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw error;
    }
  }
  const { error } = await supabase.from('finance_preferences').upsert({
    user_id: userId,
    data: { creditScore: state.creditScore, budgetGroups: state.budgetGroups },
  });
  if (error) throw error;
}

export async function replaceDomains(userId: string, state: FinanceData): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  for (const table of Object.values(DOMAIN_TABLES)) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }
  const { error } = await supabase.from('finance_preferences').delete().eq('user_id', userId);
  if (error) throw error;
  await saveDomains(userId, state);
}

export async function saveOne(
  userId: string,
  key: keyof typeof DOMAIN_TABLES,
  record: FinanceRecord,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const table = DOMAIN_TABLES[key];
  const { data, error } = await supabase
    .from(table)
    .upsert({ user_id: userId, id: record.id, data: record }, { onConflict: 'user_id,id' })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`Supabase did not confirm saving this ${key.replace(/([A-Z])/g, ' $1').toLowerCase()} record.`);
}

export async function deleteOne(
  userId: string,
  key: keyof typeof DOMAIN_TABLES,
  id: string,
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase
    .from(DOMAIN_TABLES[key])
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}

export async function savePreferences(userId: string, data: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('finance_preferences').upsert({ user_id: userId, data });
  if (error) throw error;
}

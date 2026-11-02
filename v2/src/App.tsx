import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode, RefObject } from 'react';
import { ArrowDownRight, ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, Cloud, CreditCard, LayoutDashboard, Landmark, LogOut, MoreHorizontal, Percent, Plus, Scale, Search, Settings, ShieldCheck, Sparkles, Tags, Upload, Wallet, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { emptyFinanceData, money, normalizeBackup, recordNumber, recordText, todayISO, type FinanceData, type FinanceRecord, DOMAIN_TABLES } from './data';
import { deleteOne, isSupabaseConfigured, loadFinanceData, replaceDomains, saveDomains, saveOne, savePreferences, supabase } from './supabase';

type Tab = 'dashboard' | 'transactions' | 'mymoney' | 'budgets' | 'creditdebt' | 'planning' | 'categories' | 'calendar' | 'settings';
type DomainKey = keyof typeof DOMAIN_TABLES;
type DialogKind = 'transaction' | 'account' | 'category' | 'budget' | 'debt' | 'creditScore' | 'investment' | 'bucket' | 'bucketTransfer' | 'recurring';
const primary = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions' as const, label: 'Transactions', icon: ArrowDownRight },
  { id: 'mymoney' as const, label: 'My Money', icon: Wallet },
  { id: 'budgets' as const, label: 'Budgets', icon: Sparkles },
  { id: 'creditdebt' as const, label: 'Credit & Debt', icon: CreditCard },
];
const secondary = [
  { id: 'planning' as const, label: 'Planning', icon: Sparkles },
  { id: 'categories' as const, label: 'Categories', icon: Tags },
  { id: 'calendar' as const, label: 'Calendar', icon: CalendarDays },
  { id: 'settings' as const, label: 'Account & Settings', icon: Settings },
];

function financeCacheKey(userId: string) { return `finance-v2-session:${userId}`; }
function readFinanceCache(userId: string): FinanceData | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(financeCacheKey(userId)) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const cached = value as Partial<FinanceData>;
    const lists: Array<keyof FinanceData> = ['transactions', 'budgets', 'accounts', 'categories', 'investments', 'recurring', 'savingsBuckets', 'debts', 'creditScoreHistory'];
    if (!lists.every((key) => Array.isArray(cached[key])) || !Array.isArray(cached.budgetGroups)) return null;
    return cached as FinanceData;
  } catch { return null; }
}

export default function App() {
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured || previewMode);
  const [data, setData] = useState<FinanceData | null>(previewMode ? emptyFinanceData() : null);
  const [dataReady, setDataReady] = useState(previewMode);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [editingRecord, setEditingRecord] = useState<FinanceRecord | null>(null);
  const [bucketAction, setBucketAction] = useState<'fund' | 'withdraw'>('fund');
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem('pennywise-theme') !== 'light');
  const importRef = useRef<HTMLInputElement>(null);
  const dataRevisionRef = useRef(0);
  const realtimeRequestRef = useRef(0);
  const confirmedTransactionsRef = useRef<{ userId: string; records: Map<string, FinanceRecord> } | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data: value }) => {
      if (alive) {
        const nextUserId = value.session?.user.id ?? null;
        const accountChanged = nextUserId !== sessionUserIdRef.current;
        sessionUserIdRef.current = nextUserId;
        if (!previewMode && accountChanged) {
          const cached = nextUserId ? readFinanceCache(nextUserId) : null;
          setData(cached);
          setDataReady(Boolean(cached));
        }
        setSession(value.session);
        setAuthReady(true);
      }
    }).catch(() => setAuthReady(true));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, value) => {
      const nextUserId = value?.user.id ?? null;
      const accountChanged = nextUserId !== sessionUserIdRef.current;
      sessionUserIdRef.current = nextUserId;
      if (!previewMode && accountChanged) {
        const cached = nextUserId ? readFinanceCache(nextUserId) : null;
        setData(cached);
        setDataReady(Boolean(cached));
      }
      setSession(value);
      setError('');
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (previewMode && !session?.user.id) return;
    if (!session?.user.id) { setData(null); setDataReady(false); return; }
    let alive = true;
    setLoading(true);
    if (!data) setDataReady(false);
    loadFinanceData(session.user.id)
      .then((value) => { if (alive) { setData(value); setDataReady(true); } })
      .catch((reason: Error) => { if (alive) { setError(reason.message); setDataReady(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !data || !dataReady) return;
    try { window.sessionStorage.setItem(financeCacheKey(userId), JSON.stringify(data)); } catch { /* Storage can be unavailable in private browsing. */ }
  }, [session?.user.id, data, dataReady]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user.id) return;
    const userId = session.user.id;
    let active = true;
    let syncTimer: number | undefined;
    const channel = client.channel('finance-data-' + userId);
    for (const table of ['transactions', 'budgets', 'accounts', 'categories', 'investments', 'recurring_rules', 'savings_buckets', 'debts', 'credit_score_history', 'finance_preferences']) {
      channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: 'user_id=eq.' + userId,
      }, () => {
        window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(() => {
          const revisionAtRequest = dataRevisionRef.current;
          const requestId = ++realtimeRequestRef.current;
          loadFinanceData(userId).then((latest) => {
            if (!active || !latest || revisionAtRequest !== dataRevisionRef.current || requestId !== realtimeRequestRef.current) return;
            const confirmed = confirmedTransactionsRef.current;
            if (confirmed?.userId === userId) {
              const savedIds = new Set(latest.transactions.map((row) => row.id));
              for (const id of savedIds) confirmed.records.delete(id);
              const notYetVisible = [...confirmed.records.values()];
              latest.transactions = [...latest.transactions, ...notYetVisible];
              if (!confirmed.records.size) confirmedTransactionsRef.current = null;
            }
            setData(latest);
          }).catch(() => undefined);
        }, 450);
      });
    }
    channel.subscribe();
    return () => {
      active = false;
      window.clearTimeout(syncTimer);
      void client.removeChannel(channel);
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    window.localStorage.setItem('pennywise-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const user = session?.user;
  const current = data ?? emptyFinanceData();
  const displayName = previewMode && !user ? 'Preview user' : String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Your account');
  const firstName = displayName.split(/\s+/)[0];

  const signIn = async () => {
    if (!supabase) return;
    setBusy(true); setError('');
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (authError) setError(authError.message);
    setBusy(false);
  };
  const signOut = async () => { if (supabase) await supabase.auth.signOut(); setMenuOpen(false); };
  const startFresh = async () => {
    if (!user) return;
    setBusy(true); setError('');
    try { const value = emptyFinanceData(); await saveDomains(user.id, value); setData(value); setDataReady(true); setToast('Your finance space is ready.'); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    const hasExistingRecords = Boolean(data && (Object.keys(DOMAIN_TABLES) as DomainKey[]).some((key) => current[key].length > 0));
    if (hasExistingRecords && !window.confirm('Importing this backup will replace all finance records currently synced to this account. Export a backup first if you want to keep a copy. Continue?')) { event.target.value = ''; return; }
    setBusy(true); setError('');
    try {
      const value = normalizeBackup(JSON.parse(await file.text()));
      if (!value) throw new Error('Choose a valid JSON backup exported from Finance Tracker v1.');
      await replaceDomains(user.id, value); setData(value); setDataReady(true); setToast('Your v1 data has been imported.');
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); event.target.value = ''; }
  };
  const persist = async (key: DomainKey, record: FinanceRecord, next: FinanceData) => {
    if (!user && previewMode) { setData(next); setDialog(null); setEditingRecord(null); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try { await saveOne(user.id, key, record); setData(next); setDialog(null); setEditingRecord(null); setToast('Saved and synced.'); }
    catch (reason) { setError((reason as Error).message); }
  };
  const saveTransaction = async (record: FinanceRecord) => {
    setError('');
    const previous = current.transactions.find((row) => row.id === record.id);
    const investments = current.investments.map((row) => ({ ...row }));
    const debts = current.debts.map((row) => ({ ...row }));
    const adjustInvestment = (id: unknown, amount: number) => {
      const item = investments.find((row) => row.id === id);
      if (item) { item.invested = Math.max(0, recordNumber(item.invested) + amount); item.current = Math.max(0, recordNumber(item.current) + amount); item.updatedAt = Date.now(); }
    };
    const adjustDebt = (id: unknown, amount: number, reverse: boolean) => {
      const item = debts.find((row) => row.id === id);
      if (item) {
        item.remainingTenure = Math.max(0, Math.min(recordNumber(item.totalTenure), recordNumber(item.remainingTenure) + (reverse ? 1 : -1)));
        item.remainingOutstanding = Math.max(0, recordNumber(item.remainingOutstanding) + (reverse ? amount : -amount));
      }
    };
    if (previous?.type === 'expense') { adjustInvestment(previous.investmentId, -recordNumber(previous.amount)); adjustDebt(previous.debtId, recordNumber(previous.amount), true); }
    if (record.type === 'expense') { adjustInvestment(record.investmentId, recordNumber(record.amount)); adjustDebt(record.debtId, recordNumber(record.amount), false); }
    const next = { ...current, transactions: previous ? current.transactions.map((row) => row.id === record.id ? record : row) : [record, ...current.transactions], investments, debts };
    if (!user && previewMode) { setData(next); setDialog(null); setEditingRecord(null); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try {
      const changed = <T extends FinanceRecord>(after: T[], before: T[]) => after.filter((row, index) => JSON.stringify(row) !== JSON.stringify(before[index]));
      await Promise.all([saveOne(user.id, 'transactions', record), ...changed(investments, current.investments).map((row) => saveOne(user.id, 'investments', row)), ...changed(debts, current.debts).map((row) => saveOne(user.id, 'debts', row))]);
      if (!confirmedTransactionsRef.current || confirmedTransactionsRef.current.userId !== user.id) confirmedTransactionsRef.current = { userId: user.id, records: new Map() };
      confirmedTransactionsRef.current.records.set(record.id, record);
      dataRevisionRef.current += 1;
      setData(next);
      if (recordText(record.date).length >= 7) setSelectedMonth(recordText(record.date).slice(0, 7));
      setDialog(null); setEditingRecord(null); setToast('Saved and synced.');
    } catch (reason) { setError((reason as Error).message); }
  };
  const removeRecord = async (key: DomainKey, record: FinanceRecord, next: FinanceData) => {
    if (!window.confirm(`Delete “${recordText(record.name, recordText(record.note, recordText(record.category, 'this item')))}”? This cannot be undone.`)) return;
    if (!user && previewMode) { setData(next); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try { await deleteOne(user.id, key, record.id); setData(next); setToast('Deleted and synced.'); }
    catch (reason) { setError((reason as Error).message); }
  };
  const reverseTransactionLinks = (rows: FinanceRecord[]) => {
    const investments = current.investments.map((item) => ({ ...item }));
    const debts = current.debts.map((item) => ({ ...item }));
    for (const row of rows) {
      if (row.type !== 'expense') continue;
      const amount = recordNumber(row.amount);
      const investment = investments.find((item) => item.id === row.investmentId);
      if (investment) { investment.invested = Math.max(0, recordNumber(investment.invested) - amount); investment.current = Math.max(0, recordNumber(investment.current) - amount); investment.updatedAt = Date.now(); }
      const debt = debts.find((item) => item.id === row.debtId);
      if (debt) { debt.remainingTenure = Math.min(recordNumber(debt.totalTenure), recordNumber(debt.remainingTenure) + 1); debt.remainingOutstanding = recordNumber(debt.remainingOutstanding) + amount; }
    }
    return { investments, debts };
  };
  const removeTransaction = async (row: FinanceRecord) => {
    if (!window.confirm(`Delete “${recordText(row.note, recordText(row.category, 'this transaction'))}”? This cannot be undone.`)) return;
    const { investments, debts } = reverseTransactionLinks([row]);
    const next = { ...current, transactions: current.transactions.filter((item) => item.id !== row.id), investments, debts };
    if (!user && previewMode) { setData(next); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try {
      await Promise.all([deleteOne(user.id, 'transactions', row.id), ...investments.filter((item, index) => JSON.stringify(item) !== JSON.stringify(current.investments[index])).map((item) => saveOne(user.id, 'investments', item)), ...debts.filter((item, index) => JSON.stringify(item) !== JSON.stringify(current.debts[index])).map((item) => saveOne(user.id, 'debts', item))]);
      setData(next); setToast('Transaction deleted and linked totals updated.');
    } catch (reason) { setError((reason as Error).message); }
  };
  const removeTransactions = async (rows: FinanceRecord[]) => {
    if (!rows.length || !window.confirm(`Delete ${rows.length} selected transaction${rows.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    const ids = new Set(rows.map((row) => row.id));
    const { investments, debts } = reverseTransactionLinks(rows);
    const next = { ...current, transactions: current.transactions.filter((row) => !ids.has(row.id)), investments, debts };
    if (!user && previewMode) { setData(next); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try { await Promise.all([...rows.map((row) => deleteOne(user.id, 'transactions', row.id)), ...investments.filter((item, index) => JSON.stringify(item) !== JSON.stringify(current.investments[index])).map((item) => saveOne(user.id, 'investments', item)), ...debts.filter((item, index) => JSON.stringify(item) !== JSON.stringify(current.debts[index])).map((item) => saveOne(user.id, 'debts', item))]); setData(next); setToast(`${rows.length} transactions deleted; linked totals updated.`); }
    catch (reason) { setError((reason as Error).message); }
  };
  const copyPreviousBudgets = async (month: string) => {
    const previousMonth = shiftMonth(month, -1);
    const previous = current.budgets.filter((row) => row.month === previousMonth);
    if (!previous.length) { setToast(`No budgets found for ${monthLabel(previousMonth)}.`); return; }
    const currentCategories = new Set(current.budgets.filter((row) => row.month === month).map((row) => recordText(row.category)));
    const copies = previous.filter((row) => !currentCategories.has(recordText(row.category))).map((row) => ({ ...row, id: crypto.randomUUID(), month, createdAt: Date.now() }));
    if (!copies.length) { setToast('This month already has all previous budget categories.'); return; }
    const next = { ...current, budgets: [...current.budgets, ...copies] };
    if (!user && previewMode) { setData(next); setToast('Previous budgets copied in preview.'); return; }
    if (!user) return;
    try { await Promise.all(copies.map((row) => saveOne(user.id, 'budgets', row))); setData(next); setToast(`${copies.length} budgets copied.`); }
    catch (reason) { setError((reason as Error).message); }
  };
  const removeAccount = async (account: FinanceRecord) => {
    const linked = current.transactions.filter((row) => row.accountId === account.id || row.fromAccountId === account.id || row.toAccountId === account.id);
    if (!window.confirm(linked.length ? `Deleting this account also deletes ${linked.length} linked transactions. Continue?` : `Delete “${recordText(account.name, 'this account')}”? This cannot be undone.`)) return;
    if (!user && previewMode) { setData({ ...current, accounts: current.accounts.filter((row) => row.id !== account.id), transactions: current.transactions.filter((row) => !linked.some((item) => item.id === row.id)) }); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try {
      await Promise.all([...linked.map((row) => deleteOne(user.id, 'transactions', row.id)), deleteOne(user.id, 'accounts', account.id)]);
      setData({ ...current, accounts: current.accounts.filter((row) => row.id !== account.id), transactions: current.transactions.filter((row) => !linked.some((item) => item.id === row.id)) });
      setToast('Account and linked transactions deleted.');
    } catch (reason) { setError((reason as Error).message); }
  };
  const removeInvestment = async (investment: FinanceRecord) => {
    if (!window.confirm(`Delete “${recordText(investment.name, 'this investment')}”? Linked transactions will remain but be unlinked.`)) return;
    const transactions = current.transactions.map((row) => row.investmentId === investment.id ? { ...row, investmentId: null } : row);
    if (!user && previewMode) { setData({ ...current, investments: current.investments.filter((row) => row.id !== investment.id), transactions }); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try {
      await Promise.all([
        ...transactions.filter((row, index) => JSON.stringify(row) !== JSON.stringify(current.transactions[index])).map((row) => saveOne(user.id, 'transactions', row)),
        deleteOne(user.id, 'investments', investment.id),
      ]);
      setData({ ...current, investments: current.investments.filter((row) => row.id !== investment.id), transactions });
      setToast('Investment deleted.');
    } catch (reason) { setError((reason as Error).message); }
  };
  const saveDebt = async (record: FinanceRecord) => {
    const previous = current.debts.find((row) => row.id === record.id);
    const recurring = current.recurring.map((row) => row.id === previous?.linkedRecurringId && row.id !== record.linkedRecurringId ? { ...row, debtId: null } : row.id === record.linkedRecurringId ? { ...row, debtId: record.id } : row);
    const next = { ...current, debts: editingRecord?.id ? current.debts.map((row) => row.id === record.id ? record : row) : [...current.debts, record], recurring };
    if (user) {
      const changed = recurring.filter((row, index) => JSON.stringify(row) !== JSON.stringify(current.recurring[index]));
      try { await Promise.all(changed.map((row) => saveOne(user.id, 'recurring', row))); }
      catch (reason) { setError((reason as Error).message); return; }
    }
    await persist('debts', record, next);
  };
  const removeDebt = async (debt: FinanceRecord) => {
    if (!window.confirm(`Delete “${recordText(debt.name, 'this debt')}”? Linked transactions will remain but be unlinked.`)) return;
    const transactions = current.transactions.map((row) => row.debtId === debt.id ? { ...row, debtId: null } : row);
    const recurring = current.recurring.map((row) => row.debtId === debt.id ? { ...row, debtId: null } : row);
    if (!user && previewMode) { setData({ ...current, debts: current.debts.filter((row) => row.id !== debt.id), transactions, recurring }); return; }
    if (!user) return;
    try {
      await Promise.all([
        ...transactions.filter((row, index) => JSON.stringify(row) !== JSON.stringify(current.transactions[index])).map((row) => saveOne(user.id, 'transactions', row)),
        ...recurring.filter((row, index) => JSON.stringify(row) !== JSON.stringify(current.recurring[index])).map((row) => saveOne(user.id, 'recurring', row)),
        deleteOne(user.id, 'debts', debt.id),
      ]);
      setData({ ...current, debts: current.debts.filter((row) => row.id !== debt.id), transactions, recurring }); setToast('Debt deleted.');
    } catch (reason) { setError((reason as Error).message); }
  };
  const logEmi = async (debt: FinanceRecord) => {
    if (recordNumber(debt.remainingTenure) <= 0) { setError('This debt is fully paid.'); return; }
    const account = current.accounts[0];
    if (!account) { setError('Add an account before logging an EMI.'); return; }
    const transaction: FinanceRecord = { id: crypto.randomUUID(), createdAt: Date.now(), type: 'expense', amount: recordNumber(debt.emiAmount), date: todayISO(), note: `${recordText(debt.name)} payment`, accountId: account.id, accountName: account.name, category: recordText(debt.category, 'EMIs'), debtId: debt.id };
    const updatedDebt = { ...debt, remainingTenure: Math.max(0, recordNumber(debt.remainingTenure) - 1), remainingOutstanding: Math.max(0, recordNumber(debt.remainingOutstanding) - recordNumber(debt.emiAmount)) };
    if (!user && previewMode) { setData({ ...current, transactions: [...current.transactions, transaction], debts: current.debts.map((row) => row.id === debt.id ? updatedDebt : row) }); return; }
    if (!user) return;
    try { await Promise.all([saveOne(user.id, 'transactions', transaction), saveOne(user.id, 'debts', updatedDebt)]); setData({ ...current, transactions: [...current.transactions, transaction], debts: current.debts.map((row) => row.id === debt.id ? updatedDebt : row) }); setToast(`EMI logged from ${recordText(account.name)}.`); }
    catch (reason) { setError((reason as Error).message); }
  };
  const saveCreditScore = async (score: number, date: string) => {
    const scoreRecord: FinanceRecord = { id: 'current-credit-score', score, date, updatedAt: Date.now() };
    const historyRecord: FinanceRecord = { id: crypto.randomUUID(), score, date };
    const next = { ...current, creditScore: scoreRecord, creditScoreHistory: [...current.creditScoreHistory, historyRecord] };
    if (!user && previewMode) { setData(next); setDialog(null); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try { await Promise.all([savePreferences(user.id, { creditScore: scoreRecord, budgetGroups: current.budgetGroups }), saveOne(user.id, 'creditScoreHistory', historyRecord)]); setData(next); setDialog(null); setToast('Credit score updated.'); }
    catch (reason) { setError((reason as Error).message); }
  };
  const saveAccount = async (record: FinanceRecord) => {
    const previous = current.accounts.find((row) => row.id === record.id);
    const transactions = previous ? current.transactions.map((row) => ({
      ...row,
      ...(row.accountId === record.id ? { accountName: record.name } : {}),
      ...(row.fromAccountId === record.id ? { fromAccountName: record.name } : {}),
      ...(row.toAccountId === record.id ? { toAccountName: record.name } : {}),
    })) : current.transactions;
    const recurring = previous ? current.recurring.map((row) => ({
      ...row,
      ...(row.accountId === record.id ? { accountName: record.name } : {}),
      ...(row.fromAccountId === record.id ? { fromAccountName: record.name } : {}),
      ...(row.toAccountId === record.id ? { toAccountName: record.name } : {}),
    })) : current.recurring;
    const next = { ...current, accounts: previous ? current.accounts.map((row) => row.id === record.id ? record : row) : [...current.accounts, record], transactions, recurring };
    if (previous && user) {
      try {
        await Promise.all([
          ...transactions.filter((row, index) => JSON.stringify(row) !== JSON.stringify(current.transactions[index])).map((row) => saveOne(user.id, 'transactions', row)),
          ...recurring.filter((row, index) => JSON.stringify(row) !== JSON.stringify(current.recurring[index])).map((row) => saveOne(user.id, 'recurring', row)),
        ]);
      } catch (reason) { setError((reason as Error).message); return; }
    }
    await persist('accounts', record, next);
  };
  const applyRecurringOccurrence = async (rule: FinanceRecord, date: string, skip = false) => {
    const updatedRule = { ...rule, lastFiredDate: date };
    const recurring = current.recurring.map((row) => row.id === rule.id ? updatedRule : row);
    if (skip) {
      if (!user && previewMode) { setData({ ...current, recurring }); setToast('Skipped this occurrence.'); return; }
      if (!user) return;
      try { await saveOne(user.id, 'recurring', updatedRule); setData({ ...current, recurring }); setToast('Skipped this occurrence.'); }
      catch (reason) { setError((reason as Error).message); }
      return;
    }
    const transaction: FinanceRecord = {
      id: crypto.randomUUID(), createdAt: Date.now(), type: rule.type, amount: recordNumber(rule.amount), date,
      note: recordText(rule.note), category: recordText(rule.category), accountId: rule.accountId, accountName: rule.accountName,
      fromAccountId: rule.fromAccountId, fromAccountName: rule.fromAccountName, toAccountId: rule.toAccountId, toAccountName: rule.toAccountName,
      investmentId: rule.investmentId, debtId: rule.debtId,
    };
    const investments = rule.investmentId ? current.investments.map((row) => row.id === rule.investmentId ? { ...row, invested: recordNumber(row.invested) + recordNumber(rule.amount), current: recordNumber(row.current) + recordNumber(rule.amount), updatedAt: Date.now() } : row) : current.investments;
    const debts = rule.debtId ? current.debts.map((row) => row.id === rule.debtId ? { ...row, remainingTenure: Math.max(0, recordNumber(row.remainingTenure) - 1), remainingOutstanding: Math.max(0, recordNumber(row.remainingOutstanding) - recordNumber(rule.amount)) } : row) : current.debts;
    const next = { ...current, transactions: [...current.transactions, transaction], recurring, investments, debts };
    if (!user && previewMode) { setData(next); setToast('Preview only — this change was not saved.'); return; }
    if (!user) return;
    try {
      await Promise.all([
        saveOne(user.id, 'transactions', transaction), saveOne(user.id, 'recurring', updatedRule),
        ...(rule.investmentId ? [saveOne(user.id, 'investments', investments.find((row) => row.id === rule.investmentId)!)] : []),
        ...(rule.debtId ? [saveOne(user.id, 'debts', debts.find((row) => row.id === rule.debtId)!)] : []),
      ]);
      setData(next); setToast('Recurring transaction logged and synced.');
    } catch (reason) { setError((reason as Error).message); }
  };
  const exportBackup = () => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'finance-tracker-backup-' + todayISO() + '.json'; link.click();
    URL.revokeObjectURL(url);
  };

  if (!authReady) return <div className="loading-screen"><span className="loader" />Opening your finance space…</div>;
  if (!isSupabaseConfigured && !previewMode) return <ConfigScreen />;
  if (!session && !previewMode) return <SignIn onSignIn={signIn} busy={busy} error={error} />;
  if (session?.user.id && !dataReady) return <div className="loading-screen"><span className="loader" />Syncing your finance data…</div>;
  if (loading && !data) return <div className="loading-screen"><span className="loader" />Syncing your finance data…</div>;
  if (error && !data) return <div className="loading-screen error-screen"><ShieldCheck size={24} /><h2>We couldn’t load your data.</h2><p>{error}</p><button className="outline-button" onClick={() => window.location.reload()}>Try again</button><button className="text-button" onClick={signOut}>Sign out</button></div>;
  if (!data) return <Setup name={firstName} busy={busy} error={error} fileRef={importRef} onFresh={startFresh} onImport={importBackup} onSignOut={signOut} />;

  const navigate = (next: Tab) => { setTab(next); setMoreOpen(false); setMenuOpen(false); };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <span className="nav-caption">PERSONAL SPACE</span>
        <nav className="side-nav" aria-label="Main navigation">
          {primary.map((item) => <button key={item.id} title={item.label} aria-label={item.label} className={'nav-item ' + (tab === item.id ? 'active' : '')} onClick={() => navigate(item.id)}><item.icon size={19} strokeWidth={1.8} /><span>{item.label}</span></button>)}
        </nav>
        <div className="nav-separator" />
        <button title="More sections" aria-label="More sections" aria-expanded={moreOpen} className={'nav-item more-toggle ' + (moreOpen || secondary.some((item) => item.id === tab) ? 'active' : '')} onClick={() => setMoreOpen(!moreOpen)}><MoreHorizontal size={19} /><span>More</span><ChevronDown className={moreOpen ? 'rotate' : ''} size={15} /></button>
        {moreOpen && <nav className="side-nav secondary-nav" aria-label="More sections">{secondary.map((item) => <button key={item.id} title={item.label} aria-label={item.label} className={'nav-item ' + (tab === item.id ? 'active' : '')} onClick={() => navigate(item.id)}><item.icon size={18} /><span>{item.label}</span></button>)}</nav>}
        <div className="sidebar-bottom">
          <div className="privacy-hint"><ShieldCheck size={17} /><span>Private to your account<br />and synced securely</span></div>
          <button className="user-chip" onClick={() => setMenuOpen(!menuOpen)}><Avatar name={displayName} /><span><b>{firstName}</b><small>Personal account</small></span><MoreHorizontal size={18} /></button>
          {menuOpen && <AccountMenu name={displayName} email={user?.email ?? ''} onSignOut={signOut} />}
        </div>
      </aside>
      <main className="main-column">
        <header className="topbar"><div className="mobile-brand"><Brand compact /></div><div className="crumb"><span>Personal space</span><i>/</i><b>{label(tab)}</b></div><div className="top-actions"><button className="icon-button" aria-label="Search transactions" onClick={() => { navigate('transactions'); window.setTimeout(() => document.getElementById('transaction-search')?.focus(), 50); }}><Search size={19} /></button><button className="icon-button notice-button" aria-label="Recurring review" onClick={() => { navigate('dashboard'); setToast('Recurring items due for review are shown on your dashboard.'); }}><Bell size={19} /><i /></button><span className="top-divider" /><button className="icon-button mobile-profile" aria-label="Account menu" onClick={() => setMenuOpen(!menuOpen)}><Avatar name={displayName} /></button>{menuOpen && <AccountMenu name={displayName} email={user?.email ?? ''} onSignOut={signOut} />}</div></header>
        {previewMode && <div className="preview-banner"><span>Preview mode</span> Changes are temporary and won’t be saved.</div>}
        {error && <div className="inline-error">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}
        <div className="page-content">
          {tab === 'dashboard' && <Dashboard data={data} name={firstName} onAdd={() => { setEditingRecord(null); setDialog('transaction'); }} onBudgets={() => navigate('budgets')} onLogRecurring={(rule, date, skip) => applyRecurringOccurrence(rule, date, skip)} />}
          {tab === 'transactions' && <Transactions data={data} month={selectedMonth} onMonthChange={setSelectedMonth} onAdd={() => { setEditingRecord(null); setDialog('transaction'); }} onEdit={(row) => { setEditingRecord(row); setDialog('transaction'); }} onDelete={removeTransaction} onBulkDelete={removeTransactions} onAddRecurring={() => { setEditingRecord(null); setDialog('recurring'); }} onEditRecurring={(row) => { setEditingRecord(row); setDialog('recurring'); }} onDeleteRecurring={(row) => removeRecord('recurring', row, { ...data, recurring: data.recurring.filter((item) => item.id !== row.id) })} />}
          {tab === 'mymoney' && <MyMoney data={data} onAdd={() => { setEditingRecord(null); setDialog('account'); }} onEdit={(row) => { setEditingRecord(row); setDialog('account'); }} onDelete={removeAccount} onAddBucket={() => { setEditingRecord(null); setDialog('bucket'); }} onEditBucket={(row) => { setEditingRecord(row); setDialog('bucket'); }} onDeleteBucket={(row) => removeRecord('savingsBuckets', row, { ...data, savingsBuckets: data.savingsBuckets.filter((item) => item.id !== row.id) })} onTransferBucket={(row, action) => { setEditingRecord(row); setBucketAction(action); setDialog('bucketTransfer'); }} onAddInvestment={() => { setEditingRecord(null); setDialog('investment'); }} onEditInvestment={(row) => { setEditingRecord(row); setDialog('investment'); }} onDeleteInvestment={removeInvestment} />}
          {tab === 'budgets' && <Budgets data={data} month={selectedMonth} onMonthChange={setSelectedMonth} onAdd={() => { setEditingRecord(null); setDialog('budget'); }} onEdit={(row) => { setEditingRecord(row); setDialog('budget'); }} onDelete={(row) => removeRecord('budgets', row, { ...data, budgets: data.budgets.filter((item) => item.id !== row.id) })} onCopyPrevious={() => copyPreviousBudgets(selectedMonth)} />}
          {tab === 'creditdebt' && <CreditDebt data={data} onAddDebt={() => { setEditingRecord(null); setDialog('debt'); }} onEditDebt={(row) => { setEditingRecord(row); setDialog('debt'); }} onDeleteDebt={removeDebt} onLogEmi={logEmi} onEditScore={() => { setEditingRecord(data.creditScore); setDialog('creditScore'); }} />}
          {tab === 'categories' && <Categories data={data} onAdd={(kind) => { setEditingRecord({ id: '', kind }); setDialog('category'); }} onEdit={(row) => { setEditingRecord(row); setDialog('category'); }} onDelete={(row) => removeRecord('categories', row, { ...data, categories: data.categories.filter((item) => item.id !== row.id) })} />}
          {tab === 'settings' && <SettingsPage name={displayName} email={user?.email ?? ''} data={data} darkMode={darkMode} onTheme={() => setDarkMode((value) => !value)} onImport={() => importRef.current?.click()} onExport={exportBackup} />}
          {tab === 'planning' && <Planning data={data} />}
          {tab === 'calendar' && <Calendar data={data} month={selectedMonth} onMonthChange={setSelectedMonth} onAdd={(date) => { setEditingRecord({ id: '', date }); setDialog('transaction'); }} onEdit={(row) => { setEditingRecord(row); setDialog('transaction'); }} onDelete={removeTransaction} />}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {primary.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.id === 'dashboard' ? 'Home' : item.id === 'transactions' ? 'Activity' : item.id === 'mymoney' ? 'Money' : item.id === 'budgets' ? 'Budgets' : 'Credit'}</span></button>)}
        <button className={moreOpen ? 'active' : ''} aria-expanded={moreOpen} aria-label="More sections" onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal size={20} /><span>More</span></button>
      </nav>
      {moreOpen && <nav className="mobile-more-menu" aria-label="More sections menu">{secondary.map((item) => <button key={item.id} className={'mobile-more-item ' + (tab === item.id ? 'active' : '')} onClick={() => navigate(item.id)}><item.icon size={18} /><span>{item.label}</span></button>)}</nav>}
      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importBackup} />
      {dialog === 'transaction' && <TransactionDialog data={data} initial={editingRecord} error={error} onClose={() => { setDialog(null); setEditingRecord(null); setError(''); }} onSave={saveTransaction} />}
      {dialog === 'account' && <AccountDialog initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={saveAccount} />}
      {dialog === 'category' && <CategoryDialog data={data} initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={(record) => {
        const old = editingRecord?.name;
        const categories = editingRecord?.id ? data.categories.map((item) => item.id === editingRecord.id ? record : item) : [...data.categories, record];
        const transactions = old ? data.transactions.map((row) => row.category === old ? { ...row, category: record.name } : row) : data.transactions;
        const budgets = old ? data.budgets.map((row) => row.category === old ? { ...row, category: record.name } : row) : data.budgets;
        const recurring = old ? data.recurring.map((row) => row.category === old ? { ...row, category: record.name } : row) : data.recurring;
        const next = { ...data, categories, transactions, budgets, recurring };
        if (old && user) {
          const saveRenamed = async () => {
            try {
              await Promise.all([
                ...transactions.filter((row) => row.category === record.name).map((row) => saveOne(user.id, 'transactions', row)),
                ...budgets.filter((row) => row.category === record.name).map((row) => saveOne(user.id, 'budgets', row)),
                ...recurring.filter((row) => row.category === record.name).map((row) => saveOne(user.id, 'recurring', row)),
              ]);
              await persist('categories', record, next);
            } catch (reason) { setError((reason as Error).message); }
          };
          return saveRenamed();
        }
        return persist('categories', record, next);
      }} />}
          {dialog === 'budget' && <BudgetDialog data={data} initial={editingRecord} month={selectedMonth} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={(record) => persist('budgets', record, { ...data, budgets: editingRecord?.id ? data.budgets.map((row) => row.id === record.id ? record : row) : [...data.budgets, record] })} />}
      {dialog === 'bucket' && <BucketDialog initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={(record) => persist('savingsBuckets', record, { ...data, savingsBuckets: editingRecord?.id ? data.savingsBuckets.map((row) => row.id === record.id ? record : row) : [...data.savingsBuckets, record] })} />}
      {dialog === 'investment' && <InvestmentDialog initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={(record) => persist('investments', record, { ...data, investments: editingRecord?.id ? data.investments.map((row) => row.id === record.id ? record : row) : [...data.investments, record] })} />}
      {dialog === 'bucketTransfer' && editingRecord && <BucketTransferDialog data={data} bucket={editingRecord} action={bucketAction} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={(record) => persist('transactions', record, { ...data, transactions: [...data.transactions, record] })} />}
      {dialog === 'recurring' && <RecurringDialog data={data} initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={(record) => persist('recurring', record, { ...data, recurring: editingRecord?.id ? data.recurring.map((row) => row.id === record.id ? record : row) : [...data.recurring, record] })} />}
      {dialog === 'debt' && <DebtDialog data={data} initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={saveDebt} />}
      {dialog === 'creditScore' && <CreditScoreDialog initial={editingRecord} onClose={() => { setDialog(null); setEditingRecord(null); }} onSave={saveCreditScore} />}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) { return <div className={'brand ' + (compact ? 'compact' : '')}><img className="brand-mark" src="/pennywise-icon.svg" alt="" />{compact ? <b>pennywise</b> : <span><b>pennywise</b><small>YOUR MONEY, IN FOCUS</small></span>}</div>; }
function Avatar({ name }: { name: string }) { return <i className="avatar">{name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'Y'}</i>; }
function AccountMenu({ name, email, onSignOut }: { name: string; email: string; onSignOut: () => void }) { return <div className="account-menu"><div className="account-menu-head"><Avatar name={name} /><span><b>{name}</b><small>{email}</small></span></div><button onClick={onSignOut}><LogOut size={16} />Sign out</button></div>; }

function ConfigScreen() { return <div className="auth-page"><div className="auth-card config-card"><Brand /><div className="auth-icon"><Settings size={21} /></div><h1>Connect Supabase</h1><p>Add your project URL and publishable key to <code>v2/.env.local</code>, then restart the app.</p><div className="config-list"><span>1 <b>Create a Supabase project</b></span><span>2 <b>Enable Google sign-in</b></span><span>3 <b>Apply the migration in supabase/migrations</b></span></div><div className="privacy-hint"><ShieldCheck size={17} /><span>V2 requires Google sign-in to use your finance space.</span></div></div></div>; }

function SignIn({ onSignIn, busy, error }: { onSignIn: () => void; busy: boolean; error: string }) { return <div className="auth-page"><div className="auth-card"><Brand /><div className="auth-art"><div className="art-glow" /><div className="art-balance"><small>YOUR MONEY, IN VIEW</small><b>One clear picture</b><span>↗ Clarity that travels with you</span></div><div className="art-bars">{[30, 47, 37, 58, 44, 68, 51, 76, 59, 84, 64, 92].map((height, i) => <i style={{ height: height + '%' }} key={i} />)}</div><div className="art-orbit" /></div><span className="eyebrow">YOUR MONEY, IN FOCUS</span><h1>A little more clarity,<br />wherever you are.</h1><p>One calm place for spending, savings, and plans. Pick up right where you left off on any device.</p><button className="google-button" onClick={onSignIn} disabled={busy}><GoogleMark />{busy ? 'Connecting…' : 'Continue with Google'}</button>{error && <div className="auth-error">{error}</div>}<div className="auth-footnote"><ShieldCheck size={16} />Your financial data is private to your account.</div></div><div className="auth-tagline">A thoughtful way to stay close to your money <span>✳</span></div></div>; }
function GoogleMark() { return <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M47.5 24.5c0-1.6-.15-3.1-.4-4.5H24v9h13.2a11.3 11.3 0 0 1-4.9 7.4l7.7 6C44.5 38.3 47.5 32 47.5 24.5Z" /><path fill="#34A853" d="M24 48c6.6 0 12.1-2.2 16.1-5.9l-7.7-6c-2.2 1.5-5 2.4-8.4 2.4-6.4 0-11.8-4.3-13.8-10.1l-8 6.2C6.2 42.6 14.5 48 24 48Z" /><path fill="#FBBC05" d="M10.2 28.4a14.5 14.5 0 0 1 0-9l-8-6.2a24 24 0 0 0 0 21.4l8-6.2Z" /><path fill="#EA4335" d="M24 9.5c3.6 0 6.8 1.2 9.3 3.7l6.9-6.9C36 2.4 30.5 0 24 0 14.5 0 6.2 5.4 2.2 13.2l8 6.2C12.2 13.8 17.6 9.5 24 9.5Z" /></svg>; }

function Setup({ name, busy, error, fileRef, onFresh, onImport, onSignOut }: { name: string; busy: boolean; error: string; fileRef: RefObject<HTMLInputElement | null>; onFresh: () => void; onImport: (event: ChangeEvent<HTMLInputElement>) => void; onSignOut: () => void }) { return <div className="setup-page"><header className="setup-header"><Brand /><button className="text-button" onClick={onSignOut}><LogOut size={16} />Sign out</button></header><main className="setup-main"><span className="eyebrow">A FRESH START, ON YOUR TERMS</span><h1>Welcome, {name}.</h1><p>Choose how you’d like to begin. You can add accounts and personalize your categories any time.</p><div className="setup-options"><button className="setup-option highlighted" disabled={busy} onClick={onFresh}><span className="option-icon"><Sparkles size={20} /></span><span><b>Start fresh</b><small>Begin with useful default categories and an empty ledger. Add your own accounts as you go.</small></span><span className="option-arrow">↗</span></button><button className="setup-option" disabled={busy} onClick={() => fileRef.current?.click()}><span className="option-icon muted"><Upload size={20} /></span><span><b>Import a v1 backup</b><small>Bring your existing transactions, accounts, budgets, and settings into your account.</small></span><span className="option-arrow">↗</span></button></div><div className="setup-note"><ShieldCheck size={17} />Your data syncs across devices through your signed-in account.</div>{busy && <div className="setup-busy"><span className="loader" />Setting up your finance space…</div>}{error && <div className="auth-error">{error}</div>}<input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImport} /></main></div>; }

function advanceOccurrence(dateValue: string, frequency: unknown) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const base = new Date(year, month - 1, 1);
  base.setMonth(base.getMonth() + (frequency === 'yearly' ? 12 : 1));
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, lastDay));
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
}
function pendingOccurrences(rule: FinanceRecord, today: string) {
  let date = rule.lastFiredDate ? advanceOccurrence(recordText(rule.lastFiredDate), rule.frequency) : recordText(rule.startDate);
  const pending: string[] = [];
  for (let count = 0; date && date <= today && count < 1000; count += 1) {
    if (rule.endDate && date > recordText(rule.endDate)) break;
    pending.push(date);
    date = advanceOccurrence(date, rule.frequency);
  }
  return pending;
}
function nextOccurrence(rule: FinanceRecord) {
  const next = rule.lastFiredDate ? advanceOccurrence(recordText(rule.lastFiredDate), rule.frequency) : recordText(rule.startDate, 'Not scheduled');
  return rule.endDate && next > recordText(rule.endDate) ? 'Complete' : next;
}

function Dashboard({ data, name, onAdd, onBudgets, onLogRecurring }: { data: FinanceData; name: string; onAdd: () => void; onBudgets: () => void; onLogRecurring: (rule: FinanceRecord, date: string, skip?: boolean) => void }) {
    const today = todayISO(); const month = today.slice(0, 7);
  const rows = data.transactions.filter((row) => recordText(row.date).startsWith(month));
  const income = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const expense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const netCashflow = income - expense;
  const spentToday = data.transactions.filter((row) => row.date === today && row.type === 'expense').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate() + 1;
  const lifestyleNames = new Set(data.categories.filter((row) => row.kind === 'expense' && row.groupId === 'grp-lifestyle').map((row) => recordText(row.name)));
  const lifestyleBudget = data.budgets.filter((row) => (!row.month || row.month === month) && lifestyleNames.has(recordText(row.category))).reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const lifestyleSpent = rows.filter((row) => row.type === 'expense' && lifestyleNames.has(recordText(row.category))).reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const guide = lifestyleBudget ? Math.max(0, lifestyleBudget - lifestyleSpent) / Math.max(1, daysLeft) : 0;
  const emergencyBucket = data.savingsBuckets.find((row) => recordText(row.name).toLocaleLowerCase().includes('emergency') || recordText(row.icon).includes('🛡'));
  const savingsRate = income > 0 ? netCashflow / income * 100 : 0;
  const emergencyTarget = recordNumber(emergencyBucket?.target) || 50000;
  const emergencyScore = emergencyBucket ? Math.round(Math.min(100, bucketBalance(data, emergencyBucket.id) / emergencyTarget * 100) * 0.25) : 0;
  const emis = data.debts.reduce((sum, row) => sum + recordNumber(row.emiAmount), 0);
  const debtScore = emis === 0 ? 25 : Math.round(25 * (1 - Math.min(1, emis / (Math.max(income, 50000) * 0.4))));
  const activeBudgets = data.budgets.filter((row) => row.month === month);
  const adhered = activeBudgets.filter((budgetRow) => rows.filter((row) => row.type === 'expense' && row.category === budgetRow.category).reduce((sum, row) => sum + recordNumber(row.amount), 0) <= recordNumber(budgetRow.amount)).length;
  const healthScore = Math.min(100, Math.max(0, Math.round(Math.min(25, savingsRate / 30 * 25))) + emergencyScore + debtScore + (activeBudgets.length ? Math.round(25 * adhered / activeBudgets.length) : 25));
  const categorySpending = [...new Set(rows.filter((row) => row.type === 'expense').map((row) => recordText(row.category, 'Uncategorized')))].map((categoryName) => ({ name: categoryName, amount: rows.filter((row) => row.type === 'expense' && recordText(row.category, 'Uncategorized') === categoryName).reduce((sum, row) => sum + recordNumber(row.amount), 0) })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const dashboardBudgets = data.budgets.filter((row) => (!row.month || row.month === month) && lifestyleNames.has(recordText(row.category))).map((row) => { const limit = recordNumber(row.amount); const spent = rows.filter((tx) => tx.type === 'expense' && tx.category === row.category).reduce((sum, tx) => sum + recordNumber(tx.amount), 0); return { id: row.id, name: recordText(row.category, 'Budget'), limit, spent, remaining: limit - spent }; });
  const pendingRecurring = data.recurring.flatMap((rule) => pendingOccurrences(rule, today).map((date) => ({ rule, date }))).sort((a, b) => a.date.localeCompare(b.date));
  return <>
    <Heading title={'Good day, ' + name} action={<button className="primary-button" onClick={onAdd}><Plus size={17} />Add transaction</button>} />
    <section className="daily-focus">
      <div className="daily-icon"><Sparkles size={19} /></div>
      <div className="daily-copy"><span className="eyebrow">PER DAY</span><strong>{guide ? money(guide) : 'Set a budget'}</strong><small>{guide ? `${daysLeft} days left this month` : 'Set a lifestyle budget to get your daily guide.'}</small></div>
      <div className="daily-spent"><span>TODAY</span><b className="danger-text">{money(spentToday)}</b></div>
      <button className="subtle-button" onClick={onBudgets}>Budgets <span>↗</span></button>
    </section>
    <div className="stat-grid">
      <Stat label="Income" value={money(income)} hint="Across all accounts" icon={<ArrowDownRight size={18} />} kind="positive" />
      <Stat label="Spent" value={money(expense)} hint="Your tracked spending" icon={<ArrowUpRight size={18} />} kind="expense" />
      <Stat label="Net cashflow" value={money(netCashflow)} hint="This month" icon={<Scale size={18} />} kind={netCashflow >= 0 ? 'positive' : 'expense'} />
      <Stat label="Savings rate" value={`${savingsRate.toFixed(1)}%`} hint="This month" icon={<Percent size={18} />} kind={savingsRate >= 0 ? 'positive' : 'expense'} />
    </div>
    {pendingRecurring.length > 0 && <section className="panel recurring-review-panel">
      <div className="panel-heading"><h2>Due to review</h2></div>
      <PendingRecurringGroups items={pendingRecurring} onLog={onLogRecurring} />
    </section>}
    {dashboardBudgets.length > 0 && <section className="panel dashboard-budget-panel"><div className="panel-heading"><h2>Lifestyle budgets</h2><button className="text-button" onClick={onBudgets}>All</button></div><div className="dashboard-budget-grid">{dashboardBudgets.map((item) => <div key={item.id}><span>{item.name}</span><b className={item.remaining < 0 ? 'danger-text' : ''}>{money(Math.abs(item.remaining))} <small>{item.remaining < 0 ? 'over' : 'left'} · of {money(item.limit)}</small></b><div className="progress-track"><i className={item.spent > item.limit ? 'over' : ''} style={{ width: `${item.limit ? Math.min(100, item.spent / item.limit * 100) : 0}%` }} /></div></div>)}</div></section>}
    <details className="dashboard-insights-foldout">
      <summary>Insights <ChevronDown size={15} /></summary>
      <div className="dashboard-grid dashboard-insights">
        <section className="panel"><div className="panel-heading"><h2>Financial health · {healthScore}/100</h2></div><div className="health-meter"><i style={{ width: `${healthScore}%` }} /></div><div className="health-breakdown"><span>Savings rate <b>{Math.min(25, Math.round(savingsRate / 30 * 25))}/25</b></span><span>Emergency fund <b>{emergencyScore}/25</b></span><span>Debt management <b>{debtScore}/25</b></span><span>Budget adherence <b>{activeBudgets.length ? `${adhered}/${activeBudgets.length}` : 'No budgets'}</b></span></div></section>
        <section className="panel"><div className="panel-heading"><h2>Spending by category</h2></div>{categorySpending.length ? categorySpending.map((item) => <div className="category-spend" key={item.name}><span>{item.name}</span><b className="danger-text">{money(item.amount)}</b><div className="progress-track"><i style={{ width: `${expense ? Math.min(100, item.amount / Math.max(...categorySpending.map((row) => row.amount)) * 100) : 0}%` }} /></div></div>) : <p className="muted-paragraph">No expenses yet.</p>}</section>
      </div>
    </details>
  </>;
}

function Heading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>; }
function monthLabel(month: string) { const [year, monthNumber] = month.split('-').map(Number); return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
function shiftMonth(month: string, amount: number) { const [year, monthNumber] = month.split('-').map(Number); const date = new Date(year, monthNumber - 1 + amount, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function ruleOccursInMonth(rule: FinanceRecord, month: string) {
  const start = recordText(rule.startDate);
  const end = recordText(rule.endDate);
  if (!start || month < start.slice(0, 7) || (end && month > end.slice(0, 7))) return false;
  return recordText(rule.frequency, 'monthly') !== 'yearly' || start.slice(5, 7) === month.slice(5, 7);
}
function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) { return <div className="month-picker"><button className="icon-button" title="Previous month" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>‹</button><b>{monthLabel(month)}</b><button className="icon-button" title="Next month" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>›</button></div>; }
function Stat({ label, value, hint, icon, kind = '', change, changeKind = '' }: { label: string; value: string; hint: string; icon: ReactNode; kind?: string; change?: string; changeKind?: string }) { return <div className={'stat-card ' + kind}><div><span>{label}</span><i>{icon}</i></div><strong>{value}{change && <small className={'stat-inline ' + changeKind}>{change}</small>}</strong><small>{hint}</small></div>; }
function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) { return <div className="empty-state"><i>{icon}</i><b>{title}</b><p>{text}</p>{action}</div>; }
function CreditScoreChart({ history }: { history: FinanceRecord[] }) {
  const rows = [...history].sort((a, b) => recordText(a.date).localeCompare(recordText(b.date))).slice(-12);
  const points = rows.map((row, index) => {
    const x = rows.length < 2 ? 160 : 12 + index * 296 / (rows.length - 1);
    const score = Math.max(300, Math.min(900, recordNumber(row.score)));
    return `${x},${108 - (score - 300) / 600 * 92}`;
  }).join(' ');
  return <div className="score-chart"><svg viewBox="0 0 320 120" role="img" aria-label="Credit score history chart"><line x1="10" y1="108" x2="310" y2="108" /><line x1="10" y1="16" x2="310" y2="16" /><polyline points={points} /></svg><div><span>{recordText(rows[0]?.date)}</span><span>{recordText(rows.at(-1)?.date)}</span></div></div>;
}

function groupRecurring<T>(items: T[], getCategory: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const category = getCategory(item).trim() || 'Uncategorized';
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function RecurringRuleGroups({ rules, onEdit, onDelete, compact = false }: { rules: FinanceRecord[]; onEdit?: (row: FinanceRecord) => void; onDelete?: (row: FinanceRecord) => void; compact?: boolean }) {
  const groups = groupRecurring(rules, (rule) => recordText(rule.category, 'Uncategorized'));
  return <div className={'recurring-category-grid' + (compact ? ' compact' : '')}>{groups.map(([category, items]) => <section className="recurring-category-tile" key={category}><header><b>{category}</b><span>{items.length} {items.length === 1 ? 'rule' : 'rules'}</span></header><div className="recurring-tile-list">{items.map((rule) => <div className="recurring-tile-row" key={rule.id}><span className="row-icon"><CalendarDays size={17} /></span><span className="row-copy"><b>{recordText(rule.name, 'Recurring item')}</b><small>{compact ? `Next ${nextOccurrence(rule)}` : `${recordText(rule.frequency, 'Monthly')} · Next ${nextOccurrence(rule)}`}</small></span><strong className={rule.type === 'income' ? 'income-text' : rule.type === 'expense' ? 'danger-text' : ''}>{money(recordNumber(rule.amount))}</strong>{(onEdit || onDelete) && <span className="row-actions">{onEdit && <button className="text-button" onClick={() => onEdit(rule)}>Edit</button>}{onDelete && <button className="text-button danger-text" onClick={() => onDelete(rule)}>Delete</button>}</span>}</div>)}</div></section>)}</div>;
}

function PendingRecurringGroups({ items, onLog }: { items: Array<{ rule: FinanceRecord; date: string }>; onLog: (rule: FinanceRecord, date: string, skip?: boolean) => void }) {
  const groups = groupRecurring(items, (item) => recordText(item.rule.category, 'Uncategorized'));
  return <div className="recurring-category-grid pending-recurring-grid">{groups.map(([category, rows]) => <section className="recurring-category-tile" key={category}><header><b>{category}</b><span>{rows.length} due</span></header><div className="recurring-tile-list">{rows.map(({ rule, date }) => <div className="recurring-tile-row" key={rule.id + date}><span className="row-icon"><CalendarDays size={17} /></span><span className="row-copy"><b>{recordText(rule.name, 'Recurring transaction')}</b><small>Due {date}</small></span><strong className={rule.type === 'income' ? 'income-text' : rule.type === 'expense' ? 'danger-text' : ''}>{money(recordNumber(rule.amount))}</strong><span className="row-actions"><button className="text-button" onClick={() => onLog(rule, date, true)}>Skip</button><button className="primary-button small" onClick={() => onLog(rule, date)}>Log</button></span></div>)}</div></section>)}</div>;
}

function Transactions({ data, month, onMonthChange, onAdd, onEdit, onDelete, onBulkDelete, onAddRecurring, onEditRecurring, onDeleteRecurring }: { data: FinanceData; month: string; onMonthChange: (month: string) => void; onAdd: () => void; onEdit: (row: FinanceRecord) => void; onDelete: (row: FinanceRecord) => void; onBulkDelete: (rows: FinanceRecord[]) => void; onAddRecurring: () => void; onEditRecurring: (row: FinanceRecord) => void; onDeleteRecurring: (row: FinanceRecord) => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [category, setCategory] = useState('all');
  const [account, setAccount] = useState('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const rows = useMemo(() => [...data.transactions]
    .filter((row) => recordText(row.date).startsWith(month))
    .filter((row) => type === 'all' || row.type === type)
    .filter((row) => category === 'all' || row.category === category)
    .filter((row) => account === 'all' || row.accountId === account || row.fromAccountId === account || row.toAccountId === account)
    .filter((row) => !query || [row.note, row.category, row.accountName, row.fromAccountName, row.toAccountName].some((value) => recordText(value).toLocaleLowerCase().includes(query.toLocaleLowerCase())))
    .sort((a, b) => recordText(b.date).localeCompare(recordText(a.date))), [data.transactions, month, query, type, category, account]);
  const allRows = data.transactions;
  const visibleIds = rows.slice(0, 100).map((row) => row.id);
  const toggleAll = () => setSelectedIds(selectedIds.length === visibleIds.length ? [] : visibleIds);
  const toggle = (id: string) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  const selectedRows = data.transactions.filter((row) => selectedIds.includes(row.id));
  return <><Heading eyebrow="YOUR MONEY, MOVING" title="Transactions" description="Every little detail, all in one place." action={<button className="primary-button" onClick={onAdd}><Plus size={17} />Add transaction</button>} /><MonthPicker month={month} onChange={onMonthChange} /><div className="summary-strip"><span><small>TRANSACTIONS</small><b>{rows.length}{rows.length !== allRows.length ? ` / ${allRows.length}` : ''}</b></span><span><small>EXPENSES</small><b className="danger-text">{money(rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + recordNumber(row.amount), 0))}</b></span><button className="filter-button" onClick={() => document.getElementById('transaction-search')?.focus()}><Search size={16} />Search</button></div><div className="transaction-filters"><input id="transaction-search" type="search" placeholder="Search transactions" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Filter by type" value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option></select><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{[...new Set(data.categories.map((row) => recordText(row.name)))].map((name) => <option key={name} value={name}>{name}</option>)}</select><select aria-label="Filter by account" value={account} onChange={(event) => setAccount(event.target.value)}><option value="all">All accounts</option>{data.accounts.map((row) => <option key={row.id} value={row.id}>{recordText(row.name, 'Account')}</option>)}</select></div><section className="panel"><div className="panel-heading"><h2>{monthLabel(month)}</h2>{rows.length > 0 && <button className="text-button" onClick={toggleAll}>{selectedIds.length === visibleIds.length ? 'Clear selection' : 'Select visible'}</button>}</div>{selectedRows.length > 0 && <div className="bulk-actions"><span>{selectedRows.length} selected</span><button className="text-button danger-text" onClick={() => { onBulkDelete(selectedRows); setSelectedIds([]); }}>Delete selected</button></div>}{rows.length ? <div className="simple-list">{rows.slice(0, 100).map((row) => <div className="transaction-select-row" key={row.id}><input aria-label={`Select ${recordText(row.note, recordText(row.category, 'transaction'))}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggle(row.id)} /><TransactionRow row={row} showDate onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} /></div>)}</div> : <Empty icon={<ArrowDownRight size={19} />} title={allRows.length ? 'No matching transactions' : 'No transactions yet'} text={allRows.length ? 'No transactions match these filters.' : 'Add your first income or expense to start tracking.'} action={!allRows.length ? <button className="primary-button small" onClick={onAdd}><Plus size={16} />Add transaction</button> : undefined} />}</section><details className="secondary-foldout"><summary><span>Recurring</span><span>{data.recurring.length}</span><ChevronDown size={16} /></summary><div className="secondary-foldout-content"><div className="panel-heading"><h2>Recurring transactions</h2><button className="text-button" onClick={onAddRecurring}><Plus size={16} />Add</button></div>{data.recurring.length ? <RecurringRuleGroups rules={data.recurring} onEdit={onEditRecurring} onDelete={onDeleteRecurring} /> : <Empty icon={<CalendarDays size={18} />} title="No recurring rules" text="Add bills, income, and regular transfers to review when due." action={<button className="primary-button small" onClick={onAddRecurring}><Plus size={15} />Add recurring</button>} />}</div></details></>;
}function TransactionRow({ row, showDate = false, onEdit, onDelete }: { row: FinanceRecord; showDate?: boolean; onEdit?: () => void; onDelete?: () => void }) {
  const income = row.type === 'income';
  const transfer = row.type === 'transfer';
  return <div className="simple-row"><span className={'row-icon ' + (income ? 'income' : '')}>{income || transfer ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}</span><span className="row-copy"><b>{recordText(row.note, recordText(row.category, transfer ? 'Transfer' : income ? 'Income' : 'Expense'))}</b><small>{transfer ? 'Transfer' : recordText(row.category, 'Uncategorized')}{showDate ? ' · ' + recordText(row.date) : ''}</small></span><strong className={income ? 'income-text' : transfer ? '' : 'danger-text'}>{transfer ? '↔ ' : income ? '+' : '−'}{money(recordNumber(row.amount))}</strong>{onEdit && <span className="row-actions"><button className="text-button" onClick={onEdit}>Edit</button><button className="text-button danger-text" onClick={onDelete}>Delete</button></span>}</div>;
}
function MyMoney({ data, onAdd, onEdit, onDelete, onAddBucket, onEditBucket, onDeleteBucket, onTransferBucket, onAddInvestment, onEditInvestment, onDeleteInvestment }: {
  data: FinanceData; onAdd: () => void; onEdit: (row: FinanceRecord) => void; onDelete: (row: FinanceRecord) => void;
  onAddBucket: () => void; onEditBucket: (row: FinanceRecord) => void; onDeleteBucket: (row: FinanceRecord) => void;
  onTransferBucket: (row: FinanceRecord, action: 'fund' | 'withdraw') => void; onAddInvestment: () => void;
  onEditInvestment: (row: FinanceRecord) => void; onDeleteInvestment: (row: FinanceRecord) => void;
}) {
  const incomeHistory = data.transactions.filter((row) => row.type === 'income');
  const buckets = data.savingsBuckets.map((row) => {
    const balance = bucketBalance(data, row.id);
    const target = recordNumber(row.target);
    const monthly = recordNumber(row.monthlyGoal);
    const months = monthly > 0 && target > balance ? Math.ceil((target - balance) / monthly) : 0;
    const completion = balance >= target && target > 0 ? 'Goal reached' : months ? `About ${months} mo.` : 'Set a monthly goal';
    return { ...row, name: recordText(row.name), icon: recordText(row.icon), balance, target, monthly, completion };
  });
  const invested = data.investments.reduce((sum, row) => sum + recordNumber(row.invested), 0);
  const current = data.investments.reduce((sum, row) => sum + recordNumber(row.current), 0);
  const netWorth = data.accounts.reduce((sum, row) => sum + accountCurrentBalance(data, row), 0)
    + buckets.reduce((sum, row) => sum + row.balance, 0)
    + current
    - data.debts.reduce((sum, row) => sum + recordNumber(row.remainingOutstanding), 0);
  const accountGroups = [
    { id: 'savings', title: 'Savings & cash', accounts: data.accounts.filter((row) => recordText(row.type).toLocaleLowerCase() !== 'credit') },
    { id: 'credit', title: 'Credit', accounts: data.accounts.filter((row) => recordText(row.type).toLocaleLowerCase() === 'credit') },
  ].filter((group) => group.accounts.length);
  return <>
    <Heading eyebrow="WHAT YOU HAVE" title="My Money" description="Your accounts, savings, and investments in one clear view." />
    <div className="stat-grid"><Stat label="Cash balance" value={money(accountBalance(data))} hint="Across your accounts" icon={<Landmark size={18} />} kind="positive" /><Stat label="Savings buckets" value={money(buckets.reduce((sum, row) => sum + row.balance, 0))} hint={buckets.length + ' goals tracked'} icon={<Wallet size={18} />} kind="positive" /><Stat label="Investments" value={money(current)} hint={`${data.investments.length} positions`} icon={<ArrowUpRight size={18} />} kind="positive" change={`(${current - invested >= 0 ? '+' : ''}${money(current - invested)})`} changeKind={current - invested < 0 ? 'danger-text' : current - invested > 0 ? 'income-text' : ''} /><Stat label="Net worth" value={money(netWorth)} hint="Assets less liabilities" icon={<Scale size={18} />} kind={netWorth >= 0 ? 'positive' : 'expense'} /></div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">YOUR ACCOUNTS</span><h2>Accounts</h2></div><button className="text-button" onClick={onAdd}><Plus size={16} />Add account</button></div>{data.accounts.length ? <div className="account-groups">{accountGroups.map((group) => <section className="account-group" key={group.id}><h3>{group.title}</h3><div className="account-list">{group.accounts.map((row) => { const balance = accountCurrentBalance(data, row); return <article className="account-tile" key={row.id}><div className="account-tile-top"><b>{recordText(row.name, 'Unnamed account')}</b><small>{recordText(row.type, 'Account')}</small></div><strong className={balance > 0 ? 'income-text' : balance < 0 ? 'danger-text' : ''}>{money(balance)}</strong><div className="account-tile-actions"><button className="text-button" onClick={() => onEdit(row)}>Edit</button><button className="text-button danger-text" onClick={() => onDelete(row)}>Delete</button></div></article>; })}</div></section>)}</div> : <Empty icon={<Landmark size={19} />} title="Add your first account" text="Set up a bank or cash account to see your balances together." action={<button className="primary-button small" onClick={onAdd}><Plus size={16} />Add account</button>} />}</section>
    <section className="panel section-gap"><div className="panel-heading"><div><span className="eyebrow">SAVE TOWARD WHAT MATTERS</span><h2>Savings buckets</h2></div><button className="text-button" onClick={onAddBucket}><Plus size={16} />Add bucket</button></div>{buckets.length ? buckets.map((row) => { const percent = row.target ? Math.min(100, Math.round(row.balance / row.target * 100)) : 0; return <div className="asset-item" key={row.id}><div className="asset-title"><b>{recordText(row.icon, '🎯')} {recordText(row.name, 'Savings goal')}</b><span>{percent}%</span></div><div className="progress-track"><i style={{ width: percent + '%' }} /></div><div className="asset-meta"><span>{money(row.balance)} saved of {row.target ? money(row.target) : 'no target'}</span><span>{row.monthly ? `${money(row.monthly)}/mo · ${row.completion}` : row.completion}</span></div><div className="row-actions"><button className="text-button" onClick={() => onTransferBucket(row, 'fund')}>Allocate</button><button className="text-button" onClick={() => onTransferBucket(row, 'withdraw')}>Withdraw</button><button className="text-button" onClick={() => onEditBucket(row)}>Edit</button><button className="text-button danger-text" onClick={() => onDeleteBucket(row)}>Delete</button></div></div>; }) : <Empty icon={<Wallet size={19} />} title="Create your first savings bucket" text="Set targets and move money into goals while keeping a record of each transfer." action={<button className="primary-button small" onClick={onAddBucket}><Plus size={16} />Add bucket</button>} />}</section>
    <section className="panel section-gap"><div className="panel-heading"><div><span className="eyebrow">YOUR PORTFOLIO</span><h2>Investments</h2></div><button className="text-button" onClick={onAddInvestment}><Plus size={16} />Add investment</button></div>{data.investments.length ? data.investments.map((row) => { const investedAmount = recordNumber(row.invested); const currentAmount = recordNumber(row.current); const gain = currentAmount - investedAmount; return <article className="investment-tile" key={row.id}><div className="investment-copy"><b>{recordText(row.name, 'Investment')}</b><small>{recordText(row.type, 'Other')} · invested {money(investedAmount)}</small></div><div className="investment-value"><strong className="income-text">{money(currentAmount)}</strong><span className={gain < 0 ? 'danger-text' : gain > 0 ? 'income-text' : ''}>({gain >= 0 ? '+' : ''}{money(gain)})</span></div><div className="investment-actions"><button className="text-button" onClick={() => onEditInvestment(row)}>Edit</button><button className="text-button danger-text" onClick={() => onDeleteInvestment(row)}>Delete</button></div></article>; }) : <Empty icon={<ArrowUpRight size={19} />} title="Track investments when you’re ready" text="Keep amount invested and current market value together." action={<button className="primary-button small" onClick={onAddInvestment}><Plus size={16} />Add investment</button>} />}</section>
    <section className="panel section-gap"><div className="panel-heading"><div><span className="eyebrow">MONTHLY SAVINGS</span><h2>Income and spending history</h2></div></div>{incomeHistory.length ? monthlyNetHistory(data) : <p className="muted-paragraph">Your month-by-month savings history will appear after you log transactions.</p>}</section>
  </>;
}

function Budgets({ data, month, onMonthChange, onAdd, onEdit, onDelete, onCopyPrevious }: { data: FinanceData; month: string; onMonthChange: (month: string) => void; onAdd: () => void; onEdit: (row: FinanceRecord) => void; onDelete: (row: FinanceRecord) => void; onCopyPrevious: () => void }) {
  const budgets = data.budgets.filter((row) => !row.month || row.month === month);
  const expenseRows = data.transactions.filter((row) => row.type === 'expense' && recordText(row.date).startsWith(month));
  const totalSpent = expenseRows.reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const total = budgets.reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const budgetItems = budgets.map((row) => {
    const category = recordText(row.category, 'Other');
    const categoryRecord = data.categories.find((item) => item.kind === 'expense' && recordText(item.name) === category);
    const parent = data.budgetGroups.find((group) => group.id === categoryRecord?.groupId);
    const value = recordNumber(row.amount);
    const spent = expenseRows.filter((item) => recordText(item.category) === category).reduce((sum, item) => sum + recordNumber(item.amount), 0);
    return { row, category, groupId: parent?.id ?? 'ungrouped', groupName: recordText(parent?.name, 'Other'), groupIcon: recordText(parent?.icon, '◦'), value, spent, remaining: value - spent };
  });
  const groupedBudgets = [
    ...data.budgetGroups.map((group) => ({ id: group.id, name: recordText(group.name, 'Group'), icon: recordText(group.icon, '◦'), items: budgetItems.filter((item) => item.groupId === group.id) })).filter((group) => group.items.length),
    { id: 'ungrouped', name: 'Other', icon: '◦', items: budgetItems.filter((item) => item.groupId === 'ungrouped') },
  ].filter((group) => group.items.length);
  return <><Heading eyebrow="A PLAN THAT CAN BREATHE" title="Budgets" description="Gentle guardrails for the things that matter to you." action={!budgets.length && <span className="row-actions"><button className="outline-button" onClick={onCopyPrevious}>Copy previous month</button><button className="primary-button" onClick={onAdd}><Plus size={17} />New budget</button></span>} /><MonthPicker month={month} onChange={onMonthChange} /><div className="budget-summary"><span><small>PLANNED THIS MONTH</small><b>{money(total)}</b></span><span><small>SPENT SO FAR</small><b className="danger-text">{money(totalSpent)}</b></span><span><small>REMAINING</small><b>{money(Math.max(0, total - totalSpent))}</b></span></div><section className="panel budget-parent-panel"><div className="panel-heading"><h2>Budget progress</h2><span className="quiet-badge">{budgets.length} categories</span></div>{budgets.length ? <div className="budget-parent-groups">{groupedBudgets.map((group) => { const groupLimit = group.items.reduce((sum, item) => sum + item.value, 0); const groupSpent = group.items.reduce((sum, item) => sum + item.spent, 0); return <section className="budget-parent-group" key={group.id}><header><span>{group.icon} {group.name}</span><b>{money(groupSpent)} <small>of {money(groupLimit)}</small></b><div className="progress-track"><i style={{ width: `${groupLimit ? Math.min(100, groupSpent / groupLimit * 100) : 0}%` }} /></div></header><div className="budget-category-grid">{group.items.map(({ row, category, value, spent, remaining }) => { const percent = value ? Math.min(100, spent / value * 100) : 0; return <div className="budget-item" key={row.id}><div><b>{category}</b><small>Budget {money(value)}</small></div><div className="progress-track"><i style={{ width: `${percent}%` }} /></div><div className="budget-item-values"><span><small>Spent</small><b className="danger-text">{money(spent)}</b></span><span className={remaining < 0 ? 'over-budget' : ''}><small>{remaining < 0 ? 'Over by' : 'Remaining'}</small><b>{money(Math.abs(remaining))}</b></span></div><div className="row-actions"><button className="text-button" onClick={() => onEdit(row)}>Edit</button><button className="text-button danger-text" onClick={() => onDelete(row)}>Delete</button></div></div>; })}</div></section>; })}</div> : <Empty icon={<Wallet size={19} />} title="Your budget space is open" text="Monthly budgets will make your daily spending guide more useful." action={<button className="primary-button small" onClick={onAdd}><Plus size={16} />Add a budget</button>} />}</section></>;
}
function CreditDebt({ data, onAddDebt, onEditDebt, onDeleteDebt, onLogEmi, onEditScore }: { data: FinanceData; onAddDebt: () => void; onEditDebt: (row: FinanceRecord) => void; onDeleteDebt: (row: FinanceRecord) => void; onLogEmi: (row: FinanceRecord) => void; onEditScore: () => void }) {
  const cards = data.accounts.filter((row) => row.type === 'credit');
  const outstanding = cards.reduce((sum, row) => sum + Math.max(0, -accountCurrentBalance(data, row)), 0);
  const billBucket = data.savingsBuckets.find((row) => recordText(row.name).trim().toLocaleLowerCase() === 'credit card bill');
  const reserved = billBucket ? bucketBalance(data, billBucket.id) : 0;
  const gap = outstanding - reserved;
  const limit = cards.reduce((sum, row) => sum + recordNumber(row.creditLimit), 0);
  const utilization = limit ? outstanding / limit * 100 : 0;
  const score = recordNumber(data.creditScore?.score);
  const history = [...data.creditScoreHistory].sort((a, b) => recordText(a.date).localeCompare(recordText(b.date)));
  const totalDebt = data.debts.reduce((sum, row) => sum + recordNumber(row.remainingOutstanding), 0);
  const active = data.debts.filter((row) => recordNumber(row.remainingTenure) > 0).length;
  return <><Heading eyebrow="STAY IN THE KNOW" title="Credit & Debt" description="Your card balances, repayment plans, and credit score in one place." />
    <div className="stat-grid"><Stat label="Card balances" value={money(outstanding)} hint={cards.length + ' credit cards'} icon={<CreditCard size={18} />} /><Stat label="Reserved for card bills" value={money(reserved)} hint={billBucket ? recordText(billBucket.name) : 'Create a “Credit Card Bill” savings bucket'} icon={<Wallet size={18} />} kind="positive" /><Stat label="Total debt remaining" value={money(totalDebt)} hint={`${active} active EMI plans`} icon={<ArrowDownRight size={18} />} /><Stat label="Credit score" value={score ? String(score) : 'Not added'} hint={history.length ? `${history.length} updates recorded` : 'Add a score when ready'} icon={<ShieldCheck size={18} />} kind="accent" /></div>
    {cards.length > 0 && <section className="panel section-gap"><div className="panel-heading"><div><span className="eyebrow">CREDIT CARDS</span><h2>Utilization and bill cover</h2></div></div><div className="credit-cards-list">{cards.map((row) => <div className="simple-row" key={row.id}><span className="row-icon"><CreditCard size={17} /></span><span className="row-copy"><b>{recordText(row.name, 'Credit card')}</b><small>Limit {recordNumber(row.creditLimit) ? money(recordNumber(row.creditLimit)) : 'not set'}</small></span><strong>{money(Math.max(0, -accountCurrentBalance(data, row)))}</strong></div>)}</div><div className="utilization-row"><span>Overall utilization</span><b>{limit ? `${utilization.toFixed(1)}% · ${money(outstanding)} of ${money(limit)}` : 'Add credit limits to track utilization'}</b></div><div className="progress-track"><i className={utilization >= 80 ? 'over' : utilization >= 30 ? 'warn' : ''} style={{ width: `${Math.min(100, utilization)}%` }} /></div><div className={'credit-gap ' + (gap > 0 ? 'warning' : 'covered')}><b>{gap > 0 ? `Need ${money(gap)} to cover card balances` : gap < 0 ? `${money(Math.abs(gap))} extra reserved` : outstanding ? 'Card balances fully covered' : 'No outstanding card balance'}</b><span>{billBucket ? `Reserved through the “${recordText(billBucket.name)}” bucket.` : 'Create a “Credit Card Bill” savings bucket and allocate funds to it.'}</span></div></section>}
    <section className="panel section-gap"><div className="panel-heading"><div><span className="eyebrow">CREDIT HEALTH</span><h2>Credit score history</h2></div><button className="text-button" onClick={onEditScore}>{score ? 'Update score' : 'Add score'}</button></div>{history.length ? <><CreditScoreChart history={history} /><div className="score-history">{history.map((row) => <div className="simple-row" key={row.id}><span className="row-icon"><ShieldCheck size={17} /></span><span className="row-copy"><b>{recordNumber(row.score)}</b><small>{recordText(row.date)}</small></span></div>)}</div></> : <Empty icon={<ShieldCheck size={19} />} title="No score history yet" text="Add a score update when you want to track your progress." action={<button className="primary-button small" onClick={onEditScore}>Add score</button>} />}</section>
    <section className="panel section-gap"><div className="panel-heading"><div><span className="eyebrow">YOUR REPAYMENTS</span><h2>Debts & EMIs <span className="quiet-badge">{active} active</span></h2></div><button className="primary-button small" onClick={onAddDebt}><Plus size={16} />Add debt</button></div>{data.debts.length ? data.debts.map((row) => { const totalTenure = recordNumber(row.totalTenure); const remaining = recordNumber(row.remainingTenure); const paid = totalTenure ? Math.round((totalTenure - remaining) / totalTenure * 100) : 0; return <div className="debt-item" key={row.id}><div className="asset-title"><b>{recordText(row.name, 'Debt')}</b><span>{paid}% paid</span></div><div className="progress-track"><i style={{ width: `${Math.min(100, Math.max(0, paid))}%` }} /></div><div className="asset-meta"><span>Outstanding {money(recordNumber(row.remainingOutstanding))} of {money(recordNumber(row.originalAmount))}</span><span>{money(recordNumber(row.emiAmount))}/mo · {remaining} of {totalTenure} EMIs left</span></div>{Boolean(row.notes) && <p className="muted-paragraph">{recordText(row.notes)}</p>}<div className="row-actions"><button className="primary-button small" disabled={remaining <= 0} onClick={() => onLogEmi(row)}>Log EMI</button><button className="text-button" onClick={() => onEditDebt(row)}>Edit</button><button className="text-button danger-text" onClick={() => onDeleteDebt(row)}>Delete</button></div></div>; }) : <Empty icon={<CreditCard size={19} />} title="Nothing to track yet" text="Add a card repayment or loan to follow your balance and monthly EMIs." action={<button className="primary-button small" onClick={onAddDebt}><Plus size={16} />Add debt</button>} />}</section>
  </>;
}

function Categories({ data, onAdd, onEdit, onDelete }: { data: FinanceData; onAdd: (kind: string) => void; onEdit: (row: FinanceRecord) => void; onDelete: (row: FinanceRecord) => void }) { return <><Heading eyebrow="YOUR LABELS" title="Categories" description="Keep your spending grouped in a way that makes sense to you." />{['expense', 'income'].map((kind) => <section className="panel category-panel" key={kind}><div className="panel-heading"><h2>{kind === 'expense' ? 'Expense categories' : 'Income categories'}</h2><button className="text-button" onClick={() => onAdd(kind)}><Plus size={15} />Add category</button></div>{data.categories.filter((row) => row.kind === kind).map((row) => <div className="category-row" key={row.id}><i /> <span className="category-name">{recordText(row.name, 'Category')}</span>{Boolean(row.groupId) && <span className="quiet-badge">{recordText(data.budgetGroups.find((group) => group.id === row.groupId)?.name, '')}</span>}{Boolean(row.default) && <span className="quiet-badge">Default</span>}<span className="row-actions"><button className="text-button" onClick={() => onEdit(row)}>Edit</button>{!row.default && <button className="text-button danger-text" onClick={() => onDelete(row)}>Delete</button>}</span></div>)}{!data.categories.some((row) => row.kind === kind) && <Empty icon={<Tags size={18} />} title="No categories yet" text="Add a category to organize your records." />}</section>)}</>; }

function Calendar({ data, month, onMonthChange, onAdd, onEdit, onDelete }: { data: FinanceData; month: string; onMonthChange: (month: string) => void; onAdd: (date: string) => void; onEdit: (row: FinanceRecord) => void; onDelete: (row: FinanceRecord) => void }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  const today = todayISO();
  const cells: Array<number | null> = Array.from({ length: firstDay + days }, (_, index) => index < firstDay ? null : index - firstDay + 1);
  while (cells.length % 7) cells.push(null);
  const selected = data.transactions.filter((row) => row.date === selectedDate).sort((a, b) => recordNumber(b.createdAt) - recordNumber(a.createdAt));
  const income = selected.filter((row) => row.type === 'income').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const expense = selected.filter((row) => row.type === 'expense').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  return <><Heading eyebrow="YOUR MONTH, IN VIEW" title="Calendar" description="Tap a day to see the activity recorded on it." /><MonthPicker month={month} onChange={onMonthChange} /><section className="panel calendar-panel"><div className="calendar-grid">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{cells.map((day, index) => { if (!day) return <div className="calendar-cell blank" key={`blank-${index}`} />; const date = `${month}-${String(day).padStart(2, '0')}`; const rows = data.transactions.filter((row) => row.date === date); const dailyIncome = rows.filter((row) => row.type === 'income').reduce((sum, row) => sum + recordNumber(row.amount), 0); const dailyExpense = rows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + recordNumber(row.amount), 0); return <button className={`calendar-cell ${date === today ? 'today' : ''} ${selectedDate === date ? 'selected' : ''}`} key={date} onClick={() => setSelectedDate(date)}><b>{day}</b>{rows.length > 0 && <span className="calendar-count">{rows.length} {rows.length === 1 ? 'item' : 'items'}</span>}{dailyIncome > 0 && <small className="income-text">+{money(dailyIncome)}</small>}{dailyExpense > 0 && <small className="danger-text">−{money(dailyExpense)}</small>}</button>; })}</div></section>{selectedDate && <Dialog title={new Date(year, monthNumber - 1, Number(selectedDate.slice(-2))).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onClose={() => setSelectedDate('')}><div className="day-summary"><span>Income <b className="income-text">{money(income)}</b></span><span>Expenses <b className="danger-text">{money(expense)}</b></span></div>{selected.length ? <div className="simple-list">{selected.map((row) => <TransactionRow key={row.id} row={row} onEdit={() => { const target = row; setSelectedDate(''); onEdit(target); }} onDelete={() => onDelete(row)} />)}</div> : <Empty icon={<CalendarDays size={19} />} title="Nothing recorded" text="There are no transactions on this day yet." />}<div className="dialog-actions"><button className="outline-button" onClick={() => setSelectedDate('')}>Close</button><button className="primary-button" onClick={() => { const date = selectedDate; setSelectedDate(''); onAdd(date); }}>Add transaction</button></div></Dialog>}</>;
}
function Planning({ data }: { data: FinanceData }) {
  const [view, setView] = useState<'forecast' | 'purchase' | 'reports' | 'projection'>('forecast');
  const [months, setMonths] = useState(12);
  const [reportMonth, setReportMonth] = useState('');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const forecasts = Array.from({ length: 12 }, (_, index) => {
    const month = shiftMonth(currentMonth, index);
    const income = data.recurring.filter((row) => row.type === 'income' && ruleOccursInMonth(row, month)).reduce((sum, row) => sum + recordNumber(row.amount), 0);
    const recurringExpense = data.recurring.filter((row) => row.type === 'expense' && !row.debtId && !row.investmentId && ruleOccursInMonth(row, month)).reduce((sum, row) => sum + recordNumber(row.amount), 0);
    const investmentContributions = data.recurring.filter((row) => row.type === 'expense' && row.investmentId && ruleOccursInMonth(row, month)).reduce((sum, row) => sum + recordNumber(row.amount), 0);
    const emis = data.debts.filter((row) => recordNumber(row.remainingTenure) > index).reduce((sum, row) => sum + recordNumber(row.emiAmount), 0);
    const expense = recurringExpense + investmentContributions + emis;
    return { month, income, expense, net: income - expense };
  });
  const expenses = data.transactions.filter((row) => row.type === 'expense');
  const accountsTotal = data.accounts.reduce((sum, row) => sum + accountCurrentBalance(data, row), 0);
  const investments = data.investments.reduce((sum, row) => sum + recordNumber(row.current), 0);
  const debts = data.debts.reduce((sum, row) => sum + recordNumber(row.remainingOutstanding), 0);
  const cashAndBuckets = accountsTotal + data.savingsBuckets.reduce((sum, row) => sum + bucketBalance(data, row.id), 0);
  const netWorth = cashAndBuckets + investments - debts;
  const reportMonths = [...new Set(data.transactions.map((row) => recordText(row.date).slice(0, 7)).filter(Boolean))].sort().reverse();
  const latestReport = reportMonths.includes(reportMonth) ? reportMonth : reportMonths[0] ?? currentMonth;
  const reportRows = data.transactions.filter((row) => recordText(row.date).startsWith(latestReport));
  const reportIncome = reportRows.filter((row) => row.type === 'income').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const reportExpense = reportRows.filter((row) => row.type === 'expense').reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const budget = data.budgets.filter((row) => row.month === latestReport).reduce((sum, row) => sum + recordNumber(row.amount), 0);
  const categories = [...new Set(expenses.filter((row) => recordText(row.date).startsWith(latestReport)).map((row) => recordText(row.category, 'Uncategorized')))].map((name) => ({ name, amount: reportRows.filter((row) => row.type === 'expense' && recordText(row.category, 'Uncategorized') === name).reduce((sum, row) => sum + recordNumber(row.amount), 0) })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const [purchase, setPurchase] = useState('');
  const purchaseAmount = Number(purchase) || 0;
  const remainingBudget = data.budgets.filter((row) => row.month === currentMonth).reduce((sum, row) => {
    const spent = data.transactions.filter((tx) => tx.type === 'expense' && recordText(tx.date).startsWith(currentMonth) && tx.category === row.category).reduce((total, tx) => total + recordNumber(tx.amount), 0);
    return sum + Math.max(0, recordNumber(row.amount) - spent);
  }, 0);
  const emergencyBucketForPurchase = data.savingsBuckets.find((row) => recordText(row.name).toLocaleLowerCase().includes('emergency') || recordText(row.icon).includes('🛡'));
  const emergencyTargetForPurchase = recordNumber(emergencyBucketForPurchase?.target) || 10000;
  let cumulative = remainingBudget;
  let safeMonth: string | null = null;
  for (const forecast of forecasts) { cumulative += forecast.net; if (cumulative >= purchaseAmount + emergencyTargetForPurchase) { safeMonth = forecast.month; break; } }
  const purchaseAffordable = purchaseAmount > 0 && purchaseAmount <= remainingBudget && remainingBudget - purchaseAmount >= emergencyTargetForPurchase;
    const projected = [{ year: 0, value: netWorth }];
  let projectedCash = cashAndBuckets;
  const projectedInvestments = data.investments.map((row) => ({ id: row.id, current: recordNumber(row.current), rate: recordNumber(row.expectedReturn) || 8 }));
  const projectedDebts = data.debts.map((row) => ({ remaining: recordNumber(row.remainingOutstanding), tenure: recordNumber(row.remainingTenure), emi: recordNumber(row.emiAmount) }));
  for (let index = 1; index <= months; index += 1) {
    const month = shiftMonth(currentMonth, index);
    const recurringIncome = data.recurring.filter((row) => row.type === 'income' && ruleOccursInMonth(row, month)).reduce((sum, row) => sum + recordNumber(row.amount), 0);
    const ordinaryExpenses = data.recurring.filter((row) => row.type === 'expense' && !row.debtId && !row.investmentId && ruleOccursInMonth(row, month)).reduce((sum, row) => sum + recordNumber(row.amount), 0);
    let emiTotal = 0;
    projectedDebts.forEach((debt) => { if (debt.tenure > 0) { const payment = Math.min(debt.emi, debt.remaining); emiTotal += debt.emi; debt.remaining = Math.max(0, debt.remaining - payment); debt.tenure -= 1; } });
    projectedInvestments.forEach((investment) => { investment.current *= 1 + investment.rate / 1200; });
    const contributions = data.recurring.filter((row) => row.type === 'expense' && row.investmentId && ruleOccursInMonth(row, month));
    contributions.forEach((rule) => { const target = projectedInvestments.find((item) => item.id === rule.investmentId); if (target) target.current += recordNumber(rule.amount); });
    const investmentContributions = contributions.reduce((sum, row) => sum + recordNumber(row.amount), 0);
    projectedCash += recurringIncome - ordinaryExpenses - emiTotal - investmentContributions;
    projected.push({ year: index, value: projectedCash + projectedInvestments.reduce((sum, row) => sum + row.current, 0) - projectedDebts.reduce((sum, row) => sum + row.remaining, 0) });
  }
  const milestones = [
    ...data.debts.filter((row) => recordNumber(row.remainingTenure) > 0 && recordNumber(row.remainingTenure) <= months).map((row) => ({ month: shiftMonth(currentMonth, recordNumber(row.remainingTenure)), label: `${recordText(row.name, 'Debt')} paid off` })),
    ...data.savingsBuckets.flatMap((row) => {
      const balance = bucketBalance(data, row.id);
      const target = recordNumber(row.target);
      const monthlyGoal = recordNumber(row.monthlyGoal);
      const neededMonths = monthlyGoal > 0 && target > balance ? Math.ceil((target - balance) / monthlyGoal) : 0;
      return neededMonths > 0 && neededMonths <= months ? [{ month: shiftMonth(currentMonth, neededMonths), label: `${recordText(row.name, 'Savings goal')} reached` }] : [];
    }),
  ].sort((a, b) => a.month.localeCompare(b.month));
  const maxProjection = Math.max(1, ...projected.map((row) => Math.abs(row.value)));
  return <><Heading eyebrow="PLAN AHEAD WITH CLARITY" title="Planning" description="Explore your upcoming cash flow, purchases, reports, and longer-term picture." />
    <div className="planning-tabs">{([['forecast', 'Cash flow'], ['purchase', 'Purchase planner'], ['reports', 'Monthly report'], ['projection', 'Net worth']] as const).map(([id, labelText]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{labelText}</button>)}</div>
    {view === 'forecast' && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECURRING RULES AND EMIS</span><h2>12 month cash flow forecast</h2></div></div><div className="simple-list">{forecasts.map((row) => <div className="simple-row" key={row.month}><span className="row-copy"><b>{monthLabel(row.month)}</b><small>Income <span className="income-text">{money(row.income)}</span> · Outgoing <span className="danger-text">{money(row.expense)}</span></small></span><strong className={row.net >= 0 ? 'income-text' : 'danger-text'}>{row.net >= 0 ? '+' : '−'}{money(Math.abs(row.net))}</strong></div>)}</div><p className="muted-paragraph">Forecast repeats each active recurring rule monthly and includes scheduled EMI amounts. Edit recurring dates and frequencies in Transactions.</p></section>}
    {view === 'purchase' && <section className="panel purchase-planner"><div className="panel-heading"><div><span className="eyebrow">A PURCHASE, WITH A PLAN</span><h2>Can it fit?</h2></div></div><label>Planned purchase amount<input type="number" min="0" value={purchase} onChange={(event) => setPurchase(event.target.value)} placeholder="Enter an amount" /></label><div className="stat-grid"><Stat label="Tracked cash" value={money(remainingBudget)} hint="Unspent budget allocations" icon={<Wallet size={18} />} /><Stat label="Monthly recurring surplus" value={money(emergencyTargetForPurchase)} hint="Emergency buffer target" icon={<Sparkles size={18} />} kind="positive" /></div>{purchaseAmount > 0 && <div className={'credit-gap ' + (purchaseAffordable ? 'covered' : 'warning')}><b>{purchaseAffordable ? 'This purchase fits your available budget while keeping the emergency buffer target intact.' : safeMonth ? `Consider waiting until ${monthLabel(safeMonth)} to reach the purchase amount and emergency buffer target.` : `This purchase exceeds your current available budget or would use your emergency buffer.`}</b><span>Available unspent budget: {money(remainingBudget)} · Emergency buffer target: {money(emergencyTargetForPurchase)}. Planning estimate only.</span></div>}</section>}
    {view === 'reports' && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">MONTHLY SNAPSHOT</span><h2>{monthLabel(latestReport)}</h2></div><select aria-label="Report month" value={latestReport} onChange={(event) => setReportMonth(event.target.value)}>{[...new Set([currentMonth, ...reportMonths])].sort().reverse().map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select><span className="quiet-badge">{reportRows.length} transactions</span></div><div className="budget-summary"><span><small>INCOME</small><b className="income-text">{money(reportIncome)}</b></span><span><small>EXPENSES</small><b className="danger-text">{money(reportExpense)}</b></span><span><small>NET</small><b className={reportIncome - reportExpense >= 0 ? 'income-text' : 'danger-text'}>{money(reportIncome - reportExpense)}</b></span><span><small>BUDGET USED</small><b>{budget ? `${Math.round(reportExpense / budget * 100)}%` : 'No budget'}</b></span></div><h3>Top spending categories</h3>{categories.length ? categories.map((row) => <div className="simple-row" key={row.name}><span className="row-copy"><b>{row.name}</b></span><strong className="danger-text">{money(row.amount)}</strong></div>) : <Empty icon={<Tags size={18} />} title="No expenses this month" text="Expense category highlights appear when you log spending." />}</section>}
    {view === 'projection' && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">BASED ON TODAY'S TRACKED NET WORTH</span><h2>Net worth projection</h2></div><select aria-label="Projection period" value={months} onChange={(event) => setMonths(Number(event.target.value))}><option value={12}>1 year</option><option value={36}>3 years</option><option value={60}>5 years</option></select></div><div className="projection-chart">{projected.filter((_, index) => index % Math.max(1, Math.ceil(months / 12)) === 0 || index === months).map((row) => <div key={row.year} className="projection-bar"><i style={{ height: `${Math.max(3, Math.abs(row.value) / maxProjection * 100)}%` }} /><small>{row.year === 0 ? 'Today' : `Year ${row.year}`}</small><b>{money(row.value)}</b></div>)}</div>{milestones.length > 0 && <div className="projection-milestones"><h3>Upcoming milestones</h3>{milestones.map((item) => <div className="simple-row" key={item.month + item.label}><span className="row-copy"><b>{item.label}</b><small>{monthLabel(item.month)}</small></span></div>)}</div>}<p className="muted-paragraph">Projection assumes recurring rules continue, uses an 8% annual estimate for investments unless a return is recorded, and excludes inflation and future changes in income or spending.</p></section>}
  </>;
}

function SettingsPage({ name, email, data, darkMode, onTheme, onImport, onExport }: { name: string; email: string; data: FinanceData; darkMode: boolean; onTheme: () => void; onImport: () => void; onExport: () => void }) { return <><Heading eyebrow="YOUR SPACE, YOUR SETTINGS" title="Account & Settings" description="Manage your account and keep a copy of your records." /><section className="panel settings-panel"><div className="settings-row"><Avatar name={name} /><span className="row-copy"><b>{name}</b><small>{email}</small></span><span className="connected"><Check size={14} />Connected with Google</span></div><div className="settings-row"><Cloud size={19} /><span className="row-copy"><b>Sync status</b><small>Your latest changes are saved to your account.</small></span><span className="connected"><i />Synced</span></div><div className="settings-row"><Upload size={19} /><span className="row-copy"><b>Backups</b><small>Export {data.transactions.length} transactions and your finance settings, or restore from a V1 JSON backup.</small></span><div className="row-actions"><button className="outline-button" onClick={onImport}>Import backup</button><button className="outline-button" onClick={onExport}>Export backup</button></div></div><div className="settings-row"><Sparkles size={19} /><span className="row-copy"><b>Appearance</b><small>Choose a comfortable display theme.</small></span><button className="outline-button" onClick={onTheme}>{darkMode ? 'Use light theme' : 'Use dark theme'}</button></div><div className="settings-row"><ShieldCheck size={19} /><span className="row-copy"><b>Private by default</b><small>Your records are isolated to your signed-in account.</small></span></div></section></>; }

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true"><div className="dialog-title"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>{children}</section></div>; }
function CategoryDialog({ data, initial, onClose, onSave }: { data: FinanceData; initial: FinanceRecord | null; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const existingName = recordText(initial?.name);
  const parsedEmoji = existingName.match(/^\p{Extended_Pictographic}(?:\uFE0F)?/u)?.[0] ?? '';
  const [name, setName] = useState(existingName.slice(parsedEmoji.length).trim());
  const [emoji, setEmoji] = useState(parsedEmoji);
  const [kind, setKind] = useState(recordText(initial?.kind, 'expense'));
  const [groupId, setGroupId] = useState(recordText(initial?.groupId));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const emojis = ['—', '👤', '🏠', '⛽', '📈', '🔁', '🍔', '🛒', '🚗', '🛫', '👕', '💊', '📚', '🎬', '💡', '📱', '🐕', '☕', '🚌', '🎮', '💻', '🏥', '🎓', '🎵', '🛍️', '💳', '🧾', '🍕', '🍻', '🎁', '💰', '💼', '🏦', '💹', '💵'];
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const formattedName = `${emoji}${emoji ? ' ' : ''}${name.trim()}`;
    if (!name.trim()) return;
    if (data.categories.some((row) => row.id !== initial?.id && row.kind === kind && recordText(row.name).toLocaleLowerCase() === formattedName.toLocaleLowerCase())) { setError('A category with this name already exists.'); return; }
    setSaving(true); setError('');
    await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), name: formattedName, kind, groupId: kind === 'expense' ? groupId : '', default: Boolean(initial?.default), createdAt: initial?.createdAt ?? Date.now() });
    setSaving(false);
  };
  return <Dialog title={initial?.id ? 'Edit category' : 'Add category'} onClose={onClose}><form className="form-fields" onSubmit={submit}>
    <label>Type<select value={kind} disabled={Boolean(initial?.id)} onChange={(event) => setKind(event.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></label>
    <label>Category name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Groceries" /></label>
    <label>Icon<select value={emoji} onChange={(event) => setEmoji(event.target.value)}>{emojis.map((value) => <option key={value} value={value === '—' ? '' : value}>{value}</option>)}</select></label>
    {kind === 'expense' && <label>Budget group<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">Uncategorized</option>{data.budgetGroups.map((group) => <option key={group.id} value={group.id}>{recordText(group.icon)} {recordText(group.name)}</option>)}</select></label>}
    {error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save category'}</button></div>
  </form></Dialog>;
}
function BudgetDialog({ data, initial, month, onClose, onSave }: { data: FinanceData; initial: FinanceRecord | null; month: string; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const [category, setCategory] = useState(recordText(initial?.category, recordText(data.categories.find((row) => row.kind === 'expense')?.name)));
  const [amount, setAmount] = useState(initial ? String(recordNumber(initial.amount)) : '');
  const [budgetMonth, setBudgetMonth] = useState(recordText(initial?.month, month));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(Number(amount) > 0)) return;
    if (data.budgets.some((row) => row.id !== initial?.id && row.category === category && row.month === budgetMonth)) { setError('A budget limit for this category already exists for that month.'); return; }
    setSaving(true); setError('');
    await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), category, amount: Number(amount), month: budgetMonth, createdAt: initial?.createdAt ?? Date.now() });
    setSaving(false);
  };
  return <Dialog title={initial?.id ? 'Edit budget' : 'Add budget'} onClose={onClose}><form className="form-fields" onSubmit={submit}>
    <label>Expense category<select required value={category} onChange={(event) => setCategory(event.target.value)}>{data.categories.filter((row) => row.kind === 'expense').map((row) => <option key={row.id} value={String(row.name)}>{String(row.name)}</option>)}</select></label>
    <label>Monthly limit<div className="currency-field"><span>₹</span><input autoFocus type="number" min="1" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label>
    <label>Month<input type="month" required value={budgetMonth} onChange={(event) => setBudgetMonth(event.target.value)} /></label>
    {error && <p className="form-error">{error}</p>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save budget'}</button></div>
  </form></Dialog>;
}
function BucketDialog({ initial, onClose, onSave }: { initial: FinanceRecord | null; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const [name, setName] = useState(recordText(initial?.name));
  const [icon, setIcon] = useState(recordText(initial?.icon, '🎯'));
  const [target, setTarget] = useState(initial ? String(recordNumber(initial.target)) : '');
  const [monthlyGoal, setMonthlyGoal] = useState(initial ? String(recordNumber(initial.monthlyGoal)) : '');
  const [notes, setNotes] = useState(recordText(initial?.notes));
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), name, icon, target: Number(target) || 0, monthlyGoal: Number(monthlyGoal) || 0, notes, createdAt: initial?.createdAt ?? Date.now() }); setSaving(false); };
  return <Dialog title={initial?.id ? 'Edit savings bucket' : 'Add savings bucket'} onClose={onClose}><form className="form-fields" onSubmit={submit}><label>Goal name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Emergency fund" /></label><label>Icon<select value={icon} onChange={(event) => setIcon(event.target.value)}>{['🎯', '🏠', '🚗', '✈️', '💻', '🎓', '💍', '🧰', '💰', '🎁', '🏥', '🛡️'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Target amount<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Optional" /></div></label><label>Monthly goal<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" value={monthlyGoal} onChange={(event) => setMonthlyGoal(event.target.value)} placeholder="Optional" /></div></label><label>Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></label><div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save bucket'}</button></div></form></Dialog>;
}
function InvestmentDialog({ initial, onClose, onSave }: { initial: FinanceRecord | null; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const [name, setName] = useState(recordText(initial?.name));
  const [type, setType] = useState(recordText(initial?.type, 'stocks'));
  const [invested, setInvested] = useState(initial ? String(recordNumber(initial.invested)) : '');
  const [current, setCurrent] = useState(initial ? String(recordNumber(initial.current)) : '');
  const [date, setDate] = useState(recordText(initial?.date, todayISO()));
  const [note, setNote] = useState(recordText(initial?.note));
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), name, type, invested: Number(invested) || 0, current: Number(current) || 0, date: date || null, note, createdAt: initial?.createdAt ?? Date.now(), updatedAt: Date.now() }); setSaving(false); };
  const labels: Record<string, string> = { stocks: 'Stocks', mutual_funds: 'Mutual funds', etf: 'ETF', fd: 'Fixed deposit', ppf: 'PPF', nps: 'NPS', crypto: 'Crypto', gold: 'Gold', real_estate: 'Real estate', other: 'Other' };
  return <Dialog title={initial?.id ? 'Edit investment' : 'Add investment'} onClose={onClose}><form className="form-fields" onSubmit={submit}><label>Investment name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Index fund" /></label><label>Type<select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Amount invested<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" required value={invested} onChange={(event) => setInvested(event.target.value)} placeholder="0.00" /></div></label><label>Current market value<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" required value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="0.00" /></div></label><label>Date acquired<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Notes<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></label><div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save investment'}</button></div></form></Dialog>;
}
function BucketTransferDialog({ data, bucket, action, onClose, onSave }: { data: FinanceData; bucket: FinanceRecord; action: 'fund' | 'withdraw'; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const targetBalance = bucketBalance(data, bucket.id);
  const candidates = [...data.accounts, ...data.savingsBuckets.filter((row) => row.id !== bucket.id)];
  const [otherId, setOtherId] = useState(String(candidates[0]?.id ?? ''));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!(value > 0) || !otherId) return;
    if (action === 'withdraw' && value > targetBalance) return;
    const other = candidates.find((row) => row.id === otherId);
    if (!other) return;
    const sourceBalance = data.accounts.some((row) => row.id === otherId) ? accountCurrentBalance(data, other) : bucketBalance(data, otherId);
    if (action === 'fund' && value > sourceBalance && !window.confirm(`This is more than the available balance of ${money(sourceBalance)}. Continue anyway?`)) return;
    const from = action === 'fund' ? other : bucket;
    const to = action === 'fund' ? bucket : other;
    setSaving(true);
    await onSave({ id: crypto.randomUUID(), type: 'transfer', amount: value, date, createdAt: Date.now(), fromAccountId: from.id, fromAccountName: from.name, toAccountId: to.id, toAccountName: to.name, note: `Savings: ${recordText(from.name)} → ${recordText(to.name)}` });
    setSaving(false);
  };
  return <Dialog title={`${action === 'fund' ? 'Allocate to' : 'Withdraw from'} ${recordText(bucket.name, 'savings bucket')}`} onClose={onClose}><form className="form-fields" onSubmit={submit}>{!candidates.length ? <p className="form-hint">Add a bank or cash account first to move money.</p> : <label>{action === 'fund' ? 'Move money from' : 'Move money to'}<select required value={otherId} onChange={(event) => setOtherId(event.target.value)}>{candidates.map((row) => { const value = data.accounts.some((account) => account.id === row.id) ? accountCurrentBalance(data, row) : bucketBalance(data, row.id); return <option key={row.id} value={row.id}>{recordText(row.name, 'Account')} · {money(value)}</option>; })}</select></label>}<p className="form-hint">Current bucket balance: {money(targetBalance)}</p><label>Amount<div className="currency-field"><span>₹</span><input autoFocus type="number" min="0.01" step="0.01" max={action === 'withdraw' ? targetBalance : undefined} required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label><label>Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !candidates.length}>{saving ? 'Saving…' : action === 'fund' ? 'Allocate' : 'Withdraw'}</button></div></form></Dialog>;
}
function RecurringDialog({ data, initial, onClose, onSave }: { data: FinanceData; initial: FinanceRecord | null; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const initialType = initial?.type === 'income' || initial?.type === 'transfer' ? initial.type : 'expense';
  const [name, setName] = useState(recordText(initial?.name));
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(initialType);
  const [amount, setAmount] = useState(initial ? String(recordNumber(initial.amount)) : '');
  const [frequency, setFrequency] = useState(recordText(initial?.frequency, 'monthly'));
  const [startDate, setStartDate] = useState(recordText(initial?.startDate, todayISO()));
  const [endDate, setEndDate] = useState(recordText(initial?.endDate));
  const [note, setNote] = useState(recordText(initial?.note));
  const [category, setCategory] = useState(recordText(initial?.category));
  const [accountId, setAccountId] = useState(String(initial?.accountId ?? data.accounts[0]?.id ?? ''));
  const [fromId, setFromId] = useState(String(initial?.fromAccountId ?? data.accounts[0]?.id ?? ''));
  const [toId, setToId] = useState(String(initial?.toAccountId ?? data.accounts[1]?.id ?? ''));
  const [investmentId, setInvestmentId] = useState(String(initial?.investmentId ?? ''));
  const [debtId, setDebtId] = useState(String(initial?.debtId ?? ''));
  const [saving, setSaving] = useState(false);
  const choices = data.categories.filter((row) => row.kind === type);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(Number(amount) > 0) || data.accounts.length === 0) return;
    if (type === 'transfer' && (!fromId || !toId || fromId === toId)) return;
    const account = data.accounts.find((row) => row.id === accountId);
    const from = data.accounts.find((row) => row.id === fromId);
    const to = data.accounts.find((row) => row.id === toId);
    setSaving(true);
    await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), name, type, amount: Number(amount), frequency, startDate, endDate: endDate || null, note, lastFiredDate: initial?.lastFiredDate ?? null, ...(type === 'transfer' ? { fromAccountId: fromId, fromAccountName: from?.name, toAccountId: toId, toAccountName: to?.name } : { accountId, accountName: account?.name, category, investmentId: type === 'expense' ? investmentId || null : null, debtId: type === 'expense' ? debtId || null : null }), createdAt: initial?.createdAt ?? Date.now() });
    setSaving(false);
  };
  return <Dialog title={initial?.id ? 'Edit recurring rule' : 'Add recurring rule'} onClose={onClose}><form className="form-fields" onSubmit={submit}>
    <label>Name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Salary, Rent, SIP" /></label>
    <div className="kind-toggle"><button type="button" className={type === 'expense' ? 'selected' : ''} onClick={() => { setType('expense'); setCategory(''); }}>Expense</button><button type="button" className={type === 'income' ? 'selected' : ''} onClick={() => { setType('income'); setCategory(''); }}>Income</button><button type="button" className={type === 'transfer' ? 'selected' : ''} onClick={() => setType('transfer')}>Transfer</button></div>
    <label>Amount<div className="currency-field"><span>₹</span><input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label>
    {type === 'transfer' ? <><label>From account<select required value={fromId} onChange={(event) => setFromId(event.target.value)}>{data.accounts.map((row) => <option key={row.id} value={row.id}>{recordText(row.name, 'Account')}</option>)}</select></label><label>To account<select required value={toId} onChange={(event) => setToId(event.target.value)}>{data.accounts.map((row) => <option key={row.id} value={row.id}>{recordText(row.name, 'Account')}</option>)}</select></label></> : <><label>Account<select required value={accountId} onChange={(event) => setAccountId(event.target.value)}>{data.accounts.map((row) => <option key={row.id} value={row.id}>{recordText(row.name, 'Account')}</option>)}</select></label><label>Category<select required value={category} onChange={(event) => setCategory(event.target.value)}>{choices.map((row) => <option key={row.id} value={String(row.name)}>{String(row.name)}</option>)}</select></label>{type === 'expense' && <><label>Investment contribution<select value={investmentId} onChange={(event) => setInvestmentId(event.target.value)}><option value="">None</option>{data.investments.map((row) => <option key={row.id} value={row.id}>{recordText(row.name, 'Investment')}</option>)}</select></label><label>Debt repayment<select value={debtId} onChange={(event) => setDebtId(event.target.value)}><option value="">None</option>{data.debts.map((row) => <option key={row.id} value={row.id}>{recordText(row.name, 'Debt')}</option>)}</select></label></>}</>}
    <label>Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label>Start date<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End date <small>Optional</small><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label>Note <small>Optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></label>
    {!data.accounts.length && <p className="form-hint">Create an account before setting up a recurring rule.</p>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || !data.accounts.length}>{saving ? 'Saving…' : 'Save rule'}</button></div>
  </form></Dialog>;
}
function DebtDialog({ data, initial, onClose, onSave }: { data: FinanceData; initial: FinanceRecord | null; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const [name, setName] = useState(recordText(initial?.name));
  const [category, setCategory] = useState(recordText(initial?.category, recordText(data.categories.find((row) => row.kind === 'expense')?.name, 'EMIs')));
  const [originalAmount, setOriginalAmount] = useState(initial ? String(recordNumber(initial.originalAmount)) : '');
  const [emiAmount, setEmiAmount] = useState(initial ? String(recordNumber(initial.emiAmount)) : '');
  const [interestRate, setInterestRate] = useState(initial ? String(recordNumber(initial.interestRate) || '') : '');
  const [totalTenure, setTotalTenure] = useState(initial ? String(recordNumber(initial.totalTenure)) : '');
  const [remainingTenure, setRemainingTenure] = useState(initial ? String(recordNumber(initial.remainingTenure)) : '');
  const [remainingOutstanding, setRemainingOutstanding] = useState(initial ? String(recordNumber(initial.remainingOutstanding)) : '');
  const [startDate, setStartDate] = useState(recordText(initial?.startDate, todayISO()));
  const [linkedRecurringId, setLinkedRecurringId] = useState(String(initial?.linkedRecurringId ?? ''));
  const [notes, setNotes] = useState(recordText(initial?.notes));
  const [saving, setSaving] = useState(false);
  const estimateOutstanding = (emi: string, remaining: string) => (Number(emi) * Number(remaining)).toFixed(2);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), name, category, originalAmount: Number(originalAmount), emiAmount: Number(emiAmount), interestRate: Number(interestRate) || 0, totalTenure: Number(totalTenure), remainingTenure: Number(remainingTenure), remainingOutstanding: Number(remainingOutstanding) || 0, startDate, linkedRecurringId: linkedRecurringId || null, notes, createdAt: initial?.createdAt ?? Date.now() }); setSaving(false); };
  return <Dialog title={initial?.id ? 'Edit debt record' : 'Add debt record'} onClose={onClose}><form className="form-fields" onSubmit={submit}><label>Debt name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Car loan" /></label><label>Expense category<select required value={category} onChange={(event) => setCategory(event.target.value)}>{data.categories.filter((row) => row.kind === 'expense').map((row) => <option key={row.id} value={String(row.name)}>{String(row.name)}</option>)}</select></label><label>Original amount<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" required value={originalAmount} onChange={(event) => setOriginalAmount(event.target.value)} /></div></label><label>Monthly EMI<div className="currency-field"><span>₹</span><input type="number" min="1" step="0.01" required value={emiAmount} onChange={(event) => { setEmiAmount(event.target.value); setRemainingOutstanding(estimateOutstanding(event.target.value, remainingTenure)); }} /></div></label><label>Interest rate (%)<input type="number" min="0" step="0.01" value={interestRate} onChange={(event) => setInterestRate(event.target.value)} placeholder="Optional" /></label><label>Total tenure (months)<input type="number" min="1" step="1" required value={totalTenure} onChange={(event) => setTotalTenure(event.target.value)} /></label><label>Remaining EMIs<input type="number" min="0" step="1" required value={remainingTenure} onChange={(event) => { setRemainingTenure(event.target.value); setRemainingOutstanding(estimateOutstanding(emiAmount, event.target.value)); }} /></label><label>Remaining outstanding<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" required value={remainingOutstanding} onChange={(event) => setRemainingOutstanding(event.target.value)} /></div></label><label>Start date<input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Linked recurring EMI<select value={linkedRecurringId} onChange={(event) => setLinkedRecurringId(event.target.value)}><option value="">None — create manually</option>{data.recurring.filter((row) => row.type === 'expense').map((row) => <option key={row.id} value={row.id}>{recordText(row.name)} · {money(recordNumber(row.amount))}/mo</option>)}</select></label><label>Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional" /></label><div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save debt'}</button></div></form></Dialog>;
}
function CreditScoreDialog({ initial, onClose, onSave }: { initial: FinanceRecord | null; onClose: () => void; onSave: (score: number, date: string) => Promise<void> }) {
  const [score, setScore] = useState(initial ? String(recordNumber(initial.score)) : '');
  const [date, setDate] = useState(recordText(initial?.date, todayISO()));
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave(Number(score), date); setSaving(false); };
  return <Dialog title="Update credit score" onClose={onClose}><form className="form-fields" onSubmit={submit}><label>Score<input autoFocus type="number" min="300" max="900" step="1" required value={score} onChange={(event) => setScore(event.target.value)} placeholder="e.g. 782" /></label><label>As of<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save score'}</button></div></form></Dialog>;
}
function TransactionDialog({ data, initial, error, onClose, onSave }: { data: FinanceData; initial: FinanceRecord | null; error: string; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) {
  const initialKind = initial?.type === 'income' || initial?.type === 'transfer' ? initial.type : 'expense';
  const [kind, setKind] = useState<'expense' | 'income' | 'transfer'>(initialKind);
  const [amount, setAmount] = useState(initial ? String(recordNumber(initial.amount)) : '');
  const [category, setCategory] = useState(recordText(initial?.category));
  const [date, setDate] = useState(recordText(initial?.date, todayISO()));
  const [note, setNote] = useState(recordText(initial?.note));
  const [accountId, setAccountId] = useState(String(initial?.accountId ?? data.accounts[0]?.id ?? ''));
  const [fromAccountId, setFromAccountId] = useState(String(initial?.fromAccountId ?? data.accounts[0]?.id ?? ''));
  const [toAccountId, setToAccountId] = useState(String(initial?.toAccountId ?? data.accounts[1]?.id ?? ''));
  const [investmentId, setInvestmentId] = useState(String(initial?.investmentId ?? ''));
  const [debtId, setDebtId] = useState(String(initial?.debtId ?? ''));
  const [saving, setSaving] = useState(false);
  const choices = data.categories.filter((row) => row.kind === kind);
  const selectedCategory = choices.find((row) => recordText(row.name) === category);
  const categoryKey = recordText(selectedCategory?.key).toLocaleLowerCase();
  const categoryName = recordText(selectedCategory?.name, category).toLocaleLowerCase().replace(/[^a-z]/g, '');
  const isInvestmentsCategory = categoryKey === 'investments' || categoryName === 'investments';
  const isEmisCategory = categoryKey === 'emis' || categoryName === 'emi' || categoryName === 'emis';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(Number(amount) > 0)) return;
    if (kind === 'transfer' && (!fromAccountId || !toAccountId || fromAccountId === toAccountId)) return;
    setSaving(true);
    const fromAccount = data.accounts.find((row) => row.id === fromAccountId);
    const toAccount = data.accounts.find((row) => row.id === toAccountId);
    const account = data.accounts.find((row) => row.id === accountId);
    const record: FinanceRecord = {
      ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), createdAt: initial?.createdAt ?? Date.now(), type: kind, amount: Number(amount), date, note,
      category: kind === 'transfer' ? 'Transfer' : category || recordText(choices[0]?.name, 'Other'),
      investmentId: kind === 'expense' ? (investmentId || null) : null,
      debtId: kind === 'expense' ? (debtId || null) : null,
      ...(kind === 'transfer'
        ? { fromAccountId, fromAccountName: fromAccount?.name, toAccountId, toAccountName: toAccount?.name }
        : account ? { accountId, accountName: account.name } : {}),
    };
    await onSave(record);
    setSaving(false);
  };
  return <Dialog title={initial?.id ? 'Edit transaction' : 'Add transaction'} onClose={onClose}><form className="form-fields" onSubmit={submit}>
    <div className="kind-toggle"><button type="button" className={kind === 'expense' ? 'selected' : ''} onClick={() => { setKind('expense'); setCategory(''); setInvestmentId(''); setDebtId(''); }}>Expense</button><button type="button" className={kind === 'income' ? 'selected' : ''} onClick={() => { setKind('income'); setCategory(''); setInvestmentId(''); setDebtId(''); }}>Income</button><button type="button" className={kind === 'transfer' ? 'selected' : ''} onClick={() => { setKind('transfer'); setCategory(''); setInvestmentId(''); setDebtId(''); }}>Transfer</button></div>
    <label className="amount-field">Amount<div><span>₹</span><input type="number" min="0.01" step="0.01" required placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></div></label>
    {kind !== 'transfer' && <label>Category<select value={category} onChange={(event) => { const value = event.target.value; const picked = choices.find((row) => recordText(row.name) === value); const key = recordText(picked?.key).toLocaleLowerCase(); const name = recordText(picked?.name, value).toLocaleLowerCase().replace(/[^a-z]/g, ''); setCategory(value); if (key !== 'investments' && name !== 'investments') setInvestmentId(''); if (key !== 'emis' && name !== 'emi' && name !== 'emis') setDebtId(''); }}>{choices.map((row) => <option key={row.id} value={String(row.name)}>{String(row.name)}</option>)}</select></label>}
    {kind === 'transfer' ? <><label>From account<select required value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>{data.accounts.map((row) => <option key={row.id} value={String(row.id)}>{recordText(row.name, 'Account')}</option>)}</select></label><label>To account<select required value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>{data.accounts.map((row) => <option key={row.id} value={String(row.id)}>{recordText(row.name, 'Account')}</option>)}</select></label>{data.accounts.length < 2 && <p className="form-hint">Add two accounts before recording a transfer.</p>}</> : <label>Account <small>Optional</small><select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">No account</option>{data.accounts.map((row) => <option key={row.id} value={String(row.id)}>{recordText(row.name, 'Account')}</option>)}</select></label>}
    {kind === 'expense' && isInvestmentsCategory && <label>Linked investment <small>Optional</small><select value={investmentId} onChange={(event) => setInvestmentId(event.target.value)}><option value="">No investment</option>{data.investments.map((item) => <option key={item.id} value={item.id}>{recordText(item.name, 'Investment')}</option>)}</select></label>}{kind === 'expense' && isEmisCategory && <label>Linked debt / EMI <small>Optional</small><select value={debtId} onChange={(event) => setDebtId(event.target.value)}><option value="">No debt</option>{data.debts.map((item) => <option key={item.id} value={item.id}>{recordText(item.name, 'Debt')}</option>)}</select></label>}
    <label>Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Note <small>Optional</small><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was this for?" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || (kind === 'transfer' && data.accounts.length < 2)}>{saving ? 'Saving…' : 'Save transaction'}</button></div>
  </form></Dialog>;
}function AccountDialog({ initial, onClose, onSave }: { initial: FinanceRecord | null; onClose: () => void; onSave: (row: FinanceRecord) => Promise<void> }) { const [name, setName] = useState(recordText(initial?.name)); const [type, setType] = useState(recordText(initial?.type, 'savings')); const [balance, setBalance] = useState(initial ? String(recordNumber(initial.openingBalance)) : '0'); const [creditLimit, setCreditLimit] = useState(initial && recordNumber(initial.creditLimit) ? String(recordNumber(initial.creditLimit)) : ''); const [saving, setSaving] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); await onSave({ ...(initial ?? {}), id: initial?.id || crypto.randomUUID(), name, type, openingBalance: initial ? recordNumber(initial.openingBalance) : Number(balance) || 0, creditLimit: type === 'credit' && creditLimit ? Number(creditLimit) : null, createdAt: initial?.createdAt ?? Date.now() }); setSaving(false); }; return <Dialog title={initial?.id ? 'Edit account' : 'Add account'} onClose={onClose}><form className="form-fields" onSubmit={submit}><label>Account name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Everyday account" /></label><label>Account type<select value={type} onChange={(event) => setType(event.target.value)}><option value="savings">Savings</option><option value="current">Current</option><option value="credit">Credit card</option><option value="cash">Cash</option><option value="wallet">Wallet</option><option value="other">Other</option></select></label><label>Starting balance<div className="currency-field"><span>₹</span><input type="number" step="0.01" value={balance} disabled={Boolean(initial)} onChange={(event) => setBalance(event.target.value)} placeholder="0.00" /></div></label>{type === 'credit' && <label>Credit limit<div className="currency-field"><span>₹</span><input type="number" min="0" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} placeholder="Optional" /></div></label>}<div className="dialog-actions"><button type="button" className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save account'}</button></div></form></Dialog>; }

function accountCurrentBalance(data: FinanceData, account: FinanceRecord) {
  let value = recordNumber(account.openingBalance);
  data.transactions.forEach((row) => {
    const amount = recordNumber(row.amount);
    if (row.type === 'transfer') {
      if (row.fromAccountId === account.id) value -= amount;
      if (row.toAccountId === account.id) value += amount;
    } else if (row.accountId === account.id) {
      if (row.type === 'income') value += amount;
      if (row.type === 'expense') value -= amount;
    }
  });
  return value;
}
function cashAccounts(data: FinanceData) {
  return data.accounts.filter((account) => recordText(account.type).trim().toLocaleLowerCase() !== 'credit');
}
function accountBalance(data: FinanceData) {
  return cashAccounts(data).reduce((total, account) => total + accountCurrentBalance(data, account), 0);
}
function bucketBalance(data: FinanceData, bucketId: string) {
  return data.transactions.reduce((total, row) => {
    if (row.type !== 'transfer') return total;
    if (row.toAccountId === bucketId) return total + recordNumber(row.amount);
    if (row.fromAccountId === bucketId) return total - recordNumber(row.amount);
    return total;
  }, 0);
}
function monthlyNetHistory(data: FinanceData) {
  const months = new Map<string, { income: number; expense: number }>();
  data.transactions.forEach((row) => {
    if (row.type !== 'income' && row.type !== 'expense') return;
    const month = recordText(row.date).slice(0, 7);
    if (!month) return;
    const values = months.get(month) ?? { income: 0, expense: 0 };
    values[row.type] += recordNumber(row.amount);
    months.set(month, values);
  });
  const rows = [...months.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  return <div className="monthly-history">{rows.map(([month, values]) => { const net = values.income - values.expense; return <div className="monthly-history-row" key={month}><b>{new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b><span className="income-text">↑ {money(values.income)}</span><span className="danger-text">↓ {money(values.expense)}</span><strong className={net >= 0 ? 'income-text' : 'danger-text'}>{net >= 0 ? '+' : '−'}{money(Math.abs(net))} ({values.income ? (net / values.income * 100).toFixed(1) : '0.0'}%)</strong></div>; })}</div>;
}
function label(tab: Tab) { return [...primary, ...secondary].find((item) => item.id === tab)?.label ?? 'Dashboard'; }


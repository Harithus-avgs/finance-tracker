// Default seed data for first install: blank slate + a sensible starter category set.
// Real personal data now lives only in the user's own exported backup (see Export/Import Backup).
const SEED_DATA = {
"transactions": [],
"budgets": [],
"accounts": [],
"categories": [
  {"id":"mp6hn1vfwxtpvf","key":"salary","name":"💰 Salary","kind":"income","default":true},
  {"id":"mp6hn1vfi932xz","key":"freelance","name":"💼 Freelance","kind":"income","default":true},
  {"id":"mp6hn1vfjjh9i7","key":"interest","name":"🏦 Interest","kind":"income","default":true},
  {"id":"mp6hn1vfzsi0mk","key":"dividends","name":"💹 Dividends","kind":"income","default":true},
  {"id":"mp6hn1vfvzqb12","key":"gifts","name":"🎁 Gifts","kind":"income","default":true},
  {"id":"mp6g50acjt071u","key":"me","name":"👤 Me","default":true,"kind":"expense"},
  {"id":"mp6g50acpuqk5o","key":"home","name":"🏠 Home","default":true,"kind":"expense"},
  {"id":"mp6g50acvqswiv","key":"fuel","name":"⛽ Fuel","default":true,"kind":"expense"},
  {"id":"mp6g50ac56aei6","key":"investments","name":"📈 Investments","default":true,"kind":"expense"},
  {"id":"mp6g50acl1n6uh","key":"subscriptions","name":"🔁 Subscriptions","default":true,"kind":"expense"},
  {"id":"mp6ih73w0ass1l","name":"✂️ EMIs","kind":"expense","createdAt":1778825001020},
  {"id":"mp6kb321ih67bi","name":"💵 Refund","kind":"income","createdAt":1778828075065},
  {"id":"mq0ju16w5pc0ot","name":"🧾 Lent","kind":"expense","createdAt":1780641264776},
  {"id":"mqalgpl0vn2d3w","name":"💳 Surplus","kind":"expense","createdAt":1781248664196}
],
"investments": [],
"recurring": [],
"savingsBuckets": []
};

// Top-level budget groups: reusable hierarchy that expense categories can be assigned to.
// Kept as data (not hardcoded logic) so more groups can be added later without code changes.
const DEFAULT_BUDGET_GROUPS = [
{ id: "grp-lifestyle", name: "Lifestyle", icon: "🏖️" },
{ id: "grp-investments", name: "Investments", icon: "📈" },
{ id: "grp-commitments", name: "Commitments", icon: "📋" },
{ id: "grp-savings", name: "Savings", icon: "💰" }
];

// Best-effort keyword match used only once, to seed a sensible default group for
// pre-existing categories that have never had a group assigned. Users can always
// override via the category edit form afterwards.
const BUDGET_GROUP_KEYWORDS = [
{ groupId: "grp-lifestyle", keywords: ["food", "dining", "entertainment", "shopping", "travel", "fuel", "personal care", "hobby", "hobbies"] },
{ groupId: "grp-investments", keywords: ["sip", "mutual fund", "stock", "gold", "epf", "retirement", "invest"] },
{ groupId: "grp-commitments", keywords: ["rent", "emi", "insurance", "bill", "subscription", "donation", "loan", "home"] },
{ groupId: "grp-savings", keywords: ["emergency fund", "vacation fund", "gadget fund", "house fund", "cash saving", "saving"] }
];

function guessBudgetGroupId(categoryName) {
const lower = categoryName.toLowerCase();
for (const entry of BUDGET_GROUP_KEYWORDS) {
  if (entry.keywords.some(k => lower.includes(k))) return entry.groupId;
}
return '';
}

// Only backfills categories that have never had a groupId (undefined), so an
// explicit "Uncategorized" choice (empty string) made later is never overwritten.
function migrateCategoryBudgetGroups() {
state.categories.forEach(cat => {
  if (cat.kind === 'expense' && cat.groupId === undefined) {
    cat.groupId = guessBudgetGroupId(cat.name);
  }
});
}

function getBudgetGroupById(groupId) {
return state.budgetGroups.find(g => g.id === groupId);
}

// App State
let state = {
transactions: [],
budgets: [],
accounts: [],
categories: [],
investments: [],
recurring: [],
savingsBuckets: [],
debts: [],
budgetGroups: []
};

// Shared month context initialized to today's month
const todayDate = new Date();
let currentMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

// Bulk transaction selection set
let selectedTxIds = new Set();

// Recurring transactions view: which category cards are collapsed (UI-only, not persisted)
let collapsedRecurringCategories = new Set();

const STORAGE_KEY = 'finance-tracker:v1';
const THEME_KEY = 'finance-tracker:theme';

// Helper Utilities
function uid() {
return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function isoDate(dateObj) {
const d = new Date(dateObj);
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISODate(dateStr) {
const [y, m, d] = dateStr.split('-').map(Number);
return new Date(y, m - 1, d);
}

const currencyFormatter = new Intl.NumberFormat("en-IN", {
style: "currency",
currency: "INR",
minimumFractionDigits: 2
});

function formatMoney(n) {
return currencyFormatter.format(n);
}

function formatMonthLabel(d) {
return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateShort(dateStr) {
const d = parseISODate(dateStr);
return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateLong(dateStr) {
const d = parseISODate(dateStr);
return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function sameMonth(dateStr, monthDate) {
const d = parseISODate(dateStr);
return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
}

function yearMonth(d) {
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function startOfMonth(d) {
return new Date(d.getFullYear(), d.getMonth(), 1);
}

function previousMonth(d) {
return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function escapeHtml(s) {
if (typeof s !== 'string') return '';
return s.replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#39;');
}

function addMonthsClamped(date, n) {
const result = new Date(date.getTime());
const expectedMonth = (result.getMonth() + n) % 12;
result.setMonth(result.getMonth() + n);
// Correct roll-over to next month for clamped dates (e.g. Jan 31 + 1 month -> Feb 28)
if (result.getMonth() !== (expectedMonth + 12) % 12) {
  result.setDate(0);
}
return result;
}

function addInterval(dateStr, frequency) {
const d = parseISODate(dateStr);
let nextDate;
if (frequency === 'monthly') {
  nextDate = addMonthsClamped(d, 1);
} else if (frequency === 'yearly') {
  nextDate = addMonthsClamped(d, 12);
} else {
  nextDate = d;
}
return isoDate(nextDate);
}

function getPendingOccurrences(rule, todayDate) {
const todayStr = isoDate(todayDate);
let nextDueDate = rule.lastFiredDate ? addInterval(rule.lastFiredDate, rule.frequency) : rule.startDate;
const occurrences = [];

let iterations = 0;
// Collect all occurrences up to today (inclusive), capped by endDate
while (nextDueDate <= todayStr && iterations < 1000) {
  if (rule.endDate && nextDueDate > rule.endDate) {
    break;
  }
  occurrences.push(nextDueDate);
  nextDueDate = addInterval(nextDueDate, rule.frequency);
  iterations++;
}
return occurrences;
}

// State Persistence & Seeding

// Fallback structures + one-time migrations, applied regardless of whether state came
// from an existing backup or from a fresh SEED_DATA install (both need the same repairs).
function normalizeState() {
if (!state.transactions) state.transactions = [];
if (!state.budgets) state.budgets = [];
if (!state.accounts) state.accounts = [];
if (!state.categories) state.categories = [];
if (!state.investments) state.investments = [];
if (!state.recurring) state.recurring = [];
if (!state.savingsBuckets) {
  state.savingsBuckets = [];
} else {
  // Clean up normal savings bucket if it exists from previous model
  state.savingsBuckets = state.savingsBuckets.filter(b => !b.isDefault && b.id !== 'bucket-normal');
}
if (!state.debts) state.debts = [];
if (!state.creditScoreHistory) state.creditScoreHistory = [];
if (state.creditScore === undefined) state.creditScore = null;

const hasSurplusCat = state.categories.some(c => c.name.includes('Surplus Investment') || c.key === 'surplus_investment');
if (!hasSurplusCat) {
  state.categories.push({
    id: 'cat-surplus-investment',
    key: 'surplus_investment',
    name: '🚀 Surplus Investment',
    kind: 'expense',
    default: true,
    createdAt: Date.now()
  });
}

if (!state.budgetGroups || state.budgetGroups.length === 0) {
  state.budgetGroups = JSON.parse(JSON.stringify(DEFAULT_BUDGET_GROUPS));
}
migrateCategoryBudgetGroups();
}

function loadState() {
const raw = localStorage.getItem(STORAGE_KEY);
if (raw) {
  try {
    state = JSON.parse(raw);
    normalizeState();
  } catch (e) {
    console.error("Error parsing storage data. Loading default backup...", e);
    initDefaults();
  }
} else {
  // Seed with user's backup data on first install
  initDefaults();
}
}

function saveState() {
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initDefaults() {
state = JSON.parse(JSON.stringify(SEED_DATA));
normalizeState();
saveState();
}

// Business Calculations
function getAccountBalance(accountId) {
const account = state.accounts.find(a => a.id === accountId);
if (!account) return 0;
let balance = Number(account.openingBalance) || 0;

for (const t of state.transactions) {
  if (t.type === 'income' && t.accountId === accountId) {
    balance += Number(t.amount);
  } else if (t.type === 'expense' && t.accountId === accountId) {
    balance -= Number(t.amount);
  } else if (t.type === 'transfer') {
    if (t.toAccountId === accountId) {
      balance += Number(t.amount);
    }
    if (t.fromAccountId === accountId) {
      balance -= Number(t.amount);
    }
  }
}
return balance;
}

function getTotalBalance() {
return state.accounts.reduce((sum, acc) => sum + getAccountBalance(acc.id), 0);
}

function getCompletedMonthsSavings() {
const today = new Date();
const currentMStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

let total = 0;
for (const t of state.transactions) {
  if (t.type === 'income' || t.type === 'expense') {
    const mStr = t.date.substring(0, 7);
    if (mStr < currentMStr) {
      const amount = Number(t.amount);
      if (t.type === 'income') {
        total += amount;
      } else {
        total -= amount;
      }
    }
  }
}
return total;
}

function getBucketBalance(bucketId) {
let balance = 0;
for (const t of state.transactions) {
  if (t.type === 'transfer') {
    if (t.toAccountId === bucketId) {
      balance += Number(t.amount);
    }
    if (t.fromAccountId === bucketId) {
      balance -= Number(t.amount);
    }
  }
}
return balance;
}

function getSavingsBucketsSum() {
return state.savingsBuckets.reduce((sum, b) => sum + getBucketBalance(b.id), 0);
}

function getSavingsBucketsTotal() {
return getCompletedMonthsSavings();
}

function reverseDebtAmortization(tx) {
if (tx.type === 'expense' && tx.debtId) {
  const debt = state.debts.find(d => d.id === tx.debtId);
  if (debt) {
    debt.remainingTenure = Math.min(debt.totalTenure, debt.remainingTenure + 1);
    debt.remainingOutstanding = Number((Number(debt.remainingOutstanding) + Number(tx.amount)).toFixed(2));
  }
}
}

function applyDebtAmortization(tx) {
if (tx.type === 'expense' && tx.debtId) {
  const debt = state.debts.find(d => d.id === tx.debtId);
  if (debt) {
    debt.remainingTenure = Math.max(0, debt.remainingTenure - 1);
    debt.remainingOutstanding = Number(Math.max(0, Number(debt.remainingOutstanding) - Number(tx.amount)).toFixed(2));
  }
}
}

function getEstimatedCompletionDate(currentVal, targetVal, monthlyGoalVal) {
if (currentVal >= targetVal && targetVal > 0) return "Goal Achieved!";
if (monthlyGoalVal > 0) {
  const remaining = targetVal - currentVal;
  if (remaining <= 0) return "Goal Achieved!";
  const months = Math.ceil(remaining / monthlyGoalVal);
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
return "N/A";
}

function getFinancialHealthScore(mStr) {
let savingsRatePoints = 0;
let emergencyFundPoints = 0;
let debtRatioPoints = 0;
let budgetDisciplinePoints = 0;

// 1. Savings Rate
let monthlyIncome = 0;
let monthlyExpense = 0;
state.transactions.forEach(t => {
  if (t.date.substring(0, 7) === mStr) {
    if (t.type === 'income') monthlyIncome += t.amount;
    if (t.type === 'expense') monthlyExpense += t.amount;
  }
});

const net = monthlyIncome - monthlyExpense;
const rate = monthlyIncome > 0 ? (net / monthlyIncome) * 100 : 0;
if (rate >= 30) {
  savingsRatePoints = 25;
} else if (rate > 0) {
  savingsRatePoints = Math.round(rate * (25 / 30));
}

// 2. Emergency Fund
const emBucket = state.savingsBuckets.find(b => b.name.toLowerCase().includes('emergency') || b.icon.includes('🛡'));
if (emBucket) {
  const bal = getBucketBalance(emBucket.id);
  const tar = emBucket.target || 50000;
  const progress = Math.min(100, (bal / tar) * 100);
  emergencyFundPoints = Math.round(progress * 0.25);
} else {
  emergencyFundPoints = 0;
}

// 3. Debt Ratio
const totalEMIs = state.debts.reduce((sum, d) => sum + Number(d.emiAmount), 0);
const inc = monthlyIncome || 50000;
const ratio = totalEMIs / inc;
if (totalEMIs === 0) {
  debtRatioPoints = 25;
} else if (ratio >= 0.4) {
  debtRatioPoints = 0;
} else {
  debtRatioPoints = Math.round(25 * (1 - ratio / 0.4));
}

// 4. Budget Discipline
const activeBudgets = state.budgets.filter(b => b.month === mStr);
if (activeBudgets.length === 0) {
  budgetDisciplinePoints = 25;
} else {
  let under = 0;
  activeBudgets.forEach(b => {
    const spent = getBudgetSpent(b.category, mStr);
    if (spent <= b.amount) under++;
  });
  budgetDisciplinePoints = Math.round(25 * (under / activeBudgets.length));
}

const totalScore = savingsRatePoints + emergencyFundPoints + debtRatioPoints + budgetDisciplinePoints;

return {
  score: totalScore,
  breakdown: {
    savingsRate: { score: savingsRatePoints, label: `Savings Rate: ${rate.toFixed(1)}%` },
    emergencyFund: { score: emergencyFundPoints, label: emBucket ? `Emergency Fund Progress: ${Math.round((getBucketBalance(emBucket.id)/(emBucket.target || 50000))*100)}%` : "No Emergency Fund bucket configured" },
    debtRatio: { score: debtRatioPoints, label: totalEMIs > 0 ? `Debt-to-Income Ratio: ${(ratio*100).toFixed(1)}%` : "Debt Free!" },
    budgetDiscipline: { score: budgetDisciplinePoints, label: activeBudgets.length > 0 ? `Budgets Adhered: ${activeBudgets.filter(b => getBudgetSpent(b.category, mStr) <= b.amount).length}/${activeBudgets.length}` : "No budgets configured" }
  }
};
}

window.openHealthScoreModal = function() {
const mStr = yearMonth(currentMonth);
const res = getFinancialHealthScore(mStr);
const container = document.getElementById('health-score-breakdown-content');

container.innerHTML = `
  <div style="text-align: center; margin-bottom: 8px;">
    <span style="font-size: 56px; font-weight: 700; color: var(--accent);">${res.score}</span>
    <span style="font-size: 24px; color: var(--text-muted);">/100</span>
    <p style="font-size: 14px; color: var(--text-muted); margin-top: 4px;">Score calculated for ${currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
  </div>
  <div class="health-detail-row">
    <div>
      <strong style="display:block; font-size:14px;">Savings Rate Discipline</strong>
      <span style="font-size:12px; color:var(--text-muted);">${res.breakdown.savingsRate.label}</span>
    </div>
    <strong style="font-size:16px; color:var(--income);">${res.breakdown.savingsRate.score}/25</strong>
  </div>
  <div class="health-detail-row">
    <div>
      <strong style="display:block; font-size:14px;">Emergency Fund Buffer</strong>
      <span style="font-size:12px; color:var(--text-muted);">${res.breakdown.emergencyFund.label}</span>
    </div>
    <strong style="font-size:16px; color:var(--income);">${res.breakdown.emergencyFund.score}/25</strong>
  </div>
  <div class="health-detail-row">
    <div>
      <strong style="display:block; font-size:14px;">Debt & EMI Management</strong>
      <span style="font-size:12px; color:var(--text-muted);">${res.breakdown.debtRatio.label}</span>
    </div>
    <strong style="font-size:16px; color:var(--income);">${res.breakdown.debtRatio.score}/25</strong>
  </div>
  <div class="health-detail-row">
    <div>
      <strong style="display:block; font-size:14px;">Budget Adherence Rate</strong>
      <span style="font-size:12px; color:var(--text-muted);">${res.breakdown.budgetDiscipline.label}</span>
    </div>
    <strong style="font-size:16px; color:var(--income);">${res.breakdown.budgetDiscipline.score}/25</strong>
  </div>
`;
openModal('modal-health-score');
};

function getBudgetSpent(categoryName, monthStr) {
let spent = 0;
for (const t of state.transactions) {
  if (t.type === 'expense' && t.category === categoryName && t.date.substring(0, 7) === monthStr) {
    spent += Number(t.amount);
  }
}
return spent;
}

// Dynamically rolls up all budgets whose category belongs to the given budget group.
function getGroupBudgetTotals(groupId, monthStr) {
const budgetsInGroup = state.budgets.filter(b => {
  if (b.month !== monthStr) return false;
  const cat = state.categories.find(c => c.name === b.category);
  return cat && cat.groupId === groupId;
});
const budgeted = budgetsInGroup.reduce((sum, b) => sum + b.amount, 0);
const spent = budgetsInGroup.reduce((sum, b) => sum + getBudgetSpent(b.category, monthStr), 0);
return { budgeted, spent, remaining: budgeted - spent };
}

function getMonthlyNet(monthDate) {
const mStr = yearMonth(monthDate);
let income = 0;
let expense = 0;
for (const t of state.transactions) {
  if (t.date.substring(0, 7) === mStr) {
    if (t.type === 'income') {
      income += Number(t.amount);
    } else if (t.type === 'expense') {
      expense += Number(t.amount);
    }
  }
}
return income - expense;
}

function getLifetimeSavings() {
let income = 0;
let expense = 0;
for (const t of state.transactions) {
  if (t.type === 'income') {
    income += Number(t.amount);
  } else if (t.type === 'expense') {
    expense += Number(t.amount);
  }
}
return income - expense;
}

function applyInvestmentContribution(investmentId, amount) {
if (!investmentId) return;
const inv = state.investments.find(i => i.id === investmentId);
if (inv) {
  inv.invested = Number((Number(inv.invested) + Number(amount)).toFixed(2));
  inv.current = Number((Number(inv.current) + Number(amount)).toFixed(2));
  inv.updatedAt = Date.now();
}
}

function reverseInvestmentContribution(investmentId, amount) {
if (!investmentId) return;
const inv = state.investments.find(i => i.id === investmentId);
if (inv) {
  inv.invested = Number((Number(inv.invested) - Number(amount)).toFixed(2));
  inv.current = Number((Number(inv.current) - Number(amount)).toFixed(2));
  inv.updatedAt = Date.now();
}
}

// Navigation & Active View Router
let activeView = 'dashboard';
let activePlanningSubview = 'forecast';
let activeProjectionsPeriod = 12;
function switchTab(viewId) {
activeView = viewId;
selectedTxIds.clear();

// Highlight tab button
document.querySelectorAll('#main-nav .tab-btn').forEach(btn => {
  btn.classList.toggle('active', btn.getAttribute('data-view') === viewId);
});

// Toggle sections visibility
document.querySelectorAll('.view-section').forEach(sec => {
  sec.classList.toggle('active', sec.id === `view-${viewId}`);
});

// Render view
renderCurrentView();
}

function renderCurrentView() {
switch (activeView) {
  case 'dashboard':
    renderDashboard();
    break;
  case 'calendar':
    renderCalendar();
    break;
  case 'transactions':
    renderTransactions();
    break;
  case 'mymoney':
    renderMyMoney();
    break;
  case 'creditdebt':
    renderCreditDebt();
    break;
  case 'planning':
    renderPlanning();
    break;
  case 'budgets':
    renderBudgets();
    break;
  case 'categories':
    renderCategories();
    break;
}
}

// 1. DASHBOARD VIEW RENDERER
function renderDashboard() {
// Synchronize month picker labels in all month pickers
document.querySelectorAll('.current-month-label').forEach(lbl => {
  lbl.textContent = formatMonthLabel(currentMonth);
});

const mStr = yearMonth(currentMonth);

// Calculations
let incomeThisMonth = 0;
let expenseThisMonth = 0;
for (const t of state.transactions) {
  if (t.date.substring(0, 7) === mStr) {
    if (t.type === 'income') incomeThisMonth += t.amount;
    if (t.type === 'expense') expenseThisMonth += t.amount;
  }
}
const netThisMonth = incomeThisMonth - expenseThisMonth;
// Calculate remaining budget for the current selected month
let remainingBudgetVal = 0;
state.budgets.filter(b => b.month === mStr).forEach(b => {
  const spent = getBudgetSpent(b.category, mStr);
  remainingBudgetVal += Math.max(0, b.amount - spent);
});

const spendableVal = remainingBudgetVal; // Available to Spend: exactly the remaining budget
const displayTotalCash = getTotalBalance(); // Total cash in bank accounts

const totalDebtVal = state.debts.reduce((sum, d) => sum + Number(d.remainingOutstanding), 0);
const activeEMIsCount = state.debts.filter(d => d.remainingTenure > 0).length;

// Find Emergency Fund bucket progress
const emBucket = state.savingsBuckets.find(b => b.name.toLowerCase().includes('emergency') || b.icon.includes('🛡'));
let emergencyPct = 0;
let emergencySaved = 0;
if (emBucket) {
  emergencySaved = getBucketBalance(emBucket.id);
  emergencyPct = emBucket.target > 0 ? Math.min(100, Math.round((emergencySaved / emBucket.target) * 100)) : 0;
}

// Find Next Target Goal (closest progress or first target goal)
const targetGoals = state.savingsBuckets.filter(b => b.target > 0);
let nextGoalName = 'None';
let nextGoalSub = 'No target goals set';
if (targetGoals.length > 0) {
  targetGoals.sort((a, b) => {
    const aPct = a.target > 0 ? (getBucketBalance(a.id) / a.target) : 0;
    const bPct = b.target > 0 ? (getBucketBalance(b.id) / b.target) : 0;
    return bPct - aPct;
  });
  const topGoal = targetGoals[0];
  const topGoalBal = getBucketBalance(topGoal.id);
  const topGoalPct = topGoal.target > 0 ? Math.min(100, Math.round((topGoalBal / topGoal.target) * 100)) : 0;
  nextGoalName = `${topGoal.icon || '🎯'} ${topGoal.name}`;
  nextGoalSub = `${topGoalPct}% completed (${formatMoney(topGoalBal)} / ${formatMoney(topGoal.target)})`;
}

// Health score
const healthRes = getFinancialHealthScore(mStr);
const savingsRate = incomeThisMonth > 0 ? (netThisMonth / incomeThisMonth) * 100 : 0;

// Populate smart cards
document.getElementById('db-spendable-val').textContent = formatMoney(spendableVal);
document.getElementById('db-balance-val').textContent = formatMoney(displayTotalCash);

const debtEl = document.getElementById('db-debt-val');
debtEl.textContent = formatMoney(totalDebtVal);
document.getElementById('db-debt-sub').textContent = `${activeEMIsCount} active EMIs`;

const emEl = document.getElementById('db-emergency-val');
emEl.textContent = `${emergencyPct}%`;
document.getElementById('db-emergency-sub').textContent = `${formatMoney(emergencySaved)} saved`;

document.getElementById('db-goal-val').textContent = nextGoalName;
document.getElementById('db-goal-sub').textContent = nextGoalSub;

document.getElementById('db-health-val').textContent = `${healthRes.score} / 100`;

// Populate monthly summary cards
document.getElementById('db-income-val').textContent = formatMoney(incomeThisMonth);
document.getElementById('db-expense-val').textContent = formatMoney(expenseThisMonth);

const netEl = document.getElementById('db-net-val');
netEl.textContent = formatMoney(netThisMonth);
if (netThisMonth >= 0) {
  netEl.className = 'card-value income-text';
} else {
  netEl.className = 'card-value expense-text';
}

const rateEl = document.getElementById('db-rate-val');
rateEl.textContent = `${savingsRate.toFixed(1)}%`;
if (savingsRate >= 0) {
  rateEl.className = 'card-value income-text';
} else {
  rateEl.className = 'card-value expense-text';
}

// Populate Daily Spending Guide Widget
const lifestyleRemaining = getGroupBudgetTotals('grp-lifestyle', mStr).remaining;
const todayObj = new Date();
const currentYm = yearMonth(todayObj);
const selectedYm = mStr;

let daysRemaining = 0;
if (selectedYm < currentYm) {
  daysRemaining = 0;
} else if (selectedYm > currentYm) {
  const [yr, mn] = selectedYm.split('-').map(Number);
  daysRemaining = new Date(yr, mn, 0).getDate();
} else {
  const totalDays = new Date(todayObj.getFullYear(), todayObj.getMonth() + 1, 0).getDate();
  daysRemaining = totalDays - todayObj.getDate() + 1;
}

const safeDailySpend = (lifestyleRemaining > 0 && daysRemaining > 0)
  ? Math.round(lifestyleRemaining / daysRemaining)
  : 0;

document.getElementById('db-widget-income-left').textContent = formatMoney(Math.max(0, lifestyleRemaining));
document.getElementById('db-widget-days-remaining').textContent = daysRemaining;
document.getElementById('db-widget-safe-spend').textContent = safeDailySpend > 0
  ? `₹${safeDailySpend}/day`
  : '₹0/day';

// Render Smart Insights & Timeline Highlights panels
const { insights, timeline } = getForecastInsightsAndTimeline(mStr);

const insightsPanel = document.getElementById('db-insights-panel');
insightsPanel.innerHTML = insights.map(ins => `
  <div class="insight-item ${ins.kind}">
    <span>${ins.kind === 'positive' ? '🟢' : ins.kind === 'negative' ? '🔴' : '🔵'}</span>
    <span>${escapeHtml(ins.text)}</span>
  </div>
`).join('') || '<div style="color:var(--text-muted);">No active insights. Configure recurring rules or budgets to generate insights.</div>';

const timelinePanel = document.getElementById('db-timeline-panel');
timelinePanel.innerHTML = timeline.map(t => `
  <div class="timeline-item ${t.kind === 'milestone' ? 'milestone' : ''}">
    <span>${t.kind === 'milestone' ? '🎉' : '🕒'}</span>
    <span>${escapeHtml(t.text)}</span>
  </div>
`).join('') || '<div style="color:var(--text-muted);">No upcoming milestones. Configure debts or recurring savings goals.</div>';

// Budget progress list
const activeBudgets = state.budgets.filter(b => b.month === mStr);
const budgetGrid = document.getElementById('db-budget-grid');
budgetGrid.innerHTML = '';

if (activeBudgets.length === 0) {
  budgetGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No budgets configured for this month.</div>`;
} else {
  activeBudgets.forEach(b => {
    const spent = getBudgetSpent(b.category, mStr);
    const limit = b.amount;
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    
    let progressClass = 'progress-normal';
    if (pct >= 80 && pct <= 100) progressClass = 'progress-warn';
    if (pct > 100) progressClass = 'progress-over';

    const tile = document.createElement('div');
    tile.className = 'budget-tile';
    tile.innerHTML = `
      <div class="budget-tile-header">
        <span class="budget-tile-title">${escapeHtml(b.category)}</span>
        <span class="budget-tile-percent">${Math.round(pct)}%</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill ${progressClass}" style="width: ${Math.min(pct, 100)}%;"></div>
      </div>
      <div class="budget-tile-footer">
        <span>Spent ${formatMoney(spent)}</span>
        <span>Limit ${formatMoney(limit)}</span>
      </div>
    `;
    budgetGrid.appendChild(tile);
  });
}

// Recurring review banner
const bannerContainer = document.getElementById('db-recurring-banner-container');
bannerContainer.innerHTML = '';
const today = new Date();

// Collect all pending items across all rules
let pendingItems = [];
state.recurring.forEach(rule => {
  const dates = getPendingOccurrences(rule, today);
  dates.forEach(dStr => {
    pendingItems.push({ rule, dateStr: dStr });
  });
});

// Sort pending items oldest first
pendingItems.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

if (pendingItems.length > 0) {
  const banner = document.createElement('div');
  banner.className = 'recurring-banner';
  
  let rowsHtml = '';
  pendingItems.forEach((item, idx) => {
    const { rule, dateStr } = item;
    let metaText = `${rule.frequency.toUpperCase()} · Due ${formatDateShort(dateStr)}`;
    if (rule.type === 'transfer') {
      metaText += ` · Transfer: ${escapeHtml(rule.fromAccountName)} → ${escapeHtml(rule.toAccountName)}`;
    } else {
      metaText += ` · Account: ${escapeHtml(rule.accountName)} · Category: ${escapeHtml(rule.category)}`;
    }

    rowsHtml += `
      <div class="recurring-pending-row">
        <div class="recurring-pending-info">
          <span style="font-weight:600;">${escapeHtml(rule.name)}</span>
          <span class="recurring-pending-meta">${metaText}</span>
        </div>
        <div class="recurring-pending-actions">
          <span class="rule-amount trans-amount" style="margin-right:12px; align-self:center;">${formatMoney(rule.amount)}</span>
          <button class="primary" onclick="logRecurringItem('${rule.id}', '${dateStr}')">Log</button>
          <button class="ghost" onclick="skipRecurringItem('${rule.id}', '${dateStr}')">Skip</button>
        </div>
      </div>
    `;
  });

  banner.innerHTML = `
    <div class="recurring-banner-header">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <span>${pendingItems.length} recurring items due to review</span>
    </div>
    <div class="recurring-pending-list">
      ${rowsHtml}
    </div>
  `;
  bannerContainer.appendChild(banner);
}

// Recent transactions list (last 5 of selected month)
const recentContainer = document.getElementById('db-recent-transactions');
recentContainer.innerHTML = '';

const monthTx = state.transactions.filter(t => t.date.substring(0, 7) === mStr);
// Sort newest first
monthTx.sort((a, b) => {
  const cmp = b.date.localeCompare(a.date);
  if (cmp !== 0) return cmp;
  return b.createdAt - a.createdAt;
});

const recent = monthTx.slice(0, 5);
if (recent.length === 0) {
  recentContainer.innerHTML = `<div class="empty-state">No transactions recorded in this month.</div>`;
} else {
  recent.forEach(t => {
    let title = escapeHtml(t.category);
    let pillClass = 'expense';
    let sign = '− ';
    let amountClass = 'expense-text';
    
    if (t.type === 'income') {
      pillClass = 'income';
      sign = '+ ';
      amountClass = 'income-text';
    } else if (t.type === 'transfer') {
      title = `Transfer: ${escapeHtml(t.fromAccountName)} → ${escapeHtml(t.toAccountName)}`;
      pillClass = 'transfer';
      sign = '';
      amountClass = 'normal-text';
    }

    let metaText = `${formatDateShort(t.date)} · `;
    if (t.type === 'transfer') {
      metaText += `Transfer`;
    } else {
      metaText += `${escapeHtml(t.accountName)}`;
    }
    if (t.note) {
      metaText += ` · ${escapeHtml(t.note)}`;
    }

    const row = document.createElement('div');
    row.className = 'transaction-row';
    row.innerHTML = `
      <div class="trans-left-block">
        <div class="trans-pill ${pillClass}"></div>
        <div class="trans-details">
          <span class="trans-title">${title}</span>
          <span class="trans-meta">${metaText}</span>
        </div>
      </div>
      <div class="trans-right-block">
        <span class="trans-amount ${amountClass}">${sign}${formatMoney(t.amount)}</span>
      </div>
    `;
    recentContainer.appendChild(row);
  });
}
renderSurplusAssistant();
renderCategoryPieCharts(mStr);
}

// Log/Skip Pending Recurring Functions (Global helpers)
window.logRecurringItem = function(ruleId, dateStr) {
const rule = state.recurring.find(r => r.id === ruleId);
if (!rule) return;

// Log transaction
const tx = {
  id: uid(),
  createdAt: Date.now(),
  type: rule.type,
  amount: rule.amount,
  date: dateStr,
  note: rule.note || ''
};

if (rule.type === 'transfer') {
  tx.fromAccountId = rule.fromAccountId;
  tx.fromAccountName = rule.fromAccountName;
  tx.toAccountId = rule.toAccountId;
  tx.toAccountName = rule.toAccountName;
} else {
  tx.accountId = rule.accountId;
  tx.accountName = rule.accountName;
  tx.category = rule.category;
  if (rule.investmentId) {
    tx.investmentId = rule.investmentId;
    applyInvestmentContribution(rule.investmentId, rule.amount);
  }
  if (rule.debtId) {
    tx.debtId = rule.debtId;
    applyDebtAmortization(tx);
  }
}

state.transactions.push(tx);
rule.lastFiredDate = dateStr;

saveState();
renderCurrentView();
};

window.skipRecurringItem = function(ruleId, dateStr) {
const rule = state.recurring.find(r => r.id === ruleId);
if (!rule) return;

rule.lastFiredDate = dateStr;
saveState();
renderCurrentView();
};

// 2. CALENDAR VIEW RENDERER
function renderCalendar() {
document.querySelectorAll('.current-month-label').forEach(lbl => {
  lbl.textContent = formatMonthLabel(currentMonth);
});

const year = currentMonth.getFullYear();
const month = currentMonth.getMonth(); // 0-indexed

const calendarGrid = document.getElementById('calendar-grid-container');
calendarGrid.innerHTML = '';

// Day Name Headers
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
dayNames.forEach(n => {
  const cell = document.createElement('div');
  cell.className = 'calendar-header-cell';
  cell.textContent = n;
  calendarGrid.appendChild(cell);
});

// Calculate Dates for Grid
const firstDay = new Date(year, month, 1);
const startPadding = firstDay.getDay(); // 0 = Sunday, 1 = Monday
const lastDay = new Date(year, month + 1, 0);
const numDays = lastDay.getDate();

const prevMonthLastDay = new Date(year, month, 0).getDate();

// Create cell data list
const cells = [];

// 1. Prev Month padding
for (let i = startPadding - 1; i >= 0; i--) {
  const dNum = prevMonthLastDay - i;
  const pm = new Date(year, month - 1, dNum);
  cells.push({
    dateStr: isoDate(pm),
    dayNum: dNum,
    isOtherMonth: true
  });
}

// 2. Current Month days
for (let dNum = 1; dNum <= numDays; dNum++) {
  const cm = new Date(year, month, dNum);
  cells.push({
    dateStr: isoDate(cm),
    dayNum: dNum,
    isOtherMonth: false
  });
}

// 3. Next Month padding
const totalCellsSoFar = cells.length;
// Complete the grid (multiples of 7, standard calendar grid sizes are 35 or 42)
const remaining = (7 - (totalCellsSoFar % 7)) % 7;
// If it falls exactly on 0, it means it is a perfect block, but sometimes we need 35/42 cells grid
const targetTotal = totalCellsSoFar + remaining;
const nextMonthPadding = targetTotal - totalCellsSoFar;

for (let dNum = 1; dNum <= nextMonthPadding; dNum++) {
  const nm = new Date(year, month + 1, dNum);
  cells.push({
    dateStr: isoDate(nm),
    dayNum: dNum,
    isOtherMonth: true
  });
}

// Render Grid Cells
const todayStr = isoDate(new Date());

cells.forEach(cellData => {
  const cell = document.createElement('div');
  cell.className = `calendar-day-cell ${cellData.isOtherMonth ? 'other-month' : ''}`;
  cell.setAttribute('data-date', cellData.dateStr);

  // Day Header
  const isToday = cellData.dateStr === todayStr;
  const numClass = isToday ? 'calendar-day-num today' : 'calendar-day-num';
  
  cell.innerHTML = `
    <div class="calendar-day-header">
      <span class="${numClass}">${cellData.dayNum}</span>
    </div>
    <div class="calendar-trans-container"></div>
  `;

  // Populate day transactions
  const dayTx = state.transactions.filter(t => t.date === cellData.dateStr);
  const transContainer = cell.querySelector('.calendar-trans-container');
  
  // Sort transactions inside the day (Income first, then Expense, then Transfers)
  dayTx.sort((a, b) => {
    const rank = { 'income': 1, 'expense': 2, 'transfer': 3 };
    return (rank[a.type] || 4) - (rank[b.type] || 4);
  });

  const displayTx = dayTx.slice(0, 5);
  displayTx.forEach(t => {
    let label = '';
    let amountSign = '−';
    if (t.type === 'income') {
      label = t.category;
      amountSign = '+';
    } else if (t.type === 'expense') {
      label = t.category;
      amountSign = '−';
    } else {
      label = `Transfer`;
      amountSign = '';
    }

    // Strip emoji prefix for calendar cell if it is long, or just slice the name
    // Let's just output the category name/label
    const item = document.createElement('div');
    item.className = `calendar-trans-item ${t.type}`;
    item.textContent = `${label} ${amountSign}${Math.round(t.amount)}`;
    transContainer.appendChild(item);
  });

  if (dayTx.length > 5) {
    const more = document.createElement('div');
    more.className = 'calendar-overflow-label';
    more.textContent = `+${dayTx.length - 5} more`;
    transContainer.appendChild(more);
  }

  // Click behavior
  cell.addEventListener('click', () => {
    openDayDetailModal(cellData.dateStr);
  });

  calendarGrid.appendChild(cell);
});
}

// Day Detail Modal (Calendar Click)
let selectedCalendarDate = '';
function openDayDetailModal(dateStr) {
selectedCalendarDate = dateStr;
const modal = document.getElementById('modal-day-detail');
const title = document.getElementById('day-detail-title');
title.textContent = formatDateLong(dateStr);

renderDayDetailTransList();

// Wire "Add Transaction"
const addBtn = document.getElementById('day-detail-add-trans-btn');
addBtn.onclick = () => {
  modal.classList.remove('active');
  openTransactionModal(null, dateStr); // open with pre-filled date
};

modal.classList.add('active');
}

function renderDayDetailTransList() {
const container = document.getElementById('day-detail-trans-list');
container.innerHTML = '';

const dayTx = state.transactions.filter(t => t.date === selectedCalendarDate);
dayTx.sort((a, b) => b.createdAt - a.createdAt);

if (dayTx.length === 0) {
  container.innerHTML = `<div class="day-detail-empty">No transactions logged on this day.</div>`;
} else {
  dayTx.forEach(t => {
    let title = escapeHtml(t.category);
    let pillClass = 'expense';
    let sign = '− ';
    let amountClass = 'expense-text';
    
    if (t.type === 'income') {
      pillClass = 'income';
      sign = '+ ';
      amountClass = 'income-text';
    } else if (t.type === 'transfer') {
      title = `Transfer: ${escapeHtml(t.fromAccountName)} → ${escapeHtml(t.toAccountName)}`;
      pillClass = 'transfer';
      sign = '';
      amountClass = 'normal-text';
    }

    let metaText = '';
    if (t.type !== 'transfer') {
      metaText += `${escapeHtml(t.accountName)}`;
    }
    if (t.note) {
      metaText += metaText ? ` · ${escapeHtml(t.note)}` : escapeHtml(t.note);
    }

    const row = document.createElement('div');
    row.className = 'transaction-row';
    row.style.margin = '4px 0';
    row.innerHTML = `
      <div class="trans-left-block">
        <div class="trans-pill ${pillClass}"></div>
        <div class="trans-details">
          <span class="trans-title">${title}</span>
          <span class="trans-meta" style="font-size:11px;">${metaText}</span>
        </div>
      </div>
      <div class="trans-right-block" style="gap:12px;">
        <span class="trans-amount ${amountClass}" style="font-size:14px;">${sign}${formatMoney(t.amount)}</span>
        <div class="trans-actions">
          <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="editTransactionFromDayDetail('${t.id}')">Edit</button>
          <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteTransactionFromDayDetail('${t.id}')">Delete</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}
}

window.editTransactionFromDayDetail = function(txId) {
document.getElementById('modal-day-detail').classList.remove('active');
openTransactionModal(txId);
};

window.deleteTransactionFromDayDetail = function(txId) {
if (confirm("Are you sure you want to delete this transaction?")) {
  const txIndex = state.transactions.findIndex(t => t.id === txId);
  if (txIndex !== -1) {
    const tx = state.transactions[txIndex];
    // Reverse investment if applicable
    if (tx.type === 'expense' && tx.investmentId) {
      reverseInvestmentContribution(tx.investmentId, tx.amount);
    }
    reverseDebtAmortization(tx);
    state.transactions.splice(txIndex, 1);
    saveState();
    
    // Update modal list
    renderDayDetailTransList();
    // Update calendar view in background
    renderCalendar();
  }
}
};

// 3. TRANSACTIONS VIEW RENDERER
function renderTransactions() {
// Update month labels
document.querySelectorAll('.current-month-label').forEach(lbl => {
  lbl.textContent = formatMonthLabel(currentMonth);
});

// Update category and account filter options
populateFilterOptions();

// Render Recurring Rules list
renderRecurringRules();

// Render transactions based on filters
renderTransactionsList();
}

function populateFilterOptions() {
const typeFilter = document.getElementById('filter-type');
const catFilter = document.getElementById('filter-category');
const accFilter = document.getElementById('filter-account');

const prevCat = catFilter.value;
const prevAcc = accFilter.value;

// Categories
catFilter.innerHTML = `<option value="all">All Categories</option>`;
// Get all unique categories sorted
const cats = [...new Set(state.categories.map(c => c.name))].sort();
cats.forEach(c => {
  catFilter.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`;
});

// Accounts
accFilter.innerHTML = `<option value="all">All Accounts</option>`;
state.accounts.sort((a,b) => a.name.localeCompare(b.name)).forEach(acc => {
  accFilter.innerHTML += `<option value="${acc.id}">${escapeHtml(acc.name)}</option>`;
});

// Restore values if still valid
if ([...catFilter.options].some(o => o.value === prevCat)) catFilter.value = prevCat;
if ([...accFilter.options].some(o => o.value === prevAcc)) accFilter.value = prevAcc;
}

function renderRecurringRules() {
const container = document.getElementById('recurring-rules-container');
container.innerHTML = '';

const rules = [...state.recurring];

if (rules.length === 0) {
  container.innerHTML = `<div class="empty-state" style="padding:24px;">No recurring rules configured. Click "+ Add Recurring" to set one up.</div>`;
  return;
}

// Group rules dynamically by category (transfers have no category, so they get their own group)
const groups = {};
rules.forEach(rule => {
  const groupName = rule.type === 'transfer' ? 'Transfers' : rule.category;
  if (!groups[groupName]) groups[groupName] = [];
  groups[groupName].push(rule);
});

const groupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b));

groupNames.forEach(groupName => {
  const groupRules = groups[groupName].sort((a, b) => a.name.localeCompare(b.name));
  const total = groupRules.reduce((sum, r) => sum + r.amount, 0);
  const isCollapsed = collapsedRecurringCategories.has(groupName);
  // A category's kind (income/expense) is fixed, so every rule in the group shares it;
  // the Transfers pseudo-group is the one exception and gets no income/expense color.
  const groupKind = groupRules[0].type;
  const totalColorClass = groupKind === 'income' ? 'income-text' : groupKind === 'expense' ? 'expense-text' : '';

  const card = document.createElement('div');
  card.className = 'recurring-category-card';

  const rowsHtml = groupRules.map(rule => {
    // Calculate next due date
    let nextDue = rule.lastFiredDate ? addInterval(rule.lastFiredDate, rule.frequency) : rule.startDate;

    let secondaryText = `Next due: ${nextDue}`;
    if (rule.type === 'transfer') {
      secondaryText += ` · ${escapeHtml(rule.fromAccountName)} → ${escapeHtml(rule.toAccountName)}`;
    } else {
      secondaryText += ` · ${escapeHtml(rule.accountName)}`;
    }

    return `
      <div class="recurring-row">
        <div class="recurring-row-main">
          <div class="recurring-row-primary">
            <span class="recurring-row-name">${escapeHtml(rule.name)}</span>
            <span class="recurring-row-freq">${rule.frequency}</span>
          </div>
          <span class="recurring-row-secondary">${secondaryText}</span>
        </div>
        <div class="recurring-row-actions">
          <span class="recurring-row-amount ${rule.type}">${formatMoney(rule.amount)}</span>
          <button class="ghost btn-sm" onclick="openRecurringModal('${rule.id}')">Edit</button>
          <button class="danger btn-sm" onclick="deleteRecurringRule('${rule.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  card.innerHTML = `
    <div class="recurring-category-header" data-category="${escapeHtml(groupName)}">
      <div class="recurring-category-title">
        <svg class="recurring-category-chevron${isCollapsed ? ' collapsed' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
        <span class="recurring-category-name" title="${escapeHtml(groupName)}">${escapeHtml(groupName)}</span>
        <span class="recurring-category-count">${groupRules.length}</span>
      </div>
      <div class="recurring-category-total">
        <span class="recurring-category-total-label">Total recurring</span>
        <span class="recurring-category-total-value ${totalColorClass}">${formatMoney(total)}</span>
      </div>
    </div>
    <div class="recurring-category-body${isCollapsed ? ' collapsed' : ''}">
      ${rowsHtml}
    </div>
  `;
  container.appendChild(card);
});
}

document.getElementById('recurring-rules-container').addEventListener('click', (e) => {
const header = e.target.closest('.recurring-category-header');
if (!header) return;
const groupName = header.dataset.category;
if (collapsedRecurringCategories.has(groupName)) {
  collapsedRecurringCategories.delete(groupName);
} else {
  collapsedRecurringCategories.add(groupName);
}
renderRecurringRules();
});

window.deleteRecurringRule = function(ruleId) {
if (confirm("Are you sure you want to delete this recurring rule?")) {
  const idx = state.recurring.findIndex(r => r.id === ruleId);
  if (idx !== -1) {
    state.recurring.splice(idx, 1);
    saveState();
    renderTransactions();
  }
}
};

function renderTransactionsList() {
const container = document.getElementById('trans-history-container');
container.innerHTML = '';

// Clear selection set on filter changes
selectedTxIds.clear();

const filterType = document.getElementById('filter-type').value;
const filterCat = document.getElementById('filter-category').value;
const filterAcc = document.getElementById('filter-account').value;

let list = [...state.transactions];

// Filter by selected month
const mStr = yearMonth(currentMonth);
list = list.filter(t => t.date.substring(0, 7) === mStr);

// Apply filters
if (filterType !== 'all') {
  list = list.filter(t => t.type === filterType);
}
if (filterCat !== 'all') {
  // Only applies to non-transfers
  list = list.filter(t => t.type !== 'transfer' && t.category === filterCat);
}
if (filterAcc !== 'all') {
  list = list.filter(t => {
    if (t.type === 'transfer') {
      return t.fromAccountId === filterAcc || t.toAccountId === filterAcc;
    } else {
      return t.accountId === filterAcc;
    }
  });
}

// Sort: newest date first, then newest createdAt first
list.sort((a, b) => {
  const dateCmp = b.date.localeCompare(a.date);
  if (dateCmp !== 0) return dateCmp;
  return b.createdAt - a.createdAt;
});

if (list.length === 0) {
  container.innerHTML = `<div class="empty-state">No transactions match the selected filters.</div>`;
  const bulkBar = document.getElementById('bulk-actions-bar');
  if (bulkBar) bulkBar.classList.add('hidden');
} else {
  const bulkBar = document.getElementById('bulk-actions-bar');
  if (bulkBar) {
    bulkBar.classList.remove('hidden');
    const selectAllCheck = document.getElementById('select-all-trans');
    if (selectAllCheck) selectAllCheck.checked = false;
    const deleteBtn = document.getElementById('bulk-delete-btn');
    if (deleteBtn) {
      deleteBtn.textContent = `Delete Selected (0)`;
      deleteBtn.disabled = true;
    }
  }

  list.forEach(t => {
    let title = escapeHtml(t.category);
    let pillClass = 'expense';
    let sign = '− ';
    let amountClass = 'expense-text';
    
    if (t.type === 'income') {
      pillClass = 'income';
      sign = '+ ';
      amountClass = 'income-text';
    } else if (t.type === 'transfer') {
      title = `Transfer: ${escapeHtml(t.fromAccountName)} → ${escapeHtml(t.toAccountName)}`;
      pillClass = 'transfer';
      sign = '';
      amountClass = 'normal-text';
    }

    let metaText = `${formatDateShort(t.date)} · `;
    if (t.type === 'transfer') {
      metaText += `Transfer`;
    } else {
      metaText += `${escapeHtml(t.accountName)}`;
    }
    if (t.note) {
      metaText += ` · ${escapeHtml(t.note)}`;
    }

    const row = document.createElement('div');
    row.className = 'transaction-row';
    row.innerHTML = `
      <div class="trans-left-block">
        <input type="checkbox" class="trans-select-checkbox" data-id="${t.id}" style="margin-right: 12px; width: 18px; height: 18px; cursor: pointer;" onchange="toggleSelectTransaction('${t.id}', this.checked)">
        <div class="trans-pill ${pillClass}"></div>
        <div class="trans-details">
          <span class="trans-title">${title}</span>
          <span class="trans-meta">${metaText}</span>
        </div>
      </div>
      <div class="trans-right-block">
        <span class="trans-amount ${amountClass}">${sign}${formatMoney(t.amount)}</span>
        <div class="trans-actions">
          <button class="ghost" onclick="openTransactionModal('${t.id}')">Edit</button>
          <button class="danger" onclick="deleteTransaction('${t.id}')">Delete</button>
        </div>
      </div>
    `;
    container.appendChild(row);
  });
}
}

window.deleteTransaction = function(txId) {
if (confirm("Are you sure you want to delete this transaction?")) {
  const idx = state.transactions.findIndex(t => t.id === txId);
  if (idx !== -1) {
    const tx = state.transactions[idx];
    // Reverse investment if applicable
    if (tx.type === 'expense' && tx.investmentId) {
      reverseInvestmentContribution(tx.investmentId, tx.amount);
    }
    reverseDebtAmortization(tx);
    state.transactions.splice(idx, 1);
    saveState();
    renderTransactions();
  }
}
};

// 4. MY MONEY VIEW RENDERER
function renderMyMoney() {
const allTimeSaved = getLifetimeSavings();
const investedSum = state.investments.reduce((sum, inv) => sum + Number(inv.invested), 0);
const currentSum = state.investments.reduce((sum, inv) => sum + Number(inv.current), 0);
const totalGain = currentSum - investedSum;
const gainPct = investedSum > 0 ? (totalGain / investedSum) * 100 : 0;

const cashBalance = getTotalBalance();
const savingsBucketsTotal = getSavingsBucketsTotal();
const netWorth = cashBalance + getSavingsBucketsSum() + currentSum;

// Monthly stats
const mStr = yearMonth(currentMonth);
let incomeThisMonth = 0;
let expenseThisMonth = 0;
state.transactions.forEach(t => {
  if (t.date.substring(0, 7) === mStr) {
    if (t.type === 'income') incomeThisMonth += t.amount;
    if (t.type === 'expense') expenseThisMonth += t.amount;
  }
});
const netThisMonth = incomeThisMonth - expenseThisMonth;
const rateThisMonth = incomeThisMonth > 0 ? (netThisMonth / incomeThisMonth) * 100 : 0;

// Cards
const savedValEl = document.getElementById('money-saved-val');
savedValEl.textContent = formatMoney(savingsBucketsTotal);
savedValEl.className = `card-value ${savingsBucketsTotal >= 0 ? 'income-text' : 'expense-text'}`;

const netSign = netThisMonth >= 0 ? '+' : '';
document.getElementById('money-saved-sub').textContent = `This month: ${netSign}${formatMoney(netThisMonth)} · ${rateThisMonth.toFixed(1)}% rate`;

document.getElementById('money-invested-val').textContent = formatMoney(investedSum);
document.getElementById('money-invested-sub').textContent = `${state.investments.length} positions`;

document.getElementById('money-current-val').textContent = formatMoney(currentSum);
const gainSub = document.getElementById('money-gain-sub');
const gainSign = totalGain >= 0 ? '+' : '';
gainSub.textContent = `${gainSign}${formatMoney(totalGain)} (${gainSign}${gainPct.toFixed(2)}%)`;
gainSub.className = `card-subline ${totalGain >= 0 ? 'income-text' : 'expense-text'}`;

document.getElementById('money-networth-val').textContent = formatMoney(netWorth);

// Accounts grid
const accountsContainer = document.getElementById('accounts-container');
accountsContainer.innerHTML = '';
state.accounts.forEach(acc => {
  const bal = getAccountBalance(acc.id);
  const tile = document.createElement('div');
  tile.className = 'account-tile';
  tile.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <span style="font-weight:600; font-size:16px;">${escapeHtml(acc.name)}</span>
      <span class="tile-type-badge">${escapeHtml(acc.type)}</span>
    </div>
    <div class="tile-balance ${bal >= 0 ? 'income-text' : 'expense-text'}">${formatMoney(bal)}</div>
    <div class="tile-actions">
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openAccountModal('${acc.id}')">Edit</button>
      <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteAccount('${acc.id}')">Delete</button>
    </div>
  `;
  accountsContainer.appendChild(tile);
});

// Investments grid
const investmentsContainer = document.getElementById('investments-container');
investmentsContainer.innerHTML = '';
state.investments.forEach(inv => {
  const gain = inv.current - inv.invested;
  const gainP = inv.invested > 0 ? (gain / inv.invested) * 100 : 0;
  const tile = document.createElement('div');
  tile.className = 'investment-tile';
  
  let dateLine = inv.type.replace('_', ' ').toUpperCase();
  if (inv.date) {
    dateLine += ` · Acquired: ${inv.date}`;
  }

  const gainSign = gain >= 0 ? '+' : '';

  tile.innerHTML = `
    <div>
      <span style="font-weight:600; font-size:16px; display:block;">${escapeHtml(inv.name)}</span>
      <span class="tile-type-badge" style="font-size:10px;">${dateLine}</span>
    </div>
    <div class="tile-balance">${formatMoney(inv.current)}</div>
    <div class="tile-footer-muted ${gain >= 0 ? 'income-text' : 'expense-text'}" style="font-weight:500;">
      ${gainSign}${formatMoney(gain)} (${gainSign}${gainP.toFixed(2)}%)
    </div>
    <div class="tile-footer-muted">Invested ${formatMoney(inv.invested)}</div>
    <div class="tile-actions">
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openInvestmentModal('${inv.id}')">Edit</button>
      <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteInvestment('${inv.id}')">Delete</button>
    </div>
  `;
  investmentsContainer.appendChild(tile);
});

// Render Savings Buckets
renderSavingsBuckets();

// Monthly savings history (last 12 months)
const savingsContainer = document.getElementById('savings-history-container');
savingsContainer.innerHTML = '';

const mList = [];
const startM = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
for (let i = 0; i < 12; i++) {
  const m = new Date(startM.getFullYear(), startM.getMonth() - i, 1);
  mList.push(m);
}

mList.forEach(m => {
  const mStr = yearMonth(m);
  let inc = 0;
  let exp = 0;
  state.transactions.forEach(t => {
    if (t.date.substring(0, 7) === mStr) {
      if (t.type === 'income') inc += t.amount;
      if (t.type === 'expense') exp += t.amount;
    }
  });

  // Skip months in the future that have zero transactions to keep view clean,
  // but if it is current/past month let's render it.
  const net = inc - exp;
  const rate = inc > 0 ? (net / inc) * 100 : 0;
  
  // Only render if there's any transaction recorded in that month
  const hasTransactions = state.transactions.some(t => t.date.substring(0, 7) === mStr);
  if (!hasTransactions) return;

  const netSign = net >= 0 ? '+' : '';

  const row = document.createElement('div');
  row.className = 'savings-history-row';
  row.innerHTML = `
    <span class="savings-month">${m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
    <div class="savings-details">
      <span class="savings-detail-item income-text">↑ ${formatMoney(inc)}</span>
      <span class="savings-detail-item expense-text">↓ ${formatMoney(exp)}</span>
      <span class="savings-detail-item ${net >= 0 ? 'income-text' : 'expense-text'}" style="font-weight:600;">
        ${netSign}${formatMoney(net)} (${netSign}${rate.toFixed(1)}%)
      </span>
    </div>
  `;
  savingsContainer.appendChild(row);
});
}

window.deleteAccount = function(accId) {
const associatedCount = state.transactions.filter(t => {
  if (t.type === 'transfer') {
    return t.fromAccountId === accId || t.toAccountId === accId;
  }
  return t.accountId === accId;
}).length;

let msg = "Are you sure you want to delete this account?";
if (associatedCount > 0) {
  msg = `Deleting this account will also delete ${associatedCount} associated transactions. Proceed?`;
}

if (confirm(msg)) {
  // Delete associated transactions
  state.transactions = state.transactions.filter(t => {
    if (t.type === 'transfer') {
      return t.fromAccountId !== accId && t.toAccountId !== accId;
    }
    return t.accountId !== accId;
  });

  // Delete account
  state.accounts = state.accounts.filter(a => a.id !== accId);
  saveState();
  renderMyMoney();
}
};

window.deleteInvestment = function(invId) {
if (confirm("Are you sure you want to delete this investment? Existing transactions linked to it will be unlinked.")) {
  // Unlink transactions
  state.transactions.forEach(t => {
    if (t.investmentId === invId) {
      t.investmentId = null;
    }
  });

  state.investments = state.investments.filter(i => i.id !== invId);
  saveState();
  renderMyMoney();
}
};

// 5. BUDGETS VIEW RENDERER

function buildBudgetTileHtml(b, spent) {
const limit = b.amount;
const pct = limit > 0 ? (spent / limit) * 100 : 0;

let progressClass = 'progress-normal';
if (pct >= 80 && pct <= 100) progressClass = 'progress-warn';
if (pct > 100) progressClass = 'progress-over';

const rem = limit - spent;
let remHtml = '';
if (rem >= 0) {
  remHtml = `<span>${formatMoney(rem)} remaining</span>`;
} else {
  remHtml = `<span class="expense-text" style="font-weight:600;">${formatMoney(Math.abs(rem))} over limit</span>`;
}

return `
  <div class="budget-tile">
    <div class="budget-tile-header">
      <span class="budget-tile-title">${escapeHtml(b.category)}</span>
      <span class="budget-tile-percent">${Math.round(pct)}%</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar-fill ${progressClass}" style="width: ${Math.min(pct, 100)}%;"></div>
    </div>
    <div class="budget-tile-footer">
      <span>Spent ${formatMoney(spent)}</span>
      <span>Limit ${formatMoney(limit)}</span>
    </div>
    <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
      ${remHtml}
    </div>
    <div class="budget-tile-actions">
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openBudgetModal('${b.id}')">Edit</button>
      <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteBudget('${b.id}')">Delete</button>
    </div>
  </div>
`;
}

// Renders the 4 (or N) clickable overview cards above the detailed hierarchy.
// Purely derived from `buckets` — no separate totals are stored anywhere.
function renderBudgetGroupSummaryCards(buckets, mStr) {
const row = document.getElementById('budget-group-summary-cards');
row.innerHTML = '';

state.budgetGroups.forEach(group => {
  const groupBudgets = buckets[group.id] || [];
  if (groupBudgets.length === 0) return;

  const groupBudgeted = groupBudgets.reduce((sum, b) => sum + b.amount, 0);
  const groupSpent = groupBudgets.reduce((sum, b) => sum + getBudgetSpent(b.category, mStr), 0);
  const pct = groupBudgeted > 0 ? (groupSpent / groupBudgeted) * 100 : 0;

  let progressClass = 'progress-normal';
  if (pct >= 80 && pct <= 100) progressClass = 'progress-warn';
  if (pct > 100) progressClass = 'progress-over';

  const card = document.createElement('div');
  card.className = 'budget-group-summary-card';
  card.innerHTML = `
    <div class="budget-group-summary-top">
      <span class="budget-group-summary-icon">${group.icon}</span>
      <span class="budget-group-summary-name">${escapeHtml(group.name)}</span>
      <span class="budget-group-summary-pct">${Math.round(pct)}%</span>
    </div>
    <span class="budget-group-summary-amount">${formatMoney(groupBudgeted)}</span>
    <div class="progress-bar-container">
      <div class="progress-bar-fill ${progressClass}" style="width: ${Math.min(pct, 100)}%;"></div>
    </div>
  `;
  card.onclick = () => {
    const section = document.getElementById(`budget-group-section-${group.id}`);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  row.appendChild(card);
});
}

function renderBudgets() {
document.querySelectorAll('.current-month-label').forEach(lbl => {
  lbl.textContent = formatMonthLabel(currentMonth);
});

const mStr = yearMonth(currentMonth);
const activeBudgets = state.budgets.filter(b => b.month === mStr);

const summaryBar = document.getElementById('budget-summary-bar');
const groupSummaryRow = document.getElementById('budget-group-summary-cards');
const grid = document.getElementById('budgets-container-grid');
const emptyState = document.getElementById('budgets-empty-state');

grid.innerHTML = '';
groupSummaryRow.innerHTML = '';

if (activeBudgets.length === 0) {
  summaryBar.classList.add('hidden');
  groupSummaryRow.classList.add('hidden');
  emptyState.classList.remove('hidden');

  // Copy from previous month option check
  const prevM = previousMonth(currentMonth);
  const prevMStr = yearMonth(prevM);
  const prevBudgets = state.budgets.filter(b => b.month === prevMStr);
  const copyBtn = document.getElementById('budgets-copy-prev-btn');

  if (prevBudgets.length > 0) {
    copyBtn.textContent = `Copy ${prevBudgets.length} budgets from ${prevM.toLocaleDateString('en-US', { month: 'short' })}`;
    copyBtn.classList.remove('hidden');
    copyBtn.onclick = () => {
      prevBudgets.forEach(pb => {
        state.budgets.push({
          id: uid(),
          category: pb.category,
          amount: pb.amount,
          month: mStr,
          createdAt: Date.now()
        });
      });
      saveState();
      renderBudgets();
    };
  } else {
    copyBtn.classList.add('hidden');
  }
  return;
}

summaryBar.classList.remove('hidden');
groupSummaryRow.classList.remove('hidden');
emptyState.classList.add('hidden');

let totalSpent = 0;
let totalBudgeted = 0;

// Bucket each active budget by its category's assigned group ('' = Uncategorized).
// This is the only place group membership is resolved — everything below is derived.
const buckets = {};
activeBudgets.forEach(b => {
  const cat = state.categories.find(c => c.name === b.category);
  const groupId = (cat && cat.groupId) || '';
  if (!buckets[groupId]) buckets[groupId] = [];
  buckets[groupId].push(b);
});

// Configured groups first (in their defined order), Uncategorized last, empty groups skipped
const orderedGroupIds = [...state.budgetGroups.map(g => g.id), ''].filter(id => buckets[id] && buckets[id].length);

orderedGroupIds.forEach(groupId => {
  const group = groupId ? getBudgetGroupById(groupId) : { id: '', name: 'Uncategorized', icon: '🗂️' };
  const groupBudgets = buckets[groupId].sort((a, b) => a.category.localeCompare(b.category));

  let groupSpent = 0;
  let groupBudgeted = 0;
  const tilesHtml = groupBudgets.map(b => {
    const spent = getBudgetSpent(b.category, mStr);
    groupSpent += spent;
    groupBudgeted += b.amount;
    totalSpent += spent;
    totalBudgeted += b.amount;
    return buildBudgetTileHtml(b, spent);
  }).join('');

  const groupPct = groupBudgeted > 0 ? (groupSpent / groupBudgeted) * 100 : 0;
  let groupProgressClass = 'progress-normal';
  if (groupPct >= 80 && groupPct <= 100) groupProgressClass = 'progress-warn';
  if (groupPct > 100) groupProgressClass = 'progress-over';
  const groupRem = groupBudgeted - groupSpent;

  const card = document.createElement('div');
  card.className = 'budget-group-card';
  card.id = `budget-group-section-${groupId || 'uncategorized'}`;
  card.innerHTML = `
    <div class="budget-group-header">
      <div class="budget-group-title">
        <span class="budget-group-icon">${group.icon}</span>
        <span class="budget-group-name">${escapeHtml(group.name)}</span>
      </div>
      <div class="budget-group-stats">
        <span>Budget: <strong>${formatMoney(groupBudgeted)}</strong></span>
        <span>Spent: <strong>${formatMoney(groupSpent)}</strong></span>
        <span class="${groupRem < 0 ? 'expense-text' : ''}">${groupRem >= 0 ? 'Remaining' : 'Over'}: <strong>${formatMoney(Math.abs(groupRem))}</strong></span>
      </div>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar-fill ${groupProgressClass}" style="width: ${Math.min(groupPct, 100)}%;"></div>
    </div>
    <div class="budget-group-body">
      ${tilesHtml}
    </div>
  `;
  grid.appendChild(card);
});

renderBudgetGroupSummaryCards(buckets, mStr);

// Populate overall Summary Bar (across every group combined)
const overallPct = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
document.getElementById('budget-sum-spent-limit').textContent = `${formatMoney(totalSpent)} / ${formatMoney(totalBudgeted)}`;
document.getElementById('budget-sum-percent').textContent = `${Math.round(overallPct)}%`;

const overallRem = totalBudgeted - totalSpent;
const remValEl = document.getElementById('budget-sum-remaining-val');
const remLblEl = document.getElementById('budget-sum-remaining-label');

if (overallRem >= 0) {
  remLblEl.textContent = 'REMAINING';
  remLblEl.className = 'card-subline';
  remValEl.textContent = formatMoney(overallRem);
  remValEl.className = 'card-value normal-text';
} else {
  remLblEl.textContent = 'OVER BUDGET';
  remLblEl.className = 'card-subline expense-text';
  remValEl.textContent = formatMoney(Math.abs(overallRem));
  remValEl.className = 'card-value expense-text';
}
}

window.deleteBudget = function(budgetId) {
if (confirm("Are you sure you want to delete this budget limit?")) {
  state.budgets = state.budgets.filter(b => b.id !== budgetId);
  saveState();
  renderBudgets();
}
};

// 6. CATEGORIES VIEW RENDERER
function renderCategories() {
const expenseContainer = document.getElementById('expense-categories-list');
const incomeContainer = document.getElementById('income-categories-list');

expenseContainer.innerHTML = '';
incomeContainer.innerHTML = '';

const expCats = state.categories.filter(c => c.kind === 'expense');
const incCats = state.categories.filter(c => c.kind === 'income');

// Sort: custom alphabetical, but default categories can be mixed or first.
// Standard alphabetical sorting
expCats.sort((a,b) => a.name.localeCompare(b.name));
incCats.sort((a,b) => a.name.localeCompare(b.name));

// Render Expense Categories
expCats.forEach(c => {
  expenseContainer.appendChild(createCategoryCard(c));
});

// Render Income Categories
incCats.forEach(c => {
  incomeContainer.appendChild(createCategoryCard(c));
});
}

function createCategoryCard(cat) {
// Compute usage count
const count = state.transactions.filter(t => t.category === cat.name).length;
const usageText = count === 0 ? 'Unused' : `${count} references`;

const card = document.createElement('div');
card.className = 'category-card';

let actionHtml = '';
if (cat.default) {
  actionHtml = `<span class="default-badge">Default</span>`;
} else {
  actionHtml = `
    <div class="category-actions">
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openCategoryModal('${cat.id}')">Edit</button>
      <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteCategory('${cat.id}')">Delete</button>
    </div>
  `;
}

card.innerHTML = `
  <div class="category-card-left">
    <span class="category-card-name">${escapeHtml(cat.name)}</span>
    <span class="category-card-meta">${usageText}</span>
  </div>
  ${actionHtml}
`;
return card;
}

window.deleteCategory = function(catId) {
const cat = state.categories.find(c => c.id === catId);
if (!cat) return;

const count = state.transactions.filter(t => t.category === cat.name).length;
let msg = "Are you sure you want to delete this category?";
if (count > 0) {
  msg = `Warning: This category is currently used in ${count} transactions. Deleting it will keep the category name on existing transactions but remove it from future selections. Proceed?`;
}

if (confirm(msg)) {
  state.categories = state.categories.filter(c => c.id !== catId);
  saveState();
  renderCategories();
}
};


// FORM CONTROLLERS & MODAL ROUTING

function openModal(modalId) {
document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
document.getElementById(modalId).classList.remove('active');
}

// Global closeModal listener
document.querySelectorAll('.modal-overlay').forEach(overlay => {
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) {
    overlay.classList.remove('active');
  }
});
});

document.querySelectorAll('.modal-close-btn').forEach(btn => {
btn.addEventListener('click', () => {
  btn.closest('.modal-overlay').classList.remove('active');
});
});

window.addEventListener('keydown', (e) => {
if (e.key === 'Escape') {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.classList.remove('active');
  });
}
});

// Transaction Modal Logic
function openTransactionModal(txId = null, prefilledDate = null) {
const form = document.getElementById('form-transaction');
form.reset();

const titleEl = document.getElementById('transaction-modal-title');
const typeSegs = document.getElementById('trans-type-segmented');
const amountInput = document.getElementById('trans-amount');
const dateInput = document.getElementById('trans-date');
const idInput = document.getElementById('trans-id');

// Populate Accounts
const accountSelects = [
  document.getElementById('trans-account'),
  document.getElementById('trans-from-account'),
  document.getElementById('trans-to-account')
];
accountSelects.forEach(sel => {
  sel.innerHTML = '';
  state.accounts.forEach(acc => {
    sel.innerHTML += `<option value="${acc.id}">${escapeHtml(acc.name)}</option>`;
  });
});

// Populate Investments
const investSel = document.getElementById('trans-investment');
investSel.innerHTML = `<option value="">None — log as regular expense</option>`;
state.investments.forEach(inv => {
  investSel.innerHTML += `<option value="${inv.id}">${escapeHtml(inv.name)}</option>`;
});

// Populate Debts
const debtSel = document.getElementById('trans-debt');
populateDebtsSelect(debtSel);

if (txId) {
  // Edit Mode
  titleEl.textContent = 'Edit Transaction';
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;

  idInput.value = tx.id;
  amountInput.value = tx.amount;
  dateInput.value = tx.date;
  document.getElementById('trans-note').value = tx.note || '';

  // Segment active
  setActiveSegment(typeSegs, tx.type);

  if (tx.type === 'transfer') {
    toggleTransactionFormFields(tx.type);
    document.getElementById('trans-from-account').value = tx.fromAccountId;
    document.getElementById('trans-to-account').value = tx.toAccountId;
  } else {
    populateCategoriesSelect(document.getElementById('trans-category'), tx.type, tx.category);
    toggleTransactionFormFields(tx.type);
    document.getElementById('trans-account').value = tx.accountId;
    
    if (tx.type === 'expense') {
      investSel.value = tx.investmentId || '';
      debtSel.value = tx.debtId || '';
    }
  }
} else {
  // Add Mode
  titleEl.textContent = 'Add Transaction';
  idInput.value = '';
  
  // Set default date (today or prefilled calendar date)
  dateInput.value = prefilledDate || isoDate(new Date());

  setActiveSegment(typeSegs, 'expense');
  populateCategoriesSelect(document.getElementById('trans-category'), 'expense');
  toggleTransactionFormFields('expense');
}

openModal('modal-transaction');
setTimeout(() => {
  amountInput.focus();
}, 50);
}

function setActiveSegment(segmentedContainer, type) {
segmentedContainer.querySelectorAll('.segment-btn').forEach(btn => {
  btn.classList.toggle('active', btn.getAttribute('data-type') === type || btn.getAttribute('data-kind') === type);
});
}

function toggleTransactionFormFields(type) {
const accGroup = document.getElementById('trans-account-group');
const catGroup = document.getElementById('trans-category-group');
const investGroup = document.getElementById('trans-investment-group');
const debtGroup = document.getElementById('trans-debt-group');
const transGroup = document.getElementById('trans-transfer-group');
const accLabel = document.getElementById('trans-account-label');

if (type === 'transfer') {
  accGroup.classList.add('hidden');
  catGroup.classList.add('hidden');
  investGroup.classList.add('hidden');
  debtGroup.classList.add('hidden');
  transGroup.classList.remove('hidden');
  
  document.getElementById('trans-account').required = false;
  document.getElementById('trans-category').required = false;
  document.getElementById('trans-from-account').required = true;
  document.getElementById('trans-to-account').required = true;
} else {
  accGroup.classList.remove('hidden');
  catGroup.classList.remove('hidden');
  transGroup.classList.add('hidden');

  document.getElementById('trans-account').required = true;
  document.getElementById('trans-category').required = true;
  document.getElementById('trans-from-account').required = false;
  document.getElementById('trans-to-account').required = false;

  if (type === 'income') {
    accLabel.textContent = 'Credit to account';
    investGroup.classList.add('hidden');
    debtGroup.classList.add('hidden');
  } else {
    accLabel.textContent = 'Debit from account';
    debtGroup.classList.remove('hidden');
    // Toggle investment dropdown depending on active category
    const activeCat = document.getElementById('trans-category').value;
    if (activeCat.includes('Investments') || activeCat.includes('Surplus Investment')) {
      investGroup.classList.remove('hidden');
    } else {
      investGroup.classList.add('hidden');
    }
  }
}
}

function populateCategoriesSelect(selectEl, kind, selectedVal = null) {
selectEl.innerHTML = '';
const list = state.categories.filter(c => c.kind === kind);
list.sort((a,b) => a.name.localeCompare(b.name)).forEach(c => {
  selectEl.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`;
});
if (selectedVal) {
  selectEl.value = selectedVal;
}
}

// Watch Segment clicks in transaction form
document.getElementById('trans-type-segmented').querySelectorAll('.segment-btn').forEach(btn => {
btn.addEventListener('click', () => {
  const type = btn.getAttribute('data-type');
  setActiveSegment(document.getElementById('trans-type-segmented'), type);
  toggleTransactionFormFields(type);
  if (type !== 'transfer') {
    populateCategoriesSelect(document.getElementById('trans-category'), type);
  }
});
});

// Watch Category selection to toggle investment dropdown
document.getElementById('trans-category').addEventListener('change', (e) => {
const type = document.getElementById('trans-type-segmented').querySelector('.segment-btn.active').getAttribute('data-type');
const investGroup = document.getElementById('trans-investment-group');
if (type === 'expense' && (e.target.value.includes('Investments') || e.target.value.includes('Surplus Investment'))) {
  investGroup.classList.remove('hidden');
} else {
  investGroup.classList.add('hidden');
}
});

// Save Transaction Form submit
document.getElementById('form-transaction').addEventListener('submit', (e) => {
e.preventDefault();

const id = document.getElementById('trans-id').value;
const type = document.getElementById('trans-type-segmented').querySelector('.segment-btn.active').getAttribute('data-type');
const amount = Number(document.getElementById('trans-amount').value);
const date = document.getElementById('trans-date').value;
const note = document.getElementById('trans-note').value;

if (state.accounts.length === 0) {
  alert("Please create an account first.");
  return;
}

const tx = {
  id: id || uid(),
  createdAt: Date.now(),
  type,
  amount,
  date,
  note
};

if (type === 'transfer') {
  const fromId = document.getElementById('trans-from-account').value;
  const toId = document.getElementById('trans-to-account').value;
  
  if (fromId === toId) {
    alert("Source and Destination accounts must be different.");
    return;
  }

  tx.fromAccountId = fromId;
  tx.fromAccountName = state.accounts.find(a => a.id === fromId).name;
  tx.toAccountId = toId;
  tx.toAccountName = state.accounts.find(a => a.id === toId).name;
} else {
  const accId = document.getElementById('trans-account').value;
  tx.accountId = accId;
  tx.accountName = state.accounts.find(a => a.id === accId).name;
  tx.category = document.getElementById('trans-category').value;
  
  if (type === 'expense') {
    if (tx.category.includes('Investments') || tx.category.includes('Surplus Investment')) {
      const invId = document.getElementById('trans-investment').value;
      if (invId) {
        tx.investmentId = invId;
      }
    }
    const debtId = document.getElementById('trans-debt').value;
    if (debtId) {
      tx.debtId = debtId;
    }
  }
}

if (id) {
  // Edit transaction: reverse old first
  const oldTx = state.transactions.find(t => t.id === id);
  if (oldTx) {
    tx.createdAt = oldTx.createdAt; // preserve creation timestamp
    if (oldTx.type === 'expense' && oldTx.investmentId) {
      reverseInvestmentContribution(oldTx.investmentId, oldTx.amount);
    }
    
    // Update entry
    const idx = state.transactions.findIndex(t => t.id === id);
    state.transactions[idx] = tx;
  }
} else {
  state.transactions.push(tx);
}

// Apply new investment contribution if any
if (tx.type === 'expense' && tx.investmentId) {
  applyInvestmentContribution(tx.investmentId, tx.amount);
}

saveState();
closeModal('modal-transaction');
renderCurrentView();
});


// Recurring Modal Logic
function openRecurringModal(ruleId = null) {
const form = document.getElementById('form-recurring');
form.reset();

const titleEl = document.getElementById('recurring-modal-title');
const typeSegs = document.getElementById('rec-type-segmented');
const amountInput = document.getElementById('rec-amount');
const startDateInput = document.getElementById('rec-start-date');
const endDateInput = document.getElementById('rec-end-date');
const idInput = document.getElementById('rec-id');

// Populate Accounts
const accountSelects = [
  document.getElementById('rec-account'),
  document.getElementById('rec-from-account'),
  document.getElementById('rec-to-account')
];
accountSelects.forEach(sel => {
  sel.innerHTML = '';
  state.accounts.forEach(acc => {
    sel.innerHTML += `<option value="${acc.id}">${escapeHtml(acc.name)}</option>`;
  });
});

// Populate Investments
const investSel = document.getElementById('rec-investment');
investSel.innerHTML = `<option value="">None — log as regular expense</option>`;
state.investments.forEach(inv => {
  investSel.innerHTML += `<option value="${inv.id}">${escapeHtml(inv.name)}</option>`;
});

// Populate Debts
const debtSel = document.getElementById('rec-debt');
populateDebtsSelect(debtSel);

if (ruleId) {
  titleEl.textContent = 'Edit Recurring Rule';
  const rule = state.recurring.find(r => r.id === ruleId);
  if (!rule) return;

  idInput.value = rule.id;
  document.getElementById('rec-name').value = rule.name;
  amountInput.value = rule.amount;
  startDateInput.value = rule.startDate;
  endDateInput.value = rule.endDate || '';
  document.getElementById('rec-frequency').value = rule.frequency;
  document.getElementById('rec-note').value = rule.note || '';

  setActiveSegment(typeSegs, rule.type);

  if (rule.type === 'transfer') {
    toggleRecurringFormFields(rule.type);
    document.getElementById('rec-from-account').value = rule.fromAccountId;
    document.getElementById('rec-to-account').value = rule.toAccountId;
  } else {
    populateCategoriesSelect(document.getElementById('rec-category'), rule.type, rule.category);
    toggleRecurringFormFields(rule.type);
    document.getElementById('rec-account').value = rule.accountId;
    if (rule.type === 'expense') {
      investSel.value = rule.investmentId || '';
      debtSel.value = rule.debtId || '';
    }
  }
} else {
  titleEl.textContent = 'Add Recurring Rule';
  idInput.value = '';
  startDateInput.value = isoDate(new Date());

  setActiveSegment(typeSegs, 'expense');
  populateCategoriesSelect(document.getElementById('rec-category'), 'expense');
  toggleRecurringFormFields('expense');
}

openModal('modal-recurring');
}

function toggleRecurringFormFields(type) {
const accGroup = document.getElementById('rec-account-group');
const catGroup = document.getElementById('rec-category-group');
const investGroup = document.getElementById('rec-investment-group');
const debtGroup = document.getElementById('rec-debt-group');
const transGroup = document.getElementById('rec-transfer-group');
const accLabel = document.getElementById('rec-account-label');

if (type === 'transfer') {
  accGroup.classList.add('hidden');
  catGroup.classList.add('hidden');
  investGroup.classList.add('hidden');
  debtGroup.classList.add('hidden');
  transGroup.classList.remove('hidden');
  
  document.getElementById('rec-account').required = false;
  document.getElementById('rec-category').required = false;
  document.getElementById('rec-from-account').required = true;
  document.getElementById('rec-to-account').required = true;
} else {
  accGroup.classList.remove('hidden');
  catGroup.classList.remove('hidden');
  transGroup.classList.add('hidden');

  document.getElementById('rec-account').required = true;
  document.getElementById('rec-category').required = true;
  document.getElementById('rec-from-account').required = false;
  document.getElementById('rec-to-account').required = false;

  if (type === 'income') {
    accLabel.textContent = 'Credit to account';
    investGroup.classList.add('hidden');
    debtGroup.classList.add('hidden');
  } else {
    accLabel.textContent = 'Debit from account';
    debtGroup.classList.remove('hidden');
    const activeCat = document.getElementById('rec-category').value;
    if (activeCat.includes('Investments') || activeCat.includes('Surplus Investment')) {
      investGroup.classList.remove('hidden');
    } else {
      investGroup.classList.add('hidden');
    }
  }
}
}

// Watch Segment clicks in recurring form
document.getElementById('rec-type-segmented').querySelectorAll('.segment-btn').forEach(btn => {
btn.addEventListener('click', () => {
  const type = btn.getAttribute('data-type');
  setActiveSegment(document.getElementById('rec-type-segmented'), type);
  toggleRecurringFormFields(type);
  if (type !== 'transfer') {
    populateCategoriesSelect(document.getElementById('rec-category'), type);
  }
});
});

document.getElementById('rec-category').addEventListener('change', (e) => {
const type = document.getElementById('rec-type-segmented').querySelector('.segment-btn.active').getAttribute('data-type');
const investGroup = document.getElementById('rec-investment-group');
if (type === 'expense' && (e.target.value.includes('Investments') || e.target.value.includes('Surplus Investment'))) {
  investGroup.classList.remove('hidden');
} else {
  investGroup.classList.add('hidden');
}
});

// Save Recurring Rule Form
document.getElementById('form-recurring').addEventListener('submit', (e) => {
e.preventDefault();

const id = document.getElementById('rec-id').value;
const name = document.getElementById('rec-name').value;
const type = document.getElementById('rec-type-segmented').querySelector('.segment-btn.active').getAttribute('data-type');
const amount = Number(document.getElementById('rec-amount').value);
const frequency = document.getElementById('rec-frequency').value;
const startDate = document.getElementById('rec-start-date').value;
const endDate = document.getElementById('rec-end-date').value || null;
const note = document.getElementById('rec-note').value;

if (state.accounts.length === 0) {
  alert("Please create an account first.");
  return;
}

const rule = {
  id: id || uid(),
  createdAt: Date.now(),
  name,
  type,
  amount,
  frequency,
  startDate,
  endDate,
  lastFiredDate: null,
  note
};

if (type === 'transfer') {
  const fromId = document.getElementById('rec-from-account').value;
  const toId = document.getElementById('rec-to-account').value;
  if (fromId === toId) {
    alert("Source and Destination accounts must be different.");
    return;
  }
  rule.fromAccountId = fromId;
  rule.fromAccountName = state.accounts.find(a => a.id === fromId).name;
  rule.toAccountId = toId;
  rule.toAccountName = state.accounts.find(a => a.id === toId).name;
} else {
  const accId = document.getElementById('rec-account').value;
  rule.accountId = accId;
  rule.accountName = state.accounts.find(a => a.id === accId).name;
  rule.category = document.getElementById('rec-category').value;
  
  if (type === 'expense') {
    if (rule.category.includes('Investments') || rule.category.includes('Surplus Investment')) {
      const invId = document.getElementById('rec-investment').value;
      if (invId) {
        rule.investmentId = invId;
      }
    }
    const debtId = document.getElementById('rec-debt').value;
    if (debtId) {
      rule.debtId = debtId;
    }
  }
}

if (id) {
  const oldRule = state.recurring.find(r => r.id === id);
  if (oldRule) {
    rule.createdAt = oldRule.createdAt;
    rule.lastFiredDate = oldRule.lastFiredDate; // preserve fired state
    const idx = state.recurring.findIndex(r => r.id === id);
    state.recurring[idx] = rule;
  }
} else {
  state.recurring.push(rule);
}

saveState();
closeModal('modal-recurring');
renderCurrentView();
});


// Account Modal Logic
function toggleAccountCreditLimitField(type) {
const group = document.getElementById('account-credit-limit-group');
group.classList.toggle('hidden', type !== 'credit');
}

function openAccountModal(accId = null) {
const form = document.getElementById('form-account');
form.reset();

const titleEl = document.getElementById('account-modal-title');
const nameInput = document.getElementById('account-name');
const typeInput = document.getElementById('account-type');
const balanceInput = document.getElementById('account-opening-balance');
const idInput = document.getElementById('account-id');
const creditLimitInput = document.getElementById('account-credit-limit');

if (accId) {
  titleEl.textContent = 'Edit Account';
  const acc = state.accounts.find(a => a.id === accId);
  if (!acc) return;
  idInput.value = acc.id;
  nameInput.value = acc.name;
  typeInput.value = acc.type;
  balanceInput.value = acc.openingBalance;
  balanceInput.disabled = true; // opening balance locked after creation
  creditLimitInput.value = acc.creditLimit || '';
} else {
  titleEl.textContent = 'Add Account';
  idInput.value = '';
  balanceInput.value = 0;
  balanceInput.disabled = false;
  creditLimitInput.value = '';
}

toggleAccountCreditLimitField(typeInput.value);
openModal('modal-account');
}

document.getElementById('account-type').addEventListener('change', (e) => {
toggleAccountCreditLimitField(e.target.value);
});

document.getElementById('form-account').addEventListener('submit', (e) => {
e.preventDefault();

const id = document.getElementById('account-id').value;
const name = document.getElementById('account-name').value;
const type = document.getElementById('account-type').value;
const openingBalance = Number(document.getElementById('account-opening-balance').value);
const creditLimitRaw = document.getElementById('account-credit-limit').value;
const creditLimit = type === 'credit' && creditLimitRaw ? Number(creditLimitRaw) : undefined;

if (id) {
  const acc = state.accounts.find(a => a.id === id);
  if (acc) {
    // Update account name in transactions denormalized records
    state.transactions.forEach(t => {
      if (t.accountId === id) t.accountName = name;
      if (t.fromAccountId === id) t.fromAccountName = name;
      if (t.toAccountId === id) t.toAccountName = name;
    });

    // Update recurring rules records too
    state.recurring.forEach(r => {
      if (r.accountId === id) r.accountName = name;
      if (r.fromAccountId === id) r.fromAccountName = name;
      if (r.toAccountId === id) r.toAccountName = name;
    });

    acc.name = name;
    acc.type = type;
    acc.creditLimit = creditLimit;
  }
} else {
  state.accounts.push({
    id: uid(),
    name,
    type,
    openingBalance,
    creditLimit,
    createdAt: Date.now()
  });
}

saveState();
closeModal('modal-account');
renderCurrentView();
});


// Category Modal Logic
let categorySelectedEmoji = '';
const EXPENSE_EMOJIS = [
'👤','🏠','⛽','📈','🔁','🍔','🛒','🚗','🛫','👕','💊','📚','🎬','💡','📱',
'🐕','☕','🚌','🎮','💻','🏥','🎓','🎵','🛍️','💳','🧾','🍕','🍻','🎁','✂️'
];
const INCOME_EMOJIS = [
'💰','💼','🏦','💹','🎁','💵','🏆','📊','🤝','📈','🥂','🎉','🎓','💸','🪙',
'🏠','👨‍💻','🎯','💎','🧾'
];

// Budget groups only apply to expense categories (only expense categories can have budgets).
function populateCategoryGroupField(kind, selectedGroupId) {
const field = document.getElementById('category-group-field');
const select = document.getElementById('category-group');

if (kind !== 'expense') {
  field.classList.add('hidden');
  return;
}
field.classList.remove('hidden');

select.innerHTML = '<option value="">Uncategorized</option>';
state.budgetGroups.forEach(g => {
  select.innerHTML += `<option value="${escapeHtml(g.id)}">${g.icon} ${escapeHtml(g.name)}</option>`;
});
select.value = selectedGroupId || '';
}

function openCategoryModal(catId = null, forcedKind = 'expense') {
const form = document.getElementById('form-category');
form.reset();

const titleEl = document.getElementById('category-modal-title');
const kindSegs = document.getElementById('cat-kind-segmented');
const nameInput = document.getElementById('category-name');
const idInput = document.getElementById('category-id');

if (catId) {
  titleEl.textContent = 'Edit Category';
  const cat = state.categories.find(c => c.id === catId);
  if (!cat) return;

  idInput.value = cat.id;
  // Extract emoji if present
  const firstChar = Array.from(cat.name)[0];
  const rest = cat.name.replace(firstChar, '').trim();

  if (cat.kind === 'expense' && EXPENSE_EMOJIS.includes(firstChar)) {
    categorySelectedEmoji = firstChar;
    nameInput.value = rest;
  } else if (cat.kind === 'income' && INCOME_EMOJIS.includes(firstChar)) {
    categorySelectedEmoji = firstChar;
    nameInput.value = rest;
  } else {
    categorySelectedEmoji = '';
    nameInput.value = cat.name;
  }

  setActiveSegment(kindSegs, cat.kind);
  kindSegs.classList.add('disabled'); // lock kind selector
  renderEmojiGrid(cat.kind);
  populateCategoryGroupField(cat.kind, cat.groupId);
} else {
  titleEl.textContent = 'Add Category';
  idInput.value = '';
  categorySelectedEmoji = '';

  setActiveSegment(kindSegs, forcedKind);
  kindSegs.classList.remove('disabled');
  renderEmojiGrid(forcedKind);
  populateCategoryGroupField(forcedKind, '');
}

openModal('modal-category');
}

function renderEmojiGrid(kind) {
const grid = document.getElementById('category-emoji-grid');
grid.innerHTML = '';

// Add "-" no emoji cell
const emptyCell = document.createElement('div');
emptyCell.className = `emoji-cell ${categorySelectedEmoji === '' ? 'selected' : ''}`;
emptyCell.textContent = '—';
emptyCell.onclick = () => {
  categorySelectedEmoji = '';
  grid.querySelectorAll('.emoji-cell').forEach(c => c.classList.remove('selected'));
  emptyCell.classList.add('selected');
};
grid.appendChild(emptyCell);

const emojis = kind === 'expense' ? EXPENSE_EMOJIS : INCOME_EMOJIS;
emojis.forEach(emoji => {
  const cell = document.createElement('div');
  cell.className = `emoji-cell ${categorySelectedEmoji === emoji ? 'selected' : ''}`;
  cell.textContent = emoji;
  cell.onclick = () => {
    categorySelectedEmoji = emoji;
    grid.querySelectorAll('.emoji-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
  };
  grid.appendChild(cell);
});
}

// Watch Kind selection in Category modal
document.getElementById('cat-kind-segmented').querySelectorAll('.segment-btn').forEach(btn => {
btn.addEventListener('click', () => {
  const kind = btn.getAttribute('data-kind');
  setActiveSegment(document.getElementById('cat-kind-segmented'), kind);
  categorySelectedEmoji = ''; // reset selection
  renderEmojiGrid(kind);
  populateCategoryGroupField(kind, '');
});
});

document.getElementById('form-category').addEventListener('submit', (e) => {
e.preventDefault();

const id = document.getElementById('category-id').value;
const name = document.getElementById('category-name').value.trim();
const kind = document.getElementById('cat-kind-segmented').querySelector('.segment-btn.active').getAttribute('data-kind');
const groupId = kind === 'expense' ? document.getElementById('category-group').value : '';

// Prepend emoji if set
let formattedName = name;
if (categorySelectedEmoji) {
  if (!name.startsWith(categorySelectedEmoji)) {
    formattedName = `${categorySelectedEmoji} ${name}`;
  }
}

if (id) {
  const cat = state.categories.find(c => c.id === id);
  if (cat) {
    // Update category names in transactions
    state.transactions.forEach(t => {
      if (t.category === cat.name) t.category = formattedName;
    });
    // Update budgets
    state.budgets.forEach(b => {
      if (b.category === cat.name) b.category = formattedName;
    });
    // Update recurring rules
    state.recurring.forEach(r => {
      if (r.category === cat.name) r.category = formattedName;
    });

    cat.name = formattedName;
    if (cat.kind === 'expense') cat.groupId = groupId;
  }
} else {
  // Check if category name exists
  const duplicate = state.categories.some(c => c.name.toLowerCase() === formattedName.toLowerCase() && c.kind === kind);
  if (duplicate) {
    alert("A category with this name already exists.");
    return;
  }

  state.categories.push({
    id: uid(),
    name: formattedName,
    kind,
    groupId: kind === 'expense' ? groupId : undefined,
    default: false,
    createdAt: Date.now()
  });
}

saveState();
closeModal('modal-category');
renderCurrentView();
});


// Budget Modal Logic
function openBudgetModal(budgetId = null) {
const form = document.getElementById('form-budget');
form.reset();

const titleEl = document.getElementById('budget-modal-title');
const catSel = document.getElementById('budget-category');
const limitInput = document.getElementById('budget-limit');
const idInput = document.getElementById('budget-id');

// Populate expense categories, grouped under their assigned budget group
catSel.innerHTML = '';
const expenseCats = state.categories.filter(c => c.kind === 'expense').sort((a, b) => a.name.localeCompare(b.name));
const groupIdsInUse = [...state.budgetGroups.map(g => g.id), ''];
groupIdsInUse.forEach(groupId => {
  const catsInGroup = expenseCats.filter(c => (c.groupId || '') === groupId);
  if (catsInGroup.length === 0) return;
  const group = groupId ? getBudgetGroupById(groupId) : { name: 'Uncategorized' };
  const optgroup = document.createElement('optgroup');
  optgroup.label = group.name;
  catsInGroup.forEach(c => {
    optgroup.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`;
  });
  catSel.appendChild(optgroup);
});

if (budgetId) {
  titleEl.textContent = 'Edit Budget';
  const b = state.budgets.find(item => item.id === budgetId);
  if (!b) return;
  idInput.value = b.id;
  catSel.value = b.category;
  limitInput.value = b.amount;
} else {
  titleEl.textContent = 'Add Budget';
  idInput.value = '';
}

openModal('modal-budget');
}

document.getElementById('form-budget').addEventListener('submit', (e) => {
e.preventDefault();

const id = document.getElementById('budget-id').value;
const category = document.getElementById('budget-category').value;
const limit = Number(document.getElementById('budget-limit').value);
const mStr = yearMonth(currentMonth);

// Duplicate Check for active month
const duplicate = state.budgets.some(b => b.category === category && b.month === mStr && b.id !== id);
if (duplicate) {
  alert("A budget limit for this category already exists in the selected month.");
  return;
}

if (id) {
  const b = state.budgets.find(item => item.id === id);
  if (b) {
    b.category = category;
    b.amount = limit;
  }
} else {
  state.budgets.push({
    id: uid(),
    category,
    amount: limit,
    month: mStr,
    createdAt: Date.now()
  });
}

saveState();
closeModal('modal-budget');
renderCurrentView();
});


// Investment Modal Logic
function openInvestmentModal(invId = null) {
const form = document.getElementById('form-investment');
form.reset();

const titleEl = document.getElementById('investment-modal-title');
const idInput = document.getElementById('investment-id');
const nameInput = document.getElementById('investment-name');
const typeInput = document.getElementById('investment-type');
const investedInput = document.getElementById('investment-invested');
const currentInput = document.getElementById('investment-current');
const dateInput = document.getElementById('investment-date');
const noteInput = document.getElementById('investment-note');

if (invId) {
  titleEl.textContent = 'Edit Investment';
  const inv = state.investments.find(i => i.id === invId);
  if (!inv) return;

  idInput.value = inv.id;
  nameInput.value = inv.name;
  typeInput.value = inv.type;
  investedInput.value = inv.invested;
  currentInput.value = inv.current;
  dateInput.value = inv.date || '';
  noteInput.value = inv.note || '';
} else {
  titleEl.textContent = 'Add Investment';
  idInput.value = '';
  dateInput.value = isoDate(new Date());
}

openModal('modal-investment');
}

document.getElementById('form-investment').addEventListener('submit', (e) => {
e.preventDefault();

const id = document.getElementById('investment-id').value;
const name = document.getElementById('investment-name').value;
const type = document.getElementById('investment-type').value;
const invested = Number(document.getElementById('investment-invested').value);
const current = Number(document.getElementById('investment-current').value);
const date = document.getElementById('investment-date').value || null;
const note = document.getElementById('investment-note').value;

if (id) {
  const inv = state.investments.find(i => i.id === id);
  if (inv) {
    inv.name = name;
    inv.type = type;
    inv.invested = invested;
    inv.current = current;
    inv.date = date;
    inv.note = note;
    inv.updatedAt = Date.now();
  }
} else {
  state.investments.push({
    id: uid(),
    name,
    type,
    invested,
    current,
    date,
    note,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

saveState();
closeModal('modal-investment');
renderCurrentView();
});


// EXPORT & IMPORT BACKUP

document.getElementById('export-btn').addEventListener('click', () => {
const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
const downloadAnchor = document.createElement('a');

const todayStr = isoDate(new Date());
downloadAnchor.setAttribute("href", dataStr);
downloadAnchor.setAttribute("download", `finance-tracker-${todayStr}.json`);
document.body.appendChild(downloadAnchor);
downloadAnchor.click();
downloadAnchor.remove();
});

document.getElementById('import-btn').addEventListener('click', () => {
document.getElementById('import-input').click();
});

document.getElementById('import-input').addEventListener('change', (e) => {
const file = e.target.files[0];
if (!file) return;

const reader = new FileReader();
reader.onload = function(evt) {
  try {
    const imported = JSON.parse(evt.target.result);
    // Validate schema
    if (
      imported.transactions && Array.isArray(imported.transactions) &&
      imported.budgets && Array.isArray(imported.budgets) &&
      imported.accounts && Array.isArray(imported.accounts) &&
      imported.categories && Array.isArray(imported.categories) &&
      imported.investments && Array.isArray(imported.investments) &&
      imported.recurring && Array.isArray(imported.recurring)
    ) {
      if (confirm("Replace ALL current data with this backup? This cannot be undone.")) {
        state = imported;
        saveState();
        alert("Backup data imported successfully!");
        location.reload();
      }
    } else {
      alert("Invalid file structure. Make sure you are uploading a valid Finance Tracker backup file.");
    }
  } catch (err) {
    alert("Error parsing JSON file. Make sure the file is not corrupted.");
  }
};
reader.readAsText(file);
});


// THEME SWITCHER
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

document.documentElement.setAttribute('data-theme', newTheme);
localStorage.setItem(THEME_KEY, newTheme);

updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
const themeBtn = document.getElementById('theme-toggle');
if (theme === 'light') {
  themeBtn.textContent = '☾';
} else {
  themeBtn.textContent = '☀';
}
}

// Nav Tab bindings
document.querySelectorAll('#main-nav .tab-btn').forEach(btn => {
btn.addEventListener('click', () => {
  switchTab(btn.getAttribute('data-view'));
});
});

// Month Picker bindings (Shared)
document.querySelectorAll('.prev-month-btn').forEach(btn => {
btn.addEventListener('click', () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCurrentView();
});
});

document.querySelectorAll('.next-month-btn').forEach(btn => {
btn.addEventListener('click', () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCurrentView();
});
});

// FAB Binding
document.getElementById('fab-add-trans').addEventListener('click', () => {
openTransactionModal();
});

// General event bindings inside views
document.getElementById('add-account-btn').addEventListener('click', () => {
openAccountModal();
});

document.getElementById('add-investment-btn').addEventListener('click', () => {
openInvestmentModal();
});

document.getElementById('add-recurring-btn').addEventListener('click', () => {
openRecurringModal();
});

document.getElementById('add-budget-btn').addEventListener('click', () => {
openBudgetModal();
});

document.getElementById('budgets-empty-add-btn').addEventListener('click', () => {
openBudgetModal();
});

document.getElementById('add-category-expense-btn').addEventListener('click', () => {
openCategoryModal(null, 'expense');
});

document.getElementById('add-category-income-btn').addEventListener('click', () => {
openCategoryModal(null, 'income');
});

// Transaction filter event triggers
document.getElementById('filter-type').addEventListener('change', renderTransactionsList);
document.getElementById('filter-category').addEventListener('change', renderTransactionsList);
document.getElementById('filter-account').addEventListener('change', renderTransactionsList);

// 4b. SAVINGS BUCKETS RENDERER
function renderSavingsBuckets() {
const container = document.getElementById('savings-buckets-container');
if (!container) return;
container.innerHTML = '';

const buckets = state.savingsBuckets || [];

buckets.forEach(bucket => {
  const balance = getBucketBalance(bucket.id);
  const tile = document.createElement('div');
  tile.className = 'budget-tile'; // Reuse budget tile styles for consistent grid layouts
  
  const pct = bucket.target > 0 ? Math.min(100, Math.round((balance / bucket.target) * 100)) : 0;
  const estDate = getEstimatedCompletionDate(balance, bucket.target, bucket.monthlyGoal);
  
  tile.innerHTML = `
    <div class="budget-tile-header">
      <span class="budget-tile-title" style="font-size:16px;">
        <span style="margin-right:6px;">${escapeHtml(bucket.icon || '🎯')}</span>
        ${escapeHtml(bucket.name)}
      </span>
      <span class="budget-tile-percent" style="font-size: 20px;">${pct}%</span>
    </div>
    <div class="progress-bar-container" style="height: 6px; margin: 6px 0;">
      <div class="progress-bar-fill progress-normal" style="width: ${pct}%;"></div>
    </div>
    <div class="budget-tile-footer" style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-muted);">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <span>Saved: <strong>${formatMoney(balance)}</strong></span>
        <span>Target: <strong>${formatMoney(bucket.target || 0)}</strong></span>
      </div>
      <div style="display:flex; justify-content:space-between; width:100%;">
        <span>Monthly Goal: <strong>${bucket.monthlyGoal ? formatMoney(bucket.monthlyGoal) : 'N/A'}</strong></span>
        <span>Completion: <strong>${estDate}</strong></span>
      </div>
      ${bucket.notes ? `<div style="font-style:italic; margin-top:2px; font-size:11px;">"${escapeHtml(bucket.notes)}"</div>` : ''}
    </div>
    <div class="budget-tile-actions" style="margin-top: 10px;">
      <button class="primary" style="padding:4px 8px; font-size:12px;" onclick="openBucketTransferModal('${bucket.id}', 'fund')">Allocate</button>
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openBucketTransferModal('${bucket.id}', 'withdraw')">Withdraw</button>
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openSavingBucketModal('${bucket.id}')">Edit</button>
      <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteSavingBucket('${bucket.id}')">Delete</button>
    </div>
  `;
  container.appendChild(tile);
});
}

window.openSavingBucketModal = function(bucketId) {
const titleEl = document.getElementById('savings-bucket-modal-title');
const idInput = document.getElementById('savings-bucket-id');
const iconInput = document.getElementById('savings-bucket-icon');
const nameInput = document.getElementById('savings-bucket-name');
const targetInput = document.getElementById('savings-bucket-target');
const monthlyInput = document.getElementById('savings-bucket-monthly');
const notesInput = document.getElementById('savings-bucket-notes');

if (bucketId) {
  const bucket = state.savingsBuckets.find(b => b.id === bucketId);
  titleEl.textContent = 'Edit Goal-Based Bucket';
  idInput.value = bucket.id;
  iconInput.value = bucket.icon || '🎯';
  nameInput.value = bucket.name;
  targetInput.value = bucket.target || '';
  monthlyInput.value = bucket.monthlyGoal || '';
  notesInput.value = bucket.notes || '';
} else {
  titleEl.textContent = 'Add Goal-Based Bucket';
  idInput.value = '';
  iconInput.value = '🎯';
  nameInput.value = '';
  targetInput.value = '';
  monthlyInput.value = '';
  notesInput.value = '';
}
openModal('modal-savings-bucket');
setTimeout(() => {
  nameInput.focus();
}, 50);
};

window.deleteSavingBucket = function(bucketId) {
const bucket = state.savingsBuckets.find(b => b.id === bucketId);
if (!bucket) return;

const balance = getBucketBalance(bucketId);
let warningMsg = `Are you sure you want to delete the bucket "${bucket.name}"?`;
if (balance > 0) {
  warningMsg += `\n\nWarning: This bucket has a balance of ${formatMoney(balance)}! Deleting it will remove the tracking bucket. The historical transactions will remain, but the earmarked funds will no longer be visible as a bucket. We recommend withdrawing the funds back to your bank account first.`;
}

if (confirm(warningMsg)) {
  const idx = state.savingsBuckets.findIndex(b => b.id === bucketId);
  if (idx !== -1) {
    state.savingsBuckets.splice(idx, 1);
    saveState();
    renderMyMoney();
  }
}
};

window.openBucketTransferModal = function(bucketId, actionType) {
const bucket = state.savingsBuckets.find(b => b.id === bucketId);
if (!bucket) return;

const titleEl = document.getElementById('bucket-transfer-modal-title');
const bucketIdInput = document.getElementById('bucket-transfer-id');
const actionInput = document.getElementById('bucket-transfer-action');
const sourceSelect = document.getElementById('bucket-transfer-source');
const amountInput = document.getElementById('bucket-transfer-amount');
const dateInput = document.getElementById('bucket-transfer-date');

bucketIdInput.value = bucketId;
actionInput.value = actionType;
amountInput.value = '';
dateInput.value = isoDate(new Date());

// Populate source dropdown with standard accounts AND other savings buckets (excluding current one)
sourceSelect.innerHTML = '';

// 1. Regular Accounts
const accGroup = document.createElement('optgroup');
accGroup.label = 'Bank / Cash Accounts';
state.accounts.forEach(acc => {
  const bal = getAccountBalance(acc.id);
  accGroup.innerHTML += `<option value="${acc.id}">${escapeHtml(acc.name)} (Bal: ${formatMoney(bal)})</option>`;
});
sourceSelect.appendChild(accGroup);

// 2. Other Savings Buckets
const buckGroup = document.createElement('optgroup');
buckGroup.label = 'Savings Buckets';
state.savingsBuckets.forEach(b => {
  if (b.id !== bucketId) {
    const bal = getBucketBalance(b.id);
    buckGroup.innerHTML += `<option value="${b.id}">${escapeHtml(b.name)} (Bal: ${formatMoney(bal)})</option>`;
  }
});
sourceSelect.appendChild(buckGroup);

if (actionType === 'fund') {
  titleEl.textContent = `Move money to ${bucket.name}`;
} else {
  titleEl.textContent = `Move money out of ${bucket.name}`;
  const curBal = getBucketBalance(bucketId);
  titleEl.textContent += ` (Max: ${formatMoney(curBal)})`;
}

openModal('modal-bucket-transfer');
setTimeout(() => {
  amountInput.focus();
}, 50);
};

// Submit Savings Bucket Form
document.getElementById('form-savings-bucket').addEventListener('submit', (e) => {
e.preventDefault();
const id = document.getElementById('savings-bucket-id').value;
const icon = document.getElementById('savings-bucket-icon').value || '🎯';
const name = document.getElementById('savings-bucket-name').value;
const target = Number(document.getElementById('savings-bucket-target').value) || 0;
const monthlyGoal = Number(document.getElementById('savings-bucket-monthly').value) || 0;
const notes = document.getElementById('savings-bucket-notes').value || '';

const bucket = {
  id: id || 'bucket-' + uid(),
  icon,
  name,
  target,
  monthlyGoal,
  notes,
  createdAt: Date.now()
};

if (id) {
  const idx = state.savingsBuckets.findIndex(b => b.id === id);
  if (idx !== -1) {
    bucket.createdAt = state.savingsBuckets[idx].createdAt;
    state.savingsBuckets[idx] = bucket;
  }
} else {
  state.savingsBuckets.push(bucket);
}

saveState();
closeModal('modal-savings-bucket');
renderMyMoney();
});

// Submit Bucket Transfer Form
document.getElementById('form-bucket-transfer').addEventListener('submit', (e) => {
e.preventDefault();
const targetBucketId = document.getElementById('bucket-transfer-id').value;
const action = document.getElementById('bucket-transfer-action').value;
const sourceId = document.getElementById('bucket-transfer-source').value;
const amount = Number(document.getElementById('bucket-transfer-amount').value);
const dateStr = document.getElementById('bucket-transfer-date').value;

const targetBucket = state.savingsBuckets.find(b => b.id === targetBucketId);

// Find source (can be standard account or another bucket)
let sourceName = '';
let isSourceBucket = false;

const sourceAccount = state.accounts.find(a => a.id === sourceId);
const sourceBucket = state.savingsBuckets.find(b => b.id === sourceId);

if (sourceAccount) {
  sourceName = sourceAccount.name;
  isSourceBucket = false;
} else if (sourceBucket) {
  sourceName = sourceBucket.name;
  isSourceBucket = true;
} else {
  return;
}

if (amount <= 0) return;

// Validation based on action
if (action === 'fund') {
  const sourceBal = isSourceBucket ? getBucketBalance(sourceId) : getAccountBalance(sourceId);
  if (amount > sourceBal) {
    if (isSourceBucket) {
      alert(`Insufficient balance in source bucket "${sourceName}" (${formatMoney(sourceBal)}).`);
      return;
    } else {
      if (!confirm(`Warning: Source account "${sourceName}" has insufficient balance (${formatMoney(sourceBal)}). Proceed anyway?`)) {
        return;
      }
    }
  }
} else {
  const targetBal = getBucketBalance(targetBucketId);
  if (amount > targetBal) {
    alert(`Cannot move out more than current bucket balance: ${formatMoney(targetBal)}`);
    return;
  }
}

// Create transfer transaction
const tx = {
  id: uid(),
  type: 'transfer',
  amount: amount,
  date: dateStr,
  createdAt: Date.now()
};

if (action === 'fund') {
  tx.fromAccountId = sourceId;
  tx.fromAccountName = sourceName;
  tx.toAccountId = targetBucketId;
  tx.toAccountName = targetBucket.name;
  tx.note = `Savings: ${sourceName} → ${targetBucket.name}`;
} else {
  tx.fromAccountId = targetBucketId;
  tx.fromAccountName = targetBucket.name;
  tx.toAccountId = sourceId;
  tx.toAccountName = sourceName;
  tx.note = `Savings: ${targetBucket.name} → ${sourceName}`;
}

state.transactions.push(tx);
saveState();
closeModal('modal-bucket-transfer');
renderMyMoney();
});

document.getElementById('add-bucket-btn').addEventListener('click', () => {
openSavingBucketModal();
});

window.toggleSelectTransaction = function(txId, isChecked) {
if (isChecked) {
  selectedTxIds.add(txId);
} else {
  selectedTxIds.delete(txId);
}

// Update bulk delete button state
const deleteBtn = document.getElementById('bulk-delete-btn');
if (deleteBtn) {
  deleteBtn.textContent = `Delete Selected (${selectedTxIds.size})`;
  deleteBtn.disabled = selectedTxIds.size === 0;
}

// Update Select All checkbox state
const selectAllCheck = document.getElementById('select-all-trans');
if (selectAllCheck) {
  const visibleCheckboxes = document.querySelectorAll('.trans-select-checkbox');
  const allChecked = [...visibleCheckboxes].every(cb => cb.checked);
  selectAllCheck.checked = allChecked;
}
};

window.toggleSelectAllTransactions = function(isChecked) {
const visibleCheckboxes = document.querySelectorAll('.trans-select-checkbox');
visibleCheckboxes.forEach(cb => {
  const id = cb.getAttribute('data-id');
  cb.checked = isChecked;
  if (isChecked) {
    selectedTxIds.add(id);
  } else {
    selectedTxIds.delete(id);
  }
});

// Update delete button state
const deleteBtn = document.getElementById('bulk-delete-btn');
if (deleteBtn) {
  deleteBtn.textContent = `Delete Selected (${selectedTxIds.size})`;
  deleteBtn.disabled = selectedTxIds.size === 0;
}
};

window.bulkDeleteTransactions = function() {
if (selectedTxIds.size === 0) return;

if (confirm(`Are you sure you want to delete the ${selectedTxIds.size} selected transactions?`)) {
  selectedTxIds.forEach(txId => {
    const idx = state.transactions.findIndex(t => t.id === txId);
    if (idx !== -1) {
      const tx = state.transactions[idx];
      // Reverse investment contribution if applicable
      if (tx.type === 'expense' && tx.investmentId) {
        reverseInvestmentContribution(tx.investmentId, tx.amount);
      }
      state.transactions.splice(idx, 1);
    }
  });

  saveState();
  selectedTxIds.clear();
  renderTransactions();
}
};

// 10. DEBT & FORECASTING HELPERS

function populateDebtsSelect(selectEl, selectedVal = null) {
selectEl.innerHTML = '<option value="">None — no debt link</option>';
state.debts.forEach(d => {
  selectEl.innerHTML += `<option value="${d.id}">${escapeHtml(d.name)}</option>`;
});
if (selectedVal) {
  selectEl.value = selectedVal;
}
}

function populateRecurringBillsSelect(selectEl, selectedVal = null) {
selectEl.innerHTML = '<option value="">None — create manually</option>';
state.recurring.filter(r => r.type === 'expense').forEach(r => {
  selectEl.innerHTML += `<option value="${r.id}">${escapeHtml(r.name)} (${formatMoney(r.amount)}/mo)</option>`;
});
if (selectedVal) {
  selectEl.value = selectedVal;
}
}

window.openDebtModal = function(debtId = null) {
const form = document.getElementById('form-debt');
form.reset();

const titleEl = document.getElementById('debt-modal-title');
const idInput = document.getElementById('debt-id');
const catSelect = document.getElementById('debt-category');
const recSelect = document.getElementById('debt-recurring-link');

// Populate Categories (only expense categories)
catSelect.innerHTML = '';
state.categories.filter(c => c.kind === 'expense').forEach(c => {
  catSelect.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`;
});

// Populate Recurring select
populateRecurringBillsSelect(recSelect);

if (debtId) {
  titleEl.textContent = 'Edit Debt Record';
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt) return;
  
  idInput.value = debt.id;
  document.getElementById('debt-name').value = debt.name;
  catSelect.value = debt.category;
  document.getElementById('debt-original').value = debt.originalAmount;
  document.getElementById('debt-emi').value = debt.emiAmount;
  document.getElementById('debt-interest').value = debt.interestRate || '';
  document.getElementById('debt-tenure').value = debt.totalTenure;
  document.getElementById('debt-remaining-tenure').value = debt.remainingTenure;
  document.getElementById('debt-outstanding').value = debt.remainingOutstanding;
  document.getElementById('debt-start-date').value = debt.startDate;
  recSelect.value = debt.linkedRecurringId || '';
  document.getElementById('debt-notes').value = debt.notes || '';
} else {
  titleEl.textContent = 'Add Debt Record';
  idInput.value = '';
  document.getElementById('debt-start-date').value = isoDate(new Date());
}

openModal('modal-debt');
};

function updateOutstandingEstimate() {
const emi = Number(document.getElementById('debt-emi').value) || 0;
const rem = Number(document.getElementById('debt-remaining-tenure').value) || 0;
const outstandingEl = document.getElementById('debt-outstanding');
if (outstandingEl) {
  outstandingEl.value = (emi * rem).toFixed(2);
}
}

window.deleteDebt = function(debtId) {
if (confirm("Are you sure you want to delete this debt? Transactions linked to it will be unlinked.")) {
  state.transactions.forEach(t => {
    if (t.debtId === debtId) {
      t.debtId = null;
    }
  });
  state.recurring.forEach(r => {
    if (r.debtId === debtId) {
      r.debtId = null;
    }
  });
  state.debts = state.debts.filter(d => d.id !== debtId);
  saveState();
  renderMyMoney();
}
};

window.logEMIForDebt = function(debtId) {
const debt = state.debts.find(d => d.id === debtId);
if (!debt) return;

if (debt.remainingTenure <= 0) {
  alert("This debt is already fully paid!");
  return;
}

if (state.accounts.length === 0) {
  alert("Please create a bank/cash account first to pay from.");
  return;
}

const defaultAccount = state.accounts[0];

const tx = {
  id: uid(),
  createdAt: Date.now(),
  type: 'expense',
  amount: debt.emiAmount,
  date: isoDate(new Date()),
  note: `${debt.name} payment`,
  accountId: defaultAccount.id,
  accountName: defaultAccount.name,
  category: debt.category,
  debtId: debt.id
};

state.transactions.push(tx);
applyDebtAmortization(tx);
saveState();
renderCurrentView();
alert(`EMI logged: ₹${debt.emiAmount} paid from ${defaultAccount.name} under ${debt.category}.`);
};

function renderDebts() {
const container = document.getElementById('debts-container');
if (!container) return;
container.innerHTML = '';

const debts = state.debts || [];
if (debts.length === 0) {
  container.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No debts or EMIs configured.</div>`;
  return;
}

debts.forEach(debt => {
  const paidEMIs = debt.totalTenure - debt.remainingTenure;
  const completedPct = debt.totalTenure > 0 ? Math.round((paidEMIs / debt.totalTenure) * 100) : 0;
  
  const tile = document.createElement('div');
  tile.className = 'budget-tile';
  
  tile.innerHTML = `
    <div class="budget-tile-header">
      <span class="budget-tile-title" style="font-size:16px;">
        <span style="margin-right:6px;">💸</span>
        ${escapeHtml(debt.name)}
      </span>
      <span class="budget-tile-percent" style="font-size: 20px;">${completedPct}%</span>
    </div>
    <div class="progress-bar-container" style="height: 6px; margin: 6px 0;">
      <div class="progress-bar-fill progress-normal" style="width: ${completedPct}%;"></div>
    </div>
    <div class="budget-tile-footer" style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--text-muted);">
      <div style="display:flex; justify-content:space-between; width:100%;">
        <span>Outstanding: <strong class="expense-text">${formatMoney(debt.remainingOutstanding)}</strong></span>
        <span>Original: <strong>${formatMoney(debt.originalAmount)}</strong></span>
      </div>
      <div style="display:flex; justify-content:space-between; width:100%;">
        <span>Monthly EMI: <strong>${formatMoney(debt.emiAmount)}</strong></span>
        <span>EMIs Left: <strong>${debt.remainingTenure} / ${debt.totalTenure}</strong></span>
      </div>
      ${debt.notes ? `<div style="font-style:italic; margin-top:2px; font-size:11px;">"${escapeHtml(debt.notes)}"</div>` : ''}
    </div>
    <div class="budget-tile-actions" style="margin-top: 10px;">
      <button class="primary" style="padding:4px 8px; font-size:12px;" onclick="logEMIForDebt('${debt.id}')">Log EMI</button>
      <button class="ghost" style="padding:4px 8px; font-size:12px;" onclick="openDebtModal('${debt.id}')">Edit</button>
      <button class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteDebt('${debt.id}')">Delete</button>
    </div>
  `;
  container.appendChild(tile);
});
}

// 4b. CREDIT & DEBT VIEW RENDERER
// This page is a read-only lens over Accounts + Savings Buckets (edited on My Money)
// plus the Debts & EMIs section, which lives here exclusively.

function getCreditCardAccounts() {
return state.accounts.filter(a => a.type === 'credit');
}

// Credit card balances go negative as money is owed; outstanding is the positive owed amount.
function getCreditCardOutstanding(acc) {
const bal = getAccountBalance(acc.id);
return bal < 0 ? -bal : 0;
}

function getCreditCardBillBucket() {
return state.savingsBuckets.find(b => b.name.trim().toLowerCase() === 'credit card bill');
}

function renderCreditDebt() {
const ccAccounts = getCreditCardAccounts();

// Credit Card Overview tiles
const overviewContainer = document.getElementById('credit-card-overview-container');
overviewContainer.innerHTML = '';
if (ccAccounts.length === 0) {
  overviewContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No credit card accounts yet. Add one from My Money → Accounts.</div>`;
} else {
  ccAccounts.forEach(acc => {
    const outstanding = getCreditCardOutstanding(acc);
    const tile = document.createElement('div');
    tile.className = 'account-tile';
    tile.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <span style="font-weight:600; font-size:16px;">${escapeHtml(acc.name)}</span>
        <span class="tile-type-badge">Credit Card</span>
      </div>
      <div class="tile-footer-muted" style="margin-top:8px;">Outstanding</div>
      <div class="tile-balance expense-text">${formatMoney(outstanding)}</div>
    `;
    overviewContainer.appendChild(tile);
  });
}

// Summary cards
const totalOutstanding = ccAccounts.reduce((sum, acc) => sum + getCreditCardOutstanding(acc), 0);
const bucket = getCreditCardBillBucket();
const bucketBalance = bucket ? getBucketBalance(bucket.id) : 0;

document.getElementById('ccd-total-outstanding').textContent = formatMoney(totalOutstanding);
document.getElementById('ccd-bucket-balance').textContent = formatMoney(bucketBalance);
document.getElementById('ccd-bucket-sub').textContent = bucket
  ? `From "${bucket.name}" bucket`
  : `No "Credit Card Bill" bucket found`;

// Difference / status card (primary metric)
const gap = Number((totalOutstanding - bucketBalance).toFixed(2));
const gapCard = document.getElementById('ccd-gap-card');
const gapTitle = document.getElementById('ccd-gap-title');
const gapValue = document.getElementById('ccd-gap-value');
const recommendation = document.getElementById('ccd-recommendation');

if (gap > 0) {
  gapCard.style.borderLeft = '4px solid var(--warn)';
  gapTitle.textContent = 'Credit Card Gap';
  gapTitle.className = 'card-title warn-text';
  gapValue.textContent = `Need ${formatMoney(gap)}`;
  gapValue.className = 'card-value warn-text';
  recommendation.textContent = bucket
    ? `Transfer another ${formatMoney(gap)} into the "${bucket.name}" bucket to fully cover your outstanding balances.`
    : `Create a "Credit Card Bill" savings bucket in My Money and fund it with ${formatMoney(totalOutstanding)} to cover your outstanding balances.`;
} else if (gap < 0) {
  gapCard.style.borderLeft = '4px solid var(--income)';
  gapTitle.textContent = 'Credit Card Buffer';
  gapTitle.className = 'card-title income-text';
  gapValue.textContent = `${formatMoney(Math.abs(gap))} extra reserved`;
  gapValue.className = 'card-value income-text';
  recommendation.textContent = `You have ${formatMoney(Math.abs(gap))} more reserved than you currently owe. No action required.`;
} else {
  gapCard.style.borderLeft = '4px solid var(--income)';
  gapTitle.textContent = 'Fully Funded';
  gapTitle.className = 'card-title income-text';
  gapValue.textContent = totalOutstanding > 0 ? 'Fully covered' : 'No outstanding balance';
  gapValue.className = 'card-value income-text';
  recommendation.textContent = 'Your credit cards are fully funded. No action required.';
}

// Credit Utilization
const totalLimit = ccAccounts.reduce((sum, acc) => sum + (Number(acc.creditLimit) || 0), 0);
const utilLabel = document.getElementById('ccd-utilization-label');
const utilPct = document.getElementById('ccd-utilization-pct');
const utilFill = document.getElementById('ccd-utilization-fill');
if (totalLimit > 0) {
  const pct = (totalOutstanding / totalLimit) * 100;
  utilLabel.textContent = `${formatMoney(totalOutstanding)} / ${formatMoney(totalLimit)}`;
  utilPct.textContent = `${pct.toFixed(1)}%`;
  utilFill.style.width = `${Math.min(100, pct)}%`;
  utilFill.className = `progress-bar-fill ${pct >= 80 ? 'progress-over' : (pct >= 30 ? 'progress-warn' : 'progress-normal')}`;
} else {
  utilLabel.textContent = 'No credit limits set';
  utilPct.textContent = '—';
  utilFill.style.width = '0%';
  utilFill.className = 'progress-bar-fill progress-normal';
}

// Credit Score
const scoreVal = document.getElementById('ccd-score-val');
const scoreSub = document.getElementById('ccd-score-sub');
if (state.creditScore) {
  scoreVal.textContent = state.creditScore.score;
  scoreSub.textContent = formatMonthLabel(parseISODate(state.creditScore.date));
} else {
  scoreVal.textContent = '—';
  scoreSub.textContent = 'Not set yet';
}
renderCreditScoreChart(state.creditScoreHistory);

// Debts & EMIs (moved from My Money)
renderDebts();
const activeCount = state.debts.filter(d => d.remainingTenure > 0).length;
const badge = document.getElementById('debts-active-count');
if (badge) badge.textContent = `${activeCount} active`;
}

function renderCreditScoreChart(history) {
const container = document.getElementById('credit-score-chart-container');
if (!container) return;

if (!history || history.length === 0) {
  container.innerHTML = `<div class="empty-state">No score history yet. Update your score to start tracking.</div>`;
  return;
}

const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
const width = 800;
const height = 220;
const padding = 40;
const chartWidth = width - padding * 2;
const chartHeight = height - padding * 2;

const scores = sorted.map(h => h.score);
let minS = Math.max(300, Math.min(...scores) - 20);
let maxS = Math.min(900, Math.max(...scores) + 20);
if (minS === maxS) { minS -= 10; maxS += 10; }

const getX = (i) => sorted.length === 1 ? width / 2 : padding + (i / (sorted.length - 1)) * chartWidth;
const getY = (v) => padding + chartHeight - ((v - minS) / (maxS - minS)) * chartHeight;

let gridHtml = '';
for (let i = 0; i <= 4; i++) {
  const val = minS + ((maxS - minS) / 4) * i;
  const y = getY(val);
  gridHtml += `
    <line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4" />
    <text x="${padding - 8}" y="${y + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${Math.round(val)}</text>
  `;
}

const points = sorted.map((h, i) => `${getX(i)},${getY(h.score)}`).join(' ');
const circles = sorted.map((h, i) => `<circle cx="${getX(i)}" cy="${getY(h.score)}" r="4" fill="var(--accent)" />`).join('');

const labelStep = Math.max(1, Math.ceil(sorted.length / 8));
const labels = sorted.map((h, i) => {
  if (i % labelStep !== 0 && i !== sorted.length - 1) return '';
  return `<text x="${getX(i)}" y="${height - padding + 18}" fill="var(--text-muted)" font-size="10" text-anchor="middle">${formatDateShort(h.date)}</text>`;
}).join('');

container.innerHTML = `
  <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; font-family: inherit;">
    ${gridHtml}
    ${sorted.length > 1 ? `<polyline fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}" />` : ''}
    ${circles}
    ${labels}
  </svg>
`;
}

window.openCreditScoreModal = function() {
const scoreInput = document.getElementById('credit-score-value');
const dateInput = document.getElementById('credit-score-date');
scoreInput.value = state.creditScore ? state.creditScore.score : '';
dateInput.value = isoDate(new Date());
openModal('modal-credit-score');
setTimeout(() => { scoreInput.focus(); }, 50);
};

document.getElementById('edit-credit-score-btn').addEventListener('click', () => {
openCreditScoreModal();
});

document.getElementById('form-credit-score').addEventListener('submit', (e) => {
e.preventDefault();
const score = Number(document.getElementById('credit-score-value').value);
const date = document.getElementById('credit-score-date').value;

state.creditScoreHistory.push({ id: uid(), score, date });
state.creditScore = { score, date, updatedAt: Date.now() };

saveState();
closeModal('modal-credit-score');
renderCreditDebt();
});

function getCashFlowForecast() {
const forecast = [];
const today = new Date();

const simulatedDebts = state.debts.map(d => ({...d}));

for (let i = 0; i < 12; i++) {
  const projDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
  const mStr = yearMonth(projDate);
  
  let expectedIncome = 0;
  let expectedExpenses = 0;
  let milestones = [];
  
  state.recurring.forEach(rule => {
    const ruleStart = new Date(rule.startDate);
    if (projDate < new Date(ruleStart.getFullYear(), ruleStart.getMonth(), 1)) return;
    if (rule.endDate) {
      const ruleEnd = new Date(rule.endDate);
      if (projDate > new Date(ruleEnd.getFullYear(), ruleEnd.getMonth(), 1)) return;
    }
    
    let count = 0;
    if (rule.frequency === 'monthly') {
      count = 1;
    } else if (rule.frequency === 'yearly') {
      if (ruleStart.getMonth() === projDate.getMonth()) {
        count = 1;
      }
    }
    
    const amt = Number(rule.amount) * count;
    if (rule.type === 'income') {
      expectedIncome += amt;
    } else if (rule.type === 'expense') {
      expectedExpenses += amt;
    }
  });
  
  simulatedDebts.forEach(debt => {
    if (debt.remainingTenure > 0) {
      expectedExpenses += Number(debt.emiAmount);
      debt.remainingTenure -= 1;
      debt.remainingOutstanding = Math.max(0, debt.remainingOutstanding - debt.emiAmount);
      
      if (debt.remainingTenure === 0) {
        milestones.push(`${debt.name} completed (+${formatMoney(debt.emiAmount)}/mo)`);
      }
    }
  });
  
  const expectedSavings = expectedIncome - expectedExpenses;
  
  forecast.push({
    monthLabel: projDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    monthStr: mStr,
    income: expectedIncome,
    expenses: expectedExpenses,
    savings: expectedSavings,
    milestones
  });
}

return forecast;
}

function generateSVGForecastChart(forecast) {
const width = 800;
const height = 260;
const padding = 40;

const chartWidth = width - padding * 2;
const chartHeight = height - padding * 2;

let maxVal = 10000;
forecast.forEach(f => {
  maxVal = Math.max(maxVal, f.income, f.expenses, Math.abs(f.savings));
});
maxVal = Math.ceil(maxVal / 10000) * 10000;

const getX = (index) => padding + (index / (forecast.length - 1)) * chartWidth;
const getY = (val) => padding + chartHeight - (val / maxVal) * chartHeight;

let gridHtml = '';
for (let i = 0; i <= 4; i++) {
  const yVal = (maxVal / 4) * i;
  const yPos = getY(yVal);
  gridHtml += `
    <line x1="${padding}" y1="${yPos}" x2="${width - padding}" y2="${yPos}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4" />
    <text x="${padding - 8}" y="${yPos + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${formatMoneyCompact(yVal)}</text>
  `;
}

let incomePoints = [];
let expensePoints = [];
let savingsPoints = [];

forecast.forEach((f, idx) => {
  const x = getX(idx);
  incomePoints.push(`${x},${getY(f.income)}`);
  expensePoints.push(`${x},${getY(f.expenses)}`);
  savingsPoints.push(`${x},${getY(Math.max(0, f.savings))}`);
});

const labelsHtml = forecast.map((f, idx) => {
  if (idx % 2 === 0) {
    const x = getX(idx);
    return `<text x="${x}" y="${height - padding + 18}" fill="var(--text-muted)" font-size="10" text-anchor="middle">${f.monthLabel.substring(0,3)} ${f.monthLabel.substring(f.monthLabel.length - 2)}</text>`;
  }
  return '';
}).join('');

return `
  <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; font-family: inherit;">
    ${gridHtml}
    
    <polyline fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${incomePoints.join(' ')}" />
    <polyline fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${expensePoints.join(' ')}" />
    <polyline fill="none" stroke="#3b82f6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${savingsPoints.join(' ')}" />
    
    ${forecast.map((f, idx) => `
      <circle cx="${getX(idx)}" cy="${getY(f.income)}" r="4" fill="#10b981" />
      <circle cx="${getX(idx)}" cy="${getY(f.expenses)}" r="4" fill="#ef4444" />
      <circle cx="${getX(idx)}" cy="${getY(Math.max(0, f.savings))}" r="4" fill="#3b82f6" />
    `).join('')}
    
    ${labelsHtml}
  </svg>
`;
}

function formatMoneyCompact(val) {
if (val >= 100000) return '₹' + (val / 100000).toFixed(1) + 'L';
if (val >= 1000) return '₹' + (val / 1000).toFixed(0) + 'K';
return '₹' + val;
}

function renderPlanning() {
document.querySelectorAll('.current-month-label').forEach(lbl => {
  lbl.textContent = formatMonthLabel(currentMonth);
});

// Toggle Planning sub-views display
const subViews = ['forecast', 'planner', 'reports', 'projections'];
subViews.forEach(sv => {
  const el = document.getElementById(`planning-${sv}-subview`);
  if (el) {
    el.classList.toggle('hidden', sv !== activePlanningSubview);
  }
});

// Toggle Planning sub-nav buttons active class
const subNav = document.getElementById('planning-sub-nav');
if (subNav) {
  subNav.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-subview') === activePlanningSubview);
  });
}

// Run sub-view rendering
if (activePlanningSubview === 'forecast') {
  const forecast = getCashFlowForecast();
  const listBody = document.getElementById('planning-list-body');
  if (listBody) {
    listBody.innerHTML = '';
    forecast.forEach(f => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--border)';
      
      const milestoneHtml = f.milestones.length > 0 
        ? f.milestones.map(m => `<div class="timeline-item milestone" style="font-size:11px; padding:2px 6px; margin:2px 0;">🎉 ${m}</div>`).join('') 
        : '<span style="color:var(--text-muted); font-size:12px;">No milestones</span>';
        
      row.innerHTML = `
        <td style="padding: 12px 16px; font-weight: 500;">${f.monthLabel}</td>
        <td style="padding: 12px 16px; text-align: right;" class="income-text">+${formatMoney(f.income)}</td>
        <td style="padding: 12px 16px; text-align: right;" class="expense-text">-${formatMoney(f.expenses)}</td>
        <td style="padding: 12px 16px; text-align: right;" class="${f.savings >= 0 ? 'income-text' : 'expense-text'}">${f.savings >= 0 ? '+' : ''}${formatMoney(f.savings)}</td>
        <td style="padding: 12px 16px; text-align: right; font-weight:600;" class="${f.savings >= 0 ? 'income-text' : 'expense-text'}">${f.savings >= 0 ? '+' : ''}${formatMoney(f.savings)}</td>
        <td style="padding: 12px 16px;">${milestoneHtml}</td>
      `;
      listBody.appendChild(row);
    });
  }
  
  const chartContainer = document.getElementById('planning-chart-container');
  if (chartContainer) {
    chartContainer.innerHTML = generateSVGForecastChart(forecast);
  }
} else if (activePlanningSubview === 'planner') {
  renderPurchasePlanner();
} else if (activePlanningSubview === 'reports') {
  renderMonthlyReports();
} else if (activePlanningSubview === 'projections') {
  renderNetWorthProjections();
}
}

function renderPurchasePlanner() {
const form = document.getElementById('form-purchase-planner');
const resultsPane = document.getElementById('planner-results-pane');
if (!form || !resultsPane) return;

// Results pane is hidden initially unless calculated
}

function calculatePurchaseAffordability(name, price) {
// 1. Calculate Available Cash (exactly the remaining budget allocations for current month)
const today = new Date();
const currentMStr = yearMonth(today);
let remainingBudgetVal = 0;
state.budgets.filter(b => b.month === currentMStr).forEach(b => {
  const spent = getBudgetSpent(b.category, currentMStr);
  remainingBudgetVal += Math.max(0, b.amount - spent);
});
const availableCash = remainingBudgetVal;

// 2. Calculate Emergency Buffer
const emBucket = state.savingsBuckets.find(b => b.name.toLowerCase().includes('emergency') || b.icon.includes('🛡'));
const emergencyTarget = emBucket ? (emBucket.target || 50000) : 10000;

// 3. Affordability conditions
if (price > availableCash) {
  const diff = price - availableCash;
  const forecast = getCashFlowForecast();
  let cumulativeSavings = availableCash;
  let safeMonth = null;
  
  for (let i = 0; i < forecast.length; i++) {
    cumulativeSavings += forecast[i].savings;
    if (cumulativeSavings >= price + emergencyTarget) {
      safeMonth = forecast[i].monthLabel;
      break;
    }
  }
  
  return {
    affordable: false,
    availableCash,
    emergencyTarget,
    safeMonth,
    explanation: `Buying this purchase today is <strong>not recommended</strong>. Your current available day-to-day cash is ${formatMoney(availableCash)}, which does not cover the purchase price of ${formatMoney(price)}. Earmarking cash from bank accounts for this item would dip into your active savings buckets (which total ${formatMoney(totalBuckets)}).`
  };
}

const postPurchaseCash = availableCash - price;
if (postPurchaseCash < emergencyTarget) {
  const forecast = getCashFlowForecast();
  let cumulativeSavings = postPurchaseCash;
  let safeMonth = null;
  
  for (let i = 0; i < forecast.length; i++) {
    cumulativeSavings += forecast[i].savings;
    if (cumulativeSavings >= emergencyTarget + price) {
      safeMonth = forecast[i].monthLabel;
      break;
    }
  }
  
  return {
    affordable: false,
    availableCash,
    emergencyTarget,
    safeMonth,
    explanation: `Buying this today is <strong>not recommended</strong>. Although you have ${formatMoney(availableCash)} in available cash, spending ${formatMoney(price)} today leaves you with only ${formatMoney(postPurchaseCash)} in spendable buffer. This will deplete your emergency buffer target of ${formatMoney(emergencyTarget)}.`
  };
}

return {
  affordable: true,
  availableCash,
  emergencyTarget,
  explanation: `This purchase is <strong>Affordable</strong>! You have enough unallocated day-to-day cash (${formatMoney(availableCash)}) to buy this today. After purchase, you will retain a buffer of ${formatMoney(postPurchaseCash)}, keeping your active savings buckets and emergency fund target (${formatMoney(emergencyTarget)}) fully protected.`
};
}

function getCompletedMonths() {
const monthsSet = new Set();
const today = new Date();
const currentYm = yearMonth(today);

state.transactions.forEach(t => {
  const ym = t.date.substring(0, 7);
  if (ym < currentYm) {
    monthsSet.add(ym);
  }
});

return Array.from(monthsSet).sort().reverse();
}

function renderMonthlyReports() {
const select = document.getElementById('reports-month-select');
const card = document.getElementById('reports-sheet-card');
if (!select || !card) return;

const completedMonths = getCompletedMonths();
if (completedMonths.length === 0) {
  select.innerHTML = '<option value="">No completed months</option>';
  card.classList.remove('hidden');
  card.innerHTML = `<div class="empty-state">No completed months found. Log transactions in prior months to see reports.</div>`;
  return;
}

const currentVal = select.value;
select.innerHTML = '';
completedMonths.forEach(ym => {
  const [year, month] = ym.split('-');
  const dateObj = new Date(year, month - 1, 1);
  const label = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  select.innerHTML += `<option value="${ym}">${label}</option>`;
});

if (currentVal && completedMonths.includes(currentVal)) {
  select.value = currentVal;
} else {
  select.value = completedMonths[0];
}

drawReportForSelectedMonth();
}

function drawReportForSelectedMonth() {
const select = document.getElementById('reports-month-select');
const card = document.getElementById('reports-sheet-card');
if (!select || !card || !select.value) return;

const ym = select.value;
const report = generateMonthlyReport(ym);

card.classList.remove('hidden');

const achievementsHtml = report.achievements.length > 0 
  ? report.achievements.map(a => `
      <span class="achievement-badge ${a.class}" style="margin: 4px;">
        ${a.emoji} ${escapeHtml(a.text)}
      </span>
    `).join('')
  : '<span style="color:var(--text-muted); font-size:13px; font-style:italic;">No achievements unlocked this month. Maintain budgets and save more to unlock next month!</span>';
  
const largestExpenseHtml = report.largestExpense 
  ? `
    <div style="padding: 12px; border-radius: var(--radius); background-color: var(--surface-2); border-left: 3px solid var(--expense); margin-top: 8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${report.largestExpense.category}</strong>
        <span class="expense-text" style="font-weight:600;">-${formatMoney(report.largestExpense.amount)}</span>
      </div>
      <p style="margin: 4px 0 0 0; font-size: 12px; color:var(--text-muted);">${escapeHtml(report.largestExpense.note || 'No note')} · ${report.largestExpense.date}</p>
    </div>
  `
  : '<span style="color:var(--text-muted); font-size:13px;">No expense logged</span>';
  
card.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 12px; flex-wrap: wrap; gap: 12px;">
    <h3 style="margin: 0; font-size: 20px;">Financial Report for ${report.monthLabel}</h3>
    <div style="display:flex; gap: 8px;">
      <span class="achievement-badge green">Savings Rate: ${report.savingsRate.toFixed(1)}%</span>
    </div>
  </div>
  
  <div class="report-stats-grid">
    <div class="health-detail-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
      <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Income</span>
      <strong style="font-size:22px; color:var(--income);">+${formatMoney(report.income)}</strong>
    </div>
    <div class="health-detail-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
      <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Expenses</span>
      <strong style="font-size:22px; color:var(--expense);">-${formatMoney(report.expenses)}</strong>
    </div>
    <div class="health-detail-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
      <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Net Savings</span>
      <strong style="font-size:22px; color:var(--accent);">${report.savings >= 0 ? '+' : ''}${formatMoney(report.savings)}</strong>
    </div>
    <div class="health-detail-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
      <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Budget Adherence</span>
      <strong style="font-size:22px;">${report.adherenceCount} / ${report.totalBudgets}</strong>
    </div>
  </div>

  <!-- Allocation and Wealth Created -->
  <div class="grid-2" style="margin-top: 24px;">
    <!-- Money Given a Purpose -->
    <div class="card" style="padding: 20px; background-color: var(--surface-1); border: 1px solid var(--border);">
      <h4 style="margin-top: 0; margin-bottom: 16px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">💰 Money Given a Purpose</h4>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Living Expenses</span>
          <strong>${formatMoney(report.breakdown.livingExpenses)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Family Support</span>
          <strong>${formatMoney(report.breakdown.familySupport)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Debt Reduction</span>
          <strong>${formatMoney(report.breakdown.debtReduction)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Savings Bucket Contributions</span>
          <strong>${formatMoney(report.breakdown.savingsBucketContributions)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Fixed Investments</span>
          <strong>${formatMoney(report.breakdown.fixedInvestments)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Surplus Investments</span>
          <strong>${formatMoney(report.breakdown.surplusInvestments)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border); font-weight:600;">
          <span>Remaining Cash</span>
          <span class="${report.breakdown.remainingCash >= 0 ? 'income-text' : 'expense-text'}">${formatMoney(report.breakdown.remainingCash)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:700; margin-top:8px; border-top: 1px solid var(--border); padding-top:8px; color:var(--text-normal);">
          <span>Total Allocated (Income)</span>
          <span>${formatMoney(report.income)}</span>
        </div>
      </div>
    </div>

    <!-- Wealth Created -->
    <div class="card" style="padding: 20px; background-color: var(--surface-1); border: 1px solid var(--border);">
      <h4 style="margin-top: 0; margin-bottom: 16px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--income);">🌱 Wealth Created</h4>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Emergency Fund Increase</span>
          <span style="color:var(--income); font-weight:600;">+${formatMoney(report.wealth.emergencyFundIncrease)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Savings Bucket Contributions</span>
          <span style="color:var(--income); font-weight:600;">+${formatMoney(report.wealth.otherBucketContributions)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Fixed Investments</span>
          <span style="color:var(--income); font-weight:600;">+${formatMoney(report.wealth.fixedInvestments)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Surplus Investments</span>
          <span style="color:var(--income); font-weight:600;">+${formatMoney(report.wealth.surplusInvestments)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; padding-bottom:4px; border-bottom:1px solid var(--border);">
          <span>Debt Reduced</span>
          <span style="color:var(--income); font-weight:600;">+${formatMoney(report.wealth.debtReduced)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:700; margin-top:8px; border-top: 1px solid var(--border); padding-top:8px; color:var(--income);">
          <span>Total Wealth Created</span>
          <span>${formatMoney(report.wealth.totalWealthCreated)}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="grid-2" style="margin-top: 24px;">
    <div class="card" style="padding: 16px; background-color: var(--surface-1); border: 1px solid var(--border);">
      <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Largest Expense</h4>
      ${largestExpenseHtml}
      
      <h4 style="margin-top: 20px; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Top Expense Category</h4>
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 12px; background-color:var(--surface-2); border-radius:var(--radius);">
        <strong>${report.topCategory.name || 'N/A'}</strong>
        <span style="font-weight:600; color:var(--expense);">${report.topCategory.amount > 0 ? '-' + formatMoney(report.topCategory.amount) : '₹0.00'}</span>
      </div>
    </div>
    
    <div class="card" style="padding: 16px; background-color: var(--surface-1); border: 1px solid var(--border);">
      <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Debt Reduced</h4>
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 12px; background-color:var(--surface-2); border-radius:var(--radius); margin-bottom: 20px;">
        <strong>Total EMI Paid</strong>
        <span style="font-weight:600; color:var(--income);">+${formatMoney(report.debtReduced)}</span>
      </div>
      
      <h4 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">Achievements & Badges</h4>
      <div style="display:flex; flex-wrap:wrap; gap:4px;">
        ${achievementsHtml}
      </div>
    </div>
  </div>
`;
}

function generateMonthlyReport(monthStr) {
let income = 0;
let expenses = 0;
let largestExpense = null;
const categoryTotals = {};
let debtReduced = 0;

let surplusInvestments = 0;
let fixedInvestments = 0;
let debtReduction = 0;
let familySupport = 0;
let livingExpenses = 0;

state.transactions.forEach(t => {
  if (t.date.substring(0, 7) === monthStr) {
    if (t.type === 'income') {
      income += t.amount;
    } else if (t.type === 'expense') {
      const amt = Number(t.amount);
      expenses += amt;
      
      if (!largestExpense || amt > largestExpense.amount) {
        largestExpense = t;
      }
      
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + amt;
      
      if (t.category.includes('Surplus Investment')) {
        surplusInvestments += amt;
      } else if (t.category.includes('Investments')) {
        fixedInvestments += amt;
      } else if (t.debtId) {
        debtReduction += amt;
        debtReduced += amt;
      } else if (t.category.toLowerCase().includes('family') || t.category.toLowerCase().includes('support') || t.category.toLowerCase().includes('parents')) {
        familySupport += amt;
      } else {
        livingExpenses += amt;
      }
    }
  }
});

let topCategoryName = 'None';
let topCategoryAmount = 0;
Object.keys(categoryTotals).forEach(cat => {
  if (categoryTotals[cat] > topCategoryAmount) {
    topCategoryAmount = categoryTotals[cat];
    topCategoryName = cat;
  }
});

const savings = income - expenses;
const savingsRate = income > 0 ? (savings / income) * 100 : 0;

const monthBudgets = state.budgets.filter(b => b.month === monthStr);
let adherenceCount = 0;
monthBudgets.forEach(b => {
  const spent = getBudgetSpent(b.category, monthStr);
  if (spent <= b.amount) {
    adherenceCount++;
  }
});

// Calculate savings buckets contributions
let savingsBucketContributions = 0;
let emergencyFundIncrease = 0;
const emBucket = state.savingsBuckets.find(b => b.name.toLowerCase().includes('emergency') || b.icon.includes('🛡'));

state.transactions.forEach(t => {
  if (t.date.substring(0, 7) === monthStr && t.type === 'transfer') {
    const isToBucket = t.toAccountId && t.toAccountId.startsWith('bucket-');
    const isFromBucket = t.fromAccountId && t.fromAccountId.startsWith('bucket-');
    const amt = Number(t.amount);
    
    if (isToBucket && !isFromBucket) {
      savingsBucketContributions += amt;
      if (emBucket && t.toAccountId === emBucket.id) {
        emergencyFundIncrease += amt;
      }
    }
    if (isFromBucket && !isToBucket) {
      savingsBucketContributions -= amt;
      if (emBucket && t.fromAccountId === emBucket.id) {
        emergencyFundIncrease -= amt;
      }
    }
  }
});

const remainingCash = income - (livingExpenses + familySupport + debtReduction + savingsBucketContributions + fixedInvestments + surplusInvestments);
const otherBucketContributions = savingsBucketContributions - emergencyFundIncrease;
const totalWealthCreated = emergencyFundIncrease + otherBucketContributions + fixedInvestments + surplusInvestments + debtReduction;

const [year, month] = monthStr.split('-');
const dateObj = new Date(year, month - 1, 1);
const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const achievements = [];

if (monthBudgets.length > 0 && adherenceCount === monthBudgets.length) {
  achievements.push({
    text: 'All Budgets Maintained',
    emoji: '🎯',
    class: 'gold'
  });
}

if (savingsRate >= 30) {
  achievements.push({
    text: 'Super Saver',
    emoji: '👑',
    class: 'gold'
  });
} else if (savingsRate >= 15) {
  achievements.push({
    text: 'Steady Saver',
    emoji: '🐷',
    class: 'green'
  });
}

if (debtReduced > 0) {
  achievements.push({
    text: 'Debt Buster',
    emoji: '🔨',
    class: 'blue'
  });
}

const newDebtsInMonth = state.debts.some(d => d.startDate && d.startDate.substring(0, 7) === monthStr);
if (!newDebtsInMonth) {
  achievements.push({
    text: 'Zero Debt Created',
    emoji: '🛡',
    class: 'green'
  });
}

return {
  monthLabel,
  income,
  expenses,
  savings,
  savingsRate,
  adherenceCount,
  totalBudgets: monthBudgets.length,
  largestExpense,
  topCategory: { name: topCategoryName, amount: topCategoryAmount },
  debtReduced,
  achievements,
  breakdown: {
    livingExpenses,
    familySupport,
    debtReduction,
    savingsBucketContributions,
    fixedInvestments,
    surplusInvestments,
    remainingCash
  },
  wealth: {
    emergencyFundIncrease,
    otherBucketContributions,
    fixedInvestments,
    surplusInvestments,
    debtReduced: debtReduction,
    totalWealthCreated
  }
};
}

// Bind Purchase Planner & Reports Event Listeners
document.addEventListener('submit', (e) => {
if (e.target && e.target.id === 'form-purchase-planner') {
  e.preventDefault();
  const name = document.getElementById('planner-purchase-name').value.trim();
  const price = Number(document.getElementById('planner-purchase-price').value) || 0;
  
  const analysis = calculatePurchaseAffordability(name, price);
  const resultsPane = document.getElementById('planner-results-pane');
  if (resultsPane) {
    resultsPane.classList.remove('hidden');
    
    const badgeClass = analysis.affordable ? 'affordable' : 'not-recommended';
    const badgeText = analysis.affordable ? '✓ Affordable' : '⚠ Not Recommended';
    
    resultsPane.innerHTML = `
      <div class="planner-result-card ${badgeClass}">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <h4 style="margin: 0; font-size: 18px;">Affordability Analysis for "${escapeHtml(name)}"</h4>
          <span class="achievement-badge ${analysis.affordable ? 'green' : 'gold'}" style="font-size: 12px; padding: 6px 14px;">${badgeText}</span>
        </div>
        <p style="font-size: 14px; line-height: 1.6; margin-bottom: 16px; color: var(--text-normal);">
          ${analysis.explanation}
        </p>
        <div class="report-stats-grid" style="margin-bottom: 0;">
          <div class="health-detail-row">
            <div>
              <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Price</span>
              <strong style="display:block; font-size:16px;">${formatMoney(price)}</strong>
            </div>
          </div>
          <div class="health-detail-row">
            <div>
              <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Day-to-day Available Cash</span>
              <strong style="display:block; font-size:16px; color:var(--accent);">${formatMoney(analysis.availableCash)}</strong>
            </div>
          </div>
          <div class="health-detail-row">
            <div>
              <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase;">Emergency Target Buffer</span>
              <strong style="display:block; font-size:16px;">${formatMoney(analysis.emergencyTarget)}</strong>
            </div>
          </div>
        </div>
        ${!analysis.affordable && analysis.safeMonth ? `
          <div style="margin-top: 16px; padding: 12px; border-radius: var(--radius); background-color: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--accent); font-size: 13px;">
            💡 <strong>Estimated Safe Purchase Month:</strong> ${analysis.safeMonth}. Waiting until this month allows you to accumulate sufficient savings without compromising your emergency fund buffer.
          </div>
        ` : ''}
      </div>
    `;
  }
}
});

document.addEventListener('change', (e) => {
if (e.target && e.target.id === 'reports-month-select') {
  drawReportForSelectedMonth();
}
});

document.addEventListener('click', (e) => {
const tabBtn = e.target.closest('#planning-sub-nav .tab-btn');
if (tabBtn) {
  activePlanningSubview = tabBtn.getAttribute('data-subview');
  renderPlanning();
}
});

function getForecastInsightsAndTimeline(mStr) {
const insights = [];
const timeline = [];

const today = new Date();

const salaryRule = state.recurring.find(r => r.name.toLowerCase().includes('salary') && r.type === 'income');
if (salaryRule) {
  const ruleStart = new Date(salaryRule.startDate);
  const nextDate = new Date(today.getFullYear(), today.getMonth(), ruleStart.getDate());
  if (nextDate < today) {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }
  const diffTime = nextDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  insights.push({
    text: `${diffDays} days until next salary deposit (+${formatMoney(salaryRule.amount)})`,
    kind: 'positive'
  });
}

const activeDebts = [...state.debts].filter(d => d.remainingTenure > 0);
if (activeDebts.length > 0) {
  activeDebts.sort((a,b) => a.remainingTenure - b.remainingTenure);
  const nearestDebt = activeDebts[0];
  timeline.push({
    text: `${nearestDebt.name} completes in ${nearestDebt.remainingTenure} months (+${formatMoney(nearestDebt.emiAmount)}/mo)`,
    kind: 'milestone'
  });
  insights.push({
    text: `Cash flow increases by +${formatMoney(nearestDebt.emiAmount)}/mo when ${nearestDebt.name} completes`,
    kind: 'neutral'
  });
}

const activeBuckets = [...state.savingsBuckets].filter(b => b.target > 0);
activeBuckets.forEach(b => {
  const bal = getBucketBalance(b.id);
  if (bal >= b.target) {
    timeline.push({
      text: `Goal Achieved: ${b.name}!`,
      kind: 'milestone'
    });
  } else if (b.monthlyGoal > 0) {
    const remaining = b.target - bal;
    const months = Math.ceil(remaining / b.monthlyGoal);
    timeline.push({
      text: `${b.name} target estimated completion in ${months} months`,
      kind: 'milestone'
    });
  }
});

const activeBudgets = state.budgets.filter(b => b.month === mStr);
let overCount = 0;
activeBudgets.forEach(b => {
  const spent = getBudgetSpent(b.category, mStr);
  if (spent > b.amount) overCount++;
});
if (overCount > 0) {
  insights.push({
    text: `Warning: Over budget in ${overCount} category/categories this month`,
    kind: 'negative'
  });
} else if (activeBudgets.length > 0) {
  insights.push({
    text: `Excellent: All active budgets are currently within limits!`,
    kind: 'positive'
  });
}

state.recurring.forEach(rule => {
  timeline.push({
    text: `Upcoming rule payment: ${rule.name} (${formatMoney(rule.amount)})`,
    kind: 'neutral'
  });
});

return { insights, timeline };
}

// Bind Debt & Planning Listeners
document.addEventListener('click', (e) => {
if (e.target && e.target.id === 'add-debt-btn') {
  openDebtModal();
}
});

document.addEventListener('submit', (e) => {
if (e.target && e.target.id === 'form-debt') {
  e.preventDefault();
  const id = document.getElementById('debt-id').value;
  const name = document.getElementById('debt-name').value;
  const category = document.getElementById('debt-category').value;
  const originalAmount = Number(document.getElementById('debt-original').value);
  const emiAmount = Number(document.getElementById('debt-emi').value);
  const interestRate = Number(document.getElementById('debt-interest').value) || 0;
  const totalTenure = Number(document.getElementById('debt-tenure').value);
  const remainingTenure = Number(document.getElementById('debt-remaining-tenure').value);
  const remainingOutstanding = Number(document.getElementById('debt-outstanding').value);
  const startDate = document.getElementById('debt-start-date').value;
  const linkedRecurringId = document.getElementById('debt-recurring-link').value || null;
  const notes = document.getElementById('debt-notes').value;
  
  const debt = {
    id: id || uid(),
    name,
    category,
    originalAmount,
    emiAmount,
    interestRate,
    totalTenure,
    remainingTenure,
    remainingOutstanding,
    startDate,
    linkedRecurringId,
    notes,
    createdAt: Date.now()
  };
  
  if (id) {
    const idx = state.debts.findIndex(d => d.id === id);
    if (idx !== -1) {
      debt.createdAt = state.debts[idx].createdAt;
      state.debts[idx] = debt;
    }
  } else {
    state.debts.push(debt);
  }
  
  if (linkedRecurringId) {
    const rule = state.recurring.find(r => r.id === linkedRecurringId);
    if (rule) {
      rule.debtId = debt.id;
    }
  }
  
  saveState();
  closeModal('modal-debt');
  renderMyMoney();
}
});

// Setup form outstanding calculator watch
document.addEventListener('input', (e) => {
if (e.target && (e.target.id === 'debt-emi' || e.target.id === 'debt-remaining-tenure')) {
  updateOutstandingEstimate();
}
});

document.addEventListener('click', (e) => {
const segmentBtn = e.target.closest('#projections-period-segmented .segment-btn');
if (segmentBtn) {
  const months = Number(segmentBtn.getAttribute('data-months'));
  activeProjectionsPeriod = months;
  setActiveSegment(document.getElementById('projections-period-segmented'), months.toString());
  renderNetWorthProjections();
}
});

function calculateNetWorthProjections(monthsCount) {
const projections = [];
const today = new Date();

let currentCash = state.accounts.reduce((sum, a) => sum + getAccountBalance(a.id), 0) +
                  state.savingsBuckets.reduce((sum, b) => sum + getBucketBalance(b.id), 0);

const simInvests = state.investments.map(inv => ({
  id: inv.id,
  current: Number(inv.current) || 0,
  yield: Number(inv.expectedReturn) || 8
}));

const simDebts = state.debts.map(d => ({
  id: d.id,
  outstanding: Number(d.remainingOutstanding) || 0,
  emi: Number(d.emiAmount) || 0,
  tenure: Number(d.remainingTenure) || 0
}));

for (let i = 1; i <= monthsCount; i++) {
  const projDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
  const mStr = yearMonth(projDate);
  
  let monthIncome = 0;
  let monthExpenses = 0;
  
  state.recurring.forEach(rule => {
    const ruleStart = new Date(rule.startDate);
    if (projDate < new Date(ruleStart.getFullYear(), ruleStart.getMonth(), 1)) return;
    if (rule.endDate) {
      const ruleEnd = new Date(rule.endDate);
      if (projDate > new Date(ruleEnd.getFullYear(), ruleEnd.getMonth(), 1)) return;
    }
    
    let count = 0;
    if (rule.frequency === 'monthly') {
      count = 1;
    } else if (rule.frequency === 'yearly') {
      if (ruleStart.getMonth() === projDate.getMonth()) {
        count = 1;
      }
    }
    
    const amt = Number(rule.amount) * count;
    if (rule.type === 'income') {
      monthIncome += amt;
    } else if (rule.type === 'expense') {
      if (rule.debtId) return; 
      if (rule.category && rule.category.includes('Investments')) return;
      monthExpenses += amt;
    }
  });
  
  let totalInvestments = 0;
  simInvests.forEach(inv => {
    const monthlyROI = (inv.yield / 12) / 100;
    const growth = inv.current * monthlyROI;
    inv.current += growth;
    
    let monthlyContribution = 0;
    state.recurring.forEach(rule => {
      if (rule.type === 'expense' && rule.investmentId === inv.id && rule.frequency === 'monthly') {
        monthlyContribution += Number(rule.amount);
      }
    });
    
    if (monthlyContribution > 0) {
      inv.current += monthlyContribution;
      currentCash -= monthlyContribution;
    }
    
    totalInvestments += inv.current;
  });
  
  let totalDebtOutstanding = 0;
  simDebts.forEach(debt => {
    if (debt.tenure > 0) {
      currentCash -= debt.emi;
      debt.tenure -= 1;
      debt.outstanding = Math.max(0, debt.outstanding - debt.emi);
    }
    totalDebtOutstanding += debt.outstanding;
  });
  
  const netSavings = monthIncome - monthExpenses;
  currentCash += netSavings;
  
  const netWorth = currentCash + totalInvestments - totalDebtOutstanding;
  
  projections.push({
    monthLabel: projDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    monthStr: mStr,
    cash: Math.max(0, Number(currentCash.toFixed(2))),
    investments: Number(totalInvestments.toFixed(2)),
    debt: Number(totalDebtOutstanding.toFixed(2)),
    netWorth: Number(netWorth.toFixed(2))
  });
}

const startingNetWorth = state.accounts.reduce((sum, a) => sum + getAccountBalance(a.id), 0) + 
                          state.savingsBuckets.reduce((sum, b) => sum + getBucketBalance(b.id), 0) +
                          state.investments.reduce((sum, i) => sum + Number(i.current), 0) - 
                          state.debts.reduce((sum, d) => sum + Number(d.remainingOutstanding), 0);
return {
  projections,
  startingNetWorth
};
}

function generateSVGProjectionsChart(projections) {
const width = 800;
const height = 260;
const padding = 40;

const chartWidth = width - padding * 2;
const chartHeight = height - padding * 2;

let maxVal = 10000;
projections.forEach(p => {
  maxVal = Math.max(maxVal, p.cash, p.investments, p.netWorth, p.debt);
});
maxVal = Math.ceil(maxVal / 10000) * 10000;

const getX = (index) => padding + (index / (projections.length - 1)) * chartWidth;
const getY = (val) => padding + chartHeight - (val / maxVal) * chartHeight;

let gridHtml = '';
for (let i = 0; i <= 4; i++) {
  const yVal = (maxVal / 4) * i;
  const yPos = getY(yVal);
  gridHtml += `
    <line x1="${padding}" y1="${yPos}" x2="${width - padding}" y2="${yPos}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4,4" />
    <text x="${padding - 8}" y="${yPos + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end">${formatMoneyCompact(yVal)}</text>
  `;
}

let cashPoints = [];
let investPoints = [];
let netWorthPoints = [];
let debtPoints = [];

projections.forEach((p, idx) => {
  const x = getX(idx);
  cashPoints.push(`${x},${getY(p.cash)}`);
  investPoints.push(`${x},${getY(p.investments)}`);
  netWorthPoints.push(`${x},${getY(p.netWorth)}`);
  debtPoints.push(`${x},${getY(p.debt)}`);
});

const labelsHtml = projections.map((p, idx) => {
  const nth = Math.ceil(projections.length / 6);
  if (idx % nth === 0) {
    const x = getX(idx);
    return `<text x="${x}" y="${height - padding + 18}" fill="var(--text-muted)" font-size="10" text-anchor="middle">${p.monthLabel.substring(0,3)} ${p.monthLabel.substring(p.monthLabel.length - 2)}</text>`;
  }
  return '';
}).join('');

return `
  <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; font-family: inherit;">
    ${gridHtml}
    
    <polyline fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${cashPoints.join(' ')}" />
    <polyline fill="none" stroke="#eab308" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${investPoints.join(' ')}" />
    <polyline fill="none" stroke="#3b82f6" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${netWorthPoints.join(' ')}" />
    <polyline fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${debtPoints.join(' ')}" stroke-dasharray="4,2" />
    
    ${labelsHtml}
  </svg>
`;
}

function generateFutureMilestones(projections, startingNetWorth) {
const milestones = [];

let debtFreeMonth = null;
const initialDebt = state.debts.reduce((sum, d) => sum + Number(d.remainingOutstanding), 0);
if (initialDebt > 0) {
  for (let i = 0; i < projections.length; i++) {
    if (projections[i].debt === 0) {
      debtFreeMonth = projections[i].monthLabel;
      break;
    }
  }
}
if (debtFreeMonth) {
  milestones.push({
    title: 'Debt Free Status!',
    description: `You are projected to pay off all active loans and EMIs, achieving 100% debt-free status.`,
    date: debtFreeMonth,
    emoji: '🕊',
    class: 'green'
  });
}

state.savingsBuckets.forEach(bucket => {
  if (bucket.target > 0) {
    const currentSaved = getBucketBalance(bucket.id);
    if (currentSaved < bucket.target) {
      let targetMonth = null;
      
      if (bucket.monthlyGoal > 0) {
        const remaining = bucket.target - currentSaved;
        const monthsNeeded = Math.ceil(remaining / bucket.monthlyGoal);
        if (monthsNeeded <= projections.length) {
          const dateObj = new Date();
          dateObj.setMonth(dateObj.getMonth() + monthsNeeded);
          targetMonth = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
      }
      
      if (targetMonth) {
        milestones.push({
          title: `Goal Target: ${bucket.name}`,
          description: `Projected to save your target of ${formatMoney(bucket.target)} for this goal.`,
          date: targetMonth,
          emoji: bucket.icon || '🎯',
          class: 'blue'
        });
      }
    }
  }
});

const milestonesLimits = [100000, 500000, 1000000];
const startingInvestments = state.investments.reduce((sum, i) => sum + Number(i.current), 0);

milestonesLimits.forEach(limit => {
  if (startingInvestments < limit) {
    let limitMonth = null;
    for (let i = 0; i < projections.length; i++) {
      if (projections[i].investments >= limit) {
        limitMonth = projections[i].monthLabel;
        break;
      }
    }
    if (limitMonth) {
      milestones.push({
        title: `Investments cross ${formatMoney(limit)}`,
        description: `Your investment portfolios are projected to grow past the ${formatMoney(limit)} milestone.`,
        date: limitMonth,
        emoji: '📈',
        class: 'gold'
      });
    }
  }
});

milestones.sort((a,b) => {
  const dateA = new Date(a.date);
  const dateB = new Date(b.date);
  return dateA - dateB;
});

return milestones;
}

function renderNetWorthProjections() {
const result = calculateNetWorthProjections(activeProjectionsPeriod);
const listBody = document.getElementById('projections-list-body');
const chartContainer = document.getElementById('projections-chart-container');
const timeline = document.getElementById('projections-milestones-timeline');
const summarySheet = document.getElementById('projections-summary-sheet');

if (!listBody || !chartContainer || !timeline || !summarySheet) return;

listBody.innerHTML = '';
result.projections.forEach(p => {
  const row = document.createElement('tr');
  row.style.borderBottom = '1px solid var(--border)';
  row.innerHTML = `
    <td style="padding: 12px 16px; font-weight: 500;">${p.monthLabel}</td>
    <td style="padding: 12px 16px; text-align: right;" class="income-text">${formatMoney(p.cash)}</td>
    <td style="padding: 12px 16px; text-align: right; color:#eab308; font-weight:600;">${formatMoney(p.investments)}</td>
    <td style="padding: 12px 16px; text-align: right;" class="expense-text">${formatMoney(p.debt)}</td>
    <td style="padding: 12px 16px; text-align: right; font-weight:600;" class="${p.netWorth >= 0 ? 'income-text' : 'expense-text'}">${formatMoney(p.netWorth)}</td>
  `;
  listBody.appendChild(row);
});

chartContainer.innerHTML = generateSVGProjectionsChart(result.projections);

const milestones = generateFutureMilestones(result.projections, result.startingNetWorth);
timeline.innerHTML = '';
if (milestones.length === 0) {
  timeline.innerHTML = '<div class="empty-state" style="font-size:13px; color:var(--text-muted);">No major milestones projected in this period.</div>';
} else {
  milestones.forEach(m => {
    const item = document.createElement('div');
    item.className = 'insight-item';
    item.style.borderLeftColor = m.class === 'green' ? 'var(--income)' : m.class === 'gold' ? '#eab308' : 'var(--accent)';
    item.innerHTML = `
      <span style="font-size: 16px;">${m.emoji}</span>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size:13px; color:var(--text-normal);">${m.title}</strong>
          <span style="font-size:11px; font-weight:600; color:var(--accent);">${m.date}</span>
        </div>
        <p style="margin:2px 0 0 0; font-size:12px; color:var(--text-muted);">${m.description}</p>
      </div>
    `;
    timeline.appendChild(item);
  });
}

const lastProj = result.projections[result.projections.length - 1];
const nwIncrease = lastProj.netWorth - result.startingNetWorth;
const pctIncrease = result.startingNetWorth > 0 ? (nwIncrease / result.startingNetWorth) * 100 : 0;

summarySheet.innerHTML = `
  <div class="health-detail-row" style="margin-bottom: 8px;">
    <div>
      <strong style="display:block; font-size:13px; color:var(--text-muted); text-transform:uppercase;">Starting Net Worth</strong>
      <span style="font-size:18px; font-weight:700;">${formatMoney(result.startingNetWorth)}</span>
    </div>
  </div>
  <div class="health-detail-row" style="margin-bottom: 8px;">
    <div>
      <strong style="display:block; font-size:13px; color:var(--text-muted); text-transform:uppercase;">Ending Net Worth (${activeProjectionsPeriod} mo)</strong>
      <span style="font-size:18px; font-weight:700; color:var(--accent);">${formatMoney(lastProj.netWorth)}</span>
    </div>
  </div>
  <div class="health-detail-row" style="margin-bottom: 8px;">
    <div>
      <strong style="display:block; font-size:13px; color:var(--text-muted); text-transform:uppercase;">Projected Growth</strong>
      <span style="font-size:18px; font-weight:700; color:${nwIncrease >= 0 ? 'var(--income)' : 'var(--expense)'};">
        ${nwIncrease >= 0 ? '+' : ''}${formatMoney(nwIncrease)} (${pctIncrease.toFixed(1)}%)
      </span>
    </div>
  </div>
  <div class="health-detail-row">
    <div>
      <strong style="display:block; font-size:13px; color:var(--text-muted); text-transform:uppercase;">Debt Free Progress</strong>
      <span style="font-size:18px; font-weight:700; color:${lastProj.debt === 0 ? 'var(--income)' : 'var(--text-normal)'};">
        ${lastProj.debt === 0 ? 'Projected Debt Free!' : `₹${lastProj.debt} left`}
      </span>
    </div>
  </div>
`;
}

let dismissedSurplusMonths = new Set();

window.dismissSurplusAssistant = function() {
const mStr = yearMonth(currentMonth);
dismissedSurplusMonths.add(mStr);
renderDashboard();
};

window.executeSurplusAction = function(actionType) {
const surplus = getTotalBalance();

if (surplus <= 0) {
  alert("No surplus cash available.");
  return;
}

if (state.accounts.length === 0) {
  alert("Please create a bank/cash account first.");
  return;
}

const defaultAccount = state.accounts[0];
const todayStr = isoDate(new Date());

if (actionType === 'invest') {
  const invId = document.getElementById('assistant-invest-select').value;
  if (!invId) {
    alert("Please configure an investment first.");
    return;
  }
  const tx = {
    id: uid(),
    createdAt: Date.now(),
    type: 'expense',
    amount: surplus,
    date: todayStr,
    note: 'EOM Surplus Investment',
    accountId: defaultAccount.id,
    accountName: defaultAccount.name,
    category: '🚀 Surplus Investment',
    investmentId: invId
  };
  state.transactions.push(tx);
  applyInvestmentContribution(invId, surplus);
  alert(`Success: Invested ${formatMoney(surplus)} into ${state.investments.find(i => i.id === invId).name}!`);
} else if (actionType === 'emergency') {
  const emBucket = state.savingsBuckets.find(b => b.name.toLowerCase().includes('emergency') || b.icon.includes('🛡'));
  if (!emBucket) {
    alert("Please create an Emergency Fund savings bucket first.");
    return;
  }
  const tx = {
    id: uid(),
    type: 'transfer',
    amount: surplus,
    date: todayStr,
    createdAt: Date.now(),
    fromAccountId: defaultAccount.id,
    fromAccountName: defaultAccount.name,
    toAccountId: emBucket.id,
    toAccountName: emBucket.name,
    note: 'EOM Surplus → Emergency Fund'
  };
  state.transactions.push(tx);
  alert(`Success: Allocated ${formatMoney(surplus)} to Emergency Fund!`);
} else if (actionType === 'bucket') {
  const bucketId = document.getElementById('assistant-bucket-select').value;
  if (!bucketId) {
    alert("Please configure a savings bucket first.");
    return;
  }
  const bucket = state.savingsBuckets.find(b => b.id === bucketId);
  const tx = {
    id: uid(),
    type: 'transfer',
    amount: surplus,
    date: todayStr,
    createdAt: Date.now(),
    fromAccountId: defaultAccount.id,
    fromAccountName: defaultAccount.name,
    toAccountId: bucket.id,
    toAccountName: bucket.name,
    note: `EOM Surplus → ${bucket.name}`
  };
  state.transactions.push(tx);
  alert(`Success: Allocated ${formatMoney(surplus)} to ${bucket.name}!`);
} else if (actionType === 'keep') {
  dismissedSurplusMonths.add(mStr);
  alert("Surplus cash kept in bank account as spending buffer.");
}

saveState();
renderDashboard();
};

function renderSurplusAssistant() {
const card = document.getElementById('db-surplus-assistant-card');
if (!card) return;

const mStr = yearMonth(currentMonth);
if (dismissedSurplusMonths.has(mStr)) {
  card.classList.add('hidden');
  return;
}

const available = getTotalBalance();

if (available <= 100) {
  card.classList.add('hidden');
  return;
}

card.classList.remove('hidden');

let investOptions = '';
state.investments.forEach(inv => {
  investOptions += `<option value="${inv.id}">${escapeHtml(inv.name)}</option>`;
});

let bucketOptions = '';
state.savingsBuckets.forEach(b => {
  bucketOptions += `<option value="${b.id}">${escapeHtml(b.name)}</option>`;
});

card.innerHTML = `
  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
    <div>
      <h4 style="margin:0; font-size:16px; color:var(--accent);">🚀 End of Month Surplus Assistant</h4>
      <p style="margin:4px 0 0 0; font-size:13px; color:var(--text-normal);">
        Available Surplus Buffer: <strong>${formatMoney(available)}</strong>. Select a quick action to allocate this unspent cash:
      </p>
    </div>
    <button class="ghost" style="padding:4px 8px; font-size:11px;" onclick="dismissSurplusAssistant()">Dismiss</button>
  </div>
  
  <div style="display:flex; flex-direction:column; gap:12px; margin-top:16px; font-size:13px;">
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span>• <strong>Invest into Portfolio:</strong></span>
      <select id="assistant-invest-select" style="padding:4px; font-size:12px; max-width:200px; background:var(--surface-2); color:var(--text-normal); border:1px solid var(--border); border-radius:4px;">
        ${investOptions || '<option value="">No investments configured</option>'}
      </select>
      <button class="primary" style="padding:4px 10px; font-size:12px;" onclick="executeSurplusAction('invest')">Invest Now</button>
    </div>
    
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span>• <strong>Allocate to Emergency Fund:</strong></span>
      <button class="primary" style="padding:4px 10px; font-size:12px;" onclick="executeSurplusAction('emergency')">Allocate Now</button>
    </div>
    
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span>• <strong>Allocate to Goal Bucket:</strong></span>
      <select id="assistant-bucket-select" style="padding:4px; font-size:12px; max-width:200px; background:var(--surface-2); color:var(--text-normal); border:1px solid var(--border); border-radius:4px;">
        ${bucketOptions || '<option value="">No buckets configured</option>'}
      </select>
      <button class="primary" style="padding:4px 10px; font-size:12px;" onclick="executeSurplusAction('bucket')">Allocate Now</button>
    </div>
    
    <div style="display:flex; align-items:center; gap:8px;">
      <span>• <strong>Keep as Cash:</strong> Retain cash in accounts as liquid spending buffer.</span>
      <button class="ghost" style="padding:4px 10px; font-size:12px;" onclick="executeSurplusAction('keep')">Confirm</button>
    </div>
  </div>
`;
}

const DONUT_COLORS = [
'#3b82f6', // blue
'#10b981', // green
'#f59e0b', // amber
'#ef4444', // red
'#8b5cf6', // purple
'#ec4899', // pink
'#06b6d4', // cyan
'#14b8a6', // teal
'#f97316', // orange
'#84cc16', // lime
'#a855f7', // purple-light
'#6366f1', // indigo
];

function getCategoryColor(index) {
return DONUT_COLORS[index % DONUT_COLORS.length];
}

function generateSVGDonutChart(data) {
const total = data.reduce((sum, item) => sum + item.value, 0);
if (total === 0) {
  return `
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%;">
      <circle cx="20" cy="20" r="15.915" fill="transparent" stroke="var(--border)" stroke-width="4" opacity="0.2" />
      <text x="20" y="22" fill="var(--text-muted)" font-size="4" text-anchor="middle" font-weight="500">No Data</text>
    </svg>
  `;
}

let accum = 0;
let circlesHtml = '';

data.forEach(item => {
  const pct = (item.value / total) * 100;
  const dashArray = `${pct.toFixed(2)} ${(100 - pct).toFixed(2)}`;
  const offset = (125 - accum) % 100;
  
  circlesHtml += `
    <circle cx="20" cy="20" r="15.915" fill="transparent" 
            stroke="${item.color}" stroke-width="5" 
            stroke-dasharray="${dashArray}" stroke-dashoffset="${offset.toFixed(2)}"
            class="donut-segment" style="transition: stroke-dashoffset 0.3s ease;">
      <title>${escapeHtml(item.label)}: ${formatMoney(item.value)} (${pct.toFixed(1)}%)</title>
    </circle>
  `;
  accum += pct;
});

return `
  <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; transform: rotate(-90deg); display: block;">
    <circle cx="20" cy="20" r="15.915" fill="transparent" stroke="var(--border)" stroke-width="5" opacity="0.1" />
    ${circlesHtml}
  </svg>
`;
}

function renderCategoryPieCharts(mStr) {
const incomePieContainer = document.getElementById('db-income-pie-chart');
const incomeLegendContainer = document.getElementById('db-income-pie-legend');
const expensePieContainer = document.getElementById('db-expense-pie-chart');
const expenseLegendContainer = document.getElementById('db-expense-pie-legend');

if (!incomePieContainer || !incomeLegendContainer || !expensePieContainer || !expenseLegendContainer) return;

const incomeTotals = {};
const expenseTotals = {};

state.transactions.forEach(t => {
  if (t.date.substring(0, 7) === mStr) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      incomeTotals[t.category] = (incomeTotals[t.category] || 0) + amt;
    } else if (t.type === 'expense') {
      expenseTotals[t.category] = (expenseTotals[t.category] || 0) + amt;
    }
  }
});

// Format income data
const incomeData = Object.keys(incomeTotals).map((catName, idx) => ({
  label: catName,
  value: incomeTotals[catName],
  color: getCategoryColor(idx)
}));
incomeData.sort((a, b) => b.value - a.value);

// Format expense data
const expenseData = Object.keys(expenseTotals).map((catName, idx) => ({
  label: catName,
  value: expenseTotals[catName],
  color: getCategoryColor(idx)
}));
expenseData.sort((a, b) => b.value - a.value);

// Render Income Pie
incomePieContainer.innerHTML = generateSVGDonutChart(incomeData);
if (incomeData.length === 0) {
  incomeLegendContainer.innerHTML = '<div style="color:var(--text-muted); font-style:italic;">No income recorded.</div>';
} else {
  const totalIncome = incomeData.reduce((sum, item) => sum + item.value, 0);
  incomeLegendContainer.innerHTML = incomeData.map(item => {
    const pct = (item.value / totalIncome) * 100;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${item.color}; flex-shrink: 0;"></span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.label)}</span>
        </div>
        <span style="font-weight: 600; flex-shrink: 0;">${pct.toFixed(0)}% (${formatMoney(item.value)})</span>
      </div>
    `;
  }).join('');
}

// Render Expense Pie
expensePieContainer.innerHTML = generateSVGDonutChart(expenseData);
if (expenseData.length === 0) {
  expenseLegendContainer.innerHTML = '<div style="color:var(--text-muted); font-style:italic;">No expenses recorded.</div>';
} else {
  const totalExpense = expenseData.reduce((sum, item) => sum + item.value, 0);
  expenseLegendContainer.innerHTML = expenseData.map(item => {
    const pct = (item.value / totalExpense) * 100;
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${item.color}; flex-shrink: 0;"></span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.label)}</span>
        </div>
        <span style="font-weight: 600; flex-shrink: 0;">${pct.toFixed(0)}% (${formatMoney(item.value)})</span>
      </div>
    `;
  }).join('');
}
}

// App initialization
window.addEventListener('DOMContentLoaded', () => {
const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
updateThemeIcon(currentTheme);

loadState();

// Render initial dashboard view
switchTab('dashboard');
});

 
// The application never moves money. These are suggested allocations and manually tracked balances.
export const DEFAULT_ACCOUNTS = [
  { id: 'checking', name: 'Checking', kind: 'checking', percent: 50, balance: 0, apy: 0, archived: false },
  { id: 'spending', name: 'Spending', kind: 'spending', percent: 15, balance: 0, apy: 0, archived: false },
  { id: 'savings', name: 'Wealthfront savings', kind: 'savings', percent: 25, balance: 0, apy: 3.55, archived: false },
  { id: 'reserves', name: 'Reserves', kind: 'reserves', percent: 10, balance: 0, apy: 0, archived: false },
];
export function initialState() {
  return { version: 2, accounts: DEFAULT_ACCOUNTS.map(a => ({ ...a })), paychecks: [], wealthfrontActivity: [], savingsGoal: 10000 };
}
export function normalizeState(data) {
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.paychecks)) return initialState();
  return { ...initialState(), ...data, accounts: data.accounts, paychecks: data.paychecks, wealthfrontActivity: Array.isArray(data.wealthfrontActivity) ? data.wealthfrontActivity : [], version: 2 };
}
export const cents = value => Math.round(Number(value || 0) * 100);
export const dollar = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
export const roundedDollar = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
export const today = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
export const formatDate = date => new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const shortMonth = (offset = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };
export function allocationsForPaycheck(amount, accounts) {
  const active = accounts.filter(a => !a.archived);
  const total = active.reduce((sum, a) => sum + Number(a.percent), 0);
  if (!active.length || Math.abs(total - 100) > 0.00001 || active.some(a => !Number.isFinite(Number(a.percent)) || Number(a.percent) < 0)) throw new Error('Account percentages must add up to 100%.');
  const amountCents = cents(amount);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Enter a paycheck greater than $0.');
  const rows = active.map((account, index) => {
    const exact = amountCents * Number(account.percent) / 100;
    const base = Math.floor(exact);
    return { account_id: account.id, name: account.name, amount: base / 100, fraction: exact - base, index, allocatedCents: base };
  });
  let remaining = amountCents - rows.reduce((sum, row) => sum + row.allocatedCents, 0);
  const ranked = [...rows].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remaining; i++) ranked[i % ranked.length].allocatedCents += 1;
  return rows.map(({ account_id, name, allocatedCents }) => ({ account_id, name, amount: allocatedCents / 100 }));
}
// An APY is already an effective annual yield. Convert it to an equivalent
// monthly rate and assume contributions arrive at END of each month.
export function savingsProjection({ startingBalance = 0, monthlyContribution = 1000, apyPercent = 3.55, months = 12 }) {
  const initial = Math.max(0, Number(startingBalance) || 0);
  const contribution = Math.max(0, Number(monthlyContribution) || 0);
  const apy = Math.max(0, Number(apyPercent) || 0) / 100;
  const monthlyRate = Math.pow(1 + apy, 1 / 12) - 1;
  const out = [{ month: 0, balance: initial, contributed: 0, interest: 0 }];
  let balance = initial;
  for (let month = 1; month <= months; month++) {
    balance = balance * (1 + monthlyRate) + contribution;
    const contributed = month * contribution;
    out.push({ month, balance, contributed, interest: balance - initial - contributed });
  }
  return out;
}
export function totalBalances(accounts) { return accounts.filter(a => !a.archived).reduce((sum, a) => sum + (Number(a.balance) || 0), 0); }
export function savingsAccount(accounts) { return accounts.find(a => a.kind === 'savings' && !a.archived) || accounts.find(a => Number(a.apy) > 0 && !a.archived); }
export function withPaycheckApplied(state, id, applied) {
  const paycheck = state.paychecks.find(p => p.id === id);
  if (!paycheck || paycheck.applied === applied) return state;
  const delta = applied ? 1 : -1;
  return { ...state, accounts: state.accounts.map(a => {
    // New paycheck plans only propose Wealthfront transfers; actual savings deposits are recorded separately.
    // Old plans without savingsTrackingMode retain their historical accounting for correct reversals.
    const amount = a.kind === 'savings' && paycheck.savingsTrackingMode === 'manual' ? 0 : paycheck.allocations.filter(x => x.account_id === a.id).reduce((sum, x) => sum + Number(x.amount), 0);
    return { ...a, balance: Math.round((Number(a.balance) + delta * amount) * 100) / 100 };
  }), paychecks: state.paychecks.map(p => p.id === id ? { ...p, applied } : p) };
}

/** Wealthfront activity is manually recorded bank activity, never a planned paycheck transfer. */
export function recordWealthfrontActivity(state, activity) {
 const a = savingsAccount(state.accounts || []);
 if (!a) throw new Error('Add a savings account before recording deposits.');
 if (!['opening', 'deposit', 'withdrawal'].includes(activity.type)) throw new Error('Choose deposit or withdrawal.');
 const amountCents = cents(activity.amount);
 if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error('Enter an amount greater than $0.');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(activity.date) || new Date(activity.date + 'T12:00:00').toString() === 'Invalid Date') throw new Error('Choose a valid date.');
 if (activity.date > today()) throw new Error('Record a deposit only after it happens.');
 const currentCents = cents(a.balance);
 const nextCents = currentCents + (activity.type === 'withdrawal' ? -amountCents : amountCents);
 if (nextCents < 0) throw new Error('The withdrawal exceeds the tracked Wealthfront balance.');
 const item = { id: activity.id, type: activity.type, date: activity.date, amount: amountCents / 100, note: String(activity.note || '').slice(0, 120), created_at: activity.created_at || new Date().toISOString() };
 return {
  ...state,
  wealthfrontActivity: [item, ...(state.wealthfrontActivity || [])].sort((x,y) => y.date.localeCompare(x.date) || (y.created_at || '').localeCompare(x.created_at || '')),
  accounts: state.accounts.map(x => x.id === a.id ? { ...x, balance: nextCents / 100 } : x)
 };
}
export function removeWealthfrontActivity(state, id) {
 const item = (state.wealthfrontActivity || []).find(x => x.id === id);
 if (!item) return state;
 const a = savingsAccount(state.accounts || []);
 if (!a) throw new Error('Savings account not found.');
 const amountCents = cents(item.amount);
 const nextCents = cents(a.balance) + (item.type === 'withdrawal' ? amountCents : -amountCents);
 if (nextCents < 0) throw new Error('Cannot remove this deposit while the remaining tracked balance is too low.');
 return { ...state, accounts: state.accounts.map(x => x.id === a.id ? { ...x, balance: nextCents / 100 } : x), wealthfrontActivity: state.wealthfrontActivity.filter(x => x.id !== id) };
}
/** Use only the immediately preceding COMPLETED calendar month, not a rolling 30 days or an old high-water mark. */
export function getMostRecentFullMonthPace(activity, asOf = today()) {
 const [year, month] = asOf.slice(0,7).split('-').map(Number);
 const previous = new Date(Date.UTC(year, month - 2, 1));
 const monthKey = previous.toISOString().slice(0,7);
 const rows = (activity || []).filter(x => x.date && x.date.startsWith(monthKey) && x.type !== 'opening');
 const depositedCents = rows.filter(x => x.type === 'deposit').reduce((sum,x) => sum + cents(x.amount), 0);
 const withdrawnCents = rows.filter(x => x.type === 'withdrawal').reduce((sum,x) => sum + cents(x.amount), 0);
 return { monthKey, hasData: rows.length > 0, depositCount: rows.filter(x => x.type === 'deposit').length, monthlyNet: Math.max(0,(depositedCents - withdrawnCents) / 100), deposited: depositedCents / 100, withdrawn: withdrawnCents / 100 };
}

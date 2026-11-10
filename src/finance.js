// The application never moves money. These are suggested allocations and manually tracked balances.
export const DEFAULT_ACCOUNTS = [
  { id: 'checking', name: 'Checking', kind: 'checking', percent: 50, balance: 0, apy: 0, archived: false },
  { id: 'spending', name: 'Spending', kind: 'spending', percent: 15, balance: 0, apy: 0, archived: false },
  { id: 'savings', name: 'Wealthfront savings', kind: 'savings', percent: 25, balance: 0, apy: 3.55, archived: false },
  { id: 'reserves', name: 'Reserves', kind: 'reserves', percent: 10, balance: 0, apy: 0, archived: false },
];
export function initialState() {
  return { version: 1, accounts: DEFAULT_ACCOUNTS.map(a => ({ ...a })), paychecks: [], monthlySavings: 1000, savingsGoal: 10000 };
}
export function normalizeState(data) {
  if (!data || !Array.isArray(data.accounts) || !Array.isArray(data.paychecks)) return initialState();
  return { ...initialState(), ...data, accounts: data.accounts, paychecks: data.paychecks };
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
    const amount = paycheck.allocations.filter(x => x.account_id === a.id).reduce((sum, x) => sum + Number(x.amount), 0);
    return { ...a, balance: Math.round((Number(a.balance) + delta * amount) * 100) / 100 };
  }), paychecks: state.paychecks.map(p => p.id === id ? { ...p, applied } : p) };
}

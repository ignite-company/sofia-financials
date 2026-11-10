import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, allocationsForPaycheck, savingsProjection, withPaycheckApplied, totalBalances, recordWealthfrontActivity, removeWealthfrontActivity, getMostRecentFullMonthPace, normalizeState } from '../src/finance.js';

test('default categories are the four requested accounts and add to 100%', () => {
 const a=initialState().accounts;
 assert.deepEqual(a.map(x=>x.kind),['checking','spending','savings','reserves']);
 assert.equal(a.reduce((s,x)=>s+x.percent,0),100);
 assert.equal(a.find(x=>x.kind==='savings').apy,3.55);
});
test('paycheck allocation exactly conserves dollars and cents', () => {
 const a=initialState().accounts;
 for(const amount of [0.01,1,73.99,813.57,1201.37,2500.00]){
  const rows=allocationsForPaycheck(amount,a);
  assert.equal(Math.round(rows.reduce((s,x)=>s+x.amount,0)*100),Math.round(amount*100));
  assert(rows.every(x=>x.amount>=0));
 }
});
test('rejects a split that is not exactly 100 percent', () => {
 const a=initialState().accounts;
 a[0].percent=40;
 assert.throws(()=>allocationsForPaycheck(1000,a),/100%/);
});
test('3.55% effective APY with $1000 end-of-month deposits over 12 months',()=>{
 const rows=savingsProjection({startingBalance:0,monthlyContribution:1000,apyPercent:3.55,months:12});
 assert.equal(rows.length,13);
 assert.equal(rows[12].balance.toFixed(2),'12194.02');
 assert.equal(rows[12].interest.toFixed(2),'194.02');
 assert.equal(rows[12].contributed,12000);
});
test('starting $1000 earns exactly 3.55% after one year with no deposits',()=>{
 const p=savingsProjection({startingBalance:1000,monthlyContribution:0,apyPercent:3.55,months:12});
 assert.equal(p[12].balance.toFixed(2),'1035.50');
});
test('zero APY produces only contributions',()=>{
 const p=savingsProjection({startingBalance:500,monthlyContribution:200,apyPercent:0,months:12});
 assert.equal(p[12].balance,2900);
 assert.equal(p[12].interest,0);
});
test('mark as moved, undo and avoid double applying',()=>{
 const start=initialState();
 start.paychecks=[{id:'p1',amount:100,applied:false,allocations:allocationsForPaycheck(100,start.accounts)}];
 const applied=withPaycheckApplied(start,'p1',true);
 assert.equal(totalBalances(applied.accounts),100);
 assert.equal(withPaycheckApplied(applied,'p1',true),applied);
 const undone=withPaycheckApplied(applied,'p1',false);
 assert.equal(totalBalances(undone.accounts),0);
});

test('new paycheck plans do not change Wealthfront until an actual deposit is recorded',()=>{
 const start=initialState();
 start.paychecks=[{id:'pay',applied:false,savingsTrackingMode:'manual',allocations:allocationsForPaycheck(800,start.accounts)}];
 const moved=withPaycheckApplied(start,'pay',true);
 assert.equal(moved.accounts.find(a=>a.kind==='savings').balance,0);
 assert.equal(totalBalances(moved.accounts),600);
 const actual=recordWealthfrontActivity(moved,{id:'wf1',type:'opening',amount:200,date:'2026-11-10'});
 assert.equal(actual.accounts.find(a=>a.kind==='savings').balance,200);
 assert.equal(totalBalances(actual.accounts),800);
});
test('record $2000 starting deposit, then $200 extra; interest-only projections increase',()=>{
 let s=initialState();
 s=recordWealthfrontActivity(s,{id:'one',type:'opening',amount:2000,date:'2026-11-10'});
 assert.equal(s.accounts.find(a=>a.id==='savings').balance,2000);
 const p1=savingsProjection({startingBalance:2000,monthlyContribution:0,apyPercent:3.55,months:12})[12];
 assert.equal(p1.balance.toFixed(2),'2071.00');
 s=recordWealthfrontActivity(s,{id:'two',type:'deposit',amount:200,date:'2026-11-17'});
 assert.equal(s.accounts.find(a=>a.id==='savings').balance,2200);
 const p2=savingsProjection({startingBalance:2200,monthlyContribution:0,apyPercent:3.55,months:12})[12];
 assert.equal(p2.balance.toFixed(2),'2278.10');
 assert.equal(s.wealthfrontActivity.length,2);
});
test('opening deposit excluded from month pace, last complete month only',()=>{
 let s=initialState();
 s=recordWealthfrontActivity(s,{id:'start',type:'opening',amount:2000,date:'2026-10-03'});
 s=recordWealthfrontActivity(s,{id:'nov',type:'deposit',amount:200,date:'2026-11-10'});
 const november10=getMostRecentFullMonthPace(s.wealthfrontActivity,'2026-11-10');
 assert.equal(november10.monthKey,'2026-10');
 assert.equal(november10.monthlyNet,0);
 assert.equal(november10.hasData,false);
 const december1=getMostRecentFullMonthPace(s.wealthfrontActivity,'2026-12-01');
 assert.equal(december1.monthKey,'2026-11');
 assert.equal(december1.monthlyNet,200);
 assert.equal(december1.hasData,true);
});
test('full month pace subtracts withdrawals and does not rely on old months',()=>{
 const activity=[
   {id:'i',date:'2026-10-12',type:'deposit',amount:300},
   {id:'w',date:'2026-10-17',type:'withdrawal',amount:100}
 ];
 assert.equal(getMostRecentFullMonthPace(activity,'2026-11-01').monthlyNet,200);
 assert.equal(getMostRecentFullMonthPace(activity,'2026-12-01').monthlyNet,0);
});
test('delete an actual deposit reverses balance; prevents impossible withdrawals',()=>{
 let s=initialState();
 s=recordWealthfrontActivity(s,{id:'start',type:'opening',date:'2026-11-10',amount:2000});
 s=recordWealthfrontActivity(s,{id:'weekly',type:'deposit',date:'2026-11-17',amount:200});
 s=removeWealthfrontActivity(s,'weekly');
 assert.equal(s.accounts.find(a=>a.id==='savings').balance,2000);
 assert.throws(()=>recordWealthfrontActivity(s,{id:'bad',type:'withdrawal',date:'2026-11-17',amount:2001}),/exceeds/);
 assert.throws(()=>recordWealthfrontActivity(s,{id:'future',type:'deposit',date:'2099-01-01',amount:100}),/after it happens/);
});
test('existing user data without activity migrates safely',()=>{
 const old={version:1,accounts:initialState().accounts,paychecks:[],monthlySavings:1000};
 const migrated=normalizeState(old);
 assert.equal(migrated.version,2);
 assert.deepEqual(migrated.wealthfrontActivity,[]);
 assert.equal(migrated.accounts.length,4);
});

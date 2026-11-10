import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, allocationsForPaycheck, savingsProjection, withPaycheckApplied, totalBalances } from '../src/finance.js';

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

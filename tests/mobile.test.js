import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));

test('Home exposes both frequent money actions for phone users',()=>{
 assert.match(app,/className="mobile-quick-actions"/);
 assert.match(app,/className="mobile-action action-paycheck"/);
 assert.match(app,/className="mobile-action action-savings"/);
 assert.match(app,/setModal\('paycheck'\)/);
 assert.match(app,/setModal\('wealthfront'\)/);
});
test('Navigation is labeled and reachable on a small phone',()=>{
 assert.match(app,/aria-label="Main navigation"/);
 assert.match(app,/aria-current=\{view===item\.id/);
 assert.match(css,/min-height:58px/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('Mobile forms keep font at 16px to avoid iOS focus zoom',()=>{
 assert.match(css,/\.field,\.input-shell input,\.goal-input input,\.large-money-input input,\.percent-input input,\.auth-box input\{font-size:16px\}/);
 assert.match(css,/\.modal-body>\.btn\{position:sticky/);
});
test('Mobile action text is readable rather than icon-only',()=>{
 assert.match(css,/\.page-intro \.btn\{font-size:13px/);
 assert.match(css,/\.page-intro \.payday-trigger\{display:none\}/);
 assert.match(css,/\.mobile-action-copy strong\{font-size:13px/);
});
test('Sofia can launch from an added phone home-screen shortcut',()=>{
 assert.match(html,/rel="manifest"/);
 assert.match(html,/apple-mobile-web-app-capable/);
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.start_url,'/');
});
test('Changing tabs scrolls the mobile page to the top',()=>{
 assert.match(app,/window\.scrollTo\(\{top:0,behavior:'auto'\}\)/);
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pushScreen, popScreen } = require('../lib/navigation.ts');

test('return follows the visited XPay path, not the fixed store destination', () => {
  const home = ['HOME'];
  const store = pushScreen(home, 'STORE');
  const benefits = pushScreen(store, 'XPAY_BENEFITS');
  const account = pushScreen(benefits, 'XPAY_ACCOUNT');
  assert.deepEqual(popScreen(account), benefits);
  assert.deepEqual(popScreen(benefits), store);
  assert.deepEqual(popScreen(store), home);
  assert.deepEqual(home, ['HOME']);
});
test('same screen does not add a loop, and the first screen cannot underflow', () => {
  const trail = ['HOME', 'CRM'];
  assert.equal(pushScreen(trail, 'CRM'), trail);
  const initial = ['HOME'];
  assert.equal(popScreen(initial), initial);
});
test('cross-module return and nested settings preserve the actual previous level', () => {
  let trail = ['HOME', 'REPORTS'];
  trail = pushScreen(trail, 'CRM');
  trail = pushScreen(trail, 'REPORTS');
  assert.deepEqual(popScreen(trail), ['HOME', 'REPORTS', 'CRM']);
  assert.deepEqual(popScreen(['HOME', 'PROFILE_MENU', 'SCHOOL_PROFILE']), ['HOME', 'PROFILE_MENU']);
  assert.deepEqual(popScreen(['HOME', 'PLAN']), ['HOME']);
});

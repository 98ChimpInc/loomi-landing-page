// Runnable check for pilotAssertColumnLayout (#95). Apps Script is not a
// module, so the two pieces we need are lifted out of Code.js by name and
// evaluated with a stub sheet. Run: node scripts/tests/column-layout.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};

global.Logger = { log: () => {} };
eval(pick(/var PILOT_HEADERS = \[[\s\S]*?\];/, 'PILOT_HEADERS'));
eval(pick(/function pilotAssertColumnLayout\(sheet\) \{[\s\S]*?\n\}/, 'pilotAssertColumnLayout'));

const sheetWith = (row1) => ({
  getRange: (_r, _c, _nr, n) => ({ getValues: () => [row1.slice(0, n)] }),
});

// 1. The correct layout passes.
assert.strictEqual(pilotAssertColumnLayout(sheetWith(PILOT_HEADERS)), null,
  'the documented layout must pass');

// 2. Untitled trailing columns are tolerated ... this is the live sheet today,
//    and refusing here would stop every fan-out the moment this deploys.
const untitled = PILOT_HEADERS.slice(0, 16).concat(['', '']);
assert.strictEqual(pilotAssertColumnLayout(sheetWith(untitled)), null,
  'blank titles must warn, not refuse');

// 3. THE CASE THIS EXISTS FOR: a column inserted at Q shifts every later title
//    right. Q reads blank (tolerated), but R now holds "Child name" instead of
//    "Survey", and that is refused.
const shifted = PILOT_HEADERS.slice(0, 16).concat(['', 'Child name', 'Survey']);
const problem = pilotAssertColumnLayout(sheetWith(shifted));
assert.ok(problem, 'an inserted column must be refused, not silently accepted');
assert.ok(/column 18/.test(problem) && /Survey/.test(problem),
  'the message must name the column and what it expected, got: ' + problem);

// 4. A wrong title in place is refused too.
const renamed = PILOT_HEADERS.slice();
renamed[3] = 'Age in months';
assert.ok(pilotAssertColumnLayout(sheetWith(renamed)), 'a renamed column must be refused');

console.log('ok ... 4 checks passed');

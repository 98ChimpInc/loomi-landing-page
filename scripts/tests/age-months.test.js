// Runnable check for the age select -> childAgeMonths -> band chain (#94).
// Run: node scripts/tests/age-months.test.js
const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync(__dirname + '/../../pilot.html', 'utf8');
const code = fs.readFileSync(__dirname + '/../Code.js', 'utf8');

// The band function, lifted from Code.js so this tests the real mapping.
eval(code.match(/function pilotAgeBand\(childAgeMonths\) \{[\s\S]*?\n\}/)[0]);

const select = html.match(/<select id="ageYears"[\s\S]*?<\/select>/)[0];
const values = [...select.matchAll(/<option value="(\d*)"/g)]
  .map(m => m[1]).filter(v => v !== '');

const months = v => parseInt(v, 10) * 12;   // pilot.html, form submit

// 1. Every eligible bracket must reach a real band. This is the regression:
//    "2 years" was not offered at all, so 24 months could not be submitted.
for (const v of ['2', '3', '4', '5', '6']) {
  assert.ok(values.includes(v), `the select must offer ${v} years`);
  assert.ok(pilotAgeBand(months(v)),
    `${v} years (${months(v)} months) must map to a band, got ${pilotAgeBand(months(v))}`);
}

// 2. The specific bug: 2 years is 24 months and band 2-3, not 0 and null.
assert.strictEqual(months('2'), 24);
assert.strictEqual(pilotAgeBand(24), '2-3');

// 3. Under-2 still reports as under-2 rather than pretending otherwise. What
//    happens to them is a policy question (#96), not this file's business.
assert.ok(values.includes('0'));
assert.strictEqual(pilotAgeBand(months('0')), null);

// 4. Every select value has a matching survey radio, so autoFillAgeGroup's
//    'age-group-' + y always resolves.
for (const v of values) {
  assert.ok(html.includes(`id="age-group-${v}"`),
    `select offers ${v} but there is no age-group-${v} radio`);
}

console.log(`ok ... ${values.length} age values, 4 checks passed`);

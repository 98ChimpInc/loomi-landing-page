// Runnable check for the age -> status/outcome decision (#96).
// Run: node scripts/tests/age-outcome.test.js
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');

eval(src.match(/var PILOT_MIN_BAND_MONTHS = \d+;/)[0]);
eval(src.match(/function pilotAgeBand\(childAgeMonths\) \{[\s\S]*?\n\}/)[0]);
eval(src.match(/function pilotOutcomeMessage\(outcome\) \{[\s\S]*?\n\}/)[0]);

// The decision, mirrored from pilotRecordApplicant's else-branch. Asserted
// against the shipping source below so it cannot drift into a private copy.
const decide = (months, capacityFull) => {
  const band = pilotAgeBand(months);
  let status = 'new', outcome = 'eligible';
  if (!band) {
    const m = parseInt(months, 10);
    if (!isNaN(m) && m < PILOT_MIN_BAND_MONTHS) {
      status = 'waitlisted'; outcome = 'waitlisted_age';
    } else {
      status = 'ineligible'; outcome = 'ineligible_age';
    }
  }
  if (outcome === 'eligible' && capacityFull) {
    status = 'waitlisted'; outcome = 'waitlisted';
  }
  return { status, outcome };
};

const body = src.match(/function pilotRecordApplicant[\s\S]*?\n\}/)[0];
assert.ok(body.includes('months < PILOT_MIN_BAND_MONTHS'), 'under-age branch missing from Code.js');
assert.ok(body.includes("outcome = 'waitlisted_age'"), 'waitlisted_age missing from Code.js');
assert.ok(body.includes("outcome = 'ineligible_age'"), 'ineligible_age missing from Code.js');

// 1. THE DECISION: under two is HELD, not screened out.
for (const m of [0, 6, 12, 23]) {
  const r = decide(m, false);
  assert.strictEqual(r.status, 'waitlisted', `${m} months must be waitlisted`);
  assert.strictEqual(r.outcome, 'waitlisted_age');
}

// 2. Over six ages OUT ... no cohort is coming, so a waitlist would never call.
for (const m of [73, 96]) {
  assert.strictEqual(decide(m, false).status, 'ineligible', `${m} months must be ineligible`);
}

// 3. Every eligible age is untouched, including both boundaries.
for (const m of [24, 35, 36, 59, 60, 72]) {
  const r = decide(m, false);
  assert.strictEqual(r.status, 'new', `${m} months must stay new`);
  assert.strictEqual(r.outcome, 'eligible');
}

// 4. A full cohort waitlists an eligible age, and does NOT overwrite the age
//    outcome ... the age reason is the one the applicant can act on.
assert.strictEqual(decide(36, true).outcome, 'waitlisted');
assert.strictEqual(decide(12, true).outcome, 'waitlisted_age');

// 5. Every outcome says something, and the two waitlists do not say the same
//    thing: "this cohort is full" is false for an under-two.
const full = pilotOutcomeMessage('waitlisted');
const age = pilotOutcomeMessage('waitlisted_age');
assert.ok(age && age !== full, 'under-two needs its own message');
assert.ok(!/full/i.test(age), 'the under-two message must not claim the cohort is full');
assert.ok(/second birthday/i.test(age), 'it must say what the actual bar is');

console.log('ok ... 5 checks passed');

// Runnable check for the #102 sheet migration's pure parts: the move plan and
// the survey JSON expansion. The sheet calls are Apps Script only; the risk is
// the plan, because a wrong move reorders real applicant data.
// Run: node scripts/tests/migration.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};

eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(pick(/var PILOT_LEGACY_COLUMNS = \[[\s\S]*?\];/, 'PILOT_LEGACY_COLUMNS'));
eval(pick(/function pilotMigrationPlan\(\) \{[\s\S]*?\n\}/, 'pilotMigrationPlan'));
eval(pick(/function pilotSurveyCellsFromJson\(text\) \{[\s\S]*?\n\}/, 'pilotSurveyCellsFromJson'));

const keys = PILOT_COLUMNS.map(c => c[0]);
const legacy = PILOT_LEGACY_COLUMNS.map(c => c[0]);

// 1. The legacy layout is the one every live row was written in (#97 docs).
assert.deepStrictEqual(legacy, ['timestamp', 'parentName', 'email', 'childAgeMonths', 'band',
  'device', 'tz', 'canCommit', 'challenge', 'themes', 'audience', 'status', 'invitationCode',
  'approvalEmailSentAt', 'notes', 'childSex', 'childName', 'survey']);

// 2. Replay the plan on a model grid, applying moveColumns as Google documents
//    it (destination counted BEFORE the move; source removed, data shifted
//    right). Written independently of the planner so it checks it, not echoes it.
const plan = pilotMigrationPlan();
const grid = legacy.concat(plan.appended);
for (const [from, to] of plan.moves) {
  assert.ok(to < from, `move ${from}->${to} is not leftward`);
  const [col] = grid.splice(from - 1, 1);
  grid.splice(to - 1, 0, col);
}
assert.deepStrictEqual(grid, keys.concat(['survey']),
  'after the moves the grid must be PILOT_COLUMNS with the JSON column last');

// 3. Only survey columns are new. Every legacy column except the JSON one is
//    carried over, so no existing data is left behind.
assert.deepStrictEqual(plan.appended.slice().sort(), PILOT_SURVEY_KEYS.slice().sort());
for (const k of legacy) {
  if (k !== 'survey') assert.ok(keys.includes(k), `legacy column ${k} has no place in the new layout`);
}

// 4. JSON expansion: a real survey lands in its cells, lists joined.
const good = pilotSurveyCellsFromJson(JSON.stringify({
  bedtimeTime: '19:30', bedtimeRoutine: ['bath', 'book'], anythingElse: 'hi',
}));
assert.ok(good.ok);
assert.deepStrictEqual(good.cells, { bedtimeTime: '19:30', bedtimeRoutine: 'bath, book', anythingElse: 'hi' });
assert.deepStrictEqual(good.unknown, []);

// 5. Blank is fine and empty; garbage and non-objects are flagged, never guessed.
assert.deepStrictEqual(pilotSurveyCellsFromJson(''), { ok: true, cells: {}, unknown: [] });
assert.strictEqual(pilotSurveyCellsFromJson('{not json').ok, false);
assert.strictEqual(pilotSurveyCellsFromJson('[1,2]').ok, false);
assert.strictEqual(pilotSurveyCellsFromJson('"text"').ok, false);

// 6. A key with no column is reported, so it is never dropped without a word.
const odd = pilotSurveyCellsFromJson(JSON.stringify({ stressLevel: 'low', favouriteColour: 'blue' }));
assert.deepStrictEqual(odd.cells, { stressLevel: 'low' });
assert.deepStrictEqual(odd.unknown, ['favouriteColour']);

console.log(`ok ... ${plan.moves.length} moves, 6 checks passed`);

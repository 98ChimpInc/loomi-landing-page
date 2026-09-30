// Runnable check for the "Add new columns" migration (#135) and the bedtime
// apps question it exists for. The sheet calls are Apps Script only; the risk is
// the plan, because an insert in the wrong place misfiles every later answer.
// Run: node scripts/tests/new-columns.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../../pilot.html', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};

eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(pick(/function pilotNewColumnsPlan\(titles\) \{[\s\S]*?\n\}/, 'pilotNewColumnsPlan'));

// Replays the plan as insertColumnAfter(pos - 1) does it: the new column lands
// at `pos` and everything from there shifts right. Written apart from the
// planner so it checks it rather than echoes it.
const titleOf = key => PILOT_HEADERS[PILOT_COLUMNS.findIndex(c => c[0] === key)];
const replay = (live, inserts) => {
  const grid = live.slice();
  for (const [pos, key] of inserts) {
    assert.ok(pos >= 1 && pos <= grid.length + 1, `insert at ${pos} is outside a ${grid.length}-wide tab`);
    grid.splice(pos - 1, 0, titleOf(key));
  }
  return grid;
};
const without = (...keys) => PILOT_COLUMNS.filter(c => !keys.includes(c[0])).map(c => c[1]);

// 1. The live tab today: every column but the two #135 adds. They go straight
//    after "Routine (other)", and nothing else moves.
const today = without('bedtimeApps', 'bedtimeAppsOther');
const plan = pilotNewColumnsPlan(today);
assert.strictEqual(plan.problem, undefined);
assert.deepStrictEqual(plan.inserts, [
  [PILOT_COL.bedtimeApps, 'bedtimeApps'],
  [PILOT_COL.bedtimeAppsOther, 'bedtimeAppsOther'],
]);
assert.strictEqual(PILOT_HEADERS[PILOT_COL.bedtimeApps - 2], 'Routine (other)');
assert.deepStrictEqual(replay(today, plan.inserts), PILOT_HEADERS);

// 2. A tab already current needs nothing, and trailing blank titles (the grid
//    is wider than the layout) are not columns.
assert.deepStrictEqual(pilotNewColumnsPlan(PILOT_HEADERS).inserts, []);
assert.deepStrictEqual(pilotNewColumnsPlan(PILOT_HEADERS.concat(['', ' ', null])).inserts, []);
assert.deepStrictEqual(pilotNewColumnsPlan(today.concat(['', ''])).inserts, plan.inserts);

// 3. Whitespace around a title is tolerated, as pilotAssertColumnLayout does.
assert.deepStrictEqual(pilotNewColumnsPlan(today.map(t => ' ' + t + ' ')).inserts, plan.inserts);

// 4. The ends: a missing first column inserts before column 1, a missing last
//    column appends.
const noFirst = without('timestamp');
assert.deepStrictEqual(pilotNewColumnsPlan(noFirst).inserts, [[1, 'timestamp']]);
assert.deepStrictEqual(replay(noFirst, [[1, 'timestamp']]), PILOT_HEADERS);
const noLast = without('notes');
assert.deepStrictEqual(pilotNewColumnsPlan(noLast).inserts, [[PILOT_COLUMNS.length, 'notes']]);
assert.deepStrictEqual(replay(noLast, pilotNewColumnsPlan(noLast).inserts), PILOT_HEADERS);

// 5. Any subset missing replays to the full layout. Deterministic, so a
//    failure reproduces.
let seed = 135;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let n = 0; n < 500; n++) {
  const live = PILOT_HEADERS.filter(() => rand() > 0.3);
  const p = pilotNewColumnsPlan(live);
  assert.strictEqual(p.problem, undefined, 'a subset of the layout is always plannable');
  assert.deepStrictEqual(replay(live, p.inserts), PILOT_HEADERS, 'subset ' + JSON.stringify(live));
}

// 6. Refusals. Each would put new columns beside the wrong neighbours, so each
//    names the column and inserts nothing.
const refuse = (live, col, why) => {
  const p = pilotNewColumnsPlan(live);
  assert.strictEqual(p.inserts, undefined, why + ' must not be planned');
  assert.ok(new RegExp('^column ' + col + ' ').test(p.problem), why + ': ' + p.problem);
};
const unknown = today.slice(); unknown.splice(3, 0, 'Something new');
refuse(unknown, 4, 'an unknown title');
const blank = today.slice(); blank[5] = '';
refuse(blank, 6, 'a blank title inside the layout');
const swapped = PILOT_HEADERS.slice();
[swapped[10], swapped[11]] = [swapped[11], swapped[10]];
refuse(swapped, 12, 'two titles out of order');
const renamed = today.map(t => (t === 'Bedtime routine' ? 'Routine' : t));
refuse(renamed, PILOT_COL.bedtimeRoutine, 'a renamed title');
refuse(PILOT_HEADERS.concat(['Extra']), PILOT_HEADERS.length + 1, 'a title past the layout');
// The pre-#102 layout has its own migration. Its ninth title, "Challenge", is
// not "Primary challenge", so this one refuses rather than half-converting it.
refuse(['Timestamp', 'Parent name', 'Email', 'Child age (months)', 'Age band', 'Device', 'Timezone',
        'Can commit', 'Challenge', 'Themes'], 9, 'the pre-#102 layout');

// 7. The question on the form: the options Soushiant listed, "none" first, and
//    the wiring that makes "none" exclusive and Other ask for detail.
const block = html.match(/<fieldset class="form-group" id="bedtime-apps-group">[\s\S]*?<\/fieldset>/);
assert.ok(block, 'the bedtime apps question is on the form');
const values = [...block[0].matchAll(/name="bedtimeApps" value="(\w+)"/g)].map(m => m[1]);
assert.deepStrictEqual(values, ['none', 'yoto', 'toniebox', 'moshi', 'calm', 'calm_kids', 'headspace',
  'headspace_kids', 'youtube', 'youtube_kids', 'spotify', 'apple_music', 'audiobooks', 'audible', 'other']);
assert.ok(/id="apps-none" name="bedtimeApps" value="none"/.test(block[0]));
assert.ok(/id="apps-other" name="bedtimeApps" value="other"/.test(block[0]));
assert.ok(/id="bedtimeAppsOtherText"/.test(block[0]));
assert.ok(html.includes("exclusiveOption('bedtimeApps', 'apps-none');"), '"none" is exclusive');
assert.ok(html.includes("toggleOtherField('apps-other', 'apps-other-field');"), 'Other shows its field');
assert.ok(/checkbox: 'apps-other', input: 'bedtimeAppsOtherText'/.test(html), 'Other needs its text');
assert.ok(html.indexOf('id="bedtime-routine-group"') < html.indexOf('id="bedtime-apps-group"') &&
          html.indexOf('id="bedtime-apps-group"') < html.indexOf('id="bedtime-difficulty-group"'),
          'the question sits between the routine and difficulty questions, as its column does');

// 8. Slugs, so the list cell's ", " join can never split one answer in two.
for (const v of values) assert.ok(/^[a-z_]+$/.test(v), v + ' is a slug');

console.log('ok ... 8 checks passed');

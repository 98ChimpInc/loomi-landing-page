// Runnable check for the pilot sheet layout (#95, #102). Apps Script is not a
// module, so the pieces are lifted out of Code.js by name and evaluated with a
// stub sheet. Run: node scripts/tests/column-layout.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../../pilot.html', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};

global.Logger = { log: () => {} };
eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(pick(/var PILOT_TEXT_KEYS = \[[\s\S]*?\];/, 'PILOT_TEXT_KEYS'));
eval(pick(/function pilotAssertColumnLayout\(sheet\) \{[\s\S]*?\n\}/, 'pilotAssertColumnLayout'));

// Bounded like the real grid: a range past the last column throws.
const sheetWith = (row1, maxColumns = Math.max(row1.length, 26)) => ({
  getMaxColumns: () => maxColumns,
  getRange: (_r, c, _nr, n) => {
    if (c + n - 1 > maxColumns) throw new Error('outside the dimensions of the sheet');
    return { getValues: () => [row1.slice(0, n)] };
  },
});
const keys = PILOT_COLUMNS.map(c => c[0]);

// 1. The layout passes against its own titles.
assert.strictEqual(pilotAssertColumnLayout(sheetWith(PILOT_HEADERS)), null);

// 2. A blank title is refused now. Tolerating it is how the child's name and
//    the survey went unlabelled on the live tab for a week.
const blank = PILOT_HEADERS.slice(); blank[3] = '';
assert.ok(/column 4/.test(pilotAssertColumnLayout(sheetWith(blank)) || ''),
  'a blank title must be refused and named');

// 3. An inserted column shifts every title after it, and is refused.
const shifted = PILOT_HEADERS.slice(0, 5).concat(['Something new'], PILOT_HEADERS.slice(5));
assert.ok(pilotAssertColumnLayout(sheetWith(shifted)), 'an inserted column must be refused');

// 3b. A tab narrower than the layout (a legacy tab is 26 wide) is refused, not
//     thrown on. The migration's first step is this check.
const legacyTitles = ['Timestamp', 'Parent name', 'Email', 'Child age (months)'];
assert.ok(pilotAssertColumnLayout(sheetWith(legacyTitles, 26)), 'a narrow legacy tab must be refused');

// 4. Keys and titles are unique, and every column the code names exists. A
//    typo in PILOT_COL.<key> would otherwise be getRange(row, undefined).
assert.strictEqual(new Set(keys).size, keys.length, 'duplicate column key');
assert.strictEqual(new Set(PILOT_HEADERS).size, PILOT_HEADERS.length, 'duplicate column title');
const named = new Set([...src.matchAll(/PILOT_COL\.(\w+)/g)].map(m => m[1]));
for (const k of named) assert.ok(PILOT_COL[k], `Code.js reads PILOT_COL.${k}, which is not a column`);
for (const k of PILOT_TEXT_KEYS.concat(PILOT_SURVEY_KEYS, PILOT_LIST_KEYS)) {
  assert.ok(PILOT_COL[k], `${k} is listed but has no column`);
}

// 5. THE CONTRACT WITH THE FORM. Every survey key pilot.html posts has a
//    column, and every survey column is something the form posts. A key on
//    one side only is an answer silently dropped, or a column that stays empty.
const surveyBlock = html.match(/survey: \{([\s\S]*?)\n\s*\},/)[1];
const posted = [...surveyBlock.matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
assert.deepStrictEqual(posted.slice().sort(), PILOT_SURVEY_KEYS.slice().sort(),
  'pilot.html survey keys and PILOT_SURVEY_KEYS must match');

// 6. Survey columns sit in the order the form asks them.
const surveyOrder = keys.filter(k => PILOT_SURVEY_KEYS.includes(k));
assert.deepStrictEqual(surveyOrder, posted, 'survey columns must follow the form order');

// 7. Round trip: what the intake writes, the fan-out reads back as the same survey.
const survey = {
  bedtimeTime: '19:30', bedtimeHandler: 'shared', settleTime: '10_to_20',
  bedtimeRoutine: ['bath', 'book'], routineOther: '', bedtimeDifficulty: 'mixed',
  bedtimeChallenges: ['resistance', 'other'], challengesOther: 'the dog, mostly',
  resistFrequency: 'sometimes', stressLevel: 'moderate', improvementWish: 'faster',
  wishOther: '', themesOther: '', anythingElse: 'thanks, this is lovely',
};
const row = pilotRowFromRecord(Object.assign({ email: 'a@b.co', themes: ['calm', 'courage'] }, survey));
assert.strictEqual(row.length, PILOT_COLUMNS.length);
assert.strictEqual(row[PILOT_COL.bedtimeRoutine - 1], 'bath, book');
assert.strictEqual(row[PILOT_COL.themes - 1], 'calm, courage');
assert.deepStrictEqual(pilotSurveyFromRow(row), survey, 'the survey must survive the sheet unchanged');
assert.deepStrictEqual(pilotListFromCell(row[PILOT_COL.themes - 1]), ['calm', 'courage']);

// 8. A row with no survey answers fans out null, as it did before the survey
//    columns existed, rather than an object of blanks.
assert.strictEqual(pilotSurveyFromRow(pilotRowFromRecord({ email: 'a@b.co' })), null);

console.log('ok ... 8 checks passed');

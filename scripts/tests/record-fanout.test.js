// Runnable check for the intake write and the fan-out read after #102 moved
// every column. The risk is a field landing in, or read from, the wrong place:
// nothing throws, the row looks full, and Firestore gets the wrong answer.
// Run: node scripts/tests/record-fanout.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};
const fn = (name) => pick(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'), name);

global.Logger = { log: () => {} };
let posted = null;
global.UrlFetchApp = { fetch: (_url, opts) => { posted = JSON.parse(opts.payload); return { getResponseCode: () => 200 }; } };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'secret' }) };

eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(pick(/var PILOT_MIN_BAND_MONTHS = \d+;/, 'PILOT_MIN_BAND_MONTHS'));
eval(pick(/var PILOT_PLACE_HOLDING_STATUSES = \[[^\]]*\];/, 'PILOT_PLACE_HOLDING_STATUSES'));
eval(pick(/var PILOT_FANOUT_ENABLED = [\s\S]*?var PILOT_FANOUT_SECRET_PROPERTY = [^;]*;/, 'fan-out settings'));
// One direct eval at top level, so the functions share this scope with the
// columns above (an eval inside a callback would scope them to the callback).
eval(['pilotAgeBand', 'pilotMergedNotes', 'findPilotRowByEmail', 'countPilotActiveApplicants',
      'pilotRecordApplicant', 'pilotAssertColumnLayout', 'pilotNoteFanOutFailure', 'pilotFanOut']
  .map(fn).join('\n'));

// A grid with the real bounds and the real 1-based addressing.
function fakeSheet(headers) {
  const rows = [headers.slice()];
  const width = headers.length;
  const range = (r, c, nr = 1, nc = 1) => {
    if (c + nc - 1 > width) throw new Error('outside the dimensions of the sheet');
    return {
      getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
      getValue: () => ((rows[r - 1] || [])[c - 1] ?? ''),
      setValues: (vals) => vals.forEach((line, i) => line.forEach((v, j) => {
        rows[r - 1 + i] = rows[r - 1 + i] || Array(width).fill('');
        rows[r - 1 + i][c - 1 + j] = v;
      })),
      setValue: (v) => { rows[r - 1] = rows[r - 1] || Array(width).fill(''); rows[r - 1][c - 1] = v; },
    };
  };
  return {
    rows,
    getMaxColumns: () => width,
    getLastRow: () => rows.length,
    getRange: range,
    appendRow: (vals) => { assert.strictEqual(vals.length, width, 'appendRow width'); rows.push(vals.slice()); },
  };
}
const at = (sheet, row, key) => sheet.rows[row - 1][PILOT_COL[key] - 1];

const survey = {
  bedtimeTime: '19:30', bedtimeHandler: 'shared', settleTime: '10_to_20',
  bedtimeRoutine: ['bath', 'book'], routineOther: '', bedtimeDifficulty: 'mixed',
  bedtimeChallenges: ['resistance'], challengesOther: '', resistFrequency: 'sometimes',
  stressLevel: 'moderate', improvementWish: 'faster', wishOther: '', themesOther: '',
  anythingElse: 'thanks',
};
const applicant = (over) => Object.assign({
  parentName: 'Sam Parent', email: 'sam@example.com', childAgeMonths: 36, band: '3-4',
  audience: { segment: 'sleep', tie: false }, themes: ['calm'], device: 'ios',
  tz: 'America/Toronto', canCommit: '', challenge: 'resistance', challengeOther: '',
  childSex: 'girl', childName: 'Ava', survey,
}, over);
const config = { capacity: 10, cohortStartDate: '2026-10-05' };

// 1. A first submission lands every field under its own title.
const sheet = fakeSheet(PILOT_HEADERS);
const first = pilotRecordApplicant(sheet, config, applicant());
assert.strictEqual(first.row, 2);
assert.strictEqual(first.outcome, 'eligible');
assert.strictEqual(at(sheet, 2, 'childName'), 'Ava');
assert.strictEqual(at(sheet, 2, 'childSex'), 'girl');
assert.strictEqual(at(sheet, 2, 'status'), 'new');
assert.strictEqual(at(sheet, 2, 'bedtimeRoutine'), 'bath, book');
assert.strictEqual(at(sheet, 2, 'anythingElse'), 'thanks');
assert.strictEqual(at(sheet, 2, 'themes'), 'calm');

// 2. Anything outside the known survey keys is not written anywhere.
const probe = fakeSheet(PILOT_HEADERS);
pilotRecordApplicant(probe, config,
  applicant({ email: 'x@example.com', survey: Object.assign({ injected: '=HYPERLINK("x")' }, survey) }));
assert.ok(!probe.rows[1].some(v => /HYPERLINK/.test(String(v))), 'an unknown survey key must not reach the sheet');

// 3. A resubmission keeps what the operator and the first submission own.
const stamp = at(sheet, 2, 'timestamp');
sheet.rows[1][PILOT_COL.status - 1] = 'approved';
sheet.rows[1][PILOT_COL.invitationCode - 1] = 'ABC234';
sheet.rows[1][PILOT_COL.approvalEmailSentAt - 1] = 'sent-date';
sheet.rows[1][PILOT_COL.notes - 1] = 'called them';
const again = pilotRecordApplicant(sheet, config,
  applicant({ childAgeMonths: 90, band: null, childSex: 'prefer_not_to_say', survey: Object.assign({}, survey, { stressLevel: 'high' }) }));
assert.strictEqual(again.row, 2, 'a resubmission must reuse the row');
assert.strictEqual(sheet.rows.length, 2, 'and must not append');
assert.strictEqual(at(sheet, 2, 'timestamp'), stamp);
assert.strictEqual(at(sheet, 2, 'invitationCode'), 'ABC234');
assert.strictEqual(at(sheet, 2, 'approvalEmailSentAt'), 'sent-date');
assert.strictEqual(at(sheet, 2, 'status'), 'approved');
assert.ok(/called them/.test(at(sheet, 2, 'notes')) && /place kept/.test(at(sheet, 2, 'notes')));
assert.strictEqual(at(sheet, 2, 'childAgeMonths'), 36, 'an approved place keeps its age');
assert.strictEqual(at(sheet, 2, 'band'), '3-4');
assert.strictEqual(at(sheet, 2, 'childSex'), 'prefer_not_to_say', 'child sex updates on resubmission');
assert.strictEqual(at(sheet, 2, 'stressLevel'), 'high', 'survey answers update on resubmission');

// 4. The fan-out sends the same payload shape it did before the move.
pilotFanOut(sheet, 2, null);
assert.ok(posted, 'fan-out must post');
assert.deepStrictEqual(Object.keys(posted).sort(), ['approvalEmailSentAt', 'audience', 'band', 'canCommit',
  'challenge', 'childAgeMonths', 'childName', 'childSex', 'codeIssuedAt', 'device', 'email',
  'invitationCode', 'parentName', 'source', 'status', 'submittedAt', 'survey', 'themes', 'tz', 'updatedAt']);
assert.strictEqual(posted.email, 'sam@example.com');
assert.strictEqual(posted.childName, 'Ava');
assert.strictEqual(posted.invitationCode, 'ABC234');
assert.strictEqual(posted.band, '3-4', 'band is recomputed from months');
assert.deepStrictEqual(posted.themes, ['calm']);
assert.deepStrictEqual(posted.survey, Object.assign({}, survey, { stressLevel: 'high' }));

// 5. A tab in the old layout is refused before anything is sent, and the
//    refusal lands in a cell that exists.
posted = null;
const legacyish = fakeSheet(['Timestamp', 'Parent name', 'Email', 'Child age (months)'].concat(Array(27).fill('')));
legacyish.rows.push(Array(31).fill(''));
pilotFanOut(legacyish, 2, null);
assert.strictEqual(posted, null, 'nothing may be sent through the wrong layout');
assert.ok(/column layout changed/.test(legacyish.rows[1][PILOT_COL.notes - 1]));

console.log('ok ... 5 checks passed');

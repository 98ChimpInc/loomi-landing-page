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
// What the endpoint answers, per payload. It answers 200 {ok:true} unless a check says otherwise.
let answer = () => ({ code: 200, body: '{"ok":true}' });
const events = [];
global.UrlFetchApp = { fetch: (_url, opts) => {
  posted = JSON.parse(opts.payload);
  events.push('fanout:' + posted.email);
  const a = answer(posted);
  if (a.throws) throw new Error(a.throws);
  return { getResponseCode: () => a.code, getContentText: () => a.body };
} };
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
// No start date: enrolment is rolling, so the config tab carries none (#116).
const config = { capacity: 10 };

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
assert.strictEqual(first.acknowledge, true, 'an eligible applicant gets the welcome email without a start date');
assert.strictEqual(first.resubmitted, false, 'a first submission is not a resubmission');
assert.ok(!/start date/i.test(at(sheet, 2, 'notes')), 'no note may blame a missing start date');

// 2. Anything outside the known survey keys is not written anywhere.
const probe = fakeSheet(PILOT_HEADERS);
pilotRecordApplicant(probe, config,
  applicant({ email: 'x@example.com', survey: Object.assign({ injected: '=HYPERLINK("x")' }, survey) }));
assert.ok(!probe.rows[1].some(v => /HYPERLINK/.test(String(v))), 'an unknown survey key must not reach the sheet');

// 3. A resubmission keeps what the operator and the first submission own.
const stamp = at(sheet, 2, 'timestamp');
sheet.rows[1][PILOT_COL.status - 1] = 'approved';
sheet.rows[1][PILOT_COL.approvalEmailSentAt - 1] = 'sent-date';
sheet.rows[1][PILOT_COL.notes - 1] = 'called them';
const again = pilotRecordApplicant(sheet, config,
  applicant({ childAgeMonths: 90, band: null, childSex: 'prefer_not_to_say', survey: Object.assign({}, survey, { stressLevel: 'high' }) }));
assert.strictEqual(again.row, 2, 'a resubmission must reuse the row');
assert.strictEqual(again.resubmitted, true, 'a reused row is reported as a resubmission');
assert.strictEqual(sheet.rows.length, 2, 'and must not append');
assert.strictEqual(at(sheet, 2, 'timestamp'), stamp);
assert.strictEqual(at(sheet, 2, 'approvalEmailSentAt'), 'sent-date');
assert.strictEqual(at(sheet, 2, 'status'), 'approved');
assert.ok(/called them/.test(at(sheet, 2, 'notes')) && /place kept/.test(at(sheet, 2, 'notes')));
assert.strictEqual(at(sheet, 2, 'childAgeMonths'), 36, 'an approved place keeps its age');
assert.strictEqual(at(sheet, 2, 'band'), '3-4');
assert.strictEqual(at(sheet, 2, 'childSex'), 'prefer_not_to_say', 'child sex updates on resubmission');
assert.strictEqual(at(sheet, 2, 'stressLevel'), 'high', 'survey answers update on resubmission');

// 4. The fan-out sends every field the endpoint reads, and no invitation code (#118).
assert.strictEqual(pilotFanOut(sheet, 2), true, 'a 200 the endpoint applied is a yes');
assert.ok(posted, 'fan-out must post');
assert.deepStrictEqual(Object.keys(posted).sort(), ['approvalEmailSentAt', 'audience', 'band', 'canCommit',
  'challenge', 'childAgeMonths', 'childName', 'childSex', 'device', 'email',
  'parentName', 'source', 'status', 'submittedAt', 'survey', 'themes', 'tz', 'updatedAt']);
assert.strictEqual(posted.email, 'sam@example.com');
assert.strictEqual(posted.childName, 'Ava');
assert.strictEqual(posted.status, 'approved');
assert.strictEqual(posted.band, '3-4', 'band is recomputed from months');
assert.deepStrictEqual(posted.themes, ['calm']);
assert.deepStrictEqual(posted.survey, Object.assign({}, survey, { stressLevel: 'high' }));

// 5. A tab in the old layout is refused before anything is sent, and the
//    refusal lands in a cell that exists.
posted = null;
const legacyish = fakeSheet(['Timestamp', 'Parent name', 'Email', 'Child age (months)'].concat(Array(27).fill('')));
legacyish.rows.push(Array(31).fill(''));
assert.strictEqual(pilotFanOut(legacyish, 2), false, 'a refused layout is a no');
assert.strictEqual(posted, null, 'nothing may be sent through the wrong layout');
assert.ok(/column layout changed/.test(legacyish.rows[1][PILOT_COL.notes - 1]));


// 6. Only a write the endpoint applied counts. Anything else is a no, and the
//    row's Notes say why, because the approval email waits on this answer.
const noteOf = (s, row) => String(s.rows[row - 1][PILOT_COL.notes - 1]);
const refused = [
  [{ code: 401, body: '{"ok":false}' }, /HTTP 401/],
  [{ code: 500, body: 'boom' }, /HTTP 500 \.\.\. boom/],
  [{ code: 200, body: '{"ok":true,"throttled":true}' }, /throttled/],
  [{ throws: 'DNS failure' }, /DNS failure/],
];
for (const [reply, note] of refused) {
  const s = fakeSheet(PILOT_HEADERS);
  pilotRecordApplicant(s, config, applicant());
  answer = () => reply;
  assert.strictEqual(pilotFanOut(s, 2), false, 'not applied must be a no: ' + JSON.stringify(reply));
  assert.ok(note.test(noteOf(s, 2)), 'the Notes must say why: ' + noteOf(s, 2));
}
answer = () => ({ code: 200, body: '{"ok":true}' });
PILOT_FANOUT_ENABLED = false;
assert.strictEqual(pilotFanOut(sheet, 2), false, 'a disabled fan-out wrote nothing, so it is a no');
PILOT_FANOUT_ENABLED = true;

// 7. Approval is one step (#118): Firestore hears first, and the email only
//    goes to an approved family, on either device, whose approval it took.
eval(fn('sendPilotApprovalToSelectedRows'));
let alerted = '';
global.SpreadsheetApp = { getUi: () => ({ alert: (text) => { alerted = text; } }) };
global.Utilities = { sleep: () => {} };
let active = null;
global.getActivePilotSheetOrWarn = () => active;
global.sendPilotApproval = (name, email, device) => events.push('email:' + email + ':' + device);

active = fakeSheet(PILOT_HEADERS);
const family = (email, status, device, sentAt) => {
  const line = Array(PILOT_HEADERS.length).fill('');
  line[PILOT_COL.parentName - 1] = 'Parent';
  line[PILOT_COL.email - 1] = email;
  line[PILOT_COL.status - 1] = status;
  line[PILOT_COL.device - 1] = device;
  line[PILOT_COL.approvalEmailSentAt - 1] = sentAt || '';
  active.rows.push(line);
};
family('ok@example.com',      'approved',     'ios');
family('android@example.com', 'approved',     'android');
family('new@example.com',     'new',          'ios');
family('sent@example.com',    'approved',     'ios', 'sent-date');
family('fail@example.com',    'approved',     'ios');
family('',                    'approved',     'ios');
family('case@example.com',    ' Approved ',   ' iOS ');
family('wait@example.com',    'waitlisted',   'ios');
active.getActiveRangeList = () => ({ getRanges: () => [{ getRow: () => 1, getNumRows: () => active.rows.length }] });
answer = (p) => p.email === 'fail@example.com' ? { code: 500, body: 'boom' } : { code: 200, body: '{"ok":true}' };
events.length = 0;
sendPilotApprovalToSelectedRows();

assert.deepStrictEqual(events, [
  'fanout:ok@example.com', 'email:ok@example.com:ios',
  'fanout:android@example.com', 'email:android@example.com:android',
  'fanout:fail@example.com',
  'fanout:case@example.com', 'email:case@example.com:ios',
], 'fan-out must come first, and only an applied fan-out may be followed by an email');
const sentStamp = (row) => active.rows[row - 1][PILOT_COL.approvalEmailSentAt - 1];
assert.ok(sentStamp(2) instanceof Date, 'a sent approval is stamped');
assert.ok(sentStamp(3) instanceof Date, 'an Android approval is sent and stamped too (loomi-firebase#37)');
assert.strictEqual(sentStamp(6), '', 'a refused approval is not stamped, so the next run retries it');
assert.ok(/HTTP 500/.test(noteOf(active, 6)), 'and its Notes say why');
assert.strictEqual(sentStamp(5), 'sent-date', 'an earlier send is left alone');
for (const [label, n] of [['Sent', 3], ['status is not approved', 2],
                          ['already sent', 1], ['missing email', 1], ['Firestore did not take the approval', 1]]) {
  assert.ok(new RegExp(label + '[^:]*: ' + n + '(\\n|$)').test(alerted), label + ' must count ' + n + ':\n' + alerted);
}
assert.ok(!/device/i.test(alerted), 'no device is skipped, so the summary does not count one');

console.log('ok ... 7 checks passed');

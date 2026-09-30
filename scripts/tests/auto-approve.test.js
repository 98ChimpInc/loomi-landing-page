// Runnable check for the Auto-approve switch (#133). The risks: the switch
// approving someone the age or capacity rules would have held back, an
// approval email going out before Firestore holds the approval, and a family
// getting a second approval email when they resubmit.
// Run: node scripts/tests/auto-approve.test.js
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
const events = [];
let fanOutAnswer = () => ({ code: 200, body: '{"ok":true}' });
global.UrlFetchApp = { fetch: (_url, opts) => {
  const posted = JSON.parse(opts.payload);
  events.push('fanout:' + posted.email + ':' + posted.status);
  const a = fanOutAnswer(posted);
  return { getResponseCode: () => a.code, getContentText: () => a.body };
} };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'secret' }) };
// Stand-ins for the two emails, so the order against the fan-out is visible.
global.sendPilotApproval = (name, email, device) => events.push('approval:' + email + ':' + device);
global.sendPilotAcknowledgement = (name, email) => events.push('ack:' + email);

var APP_STORE_LINK = 'app-store', PLAY_STORE_LINK = 'play-store', PILOT_CONFIG_SHEET_NAME = 'Pilot Config';
eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(pick(/var PILOT_MIN_BAND_MONTHS = \d+;/, 'PILOT_MIN_BAND_MONTHS'));
eval(pick(/var PILOT_PLACE_HOLDING_STATUSES = \[[^\]]*\];/, 'PILOT_PLACE_HOLDING_STATUSES'));
eval(pick(/var PILOT_FANOUT_ENABLED = [\s\S]*?var PILOT_FANOUT_SECRET_PROPERTY = [^;]*;/, 'fan-out settings'));
eval(['pilotAgeBand', 'pilotMergedNotes', 'findPilotRowByEmail', 'countPilotActiveApplicants',
      'pilotRecordApplicant', 'pilotAssertColumnLayout', 'pilotNoteFanOutFailure', 'pilotFanOut',
      'pilotDeliverApplicant', 'readPilotConfig', 'pilotOutcomeMessage']
  .map(fn).join('\n'));

function fakeSheet(headers) {
  const rows = [headers.slice()];
  const width = headers.length;
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    getValue: () => ((rows[r - 1] || [])[c - 1] ?? ''),
    setValues: (vals) => vals.forEach((line, i) => line.forEach((v, j) => {
      rows[r - 1 + i] = rows[r - 1 + i] || Array(width).fill('');
      rows[r - 1 + i][c - 1 + j] = v;
    })),
    setValue: (v) => { rows[r - 1] = rows[r - 1] || Array(width).fill(''); rows[r - 1][c - 1] = v; },
  });
  return {
    rows,
    getMaxColumns: () => width,
    getLastRow: () => rows.length,
    getRange: range,
    appendRow: (vals) => rows.push(vals.slice()),
  };
}
const at = (sheet, row, key) => sheet.rows[row - 1][PILOT_COL[key] - 1];

const applicant = (over) => Object.assign({
  parentName: 'Sam Parent', email: 'sam@example.com', childAgeMonths: 36, band: '3-4',
  audience: { segment: 'sleep', tie: false }, themes: ['calm'], device: 'android',
  tz: 'America/Toronto', canCommit: '', challenge: 'resistance', challengeOther: '',
  childSex: 'girl', childName: 'Ava', survey: {},
}, over);

// Record then deliver, the way doPost does it.
function signUp(sheet, config, over) {
  const a = applicant(over);
  const recorded = pilotRecordApplicant(sheet, config, a);
  return { recorded, outcome: pilotDeliverApplicant(sheet, recorded, a, config) };
}

// 1. Switch off: unchanged. The row waits at "new" and gets the welcome email.
{
  events.length = 0;
  const sheet = fakeSheet(PILOT_HEADERS);
  const r = signUp(sheet, { capacity: 10, autoApprove: false });
  assert.strictEqual(r.outcome, 'eligible');
  assert.strictEqual(at(sheet, 2, 'status'), 'new');
  assert.strictEqual(at(sheet, 2, 'approvalEmailSentAt'), '');
  assert.deepStrictEqual(events, ['fanout:sam@example.com:new', 'ack:sam@example.com']);
}

// 2. A config object without the key is off too.
{
  events.length = 0;
  const sheet = fakeSheet(PILOT_HEADERS);
  assert.strictEqual(signUp(sheet, { capacity: 10 }).outcome, 'eligible');
  assert.strictEqual(at(sheet, 2, 'status'), 'new');
}

// 3. Switch on: approved, fanned out as approved, THEN one approval email, then stamped.
{
  events.length = 0;
  const sheet = fakeSheet(PILOT_HEADERS);
  const r = signUp(sheet, { capacity: 10, autoApprove: true });
  assert.strictEqual(r.outcome, 'approved');
  assert.strictEqual(at(sheet, 2, 'status'), 'approved');
  assert.ok(at(sheet, 2, 'approvalEmailSentAt') instanceof Date, 'the send is stamped');
  assert.deepStrictEqual(events, ['fanout:sam@example.com:approved', 'approval:sam@example.com:android'],
    'Firestore takes the approval before the email, and no welcome email doubles it');

  // 3b. The same family resubmits: place kept, nothing sent again.
  events.length = 0;
  const again = signUp(sheet, { capacity: 10, autoApprove: true });
  assert.strictEqual(again.outcome, 'eligible');
  assert.strictEqual(again.recorded.autoApproved, false);
  assert.ok(!events.some(e => /^(approval|ack):/.test(e)), 'a resubmission sends no second email');
  assert.ok(at(sheet, 2, 'approvalEmailSentAt') instanceof Date, 'the first stamp survives');
}

// 4. Switch on, fan-out refused: no approval email, row approved and unsent so
// the menu step retries it, and the applicant is told what is true.
{
  events.length = 0;
  fanOutAnswer = () => ({ code: 401, body: 'nope' });
  const sheet = fakeSheet(PILOT_HEADERS);
  const r = signUp(sheet, { capacity: 10, autoApprove: true });
  fanOutAnswer = () => ({ code: 200, body: '{"ok":true}' });
  assert.strictEqual(r.outcome, 'eligible', 'not "approved" when the approval never reached Firestore');
  assert.strictEqual(at(sheet, 2, 'status'), 'approved');
  assert.strictEqual(at(sheet, 2, 'approvalEmailSentAt'), '', 'left unsent, so Approve & Send retries it');
  assert.ok(!events.some(e => e.startsWith('approval:')));
  assert.ok(events.includes('ack:sam@example.com'), 'the welcome email still goes');
}

// 5. Switch on never beats capacity.
{
  events.length = 0;
  const sheet = fakeSheet(PILOT_HEADERS);
  signUp(sheet, { capacity: 1, autoApprove: true }, { email: 'first@example.com' });
  const r = signUp(sheet, { capacity: 1, autoApprove: true }, { email: 'second@example.com' });
  assert.strictEqual(r.outcome, 'waitlisted');
  assert.strictEqual(at(sheet, 3, 'status'), 'waitlisted');
  assert.ok(!events.includes('approval:second@example.com:android'));
}

// 6. Switch on never beats the age rules, in either direction.
{
  events.length = 0;
  const sheet = fakeSheet(PILOT_HEADERS);
  const young = signUp(sheet, { capacity: 10, autoApprove: true }, { email: 'young@example.com', childAgeMonths: 12, band: null });
  const old = signUp(sheet, { capacity: 10, autoApprove: true }, { email: 'old@example.com', childAgeMonths: 90, band: null });
  assert.strictEqual(young.outcome, 'waitlisted_age');
  assert.strictEqual(old.outcome, 'ineligible_age');
  assert.strictEqual(at(sheet, 2, 'status'), 'waitlisted');
  assert.strictEqual(at(sheet, 3, 'status'), 'ineligible');
  assert.ok(!events.some(e => e.startsWith('approval:')));
}

// 7. A family already waiting at "new" when the switch goes on is approved by
// their own resubmission, not swept up by anything else.
{
  events.length = 0;
  const sheet = fakeSheet(PILOT_HEADERS);
  signUp(sheet, { capacity: 10, autoApprove: false });
  events.length = 0;
  const r = signUp(sheet, { capacity: 10, autoApprove: true });
  assert.strictEqual(r.outcome, 'approved');
  assert.strictEqual(events.filter(e => e.startsWith('approval:')).length, 1);
}

// 8. readPilotConfig: only a ticked box turns it on.
function configWith(value) {
  const rows = [['Key', 'Value'], ['Capacity', 40], ['Auto-approve', value]];
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => ({
    getLastRow: () => rows.length,
    getRange: (r, c) => ({ getValue: () => rows[r - 1][c - 1] }),
  }) }) };
  return readPilotConfig();
}
assert.strictEqual(configWith(true).autoApprove, true, 'a ticked checkbox');
assert.strictEqual(configWith('TRUE').autoApprove, true, 'typed TRUE');
assert.strictEqual(configWith(false).autoApprove, false, 'an unticked checkbox');
assert.strictEqual(configWith('').autoApprove, false, 'a blank cell');
assert.strictEqual(configWith('yes').autoApprove, false, 'a stray value is not consent');
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) };
assert.strictEqual(readPilotConfig().autoApprove, false, 'no config tab');

// 9. The approved outcome has its own copy, not "over the next few days".
assert.ok(/on its way now/.test(pilotOutcomeMessage('approved')));

console.log('auto-approve: all checks passed');

// Runnable check for the hello@ heads-up on every pilot application (#125).
// The risk is silence: a submission the team never hears about, or a Gmail
// failure that turns a saved application into an error for the parent.
// Run: node scripts/tests/team-notification.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};
const fn = (name) => pick(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'), name);

// ---- The Apps Script services, recorded rather than called ----
const logs = [];
global.Logger = { log: (m) => logs.push(m) };
global.LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getUrl: () => 'https://sheet.example/x', getSheetByName: () => ({ getRange: () => ({ setValue: () => {} }) }) }),
};
let sent = [];
let gmailFails = () => false;
global.GmailApp = { sendEmail: (to, subject, body, opts) => {
  if (gmailFails(to)) throw new Error('Service invoked too many times: email');
  sent.push({ to, subject, body, opts });
} };

// ---- The intake's collaborators, stubbed so each case controls one thing ----
let config;
let recordResult;
let fanOutThrows = false;
let acknowledged = [];
global.ensurePilotSheets = () => {};
global.readPilotConfig = () => config;
global.pilotAssertColumnLayout = () => '';
global.pilotAgeBand = () => '3-4';
global.derivePilotAudience = () => ({ segment: 'sleep', tie: false });
global.pilotRecordApplicant = () => recordResult;
global.pilotFanOut = () => { if (fanOutThrows) throw new Error('fan-out down'); return true; };
global.sendPilotAcknowledgement = (name, email) => acknowledged.push(email);
let approved = [];
global.sendPilotApproval = (name, email) => approved.push(email);
global.PILOT_COL = { approvalEmailSentAt: 5 };
global.sendPilotClosedNotification = (name, email) => GmailApp.sendEmail(email, 'closed', '', {});
global.pilotOutcomeMessage = (o) => 'message for ' + o;
global.PILOT_SHEET_NAME = 'Pilot Applicants';

eval(pick(/var PILOT_TEAM_EMAIL = "[^"]*";/, 'PILOT_TEAM_EMAIL'));
eval(['pilotError', 'pilotIntegerOrNull', 'pilotTeamNotification', 'sendPilotTeamNotification',
      'pilotDeliverApplicant', 'pilotSurveyWithLegacyKeys', 'handlePilotSubmission'].map(fn).join('\n'));

const TEAM = 'hello@loomi.kids';
const teamMail = () => sent.filter(m => m.to === TEAM);
const payload = (over) => Object.assign({
  form: 'pilot', parentName: 'Sam Parent', email: 'sam@example.com', childAgeMonths: '36',
  device: 'ios', tz: 'America/Toronto', elapsedMs: 20000, themes: ['calm'], survey: {},
}, over);
const reset = (over) => {
  sent = []; acknowledged = []; approved = []; logs.length = 0; fanOutThrows = false; gmailFails = () => false;
  config = { accepting: true, capacity: 10, appStoreUrl: 'a', playStoreUrl: 'p' };
  recordResult = Object.assign({ row: 7, outcome: 'eligible', acknowledge: true, resubmitted: false }, over);
};

assert.strictEqual(PILOT_TEAM_EMAIL, TEAM);

// 1. A recorded application sends exactly one heads-up, alongside the welcome.
reset();
let res = handlePilotSubmission(payload());
assert.strictEqual(res.result, 'success');
assert.strictEqual(res.outcome, 'eligible');
assert.strictEqual(teamMail().length, 1, 'one heads-up per application');
assert.deepStrictEqual(acknowledged, ['sam@example.com'], 'the applicant still gets their welcome');
assert.strictEqual(teamMail()[0].subject, 'Pilot application: eligible');
assert.strictEqual(teamMail()[0].opts.from, TEAM);
for (const part of ['Parent: Sam Parent', 'Email: sam@example.com', "Child's age: 36 months",
                    'Device: ios', 'Time zone: America/Toronto', 'Outcome: eligible', 'Sheet row: 7',
                    'Applicants: https://sheet.example/x']) {
  assert.ok(teamMail()[0].body.includes(part), 'body must include "' + part + '"');
}

// 2. Every recorded outcome is reported, not only the eligible one.
for (const outcome of ['waitlisted', 'waitlisted_age', 'ineligible_age']) {
  reset({ outcome, acknowledge: false });
  res = handlePilotSubmission(payload());
  assert.strictEqual(res.outcome, outcome);
  assert.strictEqual(teamMail().length, 1, outcome + ' must reach the team');
  assert.strictEqual(teamMail()[0].subject, 'Pilot application: ' + outcome);
  assert.deepStrictEqual(acknowledged, [], outcome + ' gets no welcome');
}

// 3. A resubmission says so, in the subject and against the row.
reset({ resubmitted: true, acknowledge: false });
handlePilotSubmission(payload());
assert.strictEqual(teamMail()[0].subject, 'Pilot application: eligible (resubmitted)');
assert.ok(teamMail()[0].body.includes('Sheet row: 7 (updated from an earlier application)'));

// 4. A Gmail failure on the heads-up is logged, and the parent's answer is unchanged.
reset();
gmailFails = (to) => to === TEAM;
res = handlePilotSubmission(payload());
assert.strictEqual(res.result, 'success', 'a failed heads-up must not become an error for the parent');
assert.strictEqual(res.message, 'message for eligible');
assert.ok(logs.some(l => /Pilot team email failed for sam@example.com/.test(l)));

// 5. A failed fan-out does not cost the team the heads-up.
reset();
fanOutThrows = true;
res = handlePilotSubmission(payload());
assert.strictEqual(res.result, 'success');
assert.strictEqual(teamMail().length, 1, 'the heads-up is independent of the fan-out');

// 6. Refused submissions send nothing to anyone.
for (const [label, over] of [['honeypot', { website: 'x' }], ['too fast', { elapsedMs: 500 }],
                             ['no name', { parentName: '  ' }], ['bad email', { email: 'nope' }],
                             ['no age', { childAgeMonths: 'three' }]]) {
  reset();
  res = handlePilotSubmission(payload(over));
  assert.strictEqual(res.result, 'error', label + ' must be refused');
  assert.strictEqual(sent.length, 0, label + ' must send nothing');
}

// 7. A closed pilot still tells the team, marked closed and not recorded.
reset();
config.accepting = false;
res = handlePilotSubmission(payload({ childAgeMonths: 'x' }));
assert.strictEqual(res.outcome, 'pilot_closed');
assert.deepStrictEqual(sent.map(m => m.to), ['sam@example.com', TEAM], 'closed email, then the heads-up');
assert.strictEqual(teamMail()[0].subject, '[closed] Pilot application, not recorded');
assert.ok(teamMail()[0].body.includes("Child's age: not given"), 'an unreadable age is said plainly');
assert.ok(teamMail()[0].body.includes('was not recorded'));
assert.ok(!teamMail()[0].body.includes('Sheet row'), 'nothing was recorded, so there is no row');

// 8. Closed, a failing closed email neither blocks the heads-up nor errors for the visitor.
reset();
config.accepting = false;
gmailFails = (to) => to === 'sam@example.com';
res = handlePilotSubmission(payload());
assert.strictEqual(res.outcome, 'pilot_closed');
assert.strictEqual(teamMail().length, 1);

// 9. Closed, a bot or an unusable address gets nothing, and the team hears nothing.
for (const over of [{ website: 'x' }, { email: 'nope' }, { parentName: '' }]) {
  reset();
  config.accepting = false;
  res = handlePilotSubmission(payload(over));
  assert.strictEqual(res.outcome, 'pilot_closed');
  assert.strictEqual(sent.length, 0, JSON.stringify(over) + ' must send nothing');
}

// 10. Auto-approved (#133): the team hears "approved", the family gets the
// approval email and no welcome email, and the page is told "approved".
reset({ autoApproved: true });
res = handlePilotSubmission(payload());
assert.strictEqual(res.outcome, 'approved');
assert.strictEqual(res.message, 'message for approved');
assert.deepStrictEqual(approved, ['sam@example.com']);
assert.deepStrictEqual(acknowledged, [], 'one email to the family, not two');
assert.strictEqual(teamMail().length, 1);
assert.strictEqual(teamMail()[0].subject, 'Pilot application: approved');

// 11. Auto-approved but the fan-out throws: no approval email, the team still
// hears, and the page is not told "approved".
reset({ autoApproved: true });
fanOutThrows = true;
res = handlePilotSubmission(payload());
assert.strictEqual(res.result, 'success');
assert.strictEqual(res.outcome, 'eligible');
assert.deepStrictEqual(approved, []);
assert.strictEqual(teamMail().length, 1);

console.log('team notification: all checks passed');

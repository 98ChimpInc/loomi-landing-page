// Runnable check for rolling enrolment (#116): each family's three weeks start
// the day they join in the app, so no email may name, or wait on, a start date.
// Run: node scripts/tests/rolling-start.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const fn = (name) => {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('could not find ' + name + ' in Code.js');
  return m[0];
};

let sent = null;
global.GmailApp = { sendEmail: (to, subject, body, opts) => { sent = { to, subject, body, html: opts.htmlBody }; } };
global.readPilotConfig = () => ({ appStoreUrl: 'https://apps.example/loomi', playStoreUrl: 'https://play.example/loomi' });
global.loomiEmailShell = (inner) => inner;
global.mimeEncodeSubject = (subject) => subject;
global.MOON = '';
global.APP_STORE_LINK = 'https://apps.example/default';
global.PLAY_STORE_LINK = 'https://play.example/default';
eval(['firstNameOf', 'pilotInstallFor', 'sendPilotApproval'].map(fn).join('\n'));

// 1. The approval email reads whole with no date to fill in.
sendPilotApproval('Sam Parent', 'sam@example.com', 'ios');
assert.ok(sent, 'the approval email must send');
for (const [part, text] of [['plain', sent.body], ['html', sent.html]]) {
  assert.ok(!/undefined|null/.test(text), `the ${part} body must not print a missing value`);
  assert.ok(/starts on the day you join in the app/.test(text), `the ${part} body must say when the three weeks start`);
  assert.ok(!/starts on \d|before \d/.test(text), `the ${part} body must not name a date`);
}
assert.ok(sent.body.includes('https://apps.example/loomi'), 'an iOS family gets the configured App Store link');

// 2. Nothing in the script reads a start date any more, so no path can wait on one.
assert.ok(!/cohortStartDate|cohort start date/i.test(src), 'Code.js must not read a cohort start date');

// 3. No invitation code anywhere (#118). The app finds a family by the email
//    they sign in with, so the approval names that address instead.
for (const [part, text] of [['plain', sent.body], ['html', sent.html]]) {
  assert.ok(!/\bcode\b|invitation/i.test(text), `the ${part} body must not mention a code`);
  assert.ok(text.includes('sam@example.com'), `the ${part} body must name the address to sign in with`);
  assert.ok(/Share My Email/.test(text), `the ${part} body must tell Apple sign-ins to share the address`);
}
for (const gone of ['generateInvitationCode', 'approvePilotSelectedRows', 'codeIssuedAt', 'PILOT_CODE_ALPHABET']) {
  assert.ok(!src.includes(gone), `Code.js must not carry ${gone}`);
}

console.log('ok ... 3 checks passed');

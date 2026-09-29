// Runnable check for the Android pilot emails (#127, loomi-firebase#37). The
// Android build ships through an App Distribution invite link, and anyone who
// holds it can install the build, so only an approved family may receive it.
// Run: node scripts/tests/android-pilot.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const page = fs.readFileSync(__dirname + '/../../pilot.html', 'utf8');
const fn = (name) => {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('could not find ' + name + ' in Code.js');
  return m[0];
};

const INVITE = 'https://invite.example/pilot';
const APP = 'https://apps.example/loomi';
const config = { appStoreUrl: APP, playStoreUrl: INVITE };
let sent = [];
global.GmailApp = { sendEmail: (to, subject, body, opts) => sent.push({ to, subject, body, html: opts.htmlBody }) };
global.readPilotConfig = () => config;
global.loomiEmailShell = (inner) => inner;
global.mimeEncodeSubject = (subject) => subject;
global.MOON = '';
global.APP_STORE_LINK = 'https://apps.example/default';
global.PLAY_STORE_LINK = 'https://play.example/default';
eval(['firstNameOf', 'pilotInstallFor', 'sendPilotAcknowledgement', 'sendPilotApproval'].map(fn).join('\n'));

const both = (m) => [['plain', m.body], ['html', m.html]];
const send = (f) => { sent = []; f(); assert.strictEqual(sent.length, 1); return sent[0]; };

// 1. The acknowledgement never carries the invite link, on either device.
for (const device of ['ios', 'android', '', undefined]) {
  const ack = send(() => sendPilotAcknowledgement('Sam Parent', 'sam@example.com', device, config));
  for (const [part, text] of both(ack)) {
    assert.ok(!text.includes(INVITE), `the ${device} acknowledgement ${part} must not carry the invite link`);
    assert.ok(!/google-play|Google Play/.test(text), `the ${device} acknowledgement ${part} must not show a Play badge`);
    assert.ok(!/undefined|null/.test(text), `the ${device} acknowledgement ${part} must not print a missing value`);
  }
}

// 2. An iOS family still gets the App Store, in both parts.
const iosAck = send(() => sendPilotAcknowledgement('Sam Parent', 'sam@example.com', 'ios', config));
for (const [part, text] of both(iosAck)) assert.ok(text.includes(APP), `the iOS acknowledgement ${part} links the App Store`);

// 3. An Android family is told the link follows approval, and is sent no link at all.
const androidAck = send(() => sendPilotAcknowledgement('Sam Parent', 'sam@example.com', ' Android ', config));
for (const [part, text] of both(androidAck)) {
  assert.ok(/second email when we confirm your place/.test(text), `the Android acknowledgement ${part} says the link follows`);
  assert.ok(!text.includes(APP), `the Android acknowledgement ${part} does not send them to the App Store`);
  assert.ok(!/Download Loomi/.test(text), `the Android acknowledgement ${part} does not ask them to download`);
}

// 4. The Android approval carries the invite link and a Google sign-in hint, not the App Store.
const androidApproval = send(() => sendPilotApproval('Sam Parent', 'sam@example.com', 'android'));
for (const [part, text] of both(androidApproval)) {
  assert.ok(text.includes(INVITE), `the Android approval ${part} carries the invite link`);
  assert.ok(!text.includes(APP), `the Android approval ${part} does not link the App Store`);
  assert.ok(/test build/.test(text) && /Android/.test(text), `the Android approval ${part} names the Android test build`);
  assert.ok(/Signing in with Google\? Pick the account with this address/.test(text), `the Android approval ${part} has the Google hint`);
  assert.ok(text.includes('sam@example.com'), `the Android approval ${part} names the address to sign in with`);
  assert.ok(!/undefined|null/.test(text), `the Android approval ${part} must not print a missing value`);
}
assert.ok(!/app-store-badge/.test(androidApproval.html), 'the Android approval shows no App Store badge');

// 5. The iOS approval is unchanged in substance: App Store, Apple hint, no invite link.
const iosApproval = send(() => sendPilotApproval('Sam Parent', 'sam@example.com', 'ios'));
for (const [part, text] of both(iosApproval)) {
  assert.ok(text.includes(APP), `the iOS approval ${part} links the App Store`);
  assert.ok(!text.includes(INVITE), `the iOS approval ${part} must not carry the invite link`);
  assert.ok(/Using Sign in with Apple\? Choose Share My Email/.test(text), `the iOS approval ${part} has the Apple hint`);
  assert.ok(!/Google/.test(text), `the iOS approval ${part} has no Google hint`);
}

// 6. Without a configured link, Android falls back to the constant rather than printing nothing.
assert.strictEqual(pilotInstallFor('android', {}).link, PLAY_STORE_LINK);
assert.strictEqual(pilotInstallFor('ios', null).link, APP_STORE_LINK);

// 7. No public response hands out the invite link: not the config GET, not the intake reply.
for (const name of ['doGet', 'handlePilotSubmission']) {
  assert.ok(!/'playStoreUrl':/.test(fn(name)), name + ' must not return playStoreUrl');
}
assert.ok(!/PLAY_STORE_URL|playStoreUrl|testerapps|appdistribution/.test(page), 'pilot.html must not hold or read the Android link');
assert.ok(!/PILOT_APPROVAL_DEVICES|skippedDevice/.test(src), 'every device the form accepts can be approved');

console.log('ok ... 7 checks passed');

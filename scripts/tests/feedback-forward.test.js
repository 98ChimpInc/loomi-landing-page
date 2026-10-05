// Runnable check for forwardFeedbackEmails (#149): which hello@ mail leaves the
// mailbox, what reaches the email intake, and how the cursor survives a bad
// run. The risks are privacy (mail from someone who is not an applicant
// leaving Gmail), a lost reply (a cursor that moves past a failure) and a
// flood (the backlog filed on day one, or one reply filed every run).
// Invented names and addresses only.
// Run: node scripts/tests/feedback-forward.test.js
const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error('could not find ' + what + ' in Code.js');
  return m[0];
};
const fn = (name) => pick(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'), name);

// ---- Apps Script fakes, reset per scenario ----------------------------------
let w;
const logs = [];
global.Logger = { log: (line) => logs.push(String(line)) };
global.Utilities = {
  formatDate: (date, tz, format) => {
    assert.strictEqual(tz, 'UTC');
    assert.strictEqual(format, 'yyyy/MM/dd');
    return date.toISOString().slice(0, 10).replace(/-/g, '/');
  },
};
global.PropertiesService = { getScriptProperties: () => w.props };
global.Session = { getEffectiveUser: () => ({ getEmail: () => w.user }) };
global.LockService = { getUserLock: () => ({
  tryLock: () => { w.lockTries++; return !w.lockBusy; },
  releaseLock: () => { w.lockReleases++; },
}) };
global.UrlFetchApp = { fetch: (url, opts) => {
  const payload = JSON.parse(opts.payload);
  w.sent.push({ url, opts, payload });
  const a = w.answer(payload);
  if (a.throws) throw new Error(a.throws);
  return { getResponseCode: () => a.code, getContentText: () => a.body || '' };
} };
global.GmailApp = {
  search: (query, start, max) => {
    w.queries.push([query, start, max]);
    const pool = query.startsWith('label:')
      ? w.threads.filter((t) => t.labels.has('to-ticket') && !['ticketed', 'ticket-skipped', 'ticket-failed'].some((l) => t.labels.has(l)))
      : w.threads;
    return pool.slice(start, start + max);
  },
  getUserLabelByName: (name) => (w.labels.has(name) ? { name } : null),
  createLabel: (name) => { w.labels.add(name); w.created.push(name); return { name }; },
};
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: (name) => (name === 'Pilot Applicants' ? w.sheet : null) }),
  getUi: () => ({ alert: (text) => w.alerts.push(text) }),
};
global.ScriptApp = {
  getProjectTriggers: () => w.triggers.slice(),
  deleteTrigger: (t) => { w.triggers = w.triggers.filter((x) => x !== t); w.deleted.push(t.getHandlerFunction()); },
  newTrigger: (handler) => ({ timeBased: () => ({ everyMinutes: (n) => ({ create: () => {
    const t = { getHandlerFunction: () => handler, minutes: n };
    w.triggers.push(t);
    return t;
  } }) }) }),
};

eval(pick(/var PILOT_SHEET_NAME = [^;]*;/, 'PILOT_SHEET_NAME'));
eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(fn('pilotAssertColumnLayout'));
// The whole section, so a helper added later is covered without a test edit.
eval(pick(/var FEEDBACK_MAILBOX = [\s\S]*?(?=\/\/ =+\n\/\/ SPREADSHEET MENU)/, 'the email feedback section'));

// ---- builders ----------------------------------------------------------------
const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const MIN = 60 * 1000;
const SINCE = NOW - 15 * MIN;
const MAILBOX = 'hello@loomi.kids';
const APPLICANT = 'parent.quill@example.test';
const ALIAS_OWNER = 'owner@team.example.test';

function props(initial) {
  const store = Object.assign({}, initial);
  return {
    store,
    writes: [],
    getProperty: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setProperty(k, v) { this.writes.push(k); store[k] = v; },
  };
}

function sheetWith(emails, headers) {
  const rows = [(headers || PILOT_HEADERS).slice()].concat(emails.map((e) => {
    const row = Array(PILOT_HEADERS.length).fill('');
    row[PILOT_COL.email - 1] = e;
    return row;
  }));
  return {
    getMaxColumns: () => PILOT_HEADERS.length,
    getLastRow: () => rows.length,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValue: (v) => { rows[r - 1][c - 1] = v; },
    }),
  };
}

let seq = 0;
function message(over) {
  const m = Object.assign({
    id: 'a' + (++seq).toString(16).padStart(15, '0'),
    from: '"Ada Quill" <' + APPLICANT + '>',
    at: SINCE + 5 * MIN,
    body: 'Pip loved the owl story.\n\nOn Mon, 5 Oct 2026 at 09:00, Loomi <hello@loomi.kids> wrote:\n> Welcome',
    subject: 'Re: Welcome to the Loomi pilot',
    to: 'Loomi <hello@loomi.kids>',
    cc: '',
    headers: {},
    attachments: 0,
    draft: false,
    trash: false,
  }, over);
  return {
    raw: m,
    getId: () => m.id,
    getDate: () => new Date(m.at),
    getFrom: () => m.from,
    getPlainBody: () => m.body,
    getSubject: () => m.subject,
    getTo: () => m.to,
    getCc: () => m.cc,
    getHeader: (name) => m.headers[name] || '',
    getAttachments: (opts) => {
      assert.deepStrictEqual(opts, { includeInlineImages: false });
      return Array(m.attachments).fill({});
    },
    isDraft: () => m.draft,
    isInTrash: () => m.trash,
  };
}

function thread(messages, labels) {
  const t = {
    id: 't' + (++seq).toString(16).padStart(15, '0'),
    messages,
    labels: new Set(labels || []),
  };
  t.getId = () => t.id;
  t.getMessages = () => t.messages;
  t.addLabel = (label) => t.labels.add(label.name);
  return t;
}

function world(over) {
  w = Object.assign({
    user: MAILBOX,
    lockBusy: false,
    lockTries: 0,
    lockReleases: 0,
    props: props({ FEEDBACK_FORWARD_ENABLED: 'true', EMAIL_INTAKE_SECRET: 'right', FEEDBACK_FORWARD_SINCE: String(SINCE) }),
    sheet: sheetWith(['Parent.Quill@Example.test ', 'second.family@example.test']),
    threads: [],
    labels: new Set(),
    created: [],
    queries: [],
    sent: [],
    answer: () => ({ code: 200, body: '{"ok":true,"outcome":"filed"}' }),
    alerts: [],
    triggers: [],
    deleted: [],
  }, over);
  logs.length = 0;
  return w;
}

// feedbackForwardRun with a fixed clock; the entry point's own guards are
// checked through forwardFeedbackEmails.
const run = (now = NOW) => feedbackForwardRun(w.props, now);
const sentIds = () => w.sent.map((s) => s.payload.messageId);
const done = () => JSON.parse(w.props.store.FEEDBACK_FORWARD_DONE || '{}');

let checks = 0;
function check(name, body) {
  try {
    body();
    checks++;
  } catch (err) {
    err.message = name + ': ' + err.message;
    throw err;
  }
}

// ---- the entry point's guards ------------------------------------------------
check('off unless the switch reads exactly true', () => {
  for (const value of [null, 'false', 'TRUE', '1']) {
    world();
    w.props.store.FEEDBACK_FORWARD_ENABLED = value;
    if (value === null) delete w.props.store.FEEDBACK_FORWARD_ENABLED;
    w.threads = [thread([message()])];
    forwardFeedbackEmails();
    assert.deepStrictEqual([w.queries.length, w.sent.length, w.props.writes.length, w.lockTries], [0, 0, 0, 0]);
  }
});

check('refuses to read any mailbox but hello@ by default', () => {
  world({ user: 'someone.else@loomi.kids' });
  w.threads = [thread([message()])];
  forwardFeedbackEmails();
  assert.deepStrictEqual([w.queries.length, w.sent.length, w.props.writes.length], [0, 0, 0]);
  assert.ok(logs.some((l) => l.includes('refused')));
});

check('a run still going makes the next one do nothing', () => {
  world({ lockBusy: true });
  w.threads = [thread([message()])];
  forwardFeedbackEmails();
  assert.deepStrictEqual([w.queries.length, w.sent.length, w.lockReleases], [0, 0, 0]);
});

check('a normal run takes the lock, sends, and lets it go', () => {
  world();
  w.threads = [thread([message()])];
  forwardFeedbackEmails();
  assert.strictEqual(w.sent.length, 1);
  assert.strictEqual(w.lockReleases, 1);
});

// ---- the cursor --------------------------------------------------------------
check('the first run sets the cursor and files no backlog', () => {
  world();
  delete w.props.store.FEEDBACK_FORWARD_SINCE;
  w.threads = [thread([message({ at: NOW - 2 * MIN })])];
  run();
  assert.strictEqual(w.sent.length, 0);
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(NOW));
  assert.deepStrictEqual(done(), {});
});

check('an applicant reply goes, with the payload the intake expects', () => {
  world();
  const m = message({
    headers: { 'Auto-Submitted': 'no', Precedence: '' },
    attachments: 2,
  });
  const t = thread([message({ from: 'Loomi <hello@loomi.kids>', at: SINCE - 10 * MIN }), m]);
  w.threads = [t];
  run();
  assert.strictEqual(w.sent.length, 1);
  const { url, opts, payload } = w.sent[0];
  assert.strictEqual(url, 'https://us-central1-loomi-app-d87ee.cloudfunctions.net/emailFeedbackIntake');
  assert.strictEqual(opts.method, 'post');
  assert.strictEqual(opts.contentType, 'application/json');
  assert.strictEqual(opts.muteHttpExceptions, true);
  assert.deepStrictEqual(opts.headers, { 'X-Loomi-Email-Secret': 'right' });
  assert.deepStrictEqual(payload, {
    messageId: m.raw.id,
    threadId: t.id,
    from: '"Ada Quill" <parent.quill@example.test>',
    date: new Date(m.raw.at).toISOString(),
    body: m.raw.body,
    subject: 'Re: Welcome to the Loomi pilot',
    attachments: 2,
    labelled: false,
    headers: { 'auto-submitted': 'no', precedence: '', 'x-autoreply': '', 'x-autorespond': '' },
  });
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(NOW));
  assert.deepStrictEqual(Object.keys(done()), [m.raw.id]);
  assert.strictEqual(t.labels.size, 0, 'a filed applicant reply is not labelled');
});

check('the search reads from a day before the overlap, without hello@\'s own mail', () => {
  world();
  run();
  const [query, start, max] = w.queries[0];
  const from = new Date(SINCE - 60 * MIN - 24 * 60 * MIN).toISOString().slice(0, 10).replace(/-/g, '/');
  assert.strictEqual(query, 'to:hello@loomi.kids after:' + from + ' -from:hello@loomi.kids -in:chats');
  assert.deepStrictEqual([start, max], [0, 50]);
});

check('only applicants\' mail leaves the mailbox', () => {
  world();
  const keep = message({ from: 'SECOND.family@example.test' });
  w.threads = [thread([
    message({ from: 'Someone New <someone.new@example.test>' }),
    message({ from: 'Loomi <hello@loomi.kids>' }),
    message({ from: 'HELLO@loomi.kids' }),
    message({ draft: true }),
    message({ trash: true }),
    message({ from: 'not an address' }),
    message({ from: '' }),
    keep,
  ])];
  run();
  assert.deepStrictEqual(sentIds(), [keep.raw.id]);
});

check('mail before the overlap window is not read again', () => {
  world();
  const inside = message({ at: SINCE - 59 * MIN });
  w.threads = [thread([message({ at: SINCE - 60 * MIN }), message({ at: SINCE - 3 * 60 * MIN }), inside])];
  run();
  assert.deepStrictEqual(sentIds(), [inside.raw.id]);
});

check('a reply the intake answered is never sent twice', () => {
  world();
  const m = message();
  w.threads = [thread([m])];
  run();
  run(NOW + 15 * MIN);
  run(NOW + 30 * MIN);
  assert.deepStrictEqual(sentIds(), [m.raw.id]);
});

check('duplicates and skips count as answered too', () => {
  for (const outcome of ['duplicate', 'skipped']) {
    world({ answer: () => ({ code: 200, body: '{"ok":true,"outcome":"' + outcome + '"}' }) });
    const m = message();
    w.threads = [thread([m])];
    run();
    run(NOW + 15 * MIN);
    assert.deepStrictEqual(sentIds(), [m.raw.id]);
  }
});

check('oldest first, across threads and pages', () => {
  world();
  const filler = Array.from({ length: 55 }, () => thread([message({ from: 'list@example.test' })]));
  const late = message({ at: SINCE + 9 * MIN });
  const early = message({ at: SINCE + 1 * MIN });
  const middle = message({ at: SINCE + 4 * MIN });
  w.threads = [thread([late])].concat(filler, [thread([early, middle])]);
  run();
  assert.deepStrictEqual(sentIds(), [early.raw.id, middle.raw.id, late.raw.id]);
  assert.deepStrictEqual(w.queries.filter((q) => !q[0].startsWith('label:')).map((q) => q[1]), [0, 50]);
});

check('only mail addressed to hello@ leaves the mailbox', () => {
  world();
  const toUs = message({ to: 'someone@example.test, "Loomi" <HELLO@loomi.kids>' });
  const ccUs = message({ to: 'someone@example.test', cc: 'hello@loomi.kids' });
  w.threads = [thread([
    message({ to: 'owner@team.example.test' }),
    message({ to: 'nothello@loomi.kids' }),
    message({ to: 'hello@loomi.kids.example.test' }),
    message({ to: '', cc: '' }),
    toUs,
    ccUs,
  ])];
  run();
  assert.deepStrictEqual(sentIds(), [toUs.raw.id, ccUs.raw.id]);
});

check('with hello@ as an alias, the account owner runs it and their own mail stays', () => {
  world({ user: 'Owner@Team.example.test' });
  w.props.store.FEEDBACK_FORWARD_ACCOUNT = ' ' + ALIAS_OWNER + ' ';
  const reply = message();
  const ownReply = message({ from: 'Owner <owner@team.example.test>', at: SINCE + 8 * MIN });
  const labelled = thread([message({ from: 'someone.new@example.test', at: SINCE - 60 * 24 * 60 * MIN }), ownReply], ['to-ticket']);
  w.threads = [thread([reply]), labelled];
  forwardFeedbackEmails();
  assert.deepStrictEqual(sentIds(), [reply.raw.id, labelled.messages[0].raw.id]);
});

check('with the account set, hello@ itself is refused', () => {
  world();
  w.props.store.FEEDBACK_FORWARD_ACCOUNT = ALIAS_OWNER;
  w.threads = [thread([message()])];
  forwardFeedbackEmails();
  assert.deepStrictEqual([w.queries.length, w.sent.length], [0, 0]);
  assert.ok(logs.some((l) => l.includes('not ' + ALIAS_OWNER)));
});

// ---- failures ----------------------------------------------------------------
check('a 401 stops the run where it is', () => {
  world({ answer: () => ({ code: 401, body: '{"ok":false,"error":"unauthorized"}' }) });
  w.threads = [thread([message(), message({ at: SINCE + 6 * MIN })])];
  run();
  assert.strictEqual(w.sent.length, 1);
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(SINCE));
  assert.deepStrictEqual(done(), {});
  assert.ok(logs.some((l) => l.includes('EMAIL_INTAKE_SECRET')));
  assert.ok(!w.queries.some((q) => q[0].startsWith('label:')), 'the labelled pass waits too');
});

check('a 5xx, a 429 or an unreachable intake is retried next run', () => {
  for (const failure of [{ code: 502 }, { code: 500 }, { code: 429 }, { throws: 'DNS error' }]) {
    world({ answer: () => failure });
    const m = message();
    w.threads = [thread([m])];
    run();
    assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(SINCE));
    assert.deepStrictEqual(done(), {});
    w.answer = () => ({ code: 200, body: '{"ok":true,"outcome":"filed"}' });
    run(NOW + 15 * MIN);
    assert.deepStrictEqual(sentIds(), [m.raw.id, m.raw.id]);
    assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(NOW + 15 * MIN));
  }
});

check('progress before a failure is kept', () => {
  world();
  const first = message({ at: SINCE + 1 * MIN });
  const second = message({ at: SINCE + 2 * MIN });
  w.threads = [thread([first, second])];
  w.answer = (p) => (p.messageId === second.raw.id ? { code: 503 } : { code: 200, body: '{"ok":true,"outcome":"filed"}' });
  run();
  assert.deepStrictEqual(Object.keys(done()), [first.raw.id]);
  w.answer = () => ({ code: 200, body: '{"ok":true,"outcome":"filed"}' });
  run(NOW + 15 * MIN);
  assert.deepStrictEqual(sentIds(), [first.raw.id, second.raw.id, second.raw.id]);
});

check('a 400 is marked, labelled ticket-failed, and the run goes on', () => {
  world();
  const bad = message({ at: SINCE + 1 * MIN });
  const good = message({ at: SINCE + 2 * MIN });
  const badThread = thread([bad]);
  w.threads = [badThread, thread([good])];
  w.answer = (p) => (p.messageId === bad.raw.id
    ? { code: 400, body: '{"ok":false,"error":"from must carry an email address"}' }
    : { code: 200, body: '{"ok":true,"outcome":"filed"}' });
  run();
  assert.deepStrictEqual(sentIds(), [bad.raw.id, good.raw.id]);
  assert.ok(badThread.labels.has('ticket-failed'));
  assert.deepStrictEqual(w.created, ['ticket-failed']);
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(NOW));
  run(NOW + 15 * MIN);
  assert.strictEqual(w.sent.length, 2, 'a rejected message is not resent');
  assert.ok(logs.some((l) => l.includes('HTTP 400') && l.includes('from must carry')));
});

check('20 sends a run; the rest go next run', () => {
  world();
  const all = Array.from({ length: 25 }, (_, i) => message({ at: SINCE + i * 1000 }));
  w.threads = [thread(all)];
  run();
  assert.strictEqual(w.sent.length, 20);
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(SINCE));
  run(NOW + 15 * MIN);
  assert.deepStrictEqual(sentIds(), all.map((m) => m.raw.id));
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(NOW + 15 * MIN));
});

check('no send starts after four minutes', () => {
  world();
  w.threads = [thread([message()])];
  feedbackForwardRun(w.props, Date.now() - 5 * MIN);
  assert.strictEqual(w.sent.length, 0);
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(SINCE));
  assert.ok(logs.some((l) => l.includes('out of time')));
});

check('a missing sheet or a moved Email column sends nothing and holds the cursor', () => {
  const moved = PILOT_HEADERS.slice();
  moved[PILOT_COL.email - 1] = 'Something else';
  for (const sheet of [null, sheetWith([APPLICANT], moved)]) {
    world({ sheet });
    w.threads = [thread([message()])];
    run();
    assert.strictEqual(w.sent.length, 0);
    assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(SINCE));
  }
});

check('an unexpected error still saves the progress made', () => {
  world();
  const first = message({ at: SINCE + 1 * MIN });
  const broken = message({ at: SINCE + 2 * MIN });
  broken.getPlainBody = () => { throw new Error('Gmail hiccup'); };
  w.threads = [thread([first, broken])];
  run();
  assert.deepStrictEqual(Object.keys(done()), [first.raw.id]);
  assert.strictEqual(w.props.store.FEEDBACK_FORWARD_SINCE, String(SINCE));
  assert.ok(logs.some((l) => l.includes('Gmail hiccup')));
});

// ---- size limits ---------------------------------------------------------------
check('the body and attachment count are capped at the intake\'s limits', () => {
  world();
  w.threads = [thread([message({ body: 'x'.repeat(250000), attachments: 140 })])];
  run();
  assert.strictEqual(w.sent[0].payload.body.length, 200000);
  assert.strictEqual(w.sent[0].payload.attachments, 100);
});

// ---- to-ticket -----------------------------------------------------------------
check('a labelled thread sends its newest inbound message, then reads ticketed', () => {
  world();
  const older = message({ from: 'Someone New <someone.new@example.test>', at: SINCE - 5 * 24 * 60 * MIN });
  const newest = message({ from: 'Someone New <someone.new@example.test>', at: SINCE - 4 * 24 * 60 * MIN });
  const ours = message({ from: 'Loomi <hello@loomi.kids>', at: SINCE - 3 * 24 * 60 * MIN });
  const t = thread([older, newest, ours], ['to-ticket']);
  w.threads = [t];
  run();
  assert.deepStrictEqual(sentIds(), [newest.raw.id]);
  assert.strictEqual(w.sent[0].payload.labelled, true);
  assert.ok(t.labels.has('ticketed'));
  run(NOW + 15 * MIN);
  assert.strictEqual(w.sent.length, 1, 'a ticketed thread is not sent again');
  assert.strictEqual(w.queries.find((q) => q[0].startsWith('label:'))[0],
    'label:to-ticket -label:ticketed -label:ticket-skipped -label:ticket-failed');
});

check('a duplicate reads ticketed; a skip reads ticket-skipped', () => {
  for (const [outcome, label] of [['duplicate', 'ticketed'], ['filed', 'ticketed'], ['skipped', 'ticket-skipped'], [null, 'ticketed']]) {
    world({ answer: () => ({ code: 200, body: outcome ? '{"ok":true,"outcome":"' + outcome + '"}' : 'not json' }) });
    const t = thread([message({ from: 'someone.new@example.test' })], ['to-ticket']);
    w.threads = [t];
    run();
    assert.ok(t.labels.has(label), outcome + ' → ' + label);
  }
});

check('a labelled thread with nothing inbound is skipped without a send', () => {
  world();
  const t = thread([message({ from: 'Loomi <hello@loomi.kids>' })], ['to-ticket']);
  w.threads = [t];
  run();
  assert.strictEqual(w.sent.length, 0);
  assert.ok(t.labels.has('ticket-skipped'));
});

check('labelled threads go on the first run as well', () => {
  world();
  delete w.props.store.FEEDBACK_FORWARD_SINCE;
  const t = thread([message({ from: 'someone.new@example.test' })], ['to-ticket']);
  w.threads = [t, thread([message()])];
  run();
  assert.strictEqual(w.sent.length, 1);
  assert.strictEqual(w.sent[0].payload.labelled, true);
});

// ---- helpers -----------------------------------------------------------------
check('sender addresses compare the way the intake normalises them', () => {
  assert.strictEqual(feedbackSenderAddress('"Ada Quill" <Parent.Quill@Example.test>'), 'parent.quill@example.test');
  assert.strictEqual(feedbackSenderAddress('Ada <a@b.test>  '), 'a@b.test');
  assert.strictEqual(feedbackSenderAddress(' Parent.Quill@Example.test '), 'parent.quill@example.test');
  assert.strictEqual(feedbackSenderAddress(null), '');
});

check('the remembered ids drop out once no run can see them', () => {
  assert.deepStrictEqual(feedbackPruneDone({ a: 100, b: 200, c: 300 }, 200), { c: 300 });
  for (const raw of ['not json', '[1,2]', 'null', '']) {
    assert.deepStrictEqual(feedbackReadDone(props({ FEEDBACK_FORWARD_DONE: raw })), {});
  }
  world();
  w.props.store.FEEDBACK_FORWARD_DONE = JSON.stringify({ old: SINCE - 3 * 60 * MIN, recent: NOW - 10 * MIN });
  run();
  assert.deepStrictEqual(done(), { recent: NOW - 10 * MIN });
});

// ---- installing ----------------------------------------------------------------
check('installing as anyone but the mailbox account changes nothing', () => {
  world({ user: 'someone.else@loomi.kids' });
  installFeedbackForwardTrigger();
  assert.strictEqual(w.triggers.length, 0);
  assert.ok(w.alerts[0].includes('Sign in as hello@loomi.kids'));
  assert.ok(w.alerts[0].includes('FEEDBACK_FORWARD_ACCOUNT'));
  world();
  w.props.store.FEEDBACK_FORWARD_ACCOUNT = ALIAS_OWNER;
  installFeedbackForwardTrigger();
  assert.strictEqual(w.triggers.length, 0);
  assert.ok(w.alerts[0].includes('Sign in as ' + ALIAS_OWNER));
  world({ user: ALIAS_OWNER });
  w.props.store.FEEDBACK_FORWARD_ACCOUNT = ALIAS_OWNER;
  installFeedbackForwardTrigger();
  assert.strictEqual(w.triggers.length, 1);
});

check('installing replaces only its own trigger and makes the labels', () => {
  world();
  const other = { getHandlerFunction: () => 'sendWelcomeToAllUnsent' };
  w.triggers = [other, { getHandlerFunction: () => 'forwardFeedbackEmails' }];
  w.labels.add('to-ticket');
  installFeedbackForwardTrigger();
  assert.deepStrictEqual(w.deleted, ['forwardFeedbackEmails']);
  assert.strictEqual(w.triggers[0], other);
  assert.deepStrictEqual(w.triggers.slice(1).map((t) => [t.getHandlerFunction(), t.minutes]), [['forwardFeedbackEmails', 15]]);
  assert.deepStrictEqual(w.created, ['ticketed', 'ticket-skipped', 'ticket-failed']);
  assert.strictEqual(w.alerts[0], 'Email feedback forwarding runs every 15 minutes.');
  w.props.store.FEEDBACK_FORWARD_ENABLED = 'false';
  installFeedbackForwardTrigger();
  assert.ok(w.alerts[1].includes('stays off until the FEEDBACK_FORWARD_ENABLED script property is true'));
});

check('the menu offers it', () => {
  assert.ok(fn('onOpen').includes(".addItem('Start email feedback forwarding', 'installFeedbackForwardTrigger')"));
});

console.log('ok ... ' + checks + ' checks passed');

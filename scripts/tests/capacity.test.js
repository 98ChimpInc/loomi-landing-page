// Runnable check for the Capacity row on "Pilot Config" (#168). A blank cell
// is no cap, a whole number from 1 up is the cap, and anything else keeps
// intake closed. The risks: a typo read as "no cap" (everyone admitted), a
// blank read as 0 (everyone refused), and a validator guarding the wrong row.
// Run: node scripts/tests/capacity.test.js
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
global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{"ok":true}' }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'secret' }) };
global.sendPilotApproval = () => {};
global.sendPilotAcknowledgement = () => {};

var APP_STORE_LINK = 'app-store', PLAY_STORE_LINK = 'play-store', PILOT_CONFIG_SHEET_NAME = 'Pilot Config';
eval(pick(/var PILOT_COLUMNS = \[[\s\S]*?\nfunction pilotSurveyFromRow\(values\) \{[\s\S]*?\n\}/, 'the column block'));
eval(pick(/var PILOT_MIN_BAND_MONTHS = \d+;/, 'PILOT_MIN_BAND_MONTHS'));
eval(pick(/var PILOT_PLACE_HOLDING_STATUSES = \[[^\]]*\];/, 'PILOT_PLACE_HOLDING_STATUSES'));
eval(pick(/var PILOT_FANOUT_ENABLED = [\s\S]*?var PILOT_FANOUT_SECRET_PROPERTY = [^;]*;/, 'fan-out settings'));
eval(['pilotAgeBand', 'pilotMergedNotes', 'findPilotRowByEmail', 'countPilotActiveApplicants',
      'pilotRecordApplicant', 'pilotAssertColumnLayout', 'pilotNoteFanOutFailure', 'pilotFanOut',
      'pilotDeliverApplicant', 'readPilotConfig', 'pilotCapacityFromCell', 'pilotIntegerOrNull',
      'enforcePilotConfigValidation']
  .map(fn).join('\n'));

// ---- 1. The cell, value by value ----

const noCap = { cap: null, problem: '' };
for (const blank of ['', '   ', null, undefined]) {
  assert.deepStrictEqual(pilotCapacityFromCell(blank), noCap, JSON.stringify(blank) + ' is no cap');
}
for (const [value, cap] of [[40, 40], [1, 1], [250, 250], ['40', 40], [' 40 ', 40], [40.0, 40]]) {
  assert.deepStrictEqual(pilotCapacityFromCell(value), { cap, problem: '' }, JSON.stringify(value) + ' is a cap of ' + cap);
}
for (const bad of [0, '0', -3, '-3', 2.5, '2.5', 'abc', '40 families', '+5', true, false,
                   NaN, Infinity, new Date(2026, 10, 10)]) {
  const read = pilotCapacityFromCell(bad);
  assert.strictEqual(read.cap, null, String(bad) + ' must not become a cap');
  assert.ok(read.problem, String(bad) + ' must be reported, never read as no cap');
}
assert.ok(/"abc"/.test(pilotCapacityFromCell('abc').problem), 'the log names the value it could not read');

// ---- 2. readPilotConfig over the tab ----

function configFrom(rows) {
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => (rows && {
    getLastRow: () => rows.length,
    getRange: (r, c) => ({ getValue: () => rows[r - 1][c - 1] }),
  }) }) };
  return readPilotConfig();
}
const tab = (capacityRow) => [['Key', 'Value'], ['Accepting applications', true], capacityRow, ['Auto-approve', false]];

let c = configFrom(tab(['Capacity', '']));
assert.strictEqual(c.capacity, null, 'blank cell: no cap');
assert.strictEqual(c.capacityProblem, '', 'blank cell: intake open');

c = configFrom(tab(['Capacity', 40]));
assert.strictEqual(c.capacity, 40);
assert.strictEqual(c.capacityProblem, '');

c = configFrom(tab(['  CAPACITY ', 12]));
assert.strictEqual(c.capacity, 12, 'the key is matched trimmed and case-blind, as the other keys are');

for (const bad of [0, 'abc', 2.5, true]) {
  c = configFrom(tab(['Capacity', bad]));
  assert.strictEqual(c.capacity, null);
  assert.ok(c.capacityProblem, String(bad) + ' keeps intake closed');
}

c = configFrom([['Key', 'Value'], ['Accepting applications', true]]);
assert.strictEqual(c.capacity, null, 'no Capacity row');
assert.ok(c.capacityProblem, 'a missing row keeps intake closed, unlike a blank cell');

c = configFrom(null);
assert.ok(c.capacityProblem, 'no config tab keeps intake closed');

// ---- 3. Waitlisting at intake ----

function fakeSheet(headers) {
  const rows = [headers.slice()];
  const width = headers.length;
  const range = (r, col, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) =>
      Array.from({ length: nc }, (_, j) => ((rows[r - 1 + i] || [])[col - 1 + j] ?? ''))),
    getValue: () => ((rows[r - 1] || [])[col - 1] ?? ''),
    setValues: (vals) => vals.forEach((line, i) => line.forEach((v, j) => {
      rows[r - 1 + i] = rows[r - 1 + i] || Array(width).fill('');
      rows[r - 1 + i][col - 1 + j] = v;
    })),
    setValue: (v) => { rows[r - 1] = rows[r - 1] || Array(width).fill(''); rows[r - 1][col - 1] = v; },
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
  audience: { segment: 'sleep', tie: false }, themes: ['calm'], device: 'ios',
  tz: 'America/Toronto', canCommit: '', challenge: 'resistance', challengeOther: '',
  childSex: 'girl', childName: 'Ava', survey: {},
}, over);
const record = (sheet, config, over) => pilotRecordApplicant(sheet, config, applicant(over));

// 3a. No cap: nobody is waitlisted for numbers, however many arrive.
{
  const sheet = fakeSheet(PILOT_HEADERS);
  const unlimited = { capacity: null, capacityProblem: '' };
  for (let i = 1; i <= 60; i++) {
    const r = record(sheet, unlimited, { email: 'family' + i + '@example.com' });
    assert.strictEqual(r.outcome, 'eligible', 'family ' + i + ' under no cap');
  }
  assert.ok(sheet.rows.slice(1).every(row => row[PILOT_COL.status - 1] === 'new'));
}

// 3b. No cap never lifts the age rules.
{
  const sheet = fakeSheet(PILOT_HEADERS);
  const unlimited = { capacity: null, capacityProblem: '' };
  assert.strictEqual(record(sheet, unlimited, { email: 'young@example.com', childAgeMonths: 12, band: null }).outcome, 'waitlisted_age');
  assert.strictEqual(record(sheet, unlimited, { email: 'old@example.com', childAgeMonths: 90, band: null }).outcome, 'ineligible_age');
}

// 3c. A cap of N admits N, then waitlists, as before.
{
  const sheet = fakeSheet(PILOT_HEADERS);
  const capped = { capacity: 2, capacityProblem: '' };
  assert.strictEqual(record(sheet, capped, { email: 'a@example.com' }).outcome, 'eligible');
  assert.strictEqual(record(sheet, capped, { email: 'b@example.com' }).outcome, 'eligible');
  assert.strictEqual(record(sheet, capped, { email: 'c@example.com' }).outcome, 'waitlisted');
  assert.strictEqual(at(sheet, 4, 'status'), 'waitlisted');

  // 3d. Lifting the cap does not jump the queue: a waitlisted family who
  // resubmits keeps their waitlisted place until the team approves them.
  const again = record(sheet, { capacity: null, capacityProblem: '' }, { email: 'c@example.com' });
  assert.strictEqual(again.outcome, 'waitlisted');
  assert.strictEqual(at(sheet, 4, 'status'), 'waitlisted');

  // 3e. A new family after the cap is lifted is not waitlisted.
  assert.strictEqual(record(sheet, { capacity: null, capacityProblem: '' }, { email: 'd@example.com' }).outcome, 'eligible');
}

// ---- 4. The validator ----

// The DataValidationBuilder methods as Google documents them, copied from
// https://developers.google.com/apps-script/reference/spreadsheet/data-validation-builder
// (2026-11-10). Kept apart from the fake builder below, so a misspelt call in
// Code.js fails here instead of at "Set up Pilot sheets" (#170).
const BUILDER_METHODS = new Set([
  'build', 'copy', 'getAllowInvalid', 'getCriteriaType', 'getCriteriaValues', 'getHelpText',
  'requireCheckbox', 'requireDate', 'requireDateAfter', 'requireDateBefore', 'requireDateBetween',
  'requireDateEqualTo', 'requireDateNotBetween', 'requireDateOnOrAfter', 'requireDateOnOrBefore',
  'requireFormulaSatisfied', 'requireNumberBetween', 'requireNumberEqualTo', 'requireNumberGreaterThan',
  'requireNumberGreaterThanOrEqualTo', 'requireNumberLessThan', 'requireNumberLessThanOrEqualTo',
  'requireNumberNotBetween', 'requireNumberNotEqualTo', 'requireTextContains', 'requireTextDoesNotContain',
  'requireTextEqualTo', 'requireTextIsEmail', 'requireTextIsUrl', 'requireValueInList', 'requireValueInRange',
  'setAllowInvalid', 'setHelpText', 'withCriteria',
]);
{
  const chains = src.match(/newDataValidation\(\)(\s*\.\w+\([^;]*?\))+/g) || [];
  assert.ok(chains.length, 'Code.js builds at least one validation rule');
  for (const chain of chains) {
    for (const [, name] of chain.matchAll(/\.(\w+)\(/g)) {
      assert.ok(BUILDER_METHODS.has(name), '"' + name + '" is not a DataValidationBuilder method');
    }
  }
}

function builderSpy() {
  const built = [];
  global.SpreadsheetApp = { newDataValidation: () => {
    const rule = {};
    const b = {
      requireFormulaSatisfied: (f) => { rule.formula = f; return b; },
      setAllowInvalid: (v) => { rule.allowInvalid = v; return b; },
      setHelpText: (t) => { rule.helpText = t; return b; },
      build: () => { built.push(rule); return rule; },
    };
    return b;
  } };
  return built;
}
function configSheet(rows) {
  const applied = [];
  return {
    applied,
    getLastRow: () => rows.length,
    getRange: (r, col) => ({
      getValue: () => rows[r - 1][col - 1],
      setDataValidation: (rule) => applied.push({ row: r, col, rule }),
    }),
  };
}

// 4a. Found by key, wherever the operator moved it.
{
  builderSpy();
  const sheet = configSheet([['Key', 'Value'], ['Accepting applications', true], ['App Store URL', 'x'],
                             ['Capacity', 40], ['Auto-approve', false]]);
  assert.strictEqual(enforcePilotConfigValidation(sheet), 4);
  assert.strictEqual(sheet.applied.length, 1, 'one cell guarded, nothing else touched');
  const { row, col, rule } = sheet.applied[0];
  assert.deepStrictEqual([row, col], [4, 2], 'the Capacity value cell');
  assert.strictEqual(rule.formula, '=OR(ISBLANK(B4),AND(ISNUMBER(B4),B4>=1,B4=INT(B4)))');
  assert.strictEqual(rule.allowInvalid, false, 'a wrong value is rejected, not just flagged');
  assert.ok(/blank/i.test(rule.helpText) && /whole number/i.test(rule.helpText));
}

// 4b. The seeded layout: Capacity on row 2.
{
  builderSpy();
  const sheet = configSheet([['Key', 'Value'], ['Capacity', 40], ['Accepting applications', true]]);
  assert.strictEqual(enforcePilotConfigValidation(sheet), 2);
  assert.ok(/B2/.test(sheet.applied[0].rule.formula) && !/B4/.test(sheet.applied[0].rule.formula));
}

// 4c. No Capacity row, or no tab: nothing to guard, and the caller is told.
{
  const built = builderSpy();
  const sheet = configSheet([['Key', 'Value'], ['Accepting applications', true]]);
  assert.strictEqual(enforcePilotConfigValidation(sheet), 0);
  assert.strictEqual(sheet.applied.length, 0);
  assert.strictEqual(enforcePilotConfigValidation(null), 0);
  assert.strictEqual(built.length, 0);
}

console.log('capacity: all checks passed');

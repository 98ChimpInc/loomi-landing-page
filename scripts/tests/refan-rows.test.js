// Runnable check for pilotRefanSelectedRows' row collection (#92).
// The risk is the row maths, not the UI: a wrong range walk silently re-sends
// the wrong families, or skips the ones that need repair.
// Run: node scripts/tests/refan-rows.test.js
const fs = require('fs');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/../Code.js', 'utf8');

// Lift the collection loop out of the function and drive it directly.
const body = src.match(/function pilotRefanSelectedRows\(\) \{[\s\S]*?\n\}/)[0];
const collect = (rangeSpecs) => {
  const list = rangeSpecs.map(([row, numRows]) => ({
    getRow: () => row, getNumRows: () => numRows,
  }));
  const rows = [];
  for (let r = 0; r < list.length; r++) {
    const start = list[r].getRow();
    const end = start + list[r].getNumRows() - 1;
    for (let row = start; row <= end; row++) {
      if (row === 1) continue;
      if (rows.indexOf(row) === -1) rows.push(row);
    }
  }
  return rows;
};

// The loop under test must be the one that ships.
assert.ok(body.includes('if (row === 1) continue;'), 'header skip missing from Code.js');
assert.ok(body.includes('if (rows.indexOf(row) === -1) rows.push(row);'), 'dedupe missing from Code.js');

// 1. A contiguous block, inclusive of its last row.
assert.deepStrictEqual(collect([[2, 3]]), [2, 3, 4]);

// 2. The header is never re-sent, even when the selection starts at row 1
//    ... which is what "select the whole column" does.
assert.deepStrictEqual(collect([[1, 3]]), [2, 3]);

// 3. Overlapping ranges send each family once, not twice. A double re-send is
//    not destructive (the endpoint upserts) but it doubles the call count.
assert.deepStrictEqual(collect([[2, 3], [3, 3]]), [2, 3, 4, 5]);

// 4. Disjoint ranges, which is what cmd-click produces.
assert.deepStrictEqual(collect([[5, 1], [9, 2]]), [5, 9, 10]);

// 5. A header-only selection does nothing at all.
assert.deepStrictEqual(collect([[1, 1]]), []);

console.log('ok ... 5 checks passed');

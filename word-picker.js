/*
 * Shared word picker: the more times a word has already appeared, the
 * lower its chance of being picked again (weight = 1 / (count + 1)).
 * Requires words.js (WORD_DATA) and idb.js to be loaded first.
 */

function jpBuildPool(levels) {
  var pool = [];
  levels.forEach(function (lv) {
    var list = WORD_DATA[lv];
    if (!list) return;
    list.forEach(function (w, i) {
      pool.push({ id: lv + "-" + i, k: w.k, r: w.r, m: w.m, level: lv });
    });
  });
  return pool;
}

function jpWeightedPick(pool, counts) {
  var weights = pool.map(function (w) { return 1 / ((counts[w.id] || 0) + 1); });
  var total = weights.reduce(function (a, b) { return a + b; }, 0);
  var r = Math.random() * total;
  for (var i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

async function jpPickNextWord(levels) {
  var pool = jpBuildPool(levels);
  if (pool.length === 0) return null;
  var counts = (await jpIdbGet("wordCounts")) || {};
  var word = jpWeightedPick(pool, counts);
  counts[word.id] = (counts[word.id] || 0) + 1;
  await jpIdbSet("wordCounts", counts);
  return word;
}

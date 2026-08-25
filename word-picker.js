/*
 * Shared "shuffle bag" word picker so notifications cycle through every
 * word in the selected levels before any word repeats.
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

function jpShuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

async function jpPickNextWord(levels) {
  var pool = jpBuildPool(levels);
  if (pool.length === 0) return null;
  var key = levels.slice().sort().join(",");
  var state = (await jpIdbGet("bagState")) || {};
  var bag = state[key];
  if (!bag || bag.length === 0) {
    bag = jpShuffle(pool.map(function (w) { return w.id; }));
  }
  var id = bag.pop();
  state[key] = bag;
  await jpIdbSet("bagState", state);
  var word = pool.filter(function (w) { return w.id === id; })[0];
  return word || pool[0];
}

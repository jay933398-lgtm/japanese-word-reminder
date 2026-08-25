/*
 * Minimal IndexedDB key-value helper shared by the page (app.js)
 * and the service worker (sw.js) via importScripts.
 */
var JP_DB_NAME = "jp-word-reminder-db";
var JP_DB_STORE = "kv";

function jpIdbOpen() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(JP_DB_NAME, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore(JP_DB_STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

async function jpIdbGet(key) {
  var db = await jpIdbOpen();
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(JP_DB_STORE, "readonly");
    var req = tx.objectStore(JP_DB_STORE).get(key);
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

async function jpIdbSet(key, value) {
  var db = await jpIdbOpen();
  return new Promise(function (resolve, reject) {
    var tx = db.transaction(JP_DB_STORE, "readwrite");
    tx.objectStore(JP_DB_STORE).put(value, key);
    tx.oncomplete = function () { resolve(); };
    tx.onerror = function () { reject(tx.error); };
  });
}

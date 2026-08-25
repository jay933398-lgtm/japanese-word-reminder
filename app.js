(function () {
  var levelGrid = document.getElementById("levelGrid");
  var intervalSelect = document.getElementById("intervalSelect");
  var customMinutes = document.getElementById("customMinutes");
  var enableBtn = document.getElementById("enableBtn");
  var disableBtn = document.getElementById("disableBtn");
  var testBtn = document.getElementById("testBtn");
  var statusText = document.getElementById("statusText");
  var flashcard = document.getElementById("flashcard");
  var fcLevel = document.getElementById("fcLevel");
  var fcKanji = document.getElementById("fcKanji");
  var fcKana = document.getElementById("fcKana");
  var fcMean = document.getElementById("fcMean");
  var nextWordBtn = document.getElementById("nextWordBtn");

  var timerId = null;
  var swReg = null;

  function getSelectedLevels() {
    var boxes = levelGrid.querySelectorAll("input[type=checkbox]:checked");
    return Array.prototype.map.call(boxes, function (b) { return b.value; });
  }

  function setSelectedLevels(levels) {
    var boxes = levelGrid.querySelectorAll("input[type=checkbox]");
    boxes.forEach(function (b) { b.checked = levels.indexOf(b.value) !== -1; });
  }

  function getIntervalMinutes() {
    if (intervalSelect.value === "custom") {
      var v = parseInt(customMinutes.value, 10);
      return v > 0 ? v : 30;
    }
    return parseInt(intervalSelect.value, 10);
  }

  function setIntervalMinutes(mins) {
    var presets = ["15", "30", "60", "120", "240"];
    if (presets.indexOf(String(mins)) !== -1) {
      intervalSelect.value = String(mins);
      customMinutes.style.display = "none";
    } else {
      intervalSelect.value = "custom";
      customMinutes.style.display = "block";
      customMinutes.value = mins;
    }
  }

  async function persistSettings() {
    var settings = (await jpIdbGet("settings")) || {};
    var levels = getSelectedLevels();
    settings.levels = levels.length ? levels : ["N5"];
    settings.intervalMinutes = getIntervalMinutes();
    await jpIdbSet("settings", settings);
    return settings;
  }

  async function onSettingsChanged() {
    var settings = await persistSettings();
    if (settings.enabled) {
      startScheduler();
      tryRegisterPeriodicSync();
    }
    await refreshStatus();
  }

  intervalSelect.addEventListener("change", function () {
    customMinutes.style.display = intervalSelect.value === "custom" ? "block" : "none";
    onSettingsChanged();
  });
  customMinutes.addEventListener("input", onSettingsChanged);
  levelGrid.addEventListener("change", onSettingsChanged);

  async function loadSettings() {
    var settings = (await jpIdbGet("settings")) || { levels: ["N5"], intervalMinutes: 30, enabled: false };
    setSelectedLevels(settings.levels || ["N5"]);
    setIntervalMinutes(settings.intervalMinutes || 30);
    return settings;
  }

  async function displayWordNotification() {
    var settings = await persistSettings();
    var word = await jpPickNextWord(settings.levels);
    if (!word) return null;

    var log = (await jpIdbGet("history")) || [];
    log.unshift({ k: word.k, r: word.r, m: word.m, level: word.level, t: Date.now() });
    await jpIdbSet("history", log.slice(0, 30));
    await jpIdbSet("lastFireTime", Date.now());

    if (Notification.permission === "granted" && swReg) {
      swReg.showNotification("📖 " + word.level + " ・ " + word.k, {
        body: word.r + "\n" + word.m,
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: "jp-word",
        renotify: true
      });
    }
    return word;
  }

  function startScheduler() {
    stopScheduler();
    var minutes = getIntervalMinutes();
    timerId = setInterval(displayWordNotification, minutes * 60 * 1000);
  }

  function stopScheduler() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  async function refreshStatus() {
    var settings = (await jpIdbGet("settings")) || {};
    if (settings.enabled) {
      enableBtn.disabled = true;
      disableBtn.disabled = false;
      var last = await jpIdbGet("lastFireTime");
      var mins = settings.intervalMinutes || 30;
      if (last) {
        var next = new Date(last + mins * 60000);
        statusText.textContent = "提醒已啟用（每 " + mins + " 分鐘）。下次約在 " +
          next.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
      } else {
        statusText.textContent = "提醒已啟用（每 " + mins + " 分鐘）。";
      }
    } else {
      enableBtn.disabled = false;
      disableBtn.disabled = true;
      statusText.textContent = "尚未啟用提醒。";
    }
  }

  enableBtn.addEventListener("click", async function () {
    if (!("Notification" in window)) {
      alert("這個瀏覽器不支援通知功能。");
      return;
    }
    var perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("需要允許通知權限才能提醒你喔。");
      return;
    }
    var settings = await persistSettings();
    settings.enabled = true;
    await jpIdbSet("settings", settings);
    await jpIdbSet("lastFireTime", Date.now());
    startScheduler();
    tryRegisterPeriodicSync();
    await refreshStatus();
  });

  disableBtn.addEventListener("click", async function () {
    var settings = (await jpIdbGet("settings")) || {};
    settings.enabled = false;
    await jpIdbSet("settings", settings);
    stopScheduler();
    if (swReg && swReg.periodicSync) {
      try { await swReg.periodicSync.unregister("jp-word-notification"); } catch (e) {}
    }
    await refreshStatus();
  });

  testBtn.addEventListener("click", async function () {
    if (!("Notification" in window)) {
      alert("這個瀏覽器不支援通知功能。");
      return;
    }
    if (Notification.permission !== "granted") {
      var perm = await Notification.requestPermission();
      if (perm !== "granted") { alert("需要允許通知權限。"); return; }
    }
    await displayWordNotification();
  });

  async function tryRegisterPeriodicSync() {
    if (!swReg || !("periodicSync" in swReg)) return;
    try {
      var status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state === "granted") {
        await swReg.periodicSync.register("jp-word-notification", {
          minInterval: getIntervalMinutes() * 60 * 1000
        });
      }
    } catch (e) {
      // Not supported on this browser (e.g. iOS Safari, Firefox) — ignore.
    }
  }

  // Manual flashcard, shown in-page (no OS notification involved).
  async function loadNextCard() {
    flashcard.classList.remove("revealed");
    var levels = getSelectedLevels().length ? getSelectedLevels() : ["N5"];
    var word = await jpPickNextWord(levels);
    if (!word) return;
    fcLevel.textContent = word.level;
    fcKanji.textContent = word.k;
    fcKana.textContent = word.r;
    fcMean.textContent = word.m;
  }
  flashcard.addEventListener("click", function () {
    flashcard.classList.toggle("revealed");
  });
  nextWordBtn.addEventListener("click", loadNextCard);

  // If the app was in the background/closed past the interval, catch up
  // with a word as soon as it's opened again, then resume the schedule.
  document.addEventListener("visibilitychange", async function () {
    if (document.visibilityState !== "visible") return;
    var settings = (await jpIdbGet("settings")) || {};
    if (!settings.enabled) return;
    var last = await jpIdbGet("lastFireTime");
    var mins = settings.intervalMinutes || 30;
    var due = !last || (Date.now() - last) >= mins * 60000;
    if (due) await displayWordNotification();
    startScheduler();
    await refreshStatus();
  });

  async function init() {
    await loadSettings();

    if ("serviceWorker" in navigator) {
      try {
        swReg = await navigator.serviceWorker.register("sw.js");
      } catch (e) {
        console.warn("Service worker registration failed", e);
      }
    }

    var settings = (await jpIdbGet("settings")) || {};
    if (settings.enabled && "Notification" in window && Notification.permission === "granted") {
      startScheduler();
      tryRegisterPeriodicSync();
    }
    await refreshStatus();
    await loadNextCard();
  }

  init();
})();

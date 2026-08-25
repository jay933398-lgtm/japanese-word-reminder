(function () {
  // Filled in once the Cloudflare Worker is deployed (see worker/README).
  var WORKER_URL = "https://jp-word-push.jay933398.workers.dev";
  var VAPID_PUBLIC_KEY = "BM-ddryxoEkpF5Rc1nwZ8DcovK4-OgrbaI8wc3Ktcm--JDWEpq9Yqmgx31w0m7SDOvyMoiQrxA1cG9lppeX6cVw";

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

  var swReg = null;
  var workerConfigured = WORKER_URL.indexOf("WORKER_URL_PLACEHOLDER") === -1;

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

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

  // Pushes the current level/interval choices to the worker so it knows
  // what to send. Reuses the existing browser push subscription if any.
  async function syncSubscriptionToServer(settings) {
    if (!workerConfigured || !swReg) return null;
    var sub = await swReg.pushManager.getSubscription();
    if (!sub) return null;
    var res = await fetch(WORKER_URL + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        levels: settings.levels,
        intervalMinutes: settings.intervalMinutes
      })
    });
    return res.ok ? res.json() : null;
  }

  async function onSettingsChanged() {
    var settings = await persistSettings();
    if (settings.enabled) {
      await syncSubscriptionToServer(settings);
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

  async function refreshStatus() {
    if (!workerConfigured) {
      enableBtn.disabled = true;
      disableBtn.disabled = true;
      statusText.textContent = "背景推播伺服器尚未設定完成，暫時無法啟用提醒。";
      return;
    }
    var settings = (await jpIdbGet("settings")) || {};
    if (settings.enabled) {
      enableBtn.disabled = true;
      disableBtn.disabled = false;
      var mins = settings.intervalMinutes || 30;
      statusText.textContent = "背景推播已啟用（每 " + mins + " 分鐘）。即使關閉分頁或滑掉 App 也會收到通知。";
    } else {
      enableBtn.disabled = false;
      disableBtn.disabled = true;
      statusText.textContent = "尚未啟用提醒。";
    }
  }

  enableBtn.addEventListener("click", async function () {
    if (!workerConfigured) return;
    if (!("Notification" in window) || !("PushManager" in window)) {
      alert("這個瀏覽器不支援推播通知功能。");
      return;
    }
    var perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("需要允許通知權限才能提醒你喔。");
      return;
    }
    try {
      var sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      var settings = await persistSettings();
      settings.enabled = true;
      await jpIdbSet("settings", settings);
      var result = await syncSubscriptionToServer(settings);
      if (!result || !result.ok) throw new Error("subscribe failed");
      await refreshStatus();
    } catch (e) {
      console.warn("push subscribe failed", e);
      alert("啟用推播失敗，請確認網路連線後再試一次。");
    }
  });

  disableBtn.addEventListener("click", async function () {
    var settings = (await jpIdbGet("settings")) || {};
    settings.enabled = false;
    await jpIdbSet("settings", settings);

    if (swReg) {
      var sub = await swReg.pushManager.getSubscription();
      if (sub) {
        if (workerConfigured) {
          try {
            await fetch(WORKER_URL + "/unsubscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endpoint: sub.endpoint })
            });
          } catch (e) { /* ignore network errors, still unsubscribe locally */ }
        }
        await sub.unsubscribe();
      }
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

    var sub = swReg ? await swReg.pushManager.getSubscription() : null;
    if (sub && workerConfigured) {
      try {
        var res = await fetch(WORKER_URL + "/send-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        var data = await res.json();
        if (!data.ok) alert("測試推播失敗：" + data.error);
        return;
      } catch (e) {
        alert("無法連線到推播伺服器，改用本機預覽通知。");
      }
    }

    // No active subscription yet (or worker unreachable) — show a local preview.
    if (swReg) {
      swReg.active && swReg.active.postMessage({ type: "SHOW_WORD_NOW" });
    }
  });

  // Manual flashcard, shown in-page (no notification involved).
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

  async function init() {
    await loadSettings();

    if ("serviceWorker" in navigator) {
      try {
        swReg = await navigator.serviceWorker.register("sw.js");
        await navigator.serviceWorker.ready;
      } catch (e) {
        console.warn("Service worker registration failed", e);
      }
    }

    // If the browser already has a push subscription (e.g. reopened after
    // being installed) but our local "enabled" flag was lost, reconcile it.
    if (swReg && workerConfigured) {
      var existingSub = await swReg.pushManager.getSubscription();
      var settings = (await jpIdbGet("settings")) || {};
      if (existingSub && !settings.enabled) {
        settings.enabled = true;
        await jpIdbSet("settings", settings);
      } else if (!existingSub && settings.enabled) {
        settings.enabled = false;
        await jpIdbSet("settings", settings);
      }
    }

    await refreshStatus();
    await loadNextCard();
  }

  init();
})();

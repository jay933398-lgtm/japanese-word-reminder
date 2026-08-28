/*
 * Cloudflare Worker: stores push subscriptions in KV and sends real
 * Web Push notifications (Encrypted Content-Encoding aes128gcm + VAPID)
 * on a cron schedule, so notifications arrive even if the phone app
 * is closed / swiped away.
 *
 * Required bindings/vars (set in the Cloudflare dashboard):
 *   - KV namespace binding: SUBS
 *   - Secret var: VAPID_PRIVATE_JWK   (the JSON string from gen_vapid.py)
 *   - Var:        VAPID_PUBLIC_KEY    (base64url public key from gen_vapid.py)
 *   - Var:        VAPID_SUBJECT       e.g. "mailto:you@example.com"
 *   - Var:        ALLOWED_ORIGIN      e.g. "https://yourname.github.io"
 * Cron trigger: run every 5 minutes (star-slash-5 space star space star space star space star)
 */

var WORD_DATA = {
  N5: [
    { k: "水", r: "みず", m: "水" }, { k: "火", r: "ひ", m: "火" }, { k: "木", r: "き", m: "樹木" },
    { k: "山", r: "やま", m: "山" }, { k: "川", r: "かわ", m: "河川" }, { k: "空", r: "そら", m: "天空" },
    { k: "雨", r: "あめ", m: "雨" }, { k: "花", r: "はな", m: "花" }, { k: "犬", r: "いぬ", m: "狗" },
    { k: "猫", r: "ねこ", m: "貓" }, { k: "魚", r: "さかな", m: "魚" }, { k: "鳥", r: "とり", m: "鳥" },
    { k: "人", r: "ひと", m: "人" }, { k: "友達", r: "ともだち", m: "朋友" }, { k: "家族", r: "かぞく", m: "家人" },
    { k: "学校", r: "がっこう", m: "學校" }, { k: "先生", r: "せんせい", m: "老師" }, { k: "学生", r: "がくせい", m: "學生" },
    { k: "会社", r: "かいしゃ", m: "公司" }, { k: "病院", r: "びょういん", m: "醫院" }, { k: "駅", r: "えき", m: "車站" },
    { k: "電車", r: "でんしゃ", m: "電車" }, { k: "車", r: "くるま", m: "車子" }, { k: "自転車", r: "じてんしゃ", m: "腳踏車" },
    { k: "本", r: "ほん", m: "書" }, { k: "新聞", r: "しんぶん", m: "報紙" }, { k: "時間", r: "じかん", m: "時間" },
    { k: "今日", r: "きょう", m: "今天" }, { k: "明日", r: "あした", m: "明天" }, { k: "昨日", r: "きのう", m: "昨天" },
    { k: "朝", r: "あさ", m: "早上" }, { k: "昼", r: "ひる", m: "中午" }, { k: "夜", r: "よる", m: "晚上" },
    { k: "食べ物", r: "たべもの", m: "食物" }, { k: "飲み物", r: "のみもの", m: "飲料" }, { k: "天気", r: "てんき", m: "天氣" },
    { k: "元気", r: "げんき", m: "有精神、健康" }, { k: "好き", r: "すき", m: "喜歡" }, { k: "大きい", r: "おおきい", m: "大的" },
    { k: "小さい", r: "ちいさい", m: "小的" }, { k: "新しい", r: "あたらしい", m: "新的" }, { k: "古い", r: "ふるい", m: "舊的" },
    { k: "高い", r: "たかい", m: "高的、貴的" }, { k: "安い", r: "やすい", m: "便宜的" }
  ],
  N4: [
    { k: "経験", r: "けいけん", m: "經驗" }, { k: "準備", r: "じゅんび", m: "準備" }, { k: "説明", r: "せつめい", m: "說明" },
    { k: "質問", r: "しつもん", m: "問題（提問）" }, { k: "返事", r: "へんじ", m: "回覆" }, { k: "約束", r: "やくそく", m: "約定" },
    { k: "予定", r: "よてい", m: "預定、計畫" }, { k: "都合", r: "つごう", m: "方便與否" }, { k: "用事", r: "ようじ", m: "事情" },
    { k: "意見", r: "いけん", m: "意見" }, { k: "経済", r: "けいざい", m: "經濟" }, { k: "政治", r: "せいじ", m: "政治" },
    { k: "文化", r: "ぶんか", m: "文化" }, { k: "習慣", r: "しゅうかん", m: "習慣" }, { k: "性格", r: "せいかく", m: "性格" },
    { k: "招待", r: "しょうたい", m: "邀請" }, { k: "案内", r: "あんない", m: "導覽、介紹" }, { k: "相談", r: "そうだん", m: "商量" },
    { k: "参加", r: "さんか", m: "參加" }, { k: "利用", r: "りよう", m: "利用、使用" }, { k: "到着", r: "とうちゃく", m: "抵達" },
    { k: "出発", r: "しゅっぱつ", m: "出發" }, { k: "帰国", r: "きこく", m: "回國" }, { k: "旅行", r: "りょこう", m: "旅行" },
    { k: "交通", r: "こうつう", m: "交通" }, { k: "渋滞", r: "じゅうたい", m: "塞車" }, { k: "都会", r: "とかい", m: "都市" },
    { k: "田舎", r: "いなか", m: "鄉下" }, { k: "景色", r: "けしき", m: "景色" }, { k: "温度", r: "おんど", m: "溫度" },
    { k: "湿気", r: "しっけ", m: "濕氣" }, { k: "台風", r: "たいふう", m: "颱風" }, { k: "地震", r: "じしん", m: "地震" },
    { k: "火事", r: "かじ", m: "火災" }, { k: "事故", r: "じこ", m: "事故" }, { k: "危険", r: "きけん", m: "危險" },
    { k: "安全", r: "あんぜん", m: "安全" }, { k: "心配", r: "しんぱい", m: "擔心" }, { k: "我慢", r: "がまん", m: "忍耐" },
    { k: "緊張", r: "きんちょう", m: "緊張" }
  ],
  N3: [
    { k: "環境", r: "かんきょう", m: "環境" }, { k: "影響", r: "えいきょう", m: "影響" }, { k: "原因", r: "げんいん", m: "原因" },
    { k: "結果", r: "けっか", m: "結果" }, { k: "効果", r: "こうか", m: "效果" }, { k: "現象", r: "げんしょう", m: "現象" },
    { k: "印象", r: "いんしょう", m: "印象" }, { k: "態度", r: "たいど", m: "態度" }, { k: "判断", r: "はんだん", m: "判斷" },
    { k: "解決", r: "かいけつ", m: "解決" }, { k: "対策", r: "たいさく", m: "對策" }, { k: "改善", r: "かいぜん", m: "改善" },
    { k: "発展", r: "はってん", m: "發展" }, { k: "成長", r: "せいちょう", m: "成長" }, { k: "進歩", r: "しんぽ", m: "進步" },
    { k: "維持", r: "いじ", m: "維持" }, { k: "継続", r: "けいぞく", m: "持續" }, { k: "変化", r: "へんか", m: "變化" },
    { k: "傾向", r: "けいこう", m: "傾向" }, { k: "特徴", r: "とくちょう", m: "特徵" }, { k: "特色", r: "とくしょく", m: "特色" },
    { k: "分野", r: "ぶんや", m: "領域" }, { k: "範囲", r: "はんい", m: "範圍" }, { k: "制限", r: "せいげん", m: "限制" },
    { k: "条件", r: "じょうけん", m: "條件" }, { k: "基準", r: "きじゅん", m: "基準" }, { k: "評価", r: "ひょうか", m: "評價" },
    { k: "検討", r: "けんとう", m: "討論、研議" }, { k: "提案", r: "ていあん", m: "提案" }, { k: "契約", r: "けいやく", m: "契約" },
    { k: "責任", r: "せきにん", m: "責任" }, { k: "義務", r: "ぎむ", m: "義務" }, { k: "権利", r: "けんり", m: "權利" },
    { k: "制度", r: "せいど", m: "制度" }, { k: "政策", r: "せいさく", m: "政策" }, { k: "組織", r: "そしき", m: "組織" },
    { k: "団体", r: "だんたい", m: "團體" }, { k: "個人", r: "こじん", m: "個人" }, { k: "全体", r: "ぜんたい", m: "全體" },
    { k: "部分", r: "ぶぶん", m: "部分" }
  ],
  N2: [
    { k: "抽象", r: "ちゅうしょう", m: "抽象" }, { k: "具体的", r: "ぐたいてき", m: "具體的" }, { k: "概念", r: "がいねん", m: "概念" },
    { k: "定義", r: "ていぎ", m: "定義" }, { k: "論理", r: "ろんり", m: "邏輯" }, { k: "矛盾", r: "むじゅん", m: "矛盾" },
    { k: "前提", r: "ぜんてい", m: "前提" }, { k: "根拠", r: "こんきょ", m: "根據" }, { k: "証拠", r: "しょうこ", m: "證據" },
    { k: "証明", r: "しょうめい", m: "證明" }, { k: "推測", r: "すいそく", m: "推測" }, { k: "予測", r: "よそく", m: "預測" },
    { k: "想定", r: "そうてい", m: "假設、預想" }, { k: "仮定", r: "かてい", m: "假定" }, { k: "偏見", r: "へんけん", m: "偏見" },
    { k: "主張", r: "しゅちょう", m: "主張" }, { k: "反論", r: "はんろん", m: "反駁" }, { k: "議論", r: "ぎろん", m: "議論、爭論" },
    { k: "妥協", r: "だきょう", m: "妥協" }, { k: "融合", r: "ゆうごう", m: "融合" }, { k: "対立", r: "たいりつ", m: "對立" },
    { k: "均衡", r: "きんこう", m: "均衡" }, { k: "格差", r: "かくさ", m: "差距" }, { k: "貧困", r: "ひんこん", m: "貧困" },
    { k: "豊富", r: "ほうふ", m: "豐富" }, { k: "深刻", r: "しんこく", m: "嚴重、深刻" }, { k: "緊急", r: "きんきゅう", m: "緊急" },
    { k: "慎重", r: "しんちょう", m: "謹慎" }, { k: "大胆", r: "だいたん", m: "大膽" }, { k: "率直", r: "そっちょく", m: "坦率" },
    { k: "曖昧", r: "あいまい", m: "曖昧、模糊" }, { k: "明確", r: "めいかく", m: "明確" }, { k: "詳細", r: "しょうさい", m: "詳細" },
    { k: "概要", r: "がいよう", m: "概要" }
  ],
  N1: [
    { k: "網羅", r: "もうら", m: "網羅、涵蓋" }, { k: "顕著", r: "けんちょ", m: "顯著" }, { k: "甚だしい", r: "はなはだしい", m: "甚為、過度" },
    { k: "些細", r: "ささい", m: "瑣碎、細微" }, { k: "煩雑", r: "はんざつ", m: "繁雜" }, { k: "円滑", r: "えんかつ", m: "圓滑、順利" },
    { k: "均質", r: "きんしつ", m: "均質" }, { k: "遂行", r: "すいこう", m: "執行、完成" }, { k: "履行", r: "りこう", m: "履行" },
    { k: "施行", r: "しこう", m: "施行" }, { k: "撤回", r: "てっかい", m: "撤回" }, { k: "撤退", r: "てったい", m: "撤退" },
    { k: "拘束", r: "こうそく", m: "拘束、約束" }, { k: "崩壊", r: "ほうかい", m: "崩潰、瓦解" }, { k: "衰退", r: "すいたい", m: "衰退" },
    { k: "逸脱", r: "いつだつ", m: "脫離常軌" }, { k: "迂回", r: "うかい", m: "迂迴繞道" }, { k: "折衷", r: "せっちゅう", m: "折衷" },
    { k: "潜在", r: "せんざい", m: "潛在" }, { k: "顕在", r: "けんざい", m: "顯在、明顯存在" }, { k: "露呈", r: "ろてい", m: "暴露、顯現" },
    { k: "隠蔽", r: "いんぺい", m: "隱瞞" }, { k: "欺瞞", r: "ぎまん", m: "欺瞞" }, { k: "是正", r: "ぜせい", m: "糾正" },
    { k: "妥当", r: "だとう", m: "妥當、恰當" }, { k: "甚大", r: "じんだい", m: "甚大、巨大" }, { k: "逼迫", r: "ひっぱく", m: "逼迫、緊迫" },
    { k: "深化", r: "しんか", m: "深化" }, { k: "錯綜", r: "さくそう", m: "錯綜複雜" }, { k: "示唆", r: "しさ", m: "暗示" },
    { k: "洞察", r: "どうさつ", m: "洞察" }, { k: "卓越", r: "たくえつ", m: "卓越" }, { k: "秀逸", r: "しゅういつ", m: "出眾、秀逸" },
    { k: "邁進", r: "まいしん", m: "邁進" }, { k: "醸成", r: "じょうせい", m: "醞釀、形成" }
  ]
};

// ---------- helpers ----------

function base64UrlToUint8Array(base64Url) {
  var padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  var base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(base64);
  var arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64Url(bytes) {
  var str = "";
  for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatUint8Arrays() {
  var arrs = Array.prototype.slice.call(arguments);
  var total = arrs.reduce(function (sum, a) { return sum + a.length; }, 0);
  var out = new Uint8Array(total);
  var offset = 0;
  arrs.forEach(function (a) { out.set(a, offset); offset += a.length; });
  return out;
}

async function idFromEndpoint(endpoint) {
  var data = new TextEncoder().encode(endpoint);
  var hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.prototype.map.call(new Uint8Array(hashBuf), function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

// ---------- word picking (frequency-weighted, mirrors word-picker.js) ----------
// The more times a word has already appeared for this subscriber, the
// lower its chance of being picked again (weight = 1 / (count + 1)).

function buildPool(levels) {
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

function weightedPick(pool, counts) {
  var weights = pool.map(function (w) { return 1 / ((counts[w.id] || 0) + 1); });
  var total = weights.reduce(function (a, b) { return a + b; }, 0);
  var r = Math.random() * total;
  for (var i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function pickWord(levels, countsAll) {
  var pool = buildPool(levels);
  if (pool.length === 0) return { word: null, counts: countsAll };
  var counts = Object.assign({}, countsAll);
  var word = weightedPick(pool, counts);
  counts[word.id] = (counts[word.id] || 0) + 1;
  return { word: word, counts: counts };
}

// ---------- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) ----------

async function importVapidPrivateKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function createVapidAuthHeader(endpoint, vapidPublicKeyB64, vapidPrivateJwk, subject) {
  var url = new URL(endpoint);
  var aud = url.protocol + "//" + url.host;
  var header = { typ: "JWT", alg: "ES256" };
  var now = Math.floor(Date.now() / 1000);
  var payload = { aud: aud, exp: now + 12 * 3600, sub: subject };
  var encHeader = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  var encPayload = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  var signingInput = encHeader + "." + encPayload;
  var key = await importVapidPrivateKey(vapidPrivateJwk);
  var sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput));
  var jwt = signingInput + "." + uint8ArrayToBase64Url(new Uint8Array(sig));
  return "vapid t=" + jwt + ", k=" + vapidPublicKeyB64;
}

async function encryptPayload(payloadObj, p256dhB64, authB64) {
  var plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));
  var uaPublicRaw = base64UrlToUint8Array(p256dhB64);
  var authSecret = base64UrlToUint8Array(authB64);

  var uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  var asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  var asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  var sharedSecretBits = await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey }, asKeyPair.privateKey, 256);
  var sharedSecret = new Uint8Array(sharedSecretBits);

  var keyInfo = concatUint8Arrays(new TextEncoder().encode("WebPush: info\0"), uaPublicRaw, asPublicRaw);
  var ecdhKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  var ikmBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: keyInfo }, ecdhKey, 256
  );
  var ikm = new Uint8Array(ikmBits);

  var salt = crypto.getRandomValues(new Uint8Array(16));
  var ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  var cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt, info: new TextEncoder().encode("Content-Encoding: aes128gcm\0") }, ikmKey, 128
  );
  var nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt, info: new TextEncoder().encode("Content-Encoding: nonce\0") }, ikmKey, 96
  );
  var cek = new Uint8Array(cekBits);
  var nonce = new Uint8Array(nonceBits);

  var paddedPlaintext = concatUint8Arrays(plaintext, new Uint8Array([2]));
  var aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  var ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, paddedPlaintext);
  var ciphertext = new Uint8Array(ciphertextBuf);

  var recordSizeBytes = new Uint8Array(4);
  new DataView(recordSizeBytes.buffer).setUint32(0, 4096, false);
  var idLen = new Uint8Array([asPublicRaw.length]);

  var header = concatUint8Arrays(salt, recordSizeBytes, idLen, asPublicRaw);
  return concatUint8Arrays(header, ciphertext);
}

async function sendWebPush(subscription, payloadObj, env) {
  var body = await encryptPayload(payloadObj, subscription.keys.p256dh, subscription.keys.auth);
  var vapidJwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  var authHeader = await createVapidAuthHeader(subscription.endpoint, env.VAPID_PUBLIC_KEY, vapidJwk, env.VAPID_SUBJECT);

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": authHeader
    },
    body: body
  });
}

function jsonResponse(obj, corsHeaders, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders)
  });
}

function wordPushPayload(word) {
  return {
    title: "📖 " + word.level + " ・ " + word.k,
    body: word.r + "\n" + word.m,
    level: word.level, k: word.k, r: word.r, m: word.m
  };
}

// ---------- HTTP routes ----------

async function handleFetch(request, env) {
  var url = new URL(request.url);
  var cors = {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: cors });

  if (url.pathname === "/subscribe" && request.method === "POST") {
    var body = await request.json();
    if (!body.subscription || !body.subscription.endpoint) {
      return jsonResponse({ ok: false, error: "missing subscription" }, cors, 400);
    }
    var id = await idFromEndpoint(body.subscription.endpoint);
    var existingRaw = await env.SUBS.get(id);
    var existing = existingRaw ? JSON.parse(existingRaw) : {};
    var record = {
      subscription: body.subscription,
      levels: (body.levels && body.levels.length) ? body.levels : ["N5"],
      intervalMinutes: body.intervalMinutes || 30,
      lastSent: Date.now(),
      wordCounts: existing.wordCounts || {}
    };
    await env.SUBS.put(id, JSON.stringify(record));
    return jsonResponse({ ok: true, id: id }, cors);
  }

  if (url.pathname === "/unsubscribe" && request.method === "POST") {
    var ubody = await request.json();
    if (!ubody.endpoint) return jsonResponse({ ok: false, error: "missing endpoint" }, cors, 400);
    var uid = await idFromEndpoint(ubody.endpoint);
    await env.SUBS.delete(uid);
    return jsonResponse({ ok: true }, cors);
  }

  if (url.pathname === "/send-test" && request.method === "POST") {
    var tbody = await request.json();
    if (!tbody.endpoint) return jsonResponse({ ok: false, error: "missing endpoint" }, cors, 400);
    var tid = await idFromEndpoint(tbody.endpoint);
    var raw = await env.SUBS.get(tid);
    if (!raw) return jsonResponse({ ok: false, error: "not subscribed" }, cors, 404);
    var record = JSON.parse(raw);
    var levels = (record.levels && record.levels.length) ? record.levels : ["N5"];
    var picked = pickWord(levels, record.wordCounts || {});
    if (!picked.word) return jsonResponse({ ok: false, error: "no words for level" }, cors, 400);
    var res;
    try {
      res = await sendWebPush(record.subscription, wordPushPayload(picked.word), env);
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e) }, cors, 500);
    }
    if (!res.ok) {
      var text = await res.text();
      return jsonResponse({ ok: false, error: "push service " + res.status + ": " + text }, cors, 502);
    }
    record.lastSent = Date.now();
    record.wordCounts = picked.counts;
    await env.SUBS.put(tid, JSON.stringify(record));
    return jsonResponse({ ok: true, word: picked.word }, cors);
  }

  return jsonResponse({ ok: false, error: "not found" }, cors, 404);
}

// ---------- Cron: fire due notifications ----------

async function handleScheduled(env) {
  var now = Date.now();
  var cursor;
  do {
    var page = await env.SUBS.list({ cursor: cursor });
    for (var i = 0; i < page.keys.length; i++) {
      var key = page.keys[i].name;
      var raw = await env.SUBS.get(key);
      if (!raw) continue;
      var record = JSON.parse(raw);
      var intervalMs = (record.intervalMinutes || 30) * 60000;
      if (record.lastSent && (now - record.lastSent) < intervalMs) continue;

      var levels = (record.levels && record.levels.length) ? record.levels : ["N5"];
      var picked = pickWord(levels, record.wordCounts || {});
      if (!picked.word) continue;

      try {
        var res = await sendWebPush(record.subscription, wordPushPayload(picked.word), env);
        if (res.status === 404 || res.status === 410) {
          await env.SUBS.delete(key);
          continue;
        }
        if (!res.ok) continue; // transient failure, retry next tick
      } catch (e) {
        continue;
      }

      record.lastSent = now;
      record.wordCounts = picked.counts;
      await env.SUBS.put(key, JSON.stringify(record));
    }
    cursor = page.cursor;
  } while (cursor);
}

export default {
  fetch: function (request, env) {
    return handleFetch(request, env);
  },
  scheduled: function (event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  }
};

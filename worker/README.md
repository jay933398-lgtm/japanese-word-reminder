# 背景推播伺服器（Cloudflare Worker）部署步驟

這個 Worker 負責：記住每個訂閱裝置的難度/間隔設定，並用排程（Cron）定時經由 Web Push 主動把單字通知送到手機——就算 App 被滑掉、分頁關閉也收得到。全程只需要瀏覽器操作，不用裝任何軟體。

## 0. 註冊帳號（免費、不用信用卡）

打開 [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) 註冊一個帳號並登入。

## 1. 建立 KV 命名空間（拿來存訂閱資料）

1. 左側選單找 **Storage & Databases → KV**
2. 按 **Create namespace**，名稱輸入 `jp-word-subs`，建立

## 2. 建立 Worker

1. 左側選單 **Workers & Pages → Create**
2. 選 **Create Worker**，名稱輸入例如 `jp-word-push`（名稱會變成網址的一部分），按 **Deploy** 先部署一個預設範例
3. 部署完成後按 **Edit code**（會打開線上程式碼編輯器）
4. 把編輯器裡原本的內容全部刪掉，貼上這個資料夾裡 [`worker.js`](worker.js) 的完整內容
5. 按右上角 **Save and deploy**

## 3. 綁定 KV 命名空間

1. 回到這個 Worker 的頁面，找 **Settings → Bindings**（或 **Variables**，不同版本位置略有不同）
2. 新增一個 **KV Namespace** binding：
   - Variable name：`SUBS`（一定要打這個名字，程式碼裡是用這個名字讀寫）
   - KV namespace：選剛剛建立的 `jp-word-subs`
3. 儲存

## 4. 設定環境變數

同樣在 **Settings → Variables and Secrets**，新增以下四個：

| 名稱 | 型態 | 值 |
|---|---|---|
| `VAPID_PUBLIC_KEY` | 一般變數 (Text) | `BM-ddryxoEkpF5Rc1nwZ8DcovK4-OgrbaI8wc3Ktcm--JDWEpq9Yqmgx31w0m7SDOvyMoiQrxA1cG9lppeX6cVw` |
| `VAPID_PRIVATE_JWK` | **Secret**（加密） | 見下方說明，**不要**把這個值貼到會上傳 GitHub 的檔案裡 |
| `VAPID_SUBJECT` | 一般變數 | `mailto:jay933398@gmail.com` |
| `ALLOWED_ORIGIN` | 一般變數 | `https://jay933398-lgtm.github.io` |

`VAPID_PRIVATE_JWK` 請務必選 **Secret** 類型（不要選一般變數），因為這是這個推播伺服器的私鑰，外流的話別人就能冒充你的伺服器發推播。它的值放在本機的 `worker/vapid_private_jwk.local.txt`（這個檔案已經被 `.gitignore` 排除，不會上傳到 GitHub），打開複製貼上即可。

儲存後 Worker 通常會自動重新部署；如果沒有，手動按一次 **Deploy**。

## 5. 設定排程（Cron Trigger）

1. 找 **Settings → Triggers → Cron Triggers**（或 **Triggers** 分頁）
2. 按 **Add Cron Trigger**
3. 輸入 `*/5 * * * *`（每 5 分鐘檢查一次有沒有該送的通知）
4. 儲存

## 6. 把網址給我

Worker 頁面最上面會顯示它的網址，長得像：

```
https://jp-word-push.你的帳號.workers.dev
```

把這個網址複製貼給我，我會把它填進 [`app.js`](../app.js) 裡的 `WORKER_URL`，重新 push 到 GitHub，網站就會自動更新完成整合。

## 之後怎麼測試

網址設定好、重新部署之後：
1. 手機打開 App，啟用通知提醒（記得先允許通知權限）
2. 按「立即測試一則通知」——這次會真的透過 Worker 送一則推播回來，即使把 App 切到背景也應該收得到
3. 確認沒問題後，就可以把 App 完全滑掉測試，等到設定的間隔時間應該還是會跳出通知

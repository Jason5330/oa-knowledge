# 開源與分享

OA Knowledge 桌面核心採 MIT 授權，見隨附 `LICENSE`。保留 AnythingLLM 上游 Mintplex Labs 版權聲明；OA 桌面修改另標示 OA Knowledge contributors。此專案是衍生的獨立桌面核心，並非官方 AnythingLLM 桌面發行版。

## 發布內容

- `OA-Knowledge-0.3.1-win-x64.zip`：一般使用者下載解壓後執行，含本機模型與執行環境。
- `OA-Knowledge-0.3.1-source.zip`：可建立獨立 Git 儲存庫的原始碼，包含 desktop 核心、測試、建置腳本、鎖定檔、說明及授權。
- SHA256 檔案：用於核對下載檔案。它們不是程式簽章。

原始碼不含 `node_modules`、大型模型、可執行檔、使用者知識庫、連接登記檔或帳號設定。建置所需的公開資產由腳本下載；詳細步驟見 [ARCHITECTURE.md](ARCHITECTURE.md)。`private: true` 僅防止誤發到 npm，不限制原始碼分享。

## 在新的公開 Git 儲存庫發布

解壓 source.zip，在解壓目錄執行：

```powershell
git init
git add .
git commit -m "Release OA Knowledge 0.3.1"
```

接著在自己的 Git 平台建立空白公開儲存庫，依該平台顯示的 remote／push 指令推送。把 Windows ZIP 放在 Release 附件，原始碼放 Git，避免把大型模型加入一般 Git 歷史。本專案的發布位置為 [Jason5330/oa-knowledge](https://github.com/Jason5330/oa-knowledge)，執行檔位於 [Releases](https://github.com/Jason5330/oa-knowledge/releases)。

## 路徑與資料

共用 MCP 設定由 `desktop/mcp-config.cjs` 產生，沒有開發者的使用者名稱或絕對安裝路徑。執行時才在每位使用者的 LocalAppData 建立連接登記。建置以腳本自身位置解析檔案，能放在不同磁碟及包含中文／空格的目錄。

請分享 release 壓縮檔，不要把 `%LOCALAPPDATA%\OA-Knowledge` 或個人 AI 客戶端設定加入開源專案。來源 ZIP 的排除清單與報告路徑去識別處理由 `scripts/package-complete.cjs` 執行。

## 相依元件

OA 自有程式授權不取代第三方條款。Electron、Node、嵌入模型與 npm 套件保留各自的 LICENSE／NOTICE；套件版本與授權清單見成品的 `reports/dependencies.json`。成品另保留 AnythingLLM 上游授權。正式發布時保留這些檔案。

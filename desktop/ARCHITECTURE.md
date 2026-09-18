# OA 知識庫 0.3 — 架構與重建

沿用 AnythingLLM 的工作區 → 文件解析 → 分段 → 嵌入 → 檢索 → MCP 分層概念。本版自行實作本機核心，沒有打包舊版的 server／collector、雲端供應商、Agent 或 LangChain 相依樹；不宣稱與官方所有功能一致。

```text
Electron 桌面（sandbox + context isolation）
  ├─ 本機 HTTP + 隨機 session token → Node 24 本機核心
  │    ├─ 固定程序入口：離線文件解析（異常與逾時隔離）
  │    ├─ Transformers.js + multilingual-e5-small（CPU，384 維）
  │    ├─ SQLite：文件原始 bytes／解析文字／分段／向量
  │    ├─ 向量相似度 + 關鍵字加權檢索
  │    └─ 使用者選配的 127.0.0.1 本機回答模型
  └─ 窄範圍 preload：備份、還原、原始文件匯出、開啟資料目錄

Claude Code / Codex → stdio MCP → 同一個 SQLite + 本機嵌入
```

0.3 使用新資料檔 `knowledge.sqlite`，沒有就地覆寫 0.1 的 SQLite 或 LanceDB。旧資料透過明確的遷移入口讀取並重建索引。

## 邊界

介面無 Node integration，禁止非本機導航、外部請求與新視窗。API 在解析內容前驗證 session；只綁定 127.0.0.1 動態埠。MCP 以 SQLite readOnly 開啟，回傳長度有限的資料。沒有 MCP HTTP 埠。

Node 離線限制阻擋外部 TCP／fetch／DNS、UDP 與任意子程序。文件解析只允許固定、隨程式提供的 parser 程序；選配模型只允許驗證過的 loopback 埠。解析輸入、解壓縮大小、文字長度、程序記憶體與時間皆有限制。這些是應用層防護，不是 OS 防火牆或完整沙箱的證明。

文件更新先在記憶體完成索引，再以 SQLite transaction 取代。刪除使用 foreign keys 級聯處理，開啟 secure_delete；不承諾 SSD 層的可驗證抹除。備份用 SQLite backup API，還原使用 readOnly 載入與 transaction 合併，拒絕不同 application_id、版本、trigger／view、損壞結構與錯誤向量。

## 原始碼重建

建置環境：Windows x64、可存取公開 npm／Node／GitHub／Hugging Face 的 Node.js 24 LTS。成品正常執行不需下載依賴或模型。

在原始碼根目錄執行：

```powershell
Push-Location desktop
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
npm.cmd ci --no-audit --no-fund
Push-Location runtime
npm.cmd ci --no-audit --no-fund
Pop-Location
node scripts/install-electron.cjs
node scripts/assets.cjs
node scripts/node-runtime.cjs
& ./assets/node.exe --test tests/*.test.cjs
npm.cmd run build
Pop-Location
```

嵌入模型固定 Hugging Face revision `4fd851a90ba06323d9428739c08ff91b09a1bfbe`；Electron 44.4.1 由 npm package checksum 驗證；Node 執行檔由官方 SHASUMS256 驗證。Node 下載腳本選取當時最新 24 LTS，實際版本與 SHA256 寫入 manifest；此次封裝為 24.21.0。其餘 npm 依賴由 runtime/package-lock.json 鎖定。

測試：`OA_TEST_FORMATS=1` 搭配 `node desktop/scripts/complete-service-test.cjs`；設定 `OA_SMOKE_TEST=1` 與獨立 `OA_DATA_DIR` 後啟動 Electron 或封裝程式可測試 UI。測試全使用虛構文件，不會連接實際 Claude／Codex 帳號或外部模型。

原始上游與 LICENSE 保留於原儲存庫。模型、Electron、Node 與 runtime 的各套件授權保留於成品內。來源：AnythingLLM https://github.com/Mintplex-Labs/anything-llm 、Transformers.js https://huggingface.co/docs/transformers.js 、Node SQLite https://nodejs.org/docs/latest-v24.x/api/sqlite.html 。


## Excel 結構化處理（0.3）

XLSX 現在保留欄位、型別、原始值、顯示值與公式狀態；預設排除隱藏資料。文件管理中的「Excel 結構」可核對並指定表頭，另可匯出結構化 JSON。新增 inspect_excel、read_excel_rows、aggregate_excel 三個 MCP 工具；詳見 [Excel 評估與實作](EXCEL-DESIGN.md)。舊版 XLSX 在新版啟動時先備份，再從原始檔升級結構與索引。

## 0.3.1 通用 MCP 入口

`mcp-config.cjs` 產生不含安裝路徑的設定。`main.cjs` 完成服務啟動後，以原子替換登記每位使用者的 `LocalAppData/OA-Knowledge/mcp/connection.json`；測試模式跳過個人登記。PowerShell 僅讀取 JSON，將路徑以獨立參數傳給 bundled Node，不使用 Invoke-Expression 或改動 ExecutionPolicy。搬移／升級後先啟動新位置，再重啟客戶端。詳見 CONNECT-AI.md。

## Excel 自動結構化（0.3.2）

直接匯入 XLSX 即可，無須預先轉檔、指定表頭、匯出 JSON 或再匯入。程式會在本機自動解析工作表、資料區域、欄位、型別、儲存格來源與公式快取，將結構化 JSON 保存於 knowledge.sqlite，並建立搜尋索引。這是資料庫內的 JSON，不會要求使用者管理另一份獨立檔案。

AI 透過 list_documents 可看到 structured.status=ready；接著用 inspect_excel / read_excel_rows 直接取得 JSON，使用 aggregate_excel 計算完整資料區域。匯入後即可使用，不必先打開人工預覽。既有 parserVersion=3 的 Excel 也能直接使用，無须重新匯入。

0.3.2 的統計預設接受自動推測表頭，回傳 headerSource、inferredHeadersUsed、來源列及警告；不把推測標示為已確認。嚴格模式可明確指定 acceptInferredHeaders=false。結構的 reviewRecommended 只表示推測結果建議核對，manualPreparationRequired=false 表示人工準備並非前置步驟；舊的 requiresReview 欄位於讀取時轉換。

「AI 資料」顯示 JSON 已就緒。「下載 JSON 副本（選用）」只用於另存／分享資料，不會觸發首次結構化。「查看資料與進階解析設定」預設收合；只有要修正解析或改變是否包含隱藏資料時才需要操作。

公式仍使用檔案儲存的結果、不重新計算；隱藏資料仍預設排除。自動結構化不代表能保證任意複雜報表的商業語意正確，解析警告會隨 JSON 回傳給 AI。

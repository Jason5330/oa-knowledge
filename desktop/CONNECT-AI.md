# 連接 Claude Code／Codex（Windows 本機）

適用 OA Knowledge 0.3.1。兩個工具可同時連接同一份知識庫，桌面程式關閉後仍可讀取。你仍須自行安裝、登入 Claude Code 或 Codex。

## 每個人第一次使用

1. 解壓縮並保留完整 `OA-Knowledge-0.3.1-win-x64` 資料夾，不能只拿 EXE。
2. 雙擊 `OA-Knowledge.exe`，建立知識庫、匯入文件，等待索引完成。
3. 左下角按「連接 Claude Code / Codex」。依以下步驟複製通用設定。

設定不含任何人的帳號、安裝磁碟或使用者目錄。程式每次正常啟動時，把當前執行檔與資料位置登記在該使用者的 `%LOCALAPPDATA%\OA-Knowledge\mcp\connection.json`。通用入口以 Windows PowerShell 讀取這個登記檔，再啟動隨附 Node 與唯讀 MCP。無須安裝全域 Node、修改 PATH 或以管理員執行。

## Claude Code

1. 在你用 Claude Code 開啟的專案根目錄，建立 `.mcp.json`（確認不是 `.mcp.json.txt`）。
2. 程式內按「Claude Code → 複製通用設定」。新檔可貼上全部 JSON；也可使用成品的 `connections/claude.mcp.json`，複製到專案並改名 `.mcp.json`。
3. 如果專案的 `.mcp.json` 已經設定其他工具（例如 GitHub），不要用 OA 的完整 JSON 蓋掉整份檔案。請在現有 `mcpServers` 工具清單中新增 `oa-knowledge` 這個項目；原本的 GitHub 等項目繼續保留。如果已經有 `oa-knowledge`，則替換這個項目即可，同名項目只留一份。JSON 項目之間用逗號分隔，最後一項後面不要多加逗號。
4. 重新開啟該專案的 Claude Code。如果出現專案 MCP 啟用提示，允許 `oa-knowledge`。
5. 在 Claude Code 輸入 `/mcp`，確認伺服器已連接。終端的 `claude mcp list` 也可協助診斷。

這是專案設定：其他專案也要放入相同通用設定。Claude Code 的專案設定和 `/mcp` 操作依據 [Claude Code 官方 MCP 文件](https://code.claude.com/docs/en/mcp)。

## Codex

1. 按 Win + R，輸入 `%USERPROFILE%\.codex`，在此目錄開啟或建立 `config.toml`。若目錄不存在，先建立。若有自訂 `CODEX_HOME`，則使用該目錄下的 `config.toml`。
2. 程式內按「Codex → 複製通用設定」，加入 `config.toml`；同樣內容在成品 `connections/codex.toml`。
3. 若已存在 `[mcp_servers.oa-knowledge]`，替換這個區塊，並移除它舊的 `[mcp_servers.oa-knowledge.env]` 區塊。保留其他設定，不要重複同名 TOML 表格。
4. 儲存、重新啟動 Codex，開啟 Windows 本機任務。CLI 可用 `/mcp` 查看狀態；終端可用 `codex mcp list` 查看設定。

Codex 使用 `config.toml` 的 stdio MCP 設定；`env_vars` 讓入口取得目前帳號的 `LOCALAPPDATA`。使用者層設定可供本機 Codex 客戶端共用。依據 [OpenAI 官方 MCP 文件](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

## 驗證連線與使用 Excel

先輸入：

> 使用 oa-knowledge 的 list_workspaces 列出我的知識庫，再搜尋「設備借用期限」，附上文件名稱與來源。

Excel 報表可輸入：

> 使用 oa-knowledge 找到預算報表，先呼叫 inspect_excel 確认欄位，再用 read_excel_rows 讀資料。需要加總時呼叫 aggregate_excel，列出工作表、來源列、是否排除合計及公式快取警告。

首次搜尋會載入本機嵌入模型，可能稍候才有結果。Excel 推測的表頭若尚未確認，請先在 OA「Excel 結構」核對並套用表頭。計算採用檔案儲存的結果，不會重新執行 Excel 公式。

## 搬移、升級與分享

知識庫資料是目前 Windows 使用者共用的，獨立於程式專案。Claude Code 的專案 `.mcp.json` 決定哪些專案啟用連接；Codex 的使用者層 `config.toml` 可供本機不同專案使用。它們連接的是同一份 OA 資料，不會因為換專案就複製一份知識庫。目前沒有把 AI 專案限制為只能讀某一個 OA 知識庫。

- 把完整程式資料夾搬到新位置後，先開啟新位置的 EXE，再重新啟動 Claude Code／Codex。通用設定保持相同。
- 同一 Windows 帳號開啟多份 OA 程式時，入口採用最近成功啟動的版本與資料目錄；目前不提供多個自訂資料庫入口。
- 預設文件位於 `%LOCALAPPDATA%\OA-Knowledge`，不跟著程式資料夾搬移。若以 `OA_DATA_DIR` 指定資料目錄，入口會採用這次啟動所使用的位置。
- 發送正式程式壓縮檔或原始碼即可。每個人先開啟一次自己的程式；不需複製你的 `connection.json`。
- 分享程式不會自動分享文件。如果要分享知識庫內容，另外在介面匯出備份，再由對方還原。

## 排除問題與範圍

- 提示先開啟 OA：同一 Windows 帳號先開啟程式一次，完成啟動後再重新載入 AI 工具。
- 找不到程式：確認整個程式資料夾仍在，開啟新位置的 EXE 重新登記。
- 沒有知識庫：確認匯入完成，且工具與 OA 在同一 Windows 帳號下執行。
- 設定解析失敗：檢查 JSON 逗號／括號，以及 TOML 有沒有重複伺服器區塊；不要把 Markdown 的三個反引號貼進設定檔。
- WSL、SSH、遠端主機或雲端任務：本設定是 Windows 本機 stdio，不能直接讓另一個作業系統／遠端主機讀到你的電腦。
- 若端點政策禁止啟動 PowerShell 或子程序，連接會失敗；本程式不會改動執行政策。

MCP 解析、索引與資料儲存在本機。Claude Code／Codex 取得的片段會依各自模型設定處理；連接本機知識庫並不會把這兩個工具的模型自動改成本機模型。OA 的 `ask_local_model` 是另外選配的本機模型介面。

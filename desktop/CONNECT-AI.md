# 連接 Claude Code／Codex（Windows 本機）

適用 OA Knowledge 0.3.1。兩個工具可同時連接同一份知識庫，桌面程式關閉後仍可讀取。你仍須自行安裝、登入 Claude Code 或 Codex。

## 每個人第一次使用

1. 解壓縮並保留完整 `OA-Knowledge-0.3.1-win-x64` 資料夾，不能只拿 EXE。
2. 雙擊 `OA-Knowledge.exe`，建立知識庫、匯入文件，等待索引完成。
3. Claude Code 建議使用下方「使用者共用註冊」；Codex 使用介面的通用 TOML 設定。

設定不含任何人的帳號、安裝磁碟或使用者目錄。程式每次正常啟動時，把當前執行檔與資料位置登記在該使用者的 `%LOCALAPPDATA%\OA-Knowledge\mcp\connection.json`。通用入口以 Windows PowerShell 讀取這個登記檔，再啟動隨附 Node 與唯讀 MCP。無須安裝全域 Node、修改 PATH 或以管理員執行。

## Claude Code：使用者共用註冊（建議）

這個方法只需在每位使用者的電腦上註冊一次，同一 Windows 帳號的不同專案就能連接 OA。無須為每個專案建立 `.mcp.json`。

**請在 Windows PowerShell 執行以下指令，不要貼到 Claude 對話框，也不要把 JSON 當成附件傳給 Claude。** 傳送檔案或對 Claude 說「啟動 MCP」，並不等於完成註冊。

### 1. 開啟 OA 知識庫一次

雙擊 `OA-Knowledge.exe`，等介面正常出現，讓程式記錄自己的安裝位置。先確認 Claude Code 已安裝；PowerShell 中執行 `claude --version` 應能顯示版本。

### 2. 在程式資料夾開啟 PowerShell

用檔案總管打開解壓縮後的程式資料夾，這裡應同時看得到 `OA-Knowledge.exe` 和 `connections` 資料夾。請勿使用 GitHub 原始碼資料夾。

點選檔案總管上方網址列，輸入 `powershell`，按 Enter。PowerShell 就會在這個程式資料夾開啟。

### 3. 貼上三行指令完成註冊

複製下方三行（不用複製 Markdown 的三個反引號），一起貼入 PowerShell 執行：

```powershell
$oa = (Get-Content -LiteralPath '.\connections\claude.mcp.json' -Raw -Encoding UTF8 | ConvertFrom-Json).mcpServers.'oa-knowledge'
$oaArgs = @($oa.args)
claude mcp add --scope user --transport stdio oa-knowledge -- $oa.command @oaArgs
```

第一行讀取程式隨附的通用設定；第二行取出啟動參數；第三行正式向 Claude Code 註冊。`--scope user` 表示「目前 Windows 使用者共用」。指令沒有開發者的帳號或固定安裝位置，也不會刪除其他 MCP 工具。

成功時會顯示已加入 `oa-knowledge` 的訊息。如果顯示同名伺服器已存在，不要重複新增，先執行下一步查看狀態。

### 4. 確認連線

仍在 PowerShell 輸入：

```powershell
claude mcp get oa-knowledge
```

預期看到 `Scope: User config (available in all your projects)` 和 `Status: Connected`（可能帶有勾號）。`Connected` 才表示這次健康檢查成功；只有「已新增」訊息還不等於伺服器能正常啟動。

### 5. 重新開啟 Claude Code 工作階段

儲存目前工作，結束原本的 Claude Code 工作階段，再開新的；若使用桌面程式的 Code 分頁，請重新開啟本機工作階段，必要時重新啟動 Claude 桌面程式。

在新的 Claude Code 對話輸入 `/mcp`，確認清單有 `oa-knowledge`，再問：

> 使用 oa-knowledge 列出我的知識庫。

已經連線成功的使用者只需重新開啟工作階段，不必再次註冊。

## Claude Code：只在單一專案啟用（選用）

只有你想把連接限制在某個專案時，才使用這個方法。已完成上方使用者共用註冊的人不需要再做一次。

1. 在你用 Claude Code 開啟的專案根目錄，建立 **`.mcp.json`，最前面有一個英文句點**。`mcp.json`、`.mcp.json.txt` 都不是這個設定檔名稱。
2. 程式內按「Claude Code → 複製通用設定」。新檔可貼上全部 JSON；也可使用成品的 `connections/claude.mcp.json`，複製到專案並改名 `.mcp.json`。
3. 如果專案的 `.mcp.json` 已經設定其他工具（例如 GitHub），不要用 OA 的完整 JSON 蓋掉整份檔案。請在現有 `mcpServers` 工具清單中新增 `oa-knowledge` 這個項目；原本的 GitHub 等項目繼續保留。如果已經有 `oa-knowledge`，則替換這個項目即可，同名項目只留一份。JSON 項目之間用逗號分隔，最後一項後面不要多加逗號。
4. 重新開啟該專案的 Claude Code。如果出現專案 MCP 啟用提示，允許 `oa-knowledge`。
5. 在 Claude Code 輸入 `/mcp`，確認伺服器已連接。終端的 `claude mcp list` 也可協助診斷。

這是專案設定：其他專案也要放入相同通用設定。兩種設定範圍與 `/mcp` 操作依據 [Claude Code 官方 MCP 文件](https://code.claude.com/docs/en/mcp)。

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

首次搜尋會載入本機嵌入模型，可能稍候才有結果。0.3.2 可直接使用自動建立的 Excel JSON；自動推測表頭會附警告，無須先人工確認或匯出再匯入。若仍使用 0.3.1，AI 可明確設定 acceptInferredHeaders=true，依來源與警告使用自動結構。計算採用檔案儲存的結果，不會重新執行 Excel 公式。

## 搬移、升級與分享

知識庫資料是目前 Windows 使用者共用的，獨立於程式專案。Claude Code 的 `--scope user` 註冊可供不同專案使用；選用的專案 `.mcp.json` 則只在該專案啟用。Codex 的使用者層 `config.toml` 也可供本機不同專案使用。它們連接的是同一份 OA 資料，不會因為換專案就複製一份知識庫。目前沒有把 AI 專案限制為只能讀某一個 OA 知識庫。

- 把完整程式資料夾搬到新位置後，先開啟新位置的 EXE，再重新啟動 Claude Code／Codex。通用設定保持相同。
- 同一 Windows 帳號開啟多份 OA 程式時，入口採用最近成功啟動的版本與資料目錄；目前不提供多個自訂資料庫入口。
- 預設文件位於 `%LOCALAPPDATA%\OA-Knowledge`，不跟著程式資料夾搬移。若以 `OA_DATA_DIR` 指定資料目錄，入口會採用這次啟動所使用的位置。
- 發送正式程式壓縮檔或原始碼即可。每個人先開啟一次自己的程式；不需複製你的 `connection.json`。
- 分享程式不會自動分享文件。如果要分享知識庫內容，另外在介面匯出備份，再由對方還原。

## 排除問題與範圍

- Claude 只是讀取你傳送的 JSON：請回到 PowerShell 依上方步驟註冊；把檔案傳進對話不會自動安裝 MCP。
- 找不到 `claude` 指令：請先完成 Claude Code CLI 安裝，再重新開啟 PowerShell；只有網頁版 Claude 不代表電腦已安裝 CLI。
- 找不到 `connections\claude.mcp.json`：PowerShell 沒有開在 Windows 成品資料夾，或資料夾沒有完整解壓。請重新執行第 2 步。
- 已註冊但原對話看不到：開啟新的 Claude Code 工作階段，再輸入 `/mcp`。
- 同名 OA 連接指向舊位置：先用 `claude mcp get oa-knowledge` 查看 Scope。專案或 local scope 的同名設定可能優先於 user scope，請檢查那一份 OA 設定，保留其他工具。

- 提示先開啟 OA：同一 Windows 帳號先開啟程式一次，完成啟動後再重新載入 AI 工具。
- 找不到程式：確認整個程式資料夾仍在，開啟新位置的 EXE 重新登記。
- 沒有知識庫：確認匯入完成，且工具與 OA 在同一 Windows 帳號下執行。
- 設定解析失敗：檢查 JSON 逗號／括號，以及 TOML 有沒有重複伺服器區塊；不要把 Markdown 的三個反引號貼進設定檔。
- WSL、SSH、遠端主機或雲端任務：本設定是 Windows 本機 stdio，不能直接讓另一個作業系統／遠端主機讀到你的電腦。
- 若端點政策禁止啟動 PowerShell 或子程序，連接會失敗；本程式不會改動執行政策。

MCP 解析、索引與資料儲存在本機。Claude Code／Codex 取得的片段會依各自模型設定處理；連接本機知識庫並不會把這兩個工具的模型自動改成本機模型。OA 的 `ask_local_model` 是另外選配的本機模型介面。

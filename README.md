# OA Knowledge · OA 知識庫

Windows 本機文件知識庫，支援 Excel 結構化整理，讓 Claude Code／Codex 透過 MCP 搜尋文件、讀取來源與查詢報表。

[下載 Windows 版](https://github.com/Jason5330/oa-knowledge/releases/latest) · [連接教學](desktop/CONNECT-AI.md) · [使用說明](desktop/USER-GUIDE.md) · [架構與重建](desktop/ARCHITECTURE.md)

## 開始使用

1. 在 [Releases](https://github.com/Jason5330/oa-knowledge/releases) 下載 `OA-Knowledge-0.3.1-win-x64.zip`。
2. 解壓縮，保留完整資料夾，雙擊 `OA-Knowledge.exe`。適用 Windows x64；不需要另外安裝 Node、Python 或 Docker。
3. 建立知識庫、匯入文件，等待本機索引完成。
4. 左下角按「連接 Claude Code / Codex」，依教學設定 AI 工具。

程式包含本機嵌入模型與執行環境，ZIP 約 640 MiB。GitHub 自動產生的 Source code ZIP 是原始碼，不是可直接執行的 Windows 程式。

## 功能

- 匯入 TXT、Markdown、文字型 PDF、DOCX、XLSX、PPTX、CSV、JSON。
- 本機解析、中文／多語向量索引、搜尋、原文來源、更新與備份還原。
- Excel 保留工作表、欄位、型別、原始值、格式化顯示值、儲存格位置及公式快取狀態；可確認表頭並匯出結構化 JSON。
- 唯讀 MCP 提供 8 個工具，可讀取表格並做指定欄位的加總等彙整；桌面關閉後仍能查詢。
- 可選配 OpenAI 相容的本機回答模型；本程式不包含回答模型。

## Claude Code／Codex 怎麼連接？

每人先開啟 OA 程式一次，使用介面的「複製通用設定」。設定不含開發者帳號或安裝路徑，搬移／升級後開啟新位置的 EXE，再重新載入 AI 工具即可。

- **Claude Code**：專案沒有 `.mcp.json` 時，建立檔案並貼上完整 JSON。如果檔案已設定其他工具，在原有 `mcpServers` 工具清單裡新增 `oa-knowledge`，不要把整份檔案覆蓋掉。
- **Codex**：將通用 TOML 加入使用者目錄的 `.codex/config.toml`；保留其他設定，同名 OA 區塊只留一份。

完整步驟與排除問題：[CONNECT-AI.md](desktop/CONNECT-AI.md)。

連接後可問：

> 使用 oa-knowledge 列出我的知識庫，搜尋設備借用期限，回答時附上文件名稱與來源。

## 全域還是專案？

資料預設保存在目前 Windows 使用者的 `%LOCALAPPDATA%\OA-Knowledge`，獨立於程式專案。不同專案連接 OA 時，可讀同一份資料，不需要重複匯入。

| 項目 | 範圍 |
| --- | --- |
| OA 知識庫資料 | 目前 Windows 帳號共用 |
| Claude Code 專案的 `.mcp.json` | 該專案啟用連接 |
| Codex 使用者的 `.codex/config.toml` | 使用者層級，可供本機不同專案使用 |

連接設定的範圍不代表資料隔離。目前沒有把某個 AI 專案限制為只能讀某一個 OA 知識庫；MCP 可列出目前連接資料庫中的各知識庫。

## 執行與資料邊界

文件解析、索引、儲存和 MCP 都在本機。Claude Code／Codex 取得的片段，會依各自模型設定處理；本機知識庫不會把這兩個工具自動改成本機推論。

通用入口適用 Windows 本機客戶端，不直接適用 WSL、SSH 或雲端任務。程式不更改 Windows 執行政策，也不自動修改 AI 客戶端設定。

目前未提供 OCR、多人帳號、SSO、資料加密、程式簽章或自動更新。Excel 公式使用檔案儲存的結果，不會重新計算；隱藏資料預設不納入索引。詳見 [Excel 設計](desktop/EXCEL-DESIGN.md)。

## 開發與驗證

此儲存庫包含獨立桌面核心，不需要原版 AnythingLLM 的 server／collector。Windows 建置需要公開依賴與模型下載，步驟見 [ARCHITECTURE.md](desktop/ARCHITECTURE.md)。

0.3.1 已通過 16 項核心測試與 37 項封裝整合檢查，另驗證關閉桌面後搜尋及搬移入口。測試使用虛構資料與 MCP 客戶端，未連接實際 Claude／Codex 帳號；本機回答介面使用模擬模型測試。紀錄見 [desktop/reports](desktop/reports)。

## 授權與來源

採 [MIT License](LICENSE)。保留 [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm)／Mintplex Labs 的上游版權聲明；此為獨立衍生桌面核心，非官方 AnythingLLM 桌面發行版。Node、Electron、模型及相依套件保留各自授權。詳見 [開源與分享](desktop/OPEN-SOURCE.md)。

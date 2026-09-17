# Excel 結構化層：評估與實作（0.3）

原本 0.2 只把工作表儲存格串成文字，遺失表頭、格式、公式狀態，也以檔名排序猜測頁籤對應。0.3 改為先建立結構化資料，再產生帶欄位名稱的搜尋片段。

## 五層處理

| 層次 | 0.3 行為 |
|---|---|
| 檔案與工作表 | 依 OOXML relationships 對應頁籤與 XML；保留日期系統，限制解壓縮大小，不讀取外部連結。 |
| 儲存格事實 | 記錄位置、型別、原始值、顯示值、數值格式、日期標準值、公式與儲存結果是否存在。 |
| 表格與欄位 | 優先採用 Excel Table；其他區域按空列／空欄區分，推測表頭。合併值僅在明確 merge 範圍內對應，不任意填滿空白。 |
| 搜尋與檢視 | 索引片段帶工作表、列號、欄位名稱、來源；介面可核對多層表頭、修改表頭列並重新解析，另可匯出 JSON。 |
| 精確讀取與統計 | MCP 直接讀取完整的結構化列；sum／average／min／max／count 使用篩選後的全表原始數值，不以語意搜尋的前幾筆結果冒充全表。 |

## 結構範例

```json
{
  "row": 3,
  "role": "data",
  "cells": [
    {
      "ref": "C3",
      "column": "C",
      "field": "金額 / 實際（元）",
      "kind": "number",
      "raw": 800,
      "display": "NT$800.00",
      "format": "\"NT$\"#,##0.00",
      "formula": {
        "expression": "=B3*0.8",
        "cached": true,
        "recalculated": false
      }
    }
  ]
}
```

JSON 同時包含 sheets、tables、columns、rows、warnings 與解析選項。`field` 是該儲存格的欄位名稱；`ref` 可追溯到原位置；合併儲存格另有 `mergedFrom`。此範例只顯示部分欄位。

## 規則與不確定性

- 預設不索引隱藏工作表、列、欄。原始 XLSX 仍完整保存，匯出原始檔也保留隱藏內容；結構化 JSON 與 MCP 只含此次解析選入的資料。介面勾選「包含隱藏資料」並重新解析後才會納入。
- 表頭來源為 `excel-table`、`inferred` 或 `manual`。規則推測不等同於理解報表；不確定的表頭須核對。統計預設拒絕尚未確認的推測表頭，呼叫端若明確接受，結果仍附上警告。
- 合計／小計依 Table 的 totals 設定及文字標籤判定，統計預設排除。沒有標籤或特殊排版的合計可能無法辨識，必須核對。篩選、排除數量、使用列號會隨結果回傳。
- 公式不執行；有快取值時明確標示為「儲存值，未重算」，缺少結果時使用 null，不代入 0。共用公式保留 master 位置及原式，不假裝已展開每列公式。
- 不重新整理 Power Query、外部連結、樞紐分析。日期同時保留原始序號與 1900／1904 系統；數值格式以 SSF 顯示，不能保證完全複製 Excel 的語系、條件格式或畫面。
- 不分析圖表、顏色或圖片的意義，不是完整 Excel 計算引擎。任意報表的跨表商業關係也不會自動判定。
- 此版支援 XLSX；不是 XLS、XLSB、XLSM 或加密檔案轉換器。每份限制 200,000 個儲存格、200 個區域、每區域 256 欄及 10,000 個索引片段，超出時需拆分。

## MCP 使用流程

1. `inspect_excel(workspace, documentId)`：取得 tableId、欄位代碼、表頭來源及警告。
2. `read_excel_rows(workspace, documentId, tableId, offset, limit)`：取回具型別的列資料，可分頁。
3. `aggregate_excel(...)`：指定欄位，例如 `column: "C"`、`operation: "sum"`，可加 `groupBy` 與 filters；不接受任意 SQL、程式或公式。

一般全文與語意搜尋仍可使用，但涉及全表統計時應使用上述結構化工具。

## 已匯入的 Excel

新版啟動時偵測舊版 XLSX 索引，先建立 SQLite 一致性備份，再從保存的原始 XLSX 重新解析。成功時沿用文件 ID 並以 transaction 替換；失败保留舊內容，提示使用者重新解析。未升級的 XLSX 暫不進入語意搜尋，避免繼續使用已遺失表格關係的舊索引。0.1 版僅保留解析文字的文件無法恢復原始表格，須重新匯入 XLSX。

## 依據

- Microsoft 的公式文件說明 `<v>` 儲存的是上次計算的快取值：[Working with formulas](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas)。
- 數值格式由 SheetJS SSF 處理：[SSF Number Formatter](https://docs.sheetjs.com/docs/constellation/ssf/)。

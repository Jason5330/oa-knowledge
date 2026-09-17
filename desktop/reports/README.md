# 驗證紀錄

smoke-result.json 是封裝程式的整合驗證；standalone-result.json 驗證關閉桌面後的 MCP。unit-tests.txt 包含備份交易、唯讀資料庫、解析與網路限制測試。全部使用虛構資料。

本機模型只以模擬服務驗證介面，原生檔案對話框在測試中回傳測試路徑，實際經過 preload、IPC、檔案存取與 API。這不是任何實際模型品質或完整安全稽核的證明。

SHA256SUMS.txt 涵蓋程式、模型、runtime、UI、鎖定檔及報告，排除 node_modules 逐檔雜湊；相依套件發佈封包 integrity 記錄在 dependencies.json。

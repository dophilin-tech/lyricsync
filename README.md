# LyricSync - 1.0.2 穩定版 (AI 卡拉 OK 播放器)

這是一個專為 Android APK 與 PWA 體驗優化的 AI 卡拉 OK 播放器。

## 核心功能 (1.0.2)
- **錯誤修復**：修正了 `async_hooks` 模組找不到的編譯問題。
- **自動全螢幕**：手機播放時會自動請求進入全螢幕模式，提供沈浸式體驗。
- **彈性歌單面板**：停止播放時，手機版歌單上方會出現拉桿，可往上滑動展開查看完整歌單。
- **智慧捲動歌單**：正在播放的歌曲會自動保持在下方歌單的視覺中間。
- **雙擊手勢**：歌詞區域雙擊快速播放/暫停。
- **AI 聽寫與同步**：上傳時自動聽寫產生 LRC。
- **個人化記憶**：自動儲存字體大小、顏色與背景主題。

## 快速定位根目錄
在您的電腦檔案總管路徑列直接輸入 `cmd` 然後按 **Enter**，跳出的黑色視窗即已位於「根目錄」。

## 硬體要求 (Hardware Requirements)
- **處理器**：建議雙核心以上。
- **記憶體**：至少 2GB RAM (建議 4GB 以上以利 AI 運算)。
- **系統需求**：Android 8.0+ (APK) 或最新版行動瀏覽器。

## 如何上傳至 GitHub
1. 建立 GitHub 儲存庫。
2. 執行：
   ```bash
   git init
   git add .
   git commit -m "LyricSync 1.0.2 Stable"
   git remote add origin [您的GitHub網址]
   git push -u origin main
   ```

## 雲端編譯 APK
- 使用 **Ionic Appflow** 連結 GitHub 即可實現免安裝環境的自動化打包。

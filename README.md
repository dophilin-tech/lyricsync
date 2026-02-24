
# LyricSync - 1.0.1 穩定版 (AI 卡拉 OK 播放器)

這是一個專為 Android APK 與 PWA 體驗優化的 AI 卡拉 OK 播放器。

## 核心功能 (1.0.1)
- **智慧捲動歌單**：在手機版播放時，下方歌單會自動捲動，將當前歌曲保持在視覺中間位置。
- **播歌視覺優化**：正在播放的歌曲名稱改為居中顯示，方便一眼辨認。
- **雙擊手勢**：在歌詞區域「雙擊」即可快速切換播放/暫停。
- **介面個人化記憶**：系統自動儲存「字體大小」、「歌詞顏色」、「背景主題」。
- **AI 聽寫與同步**：上傳時若無歌詞，AI 自動聽寫產生同步 LRC。
- **原生環境優化**：打包 APK 後啟動自動隱藏偵測畫面，直接進入主介面。

## 專案路徑與執行說明
當您在電腦上執行 `firebase deploy` 或 `npm run build` 時，請確保您的終端機 (Terminal/CMD) 位在 **專案根目錄**。
- **根目錄特徵**：資料夾內包含 `package.json`、`apphosting.yaml` 與 `src` 資料夾。
- **如何確認路徑**：
  - Windows: 在檔案總管網址列輸入 `cmd` 並按 Enter。
  - Mac/Linux: 在資料夾上點擊右鍵選擇「在終端機開啟」。

## 硬體要求 (Hardware Requirements)

### 1. 使用者端 (App 運行)
- **處理器**：建議雙核心以上處理器。
- **記憶體**：至少 2GB RAM (建議 4GB 以上以利 AI 運算)。
- **儲存空間**：需有足夠空間儲存 MP3 與歌詞資料 (儲存於 IndexedDB)。
- **系統需求**：Android 8.0+ (APK) 或最新版行動瀏覽器 (PWA)。

### 2. 開發與部署端 (Firebase CLI / Build)
- **環境**：需安裝 Node.js 18.x 或以上版本。
- **記憶體**：執行建置 (`npm run build`) 建議電腦具備 **8GB RAM**。

## 如何將程式碼上傳至 GitHub？
1. **建立 GitHub 儲存庫**：登入 GitHub，建立一個全新的 Repository。
2. **執行指令**：在專案根目錄執行：
   ```bash
   git init
   git add .
   git commit -m "LyricSync 1.0.1 Stable"
   git branch -M main
   git remote add origin [您的GitHub網址]
   git push -u origin main
   ```

## 如何將 APK 分享給他人？
1. **本地編譯 (Android Studio)**：
   - 執行 `npm run cap:open:android`。
   - 選擇 **Build > Build APK(s)**。
2. **雲端編譯 (免安裝環境)**：
   - 使用 **Ionic Appflow** 或 **GitHub Actions** 連結 GitHub 實現自動化打包。
3. **安裝提示**：提醒對方需「允許安裝來自未知來源的應用程式」。

## 部署至 Firebase Hosting
- 建議使用 **Firebase App Hosting** 連結 GitHub，實現每次推送代碼後自動更新網站。

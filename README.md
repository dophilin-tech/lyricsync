
# LyricSync - 1.0.1 穩定版 (AI 卡拉 OK 播放器)

這是一個專為 Android APK 與 PWA 體驗優化的 AI 卡拉 OK 播放器。

## 核心功能 (1.0.1)
- **智慧捲動歌單**：在手機版播放時，下方歌單會自動捲動，將當前歌曲保持在視覺中間位置。
- **播歌視覺優化**：正在播放的歌曲名稱改為居中顯示。
- **雙擊手勢**：在歌詞區域「雙擊」即可快速切換播放/暫停。
- **介面個人化記憶**：系統自動儲存「字體大小」、「歌詞顏色」、「背景主題」。
- **AI 聽寫與同步**：上傳時若無歌詞，AI 自動聽寫產生同步 LRC。
- **原生環境優化**：打包 APK 後啟動自動隱藏偵測畫面，直接進入主介面。

## 硬體要求 (Hardware Requirements)

### 1. 使用者端 (App 運行)
- **處理器**：建議雙核心以上處理器。
- **記憶體**：至少 2GB RAM (建議 4GB 以上以利 AI 運算)。
- **儲存空間**：需有足夠空間儲存 MP3 與歌詞資料 (儲存於 IndexedDB)。
- **系統需求**：Android 8.0+ (APK) 或最新版行動瀏覽器 (PWA)。

### 2. 開發與部署端 (Firebase CLI)
- **環境**：需安裝 Node.js 18.x 或以上版本。
- **記憶體**：執行部署前的建置 (`npm run build`) 建議電腦具備 8GB RAM。
- **工具**：Firebase CLI (透過 npm 安裝)。

## 部署至 Firebase Hosting (電腦端操作)
為了讓您的朋友能透過網址直接使用，建議將 App 部署到 Firebase：

1. **安裝 Firebase CLI**：在電腦開啟終端機執行 `npm install -g firebase-tools`。
2. **登入**：執行 `firebase login` 並選取專案。
3. **部署**：
   - 推薦使用 **Firebase App Hosting**。連結您的 GitHub 儲存庫後，Firebase 會自動處理所有建置與更新。
   - 傳統方式：執行 `npm run build` 後執行 `firebase deploy`。

## 如何將 APK 分享給他人？
1. **產出 APK**：
   - 在電腦執行 `npm run cap:open:android` 開啟 Android Studio。
   - 選擇 **Build > Build APK(s)**。
2. **分享檔案**：
   - 找到產出的 `app-debug.apk` 並分享給朋友（可透過雲端硬碟或通訊軟體）。
3. **安裝提示**：
   - 提醒對方需「允許安裝來自未知來源的應用程式」。

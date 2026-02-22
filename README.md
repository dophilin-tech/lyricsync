# LyricSync - AI Powered Karaoke Player

This is a NextJS karaoke application that synchronizes lyrics using Gemini AI and stores data locally.

## Data Storage
This application uses **IndexedDB** for local data persistence.
- **Location**: Your browser/device's local storage.
- **Capacity**: Can store large MP3 files and lyrics without a small fixed limit like LocalStorage.
- **Privacy**: All audio files and lyrics remain on your device and are not uploaded to a permanent cloud server (except temporarily for AI analysis during the sync process).

## Key Features
- **AI Sync**: Automatically generates LRC files from MP3 and lyrics text.
- **IndexedDB**: Persistent storage for your music library.
- **Customizable UI**: Change font sizes, colors, and background themes.
- **Capacitor Ready**: Configuration available for Android deployment.

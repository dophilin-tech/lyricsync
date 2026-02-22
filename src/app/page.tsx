
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Music, 
  FileText, 
  Upload, 
  Sparkles, 
  Trash2,
  ListMusic,
  Timer,
  Info,
  Type,
  Palette,
  Layout,
  HardDrive,
  Maximize,
  Minimize,
  Sun,
  Repeat,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseLrc, LrcLine, formatTime } from "@/lib/lrc-parser";
import { generateLrcFromMp3AndLyrics } from "@/ai/flows/generate-lrc-from-mp3-and-lyrics";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { saveTrackToDB, getAllTracksFromDB, deleteTrackFromDB, TrackData } from "@/lib/db";

interface Track extends Omit<TrackData, 'mp3Blob'> {
  audioUrl: string;
  mp3DataUri: string; 
  parsedLrc?: LrcLine[];
}

export default function LyricSyncApp() {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [syncOffset, setSyncOffset] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Screen Wake Lock state
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [wakeLockError, setWakeLockError] = useState<string | null>(null);

  // Deletion confirmation
  const [trackToDelete, setTrackToDelete] = useState<string | null>(null);

  // Customization states
  const [fontSize, setFontSize] = useState<string>("md");
  const [activeColor, setActiveColor] = useState<string>("secondary");
  const [bgTheme, setBgTheme] = useState<string>("slate-900");

  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newMp3File, setNewMp3File] = useState<File | null>(null);
  const [newLyricsFile, setNewLyricsFile] = useState<File | null>(null);
  const [newLyricsText, setNewLyricsText] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricScrollRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;

  // Optimized Screen Wake Lock handling with explicit User Gesture support
  const requestWakeLock = useCallback(async (isManual = false) => {
    if (!('wakeLock' in navigator)) {
      setWakeLockError("瀏覽器不支援 Wake Lock API");
      return;
    }

    try {
      // If we already have a lock, release it first to be clean
      if (wakeLock) {
        await wakeLock.release();
        setWakeLock(null);
      }

      const lock = await (navigator as any).wakeLock.request('screen');
      setWakeLock(lock);
      setWakeLockError(null);
      
      lock.addEventListener('release', () => {
        setWakeLock(null);
      });

      if (isManual) {
        toast({ title: "螢幕常亮已啟動", description: "已成功獲取系統鎖定。" });
      }
    } catch (err: any) {
      setWakeLock(null);
      let errorMsg = err.message;
      
      // Detailed diagnostics for common errors
      if (err.name === 'NotAllowedError') {
        const isIframe = window.self !== window.top;
        if (isIframe) {
          errorMsg = "權限被拒絕：偵測到您正在預覽視窗中使用。請點擊右上角按鈕「開啟新分頁」測試此功能。";
        } else {
          errorMsg = "權限被拒絕：請確保使用手機 Chrome 直接開啟網址，不要透過 LINE/FB 開啟。";
        }
      }
      
      setWakeLockError(errorMsg);
      if (isManual) {
        toast({ 
          title: "螢幕常亮失敗", 
          description: errorMsg, 
          variant: "destructive" 
        });
      }
      console.warn("Wake Lock 獲取失敗:", err);
    }
  }, [wakeLock]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isPlaying && !wakeLock) {
        await requestWakeLock();
      }
    };

    if (isPlaying) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        setWakeLock(null);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) wakeLock.release().catch(() => {});
    };
  }, [isPlaying, requestWakeLock]);

  // Sync Fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const loadTracks = async () => {
      try {
        const savedTracks = await getAllTracksFromDB();
        const tracksWithUrls = await Promise.all(savedTracks.map(async (st) => {
          const audioUrl = URL.createObjectURL(st.mp3Blob);
          const mp3DataUri = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(st.mp3Blob);
          });

          return {
            ...st,
            audioUrl,
            mp3DataUri,
            parsedLrc: st.lrcContent ? parseLrc(st.lrcContent) : []
          };
        }));
        setPlaylist(tracksWithUrls);
      } catch (error) {
        console.warn("Failed to load tracks from DB", error);
      } finally {
        setIsLoadingDB(false);
      }
    };
    loadTracks();
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = currentTrack.audioUrl;
      audioRef.current.load();
      setSyncOffset(0);
      setCurrentTime(0);
      if (isPlaying) {
        audioRef.current.play().catch(e => console.warn("Auto-play prevented", e));
        // Ensure wake lock is re-requested on track change
        requestWakeLock();
      }
    }
  }, [currentTrackIndex]);

  const toggleFullscreen = (force?: boolean) => {
    if (force === true || !document.fullscreenElement) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn("Fullscreen request failed", err);
        });
      }
    } else if (force === false || document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (audioRef.current.paused) {
      // Crucial: Request Wake Lock and Fullscreen within the CLICK handler
      requestWakeLock();
      toggleFullscreen(true);
      
      audioRef.current.play().catch(error => {
        console.warn("Playback failed:", error);
        toast({ title: "播放錯誤", description: "瀏覽器封鎖了自動播放，請手動點擊。", variant: "destructive" });
      });
    } else {
      audioRef.current.pause();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const skipTrack = (direction: 'next' | 'prev') => {
    if (playlist.length === 0) return;
    let nextIndex = direction === 'next' ? currentTrackIndex + 1 : currentTrackIndex - 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = playlist.length - 1;
    setCurrentTrackIndex(nextIndex);
  };

  const handleTrackEnded = () => {
    if (playlist.length > 0) {
      setIsPlaying(true);
      skipTrack('next');
    } else {
      setIsPlaying(false);
    }
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async () => {
    if (!newMp3File) {
      toast({ title: "錯誤", description: "請選擇 MP3 檔案。", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const audioUrl = URL.createObjectURL(newMp3File);
      const mp3DataUri = await readFileAsDataURL(newMp3File);
      
      const finalTitle = newTitle || newMp3File.name.replace(/\.[^/.]+$/, "");
      const finalArtist = newArtist || "未知歌手";

      let lyricsToProcess = newLyricsText;
      let lrcContent = "";
      let parsedLrc: LrcLine[] = [];
      let isLrcFile = false;

      if (newLyricsFile) {
        const fileContent = await readFileAsText(newLyricsFile);
        if (newLyricsFile.name.toLowerCase().endsWith('.lrc')) {
          lrcContent = fileContent;
          parsedLrc = parseLrc(lrcContent);
          isLrcFile = true;
        } else {
          lyricsToProcess = fileContent;
        }
      }

      if (lyricsToProcess && !isLrcFile) {
        try {
          toast({ title: "同步中", description: "AI 正在分析音訊以對齊歌詞時間..." });
          const aiRes = await generateLrcFromMp3AndLyrics({
            mp3DataUri,
            lyricsText: lyricsToProcess,
            songTitle: finalTitle,
            artist: finalArtist
          });
          lrcContent = aiRes.lrcContent;
          parsedLrc = parseLrc(lrcContent);
          toast({ title: "成功", description: "AI 已完成歌詞同步！" });
        } catch (err) {
          console.warn(err);
          toast({ title: "AI 錯誤", description: "同步失敗，將使用純文字歌詞。", variant: "destructive" });
        }
      }

      const trackId = Date.now().toString();
      const trackData: TrackData = {
        id: trackId,
        title: finalTitle,
        artist: finalArtist,
        mp3Blob: newMp3File,
        lyricsText: lyricsToProcess || (isLrcFile ? lrcContent.replace(/\[.*?\]/g, '') : ""),
        lrcContent,
        createdAt: Date.now()
      };

      await saveTrackToDB(trackData);

      const newTrack: Track = {
        ...trackData,
        audioUrl,
        mp3DataUri,
        parsedLrc
      };

      setPlaylist(prev => [...prev, newTrack]);
      if (currentTrackIndex === -1) {
        setCurrentTrackIndex(0);
        setIsPlaying(true);
      }
      
      setNewTitle("");
      setNewArtist("");
      setNewMp3File(null);
      setNewLyricsFile(null);
      setNewLyricsText("");
      setIsUploadOpen(false);
    } catch (error) {
      console.warn(error);
      toast({ title: "上傳失敗", description: "處理檔案時發生錯誤。", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmDelete = async () => {
    if (!trackToDelete) return;
    try {
      await deleteTrackFromDB(trackToDelete);
      const indexToRemove = playlist.findIndex(t => t.id === trackToDelete);
      const newPlaylist = playlist.filter(t => t.id !== trackToDelete);
      
      setPlaylist(newPlaylist);
      
      if (currentTrackIndex === indexToRemove) {
        setCurrentTrackIndex(-1);
        setIsPlaying(false);
      } else if (currentTrackIndex > indexToRemove) {
        setCurrentTrackIndex(currentTrackIndex - 1);
      }
      toast({ title: "已刪除", description: "歌曲已從裝置儲存中移除。" });
    } catch (error) {
      console.warn(error);
      toast({ title: "錯誤", description: "無法刪除歌曲。", variant: "destructive" });
    } finally {
      setTrackToDelete(null);
    }
  };

  const adjustedCurrentTime = currentTime - syncOffset;
  const activeLyricIndex = currentTrack?.parsedLrc?.findLastIndex(l => l.time <= adjustedCurrentTime) ?? -1;

  useEffect(() => {
    if (lyricScrollRef.current) {
      if (activeLyricIndex !== -1) {
        const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (currentTime === 0) {
        lyricScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [activeLyricIndex, currentTime]);

  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'sm': return 'text-xl md:text-2xl';
      case 'md': return 'text-2xl md:text-3xl';
      case 'lg': return 'text-3xl md:text-5xl';
      case 'xl': return 'text-4xl md:text-7xl';
      default: return 'text-2xl md:text-3xl';
    }
  };

  const getActiveColorClass = () => {
    switch (activeColor) {
      case 'secondary': return 'text-secondary';
      case 'white': return 'text-white';
      case 'yellow': return 'text-yellow-400';
      case 'green': return 'text-green-400';
      case 'pink': return 'text-pink-400';
      case 'cyan': return 'text-cyan-400';
      default: return 'text-secondary';
    }
  };

  const getBgThemeClass = () => {
    switch (bgTheme) {
      case 'slate-900': return 'bg-slate-900';
      case 'black': return 'bg-black';
      case 'indigo-950': return 'bg-indigo-950';
      case 'zinc-900': return 'bg-zinc-900';
      case 'rose-950': return 'bg-rose-950';
      default: return 'bg-slate-900';
    }
  };

  const getThemeHex = () => {
    switch (bgTheme) {
      case 'slate-900': return '#0f172a';
      case 'black': return '#000000';
      case 'indigo-950': return '#1e1b4b';
      case 'zinc-900': return '#18181b';
      case 'rose-950': return '#450a0a';
      default: return '#0f172a';
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-7xl flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
            <Music className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">LyricSync</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {wakeLock ? (
            <Badge variant="outline" className="flex gap-1.5 items-center text-green-600 bg-green-50 border-green-200">
              <Sun className="w-3 h-3" /> 螢幕常亮已開啟
            </Badge>
          ) : isPlaying ? (
            <Badge 
              variant="outline" 
              className="flex gap-1.5 items-center text-destructive bg-destructive/10 border-destructive cursor-pointer hover:bg-destructive/20"
              onClick={() => {
                requestWakeLock(true);
              }}
            >
              <AlertCircle className="w-3 h-3" /> {wakeLockError ? "喚醒受限 (點擊重試)" : "喚醒關閉"}
              <RefreshCw className="w-2.5 h-2.5 ml-1" />
            </Badge>
          ) : null}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => toggleFullscreen()}
            className="gap-2 h-9"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden sm:inline">{isFullscreen ? "退出全螢幕" : "全螢幕"}</span>
          </Button>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
        {/* Playlist Card */}
        <Card className="lg:col-span-3 h-full flex flex-col overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur order-2 lg:order-1">
          <div className="p-4 border-b flex flex-col gap-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-primary" /> 播放清單
              </h2>
              <div className="flex flex-col items-end">
                <span className="text-xs text-muted-foreground font-medium">
                  {isLoadingDB ? "載入中..." : `${playlist.length} 首歌曲`}
                </span>
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 uppercase font-bold tracking-tighter">
                  <HardDrive className="w-2.5 h-2.5" /> 裝置儲存
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={togglePlay} 
                disabled={!currentTrack}
                className={cn(
                  "flex-1 gap-2 h-11 shadow-lg text-base",
                  isPlaying ? "bg-orange-600 hover:bg-orange-700" : "bg-primary hover:bg-primary/90"
                )}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-5 h-5 fill-current" /> 停止
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" /> 開始
                  </>
                )}
              </Button>
              
              <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="icon" className="h-11 w-11 shadow-lg shrink-0">
                    <Upload className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>上傳新歌曲</DialogTitle>
                    <DialogDescription>
                      新增 MP3 與歌詞。檔案將儲存在您的裝置本地。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="mp3">MP3 檔案 *</Label>
                      <Input 
                        id="mp3" 
                        type="file" 
                        accept="audio/mpeg" 
                        onChange={e => setNewMp3File(e.target.files ? e.target.files[0] : null)} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="title">歌名 (選填，預設為檔名)</Label>
                      <Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例如：Bohemian Rhapsody" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="artist">歌手 (選填)</Label>
                      <Input id="artist" value={newArtist} onChange={e => setNewArtist(e.target.value)} placeholder="例如：Queen" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lyricFile">歌詞檔案 (.txt, .lrc)</Label>
                      <Input 
                        id="lyricFile" 
                        type="file" 
                        accept=".txt,.lrc" 
                        onChange={e => setNewLyricsFile(e.target.files ? e.target.files[0] : null)} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lyrics">或貼上歌詞</Label>
                      <textarea 
                        id="lyrics" 
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        value={newLyricsText}
                        onChange={e => setNewLyricsText(e.target.value)}
                        placeholder="在此貼上歌詞內容..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button 
                      onClick={handleFileUpload} 
                      disabled={isProcessing || !newMp3File}
                      className="w-full"
                    >
                      {isProcessing ? "同步中..." : "開始 AI 同步"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-[300px]">
            {playlist.length === 0 && !isLoadingDB ? (
              <div className="p-12 text-center text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">尚未新增歌曲。</p>
              </div>
            ) : (
              playlist.map((track, index) => (
                <div 
                  key={track.id}
                  onClick={() => {
                    setCurrentTrackIndex(index);
                    setIsPlaying(true);
                    // Crucial: Request Wake Lock and Fullscreen within the CLICK handler
                    requestWakeLock();
                    toggleFullscreen(true);
                  }}
                  className={`group p-4 flex items-center gap-4 cursor-pointer border-b last:border-0 transition-colors ${index === currentTrackIndex ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/50'}`}
                >
                  <div className="relative w-8 h-8 bg-primary/20 rounded-md flex items-center justify-center text-primary shrink-0">
                    {index === currentTrackIndex && isPlaying ? (
                      <div className="flex gap-0.5 items-end h-2.5">
                        <div className="w-0.5 bg-primary animate-bounce h-full"></div>
                        <div className="w-0.5 bg-primary animate-bounce delay-150 h-2/3"></div>
                      </div>
                    ) : (
                      <Music className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-none mb-1">{track.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate uppercase font-bold">{track.artist}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTrackToDelete(track.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </ScrollArea>
        </Card>

        {/* Lyric Display Area */}
        <Card 
          onClick={togglePlay}
          className={cn(
            "lg:col-span-6 h-[500px] lg:h-[650px] relative overflow-hidden border-none shadow-2xl transition-colors duration-500 rounded-3xl order-1 lg:order-2 cursor-pointer group/lyrics",
            getBgThemeClass(),
            "text-white"
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />
          
          <div className="absolute top-4 right-4 opacity-0 group-hover/lyrics:opacity-20 transition-opacity pointer-events-none">
             {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
          </div>

          {currentTrack ? (
            <div className="relative h-full flex flex-col">
              <div className="flex-1 overflow-hidden relative">
                <div 
                  ref={lyricScrollRef}
                  className="h-full space-y-8 overflow-y-auto no-scrollbar pt-[45%] pb-[45%] px-6 md:px-12"
                >
                  {currentTrack.parsedLrc && currentTrack.parsedLrc.length > 0 ? (
                    currentTrack.parsedLrc.map((line, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          getFontSizeClass(),
                          "font-bold transition-all duration-300 transform break-words whitespace-pre-wrap leading-tight",
                          i === activeLyricIndex 
                            ? `${getActiveColorClass()} scale-105 origin-left opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]` 
                            : 'text-white/20 opacity-100'
                        )}
                      >
                        {line.text}
                      </div>
                    ))
                  ) : currentTrack.lyricsText ? (
                    <div className="text-center space-y-6 pt-10 px-4">
                      {currentTrack.lyricsText.split('\n').map((line, i) => (
                        <div key={i} className="text-xl md:text-2xl font-medium text-white/40 break-words whitespace-pre-wrap">
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                      <FileText className="w-16 h-16 mb-4" />
                      <p className="text-xl max-w-sm">找不到歌詞。</p>
                    </div>
                  )}
                </div>
                {/* Visual Gradients for scroll focus */}
                <div 
                  className="absolute top-0 left-0 right-0 h-32 pointer-events-none" 
                  style={{ background: `linear-gradient(to bottom, ${getThemeHex()}, transparent)` }}
                />
                <div 
                  className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" 
                  style={{ background: `linear-gradient(to top, ${getThemeHex()}, transparent)` }}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6 opacity-60">
              <div className="w-24 h-24 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Music className="w-12 h-12 text-indigo-400" />
              </div>
              <h3 className="text-2xl font-bold font-headline">請選擇歌曲開始播放</h3>
            </div>
          )}
        </Card>

        {/* Controls Card */}
        <Card className="lg:col-span-3 h-full flex flex-col border-none shadow-xl bg-card/80 backdrop-blur-md order-3">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="font-semibold flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" /> 正在播放
            </h2>
          </div>
          
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-8">
              {currentTrack ? (
                <>
                  <div>
                    <h2 className="text-xl font-bold font-headline mb-1 line-clamp-2">{currentTrack.title}</h2>
                    <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">{currentTrack.artist}</p>
                  </div>

                  <Separator />

                  {/* Progress Control */}
                  <div className="space-y-3">
                    <Slider 
                      value={[currentTime]} 
                      max={duration || 100} 
                      step={0.1}
                      onValueChange={handleSeek}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Playback Buttons */}
                  <div className="flex items-center justify-center gap-6">
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => skipTrack('prev')}>
                      <SkipBack className="w-6 h-6" />
                    </Button>
                    <Button 
                      size="icon" 
                      className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30"
                      onClick={togglePlay}
                    >
                      {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => skipTrack('next')}>
                      <SkipForward className="w-6 h-6" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground opacity-70">
                    <Repeat className="w-3 h-3 text-primary" />
                    <span>已開啟連續播放</span>
                  </div>

                  <Separator />

                  {/* Settings */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase">
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-3 h-3" /> 音量
                        </div>
                        <span>{Math.round(volume * 100)}%</span>
                      </div>
                      <Slider value={[volume * 100]} max={100} onValueChange={(v) => setVolume(v[0] / 100)} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase">
                        <div className="flex items-center gap-2">
                          <Timer className="w-3 h-3" /> 同步偏移
                        </div>
                        <Badge variant="secondary" className="px-1.5 h-4 text-[9px] bg-orange-500/10 text-orange-600 border-none">
                          {syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(1)}s
                        </Badge>
                      </div>
                      <Slider value={[syncOffset]} min={-2} max={2} step={0.1} onValueChange={(v) => setSyncOffset(v[0])} />
                    </div>

                    <div className="space-y-4">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">視覺設定</p>
                      
                      {/* Font Size Selector */}
                      <div className="space-y-2">
                        <Label className="text-[10px] flex items-center gap-2 uppercase opacity-70">
                          <Type className="w-3 h-3" /> 字體大小
                        </Label>
                        <Select value={fontSize} onValueChange={setFontSize}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="字體大小" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sm">小 (Small)</SelectItem>
                            <SelectItem value="md">中 (Medium)</SelectItem>
                            <SelectItem value="lg">大 (Large)</SelectItem>
                            <SelectItem value="xl">超大 (Extra Large)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Active Color Selector */}
                      <div className="space-y-2">
                        <Label className="text-[10px] flex items-center gap-2 uppercase opacity-70">
                          <Palette className="w-3 h-3" /> 歌詞顏色
                        </Label>
                        <Select value={activeColor} onValueChange={setActiveColor}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="顏色" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="secondary">青色 (預設)</SelectItem>
                            <SelectItem value="white">純白色</SelectItem>
                            <SelectItem value="yellow">金黃色</SelectItem>
                            <SelectItem value="green">萊姆綠</SelectItem>
                            <SelectItem value="pink">亮粉色</SelectItem>
                            <SelectItem value="cyan">電子藍</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Background Theme Selector */}
                      <div className="space-y-2">
                        <Label className="text-[10px] flex items-center gap-2 uppercase opacity-70">
                          <Layout className="w-3 h-3" /> 背景主題
                        </Label>
                        <Select value={bgTheme} onValueChange={setBgTheme}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="背景主題" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="slate-900">深灰 (預設)</SelectItem>
                            <SelectItem value="black">純黑</SelectItem>
                            <SelectItem value="indigo-950">午 midnight 藍</SelectItem>
                            <SelectItem value="zinc-900">深鐵灰</SelectItem>
                            <SelectItem value="rose-950">酒紅色</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* AI Actions */}
                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">AI 工具</p>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2 h-9 text-xs" 
                      onClick={() => {}} 
                      disabled={isProcessing || !currentTrack.lrcContent}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-500" /> 
                      {isProcessing ? "精煉中..." : "使用 AI 優化同步"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-20 text-center opacity-30">
                  <Play className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-xs uppercase font-bold tracking-widest">無播放中歌曲</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!trackToDelete} onOpenChange={(open) => !open && setTrackToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除歌曲？</AlertDialogTitle>
            <AlertDialogDescription>
              這將永久從您的裝置儲存中移除這首歌曲與歌詞。此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <audio 
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleTrackEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <Toaster />
    </div>
  );
}

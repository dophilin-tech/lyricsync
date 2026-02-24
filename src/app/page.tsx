
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Music, 
  Upload, 
  Trash2,
  ListMusic,
  Type,
  Palette,
  Maximize,
  Minimize,
  Settings,
  FileText,
  Layout,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
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
import { transcribeMp3ToLrc } from "@/ai/flows/transcribe-mp3-to-lrc";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIframe, setIsIframe] = useState(false);
  const [isAppLaunched, setIsAppLaunched] = useState(false);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [trackToDelete, setTrackToDelete] = useState<string | null>(null);

  const [fontSize, setFontSize] = useState<string>("md");
  const [activeColor, setActiveColor] = useState<string>("secondary");
  const [bgTheme, setBgTheme] = useState<string>("slate-900");

  const [newTitle, setNewTitle] = useState("");
  const [newMp3File, setNewMp3File] = useState<File | null>(null);
  const [newLyricsText, setNewLyricsText] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricScrollRef = useRef<HTMLDivElement | null>(null);
  const playlistContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const inIframe = window.self !== window.top;
    const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches || (window as any).Capacitor;
    
    if (!inIframe || isStandalone) {
      setIsIframe(false);
      setIsAppLaunched(true);
    } else {
      setIsIframe(true);
    }

    const savedFontSize = localStorage.getItem('lyricSync_fontSize');
    const savedActiveColor = localStorage.getItem('lyricSync_activeColor');
    const savedBgTheme = localStorage.getItem('lyricSync_bgTheme');
    if (savedFontSize) setFontSize(savedFontSize);
    if (savedActiveColor) setActiveColor(savedActiveColor);
    if (savedBgTheme) setBgTheme(savedBgTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem('lyricSync_fontSize', fontSize);
    localStorage.setItem('lyricSync_activeColor', activeColor);
    localStorage.setItem('lyricSync_bgTheme', bgTheme);
  }, [fontSize, activeColor, bgTheme]);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      if (wakeLock) await wakeLock.release();
      const lock = await (navigator as any).wakeLock.request('screen');
      setWakeLock(lock);
    } catch (err: any) {
      console.warn("Wake lock failed:", err.name);
    }
  }, [wakeLock]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isPlaying) await requestWakeLock();
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
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, requestWakeLock, wakeLock]);

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
        console.warn("Failed to load tracks");
      } finally {
        setIsLoadingDB(false);
      }
    };
    loadTracks();
  }, []);

  const activeLyricIndex = currentTrackIndex >= 0 
    ? playlist[currentTrackIndex]?.parsedLrc?.findLastIndex(l => l.time <= (currentTime - syncOffset)) ?? -1 
    : -1;

  useEffect(() => {
    if (lyricScrollRef.current && activeLyricIndex !== -1) {
      const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLyricIndex]);

  // 自動滾動歌單至中間
  useEffect(() => {
    if (playlistContainerRef.current && currentTrackIndex !== -1) {
      const activeItem = playlistContainerRef.current.children[currentTrackIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTrackIndex]);

  const playTrack = async (index: number) => {
    if (index < 0 || index >= playlist.length || !audioRef.current) return;
    const track = playlist[index];
    setCurrentTrackIndex(index);
    audioRef.current.src = track.audioUrl;
    audioRef.current.load();
    try {
      await audioRef.current.play();
      requestWakeLock();
    } catch (error) {
      console.warn("Playback failed:", error);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || currentTrackIndex === -1) {
      if (playlist.length > 0) playTrack(0);
      return;
    }
    if (audioRef.current.paused) {
      audioRef.current.play().then(() => requestWakeLock()).catch(() => {});
    } else {
      audioRef.current.pause();
    }
  };

  const skipTrack = (direction: 'next' | 'prev') => {
    if (playlist.length === 0) return;
    let nextIndex = direction === 'next' ? currentTrackIndex + 1 : currentTrackIndex - 1;
    if (nextIndex >= playlist.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = playlist.length - 1;
    playTrack(nextIndex);
  };

  const handleLyricsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setNewLyricsText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = async () => {
    if (!newMp3File) {
      toast({ title: "錯誤", description: "請選擇 MP3 檔案。", variant: "destructive" });
      return;
    }
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      const mp3DataUri = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(newMp3File);
      });

      const finalTitle = newTitle || newMp3File.name.replace(/\.[^/.]+$/, "");
      const finalArtist = "未知歌手";
      let lrcContent = "";

      if (!newLyricsText) {
        toast({ title: "AI 聽寫中", description: "正在自動分析歌曲音軌..." });
        const aiRes = await transcribeMp3ToLrc({ mp3DataUri, songTitle: finalTitle, artist: finalArtist });
        lrcContent = aiRes.lrcContent;
      } else {
        toast({ title: "同步中", description: "正在對齊歌詞時間..." });
        const aiRes = await generateLrcFromMp3AndLyrics({ mp3DataUri, lyricsText: newLyricsText, songTitle: finalTitle, artist: finalArtist });
        lrcContent = aiRes.lrcContent;
      }

      const trackId = Date.now().toString();
      const trackData: TrackData = {
        id: trackId,
        title: finalTitle,
        artist: finalArtist,
        mp3Blob: newMp3File,
        lyricsText: newLyricsText || "AI 自動聽寫",
        lrcContent,
        createdAt: Date.now()
      };

      await saveTrackToDB(trackData);
      
      const audioUrl = URL.createObjectURL(newMp3File);
      const newTrack: Track = {
        ...trackData,
        audioUrl,
        mp3DataUri,
        parsedLrc: lrcContent ? parseLrc(lrcContent) : []
      };

      setPlaylist(prev => [...prev, newTrack]);
      if (currentTrackIndex === -1) playTrack(playlist.length);
      
      setNewTitle("");
      setNewMp3File(null);
      setNewLyricsText("");
      setIsUploadOpen(false);
      toast({ title: "成功", description: "歌曲已新增" });
    } catch (error) {
      toast({ title: "失敗", description: "處理檔案時發生錯誤。", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

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
      case 'emerald-950': return 'bg-[#064e3b]';
      case 'purple-950': return 'bg-[#3b0764]';
      case 'slate-950': return 'bg-[#020617]';
      default: return 'bg-slate-900';
    }
  };

  const currentTrack = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;

  if (isIframe && !isAppLaunched) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center text-primary-foreground shadow-2xl mb-6 animate-bounce">
          <Music className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">LyricSync</h1>
        <p className="text-slate-400 max-w-xs mb-10 text-sm">
          為了獲得完整的螢幕權限與最佳音質，請點擊下方按鈕啟動獨立網頁。
        </p>
        <Button 
          size="lg" 
          onClick={() => {
            window.open(window.location.href, '_blank');
            setIsAppLaunched(true);
          }} 
          className="h-14 px-10 text-lg font-bold gap-2 rounded-xl"
        >
          <Zap className="w-5 h-5 fill-current" />
          立即啟動 App
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col p-0 overflow-hidden">
      <header className="flex justify-between items-center h-10 px-4 z-10 bg-background/80 backdrop-blur-sm shrink-0 border-b">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-bold tracking-tight text-primary">LyricSync</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Upload className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>新增歌曲</DialogTitle>
                <DialogDescription>上傳 MP3，若無歌詞 AI 將自動聽寫。</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-bold uppercase">1. MP3 檔案 *</Label>
                  <Input type="file" accept="audio/mpeg" onChange={e => setNewMp3File(e.target.files ? e.target.files[0] : null)} />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-bold uppercase">2. 歌曲名稱</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="留空則使用檔名" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-bold uppercase flex items-center gap-1">
                    <FileText className="w-3 h-3" /> 3. 歌詞來源 (.txt)
                  </Label>
                  <Input type="file" accept=".txt" onChange={handleLyricsFileChange} className="h-8 text-[10px]" />
                  <textarea 
                    className="flex min-h-[120px] w-full rounded-md border bg-background px-3 py-2 text-xs"
                    value={newLyricsText}
                    onChange={e => setNewLyricsText(e.target.value)}
                    placeholder="或在此貼上歌詞內容，不填寫則由 AI 自動聽寫..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleFileUpload} disabled={isProcessing || !newMp3File} className="w-full h-10 font-bold">
                  {isProcessing ? "AI 處理中..." : (newLyricsText ? "開始同步" : "開始 AI 聽寫")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[350px]">
              <DialogHeader>
                <DialogTitle>介面設定</DialogTitle>
                <DialogDescription>系統將自動記住您的個人化設定。</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase flex items-center gap-1 opacity-70">
                    <Type className="w-3 h-3" /> 字體大小
                  </Label>
                  <Select value={fontSize} onValueChange={setFontSize}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sm">標準</SelectItem>
                      <SelectItem value="md">中型</SelectItem>
                      <SelectItem value="lg">大型</SelectItem>
                      <SelectItem value="xl">巨型</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase flex items-center gap-1 opacity-70">
                    <Palette className="w-3 h-3" /> 歌詞顏色
                  </Label>
                  <Select value={activeColor} onValueChange={setActiveColor}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="secondary">活力青</SelectItem>
                      <SelectItem value="white">極致白</SelectItem>
                      <SelectItem value="yellow">亮麗黃</SelectItem>
                      <SelectItem value="green">嫩草綠</SelectItem>
                      <SelectItem value="pink">浪漫粉</SelectItem>
                      <SelectItem value="cyan">星空藍</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase flex items-center gap-1 opacity-70">
                    <Layout className="w-3 h-3" /> 背景主題
                  </Label>
                  <Select value={bgTheme} onValueChange={setBgTheme}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slate-900">經典深藍</SelectItem>
                      <SelectItem value="black">極緻純黑</SelectItem>
                      <SelectItem value="indigo-950">午夜藍調</SelectItem>
                      <SelectItem value="zinc-900">深邃灰質</SelectItem>
                      <SelectItem value="rose-950">暗影玫瑰</SelectItem>
                      <SelectItem value="emerald-950">翡翠綠</SelectItem>
                      <SelectItem value="purple-950">幻影紫</SelectItem>
                      <SelectItem value="slate-950">星空藍</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="ghost" size="sm" onClick={() => !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen()} className="h-7 gap-1 px-2 text-xs">
            {isFullscreen ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 歌詞區域 - 佔 75% 高度 */}
        <Card 
          className={cn(
            "flex-[3] lg:flex-[6] relative flex flex-col overflow-hidden border-none transition-colors duration-500 rounded-none h-3/4 lg:h-full",
            getBgThemeClass()
          )}
        >
          {currentTrack ? (
            <div className="relative h-full flex flex-col">
              <div 
                ref={lyricScrollRef} 
                onDoubleClick={togglePlay}
                className="flex-1 overflow-y-auto no-scrollbar pt-[10%] pb-24 px-6 cursor-pointer"
              >
                {currentTrack.parsedLrc?.map((line, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      getFontSizeClass(),
                      "font-bold transition-all duration-300 break-words whitespace-pre-wrap leading-tight mb-4",
                      i === activeLyricIndex 
                        ? `${getActiveColorClass()} scale-105 origin-left opacity-100` 
                        : 'text-white/20'
                    )}
                  >
                    {line.text}
                  </div>
                ))}
              </div>

              {/* 播放控制項 - 獨立底部區塊，不擋歌詞 */}
              <div className="shrink-0 bg-black/60 backdrop-blur-md px-4 py-3 flex justify-between items-center border-t border-white/10 z-20">
                 <div className="flex items-center gap-4">
                   <Button variant="ghost" size="icon" className="h-10 w-10 text-white" onClick={() => skipTrack('prev')}>
                     <SkipBack className="w-5 h-5" />
                   </Button>
                   <Button size="icon" className="h-12 w-12 rounded-full bg-white text-black hover:bg-white/90" onClick={togglePlay}>
                     {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                   </Button>
                   <Button variant="ghost" size="icon" className="h-10 w-10 text-white" onClick={() => skipTrack('next')}>
                     <SkipForward className="w-5 h-5" />
                   </Button>
                 </div>
                 <div className="bg-white/10 rounded-full px-4 py-2 text-xs font-mono text-white/90">
                   {formatTime(currentTime)} / {formatTime(duration)}
                 </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 p-8">
              <Music className="w-10 h-10 mb-2" />
              <p className="text-[10px] uppercase font-bold tracking-widest">請新增或選擇歌曲</p>
            </div>
          )}
        </Card>

        {/* 播放清單區域 - 佔 25% 高度，可獨立滾動且正在播放的置中 */}
        <Card className="flex-[1] lg:flex-[3] flex flex-col overflow-hidden border-none shadow-lg bg-card/50 backdrop-blur-md rounded-none h-1/4 lg:h-full">
          <div className="p-2 border-b flex items-center justify-between bg-muted/30 shrink-0">
             <h2 className="text-[10px] font-bold flex items-center gap-1 uppercase tracking-wider">
               <ListMusic className="w-3 h-3 text-primary" /> 播放清單
             </h2>
             <span className="text-[9px] text-muted-foreground font-bold">{playlist.length} 首</span>
          </div>
          <div 
            ref={playlistContainerRef}
            className="flex-1 overflow-y-auto no-scrollbar"
          >
            {playlist.map((track, index) => (
              <div 
                key={track.id} 
                onClick={() => playTrack(index)}
                className={cn(
                  "group h-[60px] p-3 flex items-center gap-3 cursor-pointer border-b transition-colors",
                  index === currentTrackIndex ? 'bg-primary/20 border-l-4 border-l-primary' : 'hover:bg-muted/50'
                )}
              >
                <div className="w-8 h-8 bg-primary/20 rounded flex items-center justify-center shrink-0 text-primary">
                  {index === currentTrackIndex && isPlaying ? "▶" : <Music className="w-4 h-4" />}
                </div>
                {/* 正在播放的歌名放在中間 (置中) */}
                <div className={cn(
                  "flex-1 flex flex-col min-w-0",
                  index === currentTrackIndex ? "items-center text-center" : "items-start"
                )}>
                  <span className={cn(
                    "text-xs truncate w-full",
                    index === currentTrackIndex ? "font-bold text-primary" : "font-medium"
                  )}>
                    {track.title}
                  </span>
                  {index === currentTrackIndex && <span className="text-[8px] uppercase tracking-tighter opacity-50">NOW PLAYING</span>}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive" 
                  onClick={(e) => { e.stopPropagation(); setTrackToDelete(track.id); }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {playlist.length === 0 && <div className="p-10 text-center opacity-20 text-[10px]">清單為空</div>}
          </div>
        </Card>

        {/* 桌面版專用的播放詳情控制 */}
        <Card className="hidden lg:flex lg:flex-[3] flex-col border-none shadow-lg bg-card/80 backdrop-blur-md p-4 space-y-6">
          {currentTrack ? (
            <>
              <div className="space-y-1">
                <h2 className="text-sm font-bold line-clamp-1">{currentTrack.title}</h2>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">正在播放</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Slider value={[currentTime]} max={duration || 100} step={0.1} onValueChange={v => audioRef.current && (audioRef.current.currentTime = v[0])} />
                  <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold opacity-50 uppercase">音量</Label>
                    <Slider value={[volume * 100]} max={100} onValueChange={v => setVolume(v[0] / 100)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold opacity-50 uppercase">歌詞偏移 {syncOffset.toFixed(1)}s</Label>
                    <Slider value={[syncOffset]} min={-2} max={2} step={0.1} onValueChange={v => setSyncOffset(v[0])} />
                  </div>
                </div>
              </div>
            </>
          ) : (
             <div className="h-full flex items-center justify-center opacity-5">
               <Music className="w-12 h-12" />
             </div>
          )}
        </Card>
      </main>

      <AlertDialog open={!!trackToDelete} onOpenChange={open => !open && setTrackToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除歌曲？</AlertDialogTitle>
            <AlertDialogDescription>這將從您的設備中永久移除歌曲。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if(trackToDelete) { await deleteTrackFromDB(trackToDelete); setPlaylist(prev => prev.filter(t => t.id !== trackToDelete)); setTrackToDelete(null); }}} className="bg-destructive text-destructive-foreground">確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <audio 
        ref={audioRef} 
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => skipTrack('next')}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <Toaster />
    </div>
  );
}

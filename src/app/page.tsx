"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Music, 
  Upload, 
  Trash2,
  ListMusic,
  Timer,
  Type,
  Palette,
  Maximize,
  Minimize,
  Zap,
  FileText,
  Layout
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
import { transcribeMp3ToLrc } from "@/ai/flows/transcribe-mp3-to-lrc";
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
  // --- All Hooks must be at the top ---
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
  const [isIframe, setIsIframe] = useState(false);
  const [isAppLaunched, setIsAppLaunched] = useState(false);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [trackToDelete, setTrackToDelete] = useState<string | null>(null);

  // Settings
  const [fontSize, setFontSize] = useState<string>("md");
  const [activeColor, setActiveColor] = useState<string>("secondary");
  const [bgTheme, setBgTheme] = useState<string>("slate-900");

  const [newTitle, setNewTitle] = useState("");
  const [newMp3File, setNewMp3File] = useState<File | null>(null);
  const [newLyricsText, setNewLyricsText] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricScrollRef = useRef<HTMLDivElement | null>(null);

  // Load settings
  useEffect(() => {
    const savedFontSize = localStorage.getItem('lyricSync_fontSize');
    const savedActiveColor = localStorage.getItem('lyricSync_activeColor');
    const savedBgTheme = localStorage.getItem('lyricSync_bgTheme');
    if (savedFontSize) setFontSize(savedFontSize);
    if (savedActiveColor) setActiveColor(savedActiveColor);
    if (savedBgTheme) setBgTheme(savedBgTheme);
  }, []);

  // Save settings
  useEffect(() => {
    localStorage.setItem('lyricSync_fontSize', fontSize);
    localStorage.setItem('lyricSync_activeColor', activeColor);
    localStorage.setItem('lyricSync_bgTheme', bgTheme);
  }, [fontSize, activeColor, bgTheme]);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

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
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
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
        console.warn("Failed to load tracks");
      } finally {
        setIsLoadingDB(false);
      }
    };
    loadTracks();
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const currentTrack = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;
  const adjustedCurrentTime = currentTime - syncOffset;
  const activeLyricIndex = currentTrack?.parsedLrc?.findLastIndex(l => l.time <= adjustedCurrentTime) ?? -1;

  useEffect(() => {
    if (lyricScrollRef.current && activeLyricIndex !== -1) {
      const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLyricIndex]);

  // Handle early return for iframe after all hooks are declared
  if (isIframe && !isAppLaunched) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center text-primary-foreground shadow-2xl mb-6 animate-bounce">
          <Music className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">LyricSync</h1>
        <p className="text-slate-400 max-w-xs mb-10 text-sm">
          偵測到您正在預覽環境中。請開啟獨立網頁以獲得<strong>螢幕常亮</strong>與<strong>全螢幕</strong>權限。
        </p>
        <Button size="lg" onClick={() => { window.open(window.location.href, '_blank'); setIsAppLaunched(true); }} className="h-14 px-10 text-lg font-bold gap-2 rounded-xl">
          <Zap className="w-5 h-5 fill-current" />
          立即啟動 App
        </Button>
      </div>
    );
  }

  // UI Helpers
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

  const getThemeHex = () => {
    switch (bgTheme) {
      case 'slate-900': return '#0f172a';
      case 'black': return '#000000';
      case 'indigo-950': return '#1e1b4b';
      case 'zinc-900': return '#18181b';
      case 'rose-950': return '#450a0a';
      case 'emerald-950': return '#064e3b';
      case 'purple-950': return '#3b0764';
      case 'slate-950': return '#020617';
      default: return '#0f172a';
    }
  };

  const toggleFullscreen = (force?: boolean) => {
    if (force === true || !document.fullscreenElement) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    } else if (force === false || document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

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
    reader.onload = (event) => setNewLyricsText(event.target?.result as string);
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
        toast({ title: "AI 聽寫中", description: "正在自動從歌曲中聽寫歌詞並同步..." });
        const aiRes = await transcribeMp3ToLrc({ mp3DataUri, songTitle: finalTitle, artist: finalArtist });
        lrcContent = aiRes.lrcContent;
      } else {
        toast({ title: "同步中", description: "AI 正在分析對齊歌詞時間..." });
        const aiRes = await generateLrcFromMp3AndLyrics({ mp3DataUri, lyricsText: newLyricsText, songTitle: finalTitle, artist: finalArtist });
        lrcContent = aiRes.lrcContent;
      }

      const trackId = Date.now().toString();
      const trackData: TrackData = {
        id: trackId, title: finalTitle, artist: finalArtist,
        mp3Blob: newMp3File, lyricsText: newLyricsText || "AI 自動生成歌詞", lrcContent,
        createdAt: Date.now()
      };
      await saveTrackToDB(trackData);
      const audioUrl = URL.createObjectURL(newMp3File);
      const newTrack: Track = { ...trackData, audioUrl, mp3DataUri, parsedLrc: lrcContent ? parseLrc(lrcContent) : [] };
      setPlaylist(prev => [...prev, newTrack]);
      if (currentTrackIndex === -1) playTrack(playlist.length);
      setNewTitle(""); setNewMp3File(null); setNewLyricsText(""); setIsUploadOpen(false);
      toast({ title: "完成", description: "歌曲處理成功！" });
    } catch (error) {
      toast({ title: "失敗", description: "處理檔案時發生錯誤。", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col p-0 overflow-hidden">
      {/* Mini Header */}
      <header className="flex justify-between items-center py-1 px-4 z-10 bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-bold tracking-tight text-primary">LyricSync</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => toggleFullscreen()} className="h-7 gap-1 px-2 text-xs">
          {isFullscreen ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />}
          <span className="hidden sm:inline">{isFullscreen ? "退出" : "全螢幕"}</span>
        </Button>
      </header>

      {/* Main Grid Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-1 px-1 pb-1 overflow-hidden">
        
        {/* Playlist Card - Mobile Bottom / Desktop Left */}
        <Card className="lg:col-span-3 flex flex-col overflow-hidden border-none shadow-lg bg-card/50 backdrop-blur order-2 lg:order-1 h-[250px] lg:h-full">
          <div className="p-2 border-b flex flex-col gap-1.5 bg-muted/30 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-bold flex items-center gap-1">
                <ListMusic className="w-3 h-3 text-primary" /> 播放清單
              </h2>
              <span className="text-[8px] text-muted-foreground font-bold uppercase">
                {isLoadingDB ? "載入中..." : `${playlist.length} SONGS`}
              </span>
            </div>
            <div className="flex gap-1">
              <Button onClick={togglePlay} size="sm" className="flex-1 gap-1.5 h-8 text-[10px] font-bold shadow-sm">
                {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                {isPlaying ? "暫停" : "播放"}
              </Button>
              <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="icon" className="h-8 w-8 shadow-sm"><Upload className="w-3.5 h-3.5" /></Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>新增歌曲</DialogTitle>
                    <DialogDescription>請選擇 MP3 檔案。若留空歌詞，AI 將自動聽寫。</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-3">
                    <div className="grid gap-1">
                      <Label className="text-[10px] font-bold uppercase">1. 音訊檔案 (MP3) *</Label>
                      <Input type="file" accept="audio/mpeg" onChange={e => setNewMp3File(e.target.files ? e.target.files[0] : null)} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] font-bold uppercase">2. 歌曲名稱 (選填)</Label>
                      <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="留空則使用檔名" />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] font-bold uppercase flex items-center gap-1.5">
                        <FileText className="w-3 h-3" /> 3. 歌詞 (.txt 選填)
                      </Label>
                      <Input type="file" accept=".txt" onChange={handleLyricsFileChange} className="h-8 text-[10px] mb-1" />
                      <textarea className="flex min-h-[100px] w-full rounded-md border bg-background px-3 py-2 text-xs" value={newLyricsText} onChange={e => setNewLyricsText(e.target.value)} placeholder="或在此貼上文字..." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleFileUpload} disabled={isProcessing || !newMp3File} className="w-full h-10 font-bold">
                      {isProcessing ? "AI 處理中..." : (newLyricsText ? "開始同步" : "開始 AI 聽寫")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <ScrollArea className="flex-1 overflow-y-auto">
            {playlist.length === 0 && !isLoadingDB ? (
              <div className="p-10 text-center opacity-20"><Music className="w-6 h-6 mx-auto" /></div>
            ) : (
              playlist.map((track, index) => (
                <div key={track.id} onClick={() => playTrack(index)} className={cn("group p-2.5 flex items-center gap-2 cursor-pointer border-b transition-colors", index === currentTrackIndex ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/50')}>
                  <div className="w-5 h-5 bg-primary/20 rounded flex items-center justify-center shrink-0">
                    {index === currentTrackIndex && isPlaying ? <div className="flex gap-0.5"><div className="w-0.5 bg-primary animate-bounce h-2"></div><div className="w-0.5 bg-primary animate-bounce delay-100 h-2"></div></div> : <Music className="w-2.5 h-2.5 text-primary" />}
                  </div>
                  <span className="text-[11px] font-medium truncate flex-1">{track.title}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={(e) => { e.stopPropagation(); setTrackToDelete(track.id); }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))
            )}
          </ScrollArea>
        </Card>

        {/* Lyrics Card - Main Focus */}
        <Card className={cn("lg:col-span-6 flex flex-col relative overflow-hidden border-none shadow-2xl transition-colors duration-500 rounded-xl order-1 lg:order-2 flex-1", getBgThemeClass())}>
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/40 pointer-events-none" />
          {currentTrack ? (
            <div className="relative h-full flex flex-col">
              <div className="flex-1 overflow-hidden relative">
                <div ref={lyricScrollRef} className="h-full space-y-4 overflow-y-auto no-scrollbar pt-[15%] pb-[40%] px-6">
                  {currentTrack.parsedLrc && currentTrack.parsedLrc.length > 0 ? (
                    currentTrack.parsedLrc.map((line, i) => (
                      <div key={i} className={cn(getFontSizeClass(), "font-bold transition-all duration-300 break-words whitespace-pre-wrap leading-tight", i === activeLyricIndex ? `${getActiveColorClass()} scale-105 origin-left opacity-100` : 'text-white/20')}>
                        {line.text}
                      </div>
                    ))
                  ) : (
                    <div className="text-center space-y-3 pt-10"><p className="text-lg text-white/30 font-medium">無動態歌詞</p></div>
                  )}
                </div>
                {/* Fade overlays for smooth lyrics scrolling */}
                <div className="absolute top-0 left-0 right-0 h-16 pointer-events-none" style={{ background: `linear-gradient(to bottom, ${getThemeHex()}, transparent)` }} />
                <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none" style={{ background: `linear-gradient(to top, ${getThemeHex()}, transparent)` }} />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 p-8"><Music className="w-10 h-10 mb-2" /><p className="text-xs uppercase font-bold tracking-widest">請新增或選擇歌曲</p></div>
          )}
        </Card>

        {/* Control Panel Card */}
        <Card className="lg:col-span-3 flex flex-col border-none shadow-lg bg-card/80 backdrop-blur-md order-3 h-fit lg:h-full">
          <ScrollArea className="flex-1 p-3 overflow-y-auto">
            <div className="space-y-4">
              {currentTrack ? (
                <>
                  <div className="space-y-0.5">
                    <h2 className="text-xs font-bold line-clamp-1">{currentTrack.title}</h2>
                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">Playing Now</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Slider value={[currentTime]} max={duration || 100} step={0.1} onValueChange={(v) => { if (audioRef.current) audioRef.current.currentTime = v[0]; }} className="h-4" />
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
                  </div>
                  <div className="flex items-center justify-center gap-4 py-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => skipTrack('prev')}><SkipBack className="w-4 h-4" /></Button>
                    <Button size="icon" className="h-10 w-10 rounded-full shadow-md" onClick={togglePlay}>
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => skipTrack('next')}><SkipForward className="w-4 h-4" /></Button>
                  </div>
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] font-bold uppercase opacity-60"><span>音量</span><span>{Math.round(volume * 100)}%</span></div>
                      <Slider value={[volume * 100]} max={100} onValueChange={(v) => setVolume(v[0] / 100)} className="h-3" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[8px] font-bold uppercase opacity-60"><span>歌詞偏移</span><span>{syncOffset.toFixed(1)}s</span></div>
                      <Slider value={[syncOffset]} min={-2} max={2} step={0.1} onValueChange={(v) => setSyncOffset(v[0])} className="h-3" />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[8px] font-bold uppercase opacity-50 flex items-center gap-1"><Type className="w-2 h-2" /> 字體大小</Label>
                        <Select value={fontSize} onValueChange={setFontSize}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="sm">標準</SelectItem><SelectItem value="md">中型</SelectItem><SelectItem value="lg">大型</SelectItem><SelectItem value="xl">巨型</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[8px] font-bold uppercase opacity-50 flex items-center gap-1"><Palette className="w-2 h-2" /> 歌詞顏色</Label>
                        <Select value={activeColor} onValueChange={setActiveColor}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="secondary">活力青</SelectItem><SelectItem value="white">極致白</SelectItem><SelectItem value="yellow">亮麗黃</SelectItem><SelectItem value="green">嫩草綠</SelectItem><SelectItem value="pink">浪漫粉</SelectItem><SelectItem value="cyan">星空藍</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[8px] font-bold uppercase opacity-50 flex items-center gap-1"><Layout className="w-2 h-2" /> 背景主題</Label>
                        <Select value={bgTheme} onValueChange={setBgTheme}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="slate-900">經典深藍</SelectItem><SelectItem value="black">極緻純黑</SelectItem><SelectItem value="indigo-950">午夜藍調</SelectItem><SelectItem value="zinc-900">深邃灰質</SelectItem><SelectItem value="rose-950">暗影玫瑰</SelectItem><SelectItem value="emerald-950">翡翠綠</SelectItem><SelectItem value="purple-950">幻影紫</SelectItem><SelectItem value="slate-950">星空藍</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-10 text-center opacity-10"><Play className="w-6 h-6 mx-auto" /></div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </main>

      <AlertDialog open={!!trackToDelete} onOpenChange={(open) => !open && setTrackToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>刪除歌曲？</AlertDialogTitle><AlertDialogDescription>這將永久移除歌曲與歌詞。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (trackToDelete) {
                await deleteTrackFromDB(trackToDelete);
                setPlaylist(prev => prev.filter(t => t.id !== trackToDelete));
                setTrackToDelete(null);
                toast({ title: "已刪除" });
              }
            }} className="bg-destructive text-destructive-foreground">確認</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <audio ref={audioRef} onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)} onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)} onEnded={() => skipTrack('next')} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
      <Toaster />
    </div>
  );
}

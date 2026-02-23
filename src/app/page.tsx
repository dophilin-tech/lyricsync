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
  Repeat,
  Zap,
  FileText
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

  const currentTrack = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;

  // Hooks MUST be called unconditionally at the top
  useEffect(() => {
    const isInIframe = window.self !== window.top;
    setIsIframe(isInIframe);
    if (!isInIframe) {
      setIsAppLaunched(true);
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      if (wakeLock) {
        await wakeLock.release();
        setWakeLock(null);
      }
      const lock = await (navigator as any).wakeLock.request('screen');
      setWakeLock(lock);
      lock.addEventListener('release', () => setWakeLock(null));
    } catch (err: any) {
      setWakeLock(null);
    }
  }, [wakeLock]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isPlaying) {
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
        console.warn("Failed to load tracks", error);
      } finally {
        setIsLoadingDB(false);
      }
    };
    loadTracks();
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const adjustedCurrentTime = currentTime - syncOffset;
  const activeLyricIndex = currentTrack?.parsedLrc?.findLastIndex(l => l.time <= adjustedCurrentTime) ?? -1;

  useEffect(() => {
    if (lyricScrollRef.current) {
      if (activeLyricIndex !== -1) {
        const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (currentTime === 0) {
        lyricScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [activeLyricIndex, currentTime]);

  // Conditional early return for iframe detection
  if (isIframe && !isAppLaunched) {
    return (
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center text-primary-foreground shadow-2xl shadow-primary/40 mb-8 animate-bounce">
          <Music className="w-12 h-12" />
        </div>
        <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">LyricSync</h1>
        <p className="text-slate-400 max-w-md mb-12 text-lg leading-relaxed">
          偵測到您正在預覽環境中。為了支援<strong>「螢幕常亮」</strong>與<strong>「全螢幕」</strong>，請點擊下方按鈕在獨立網頁中開啟。
        </p>
        <Button 
          size="lg" 
          onClick={() => { window.open(window.location.href, '_blank'); setIsAppLaunched(true); }}
          className="h-16 px-12 text-xl font-bold gap-3 rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
        >
          <Zap className="w-6 h-6 fill-current" />
          立即啟動 App
        </Button>
      </div>
    );
  }

  // UI Helper functions
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

  const toggleFullscreen = (force?: boolean) => {
    if (force === true || !document.fullscreenElement) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
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
      toggleFullscreen(true);
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
      audioRef.current.play().then(() => {
        requestWakeLock();
        toggleFullscreen(true);
      }).catch(() => {});
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
      const text = event.target?.result as string;
      setNewLyricsText(text);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = async () => {
    if (!newMp3File || !newLyricsText) {
      toast({ title: "錯誤", description: "請選擇 MP3 並輸入歌詞。", variant: "destructive" });
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
      let parsedLrc: LrcLine[] = [];
      try {
        toast({ title: "同步中", description: "AI 正在分析音訊以對齊歌詞時間..." });
        const aiRes = await generateLrcFromMp3AndLyrics({
          mp3DataUri,
          lyricsText: newLyricsText,
          songTitle: finalTitle,
          artist: finalArtist
        });
        lrcContent = aiRes.lrcContent;
        parsedLrc = parseLrc(lrcContent);
        toast({ title: "成功", description: "AI 已完成歌詞同步！" });
      } catch (err) {
        toast({ title: "AI 錯誤", description: "同步失敗，將使用純文字歌詞。", variant: "destructive" });
      }
      const trackId = Date.now().toString();
      const trackData: TrackData = {
        id: trackId, title: finalTitle, artist: finalArtist,
        mp3Blob: newMp3File, lyricsText: newLyricsText, lrcContent,
        createdAt: Date.now()
      };
      await saveTrackToDB(trackData);
      const audioUrl = URL.createObjectURL(newMp3File);
      const newTrack: Track = { ...trackData, audioUrl, mp3DataUri, parsedLrc };
      const newPlaylist = [...playlist, newTrack];
      setPlaylist(newPlaylist);
      if (currentTrackIndex === -1) playTrack(newPlaylist.length - 1);
      setNewTitle(""); setNewMp3File(null); setNewLyricsText(""); setIsUploadOpen(false);
    } catch (error) {
      toast({ title: "上傳失敗", description: "處理檔案時發生錯誤。", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-0">
      <header className="w-full max-w-7xl flex justify-between items-center py-2 px-4 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-primary p-1.5 rounded-lg text-primary-foreground">
            <Music className="w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-primary">LyricSync</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toggleFullscreen()} className="h-8 gap-1.5 px-2">
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-xs">{isFullscreen ? "退出" : "全螢幕"}</span>
          </Button>
        </div>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 items-stretch p-2 pt-0">
        {/* Playlist Card */}
        <Card className="lg:col-span-3 h-full flex flex-col overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur order-2 lg:order-1">
          <div className="p-3 border-b flex flex-col gap-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ListMusic className="w-3.5 h-3.5 text-primary" /> 播放清單
              </h2>
              <span className="text-[10px] text-muted-foreground font-medium">
                {isLoadingDB ? "載入中..." : `${playlist.length} 首歌曲`}
              </span>
            </div>

            <div className="flex gap-2">
              <Button onClick={togglePlay} className={cn("flex-1 gap-2 h-10 shadow-lg text-sm", isPlaying ? "bg-orange-600 hover:bg-orange-700" : "bg-primary hover:bg-primary/90")}>
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? "停止" : "開始"}
              </Button>
              
              <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="icon" className="h-10 w-10 shadow-lg shrink-0">
                    <Upload className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[450px]">
                  <DialogHeader>
                    <DialogTitle>新增歌曲</DialogTitle>
                    <DialogDescription>請選擇 MP3 檔案，並輸入或選擇歌詞檔案。</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="mp3" className="text-xs font-bold">1. 音訊檔案 (MP3) *</Label>
                      <Input id="mp3" type="file" accept="audio/mpeg" onChange={e => setNewMp3File(e.target.files ? e.target.files[0] : null)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="title" className="text-xs font-bold">2. 歌曲名稱 (選填)</Label>
                      <Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例如：Bohemian Rhapsody" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lyrics-file" className="text-xs font-bold flex items-center gap-2">
                        <FileText className="w-3 h-3" /> 3. 歌詞來源 (.txt)
                      </Label>
                      <Input id="lyrics-file" type="file" accept=".txt" onChange={handleLyricsFileChange} className="text-xs" />
                      <textarea 
                        id="lyrics" 
                        className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={newLyricsText}
                        onChange={e => setNewLyricsText(e.target.value)}
                        placeholder="或者在此處直接貼上歌詞內容..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleFileUpload} disabled={isProcessing || !newMp3File || !newLyricsText} className="w-full">
                      {isProcessing ? "AI 同步中..." : "開始 AI 同步"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-[200px]">
            {playlist.length === 0 && !isLoadingDB ? (
              <div className="p-8 text-center text-muted-foreground opacity-30">
                <Music className="w-10 h-10 mx-auto mb-2" />
                <p className="text-xs">尚未新增歌曲。</p>
              </div>
            ) : (
              playlist.map((track, index) => (
                <div key={track.id} onClick={() => playTrack(index)} className={`group p-3 flex items-center gap-3 cursor-pointer border-b last:border-0 transition-colors ${index === currentTrackIndex ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/50'}`}>
                  <div className="relative w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center text-primary shrink-0">
                    {index === currentTrackIndex && isPlaying ? (
                      <div className="flex gap-0.5 items-end h-2">
                        <div className="w-0.5 bg-primary animate-bounce h-full"></div>
                        <div className="w-0.5 bg-primary animate-bounce delay-150 h-2/3"></div>
                      </div>
                    ) : <Music className="w-3 h-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-none">{track.title}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={(e) => { e.stopPropagation(); setTrackToDelete(track.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </ScrollArea>
        </Card>

        {/* Lyrics Card - Stretched to top */}
        <Card onClick={togglePlay} className={cn("lg:col-span-6 h-[550px] lg:h-full relative overflow-hidden border-none shadow-2xl transition-colors duration-500 rounded-3xl order-1 lg:order-2 cursor-pointer group/lyrics", getBgThemeClass(), "text-white")}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />
          {currentTrack ? (
            <div className="relative h-full flex flex-col">
              <div className="flex-1 overflow-hidden relative">
                <div ref={lyricScrollRef} className="h-full space-y-6 overflow-y-auto no-scrollbar pt-[15%] pb-[45%] px-6 md:px-12">
                  {currentTrack.parsedLrc && currentTrack.parsedLrc.length > 0 ? (
                    currentTrack.parsedLrc.map((line, i) => (
                      <div key={i} className={cn(getFontSizeClass(), "font-bold transition-all duration-300 transform break-words whitespace-pre-wrap leading-tight", i === activeLyricIndex ? `${getActiveColorClass()} scale-105 origin-left opacity-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]` : 'text-white/20 opacity-100')}>
                        {line.text}
                      </div>
                    ))
                  ) : (
                    <div className="text-center space-y-4 pt-10 px-4">
                      {currentTrack.lyricsText?.split('\n').map((line, i) => (
                        <div key={i} className="text-lg md:text-xl font-medium text-white/40 break-words whitespace-pre-wrap">{line}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="absolute top-0 left-0 right-0 h-20 pointer-events-none" style={{ background: `linear-gradient(to bottom, ${getThemeHex()}, transparent)` }} />
                <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ background: `linear-gradient(to top, ${getThemeHex()}, transparent)` }} />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6 opacity-40">
              <div className="w-20 h-20 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Music className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold">請點擊上傳或選擇歌曲</h3>
            </div>
          )}
        </Card>

        {/* Control Panel Card */}
        <Card className="lg:col-span-3 h-full flex flex-col border-none shadow-xl bg-card/80 backdrop-blur-md order-3">
          <ScrollArea className="flex-1 p-5">
            <div className="space-y-6">
              {currentTrack ? (
                <>
                  <div>
                    <h2 className="text-lg font-bold font-headline mb-0.5 line-clamp-2 leading-tight">{currentTrack.title}</h2>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">已載入 AI 同步歌詞</p>
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    <Slider value={[currentTime]} max={duration || 100} step={0.1} onValueChange={(v) => { if (audioRef.current) audioRef.current.currentTime = v[0]; }} className="cursor-pointer h-4" />
                    <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skipTrack('prev')}><SkipBack className="w-5 h-5" /></Button>
                    <Button size="icon" className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30" onClick={togglePlay}>
                      {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-1" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skipTrack('next')}><SkipForward className="w-5 h-5" /></Button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-muted-foreground opacity-60">
                    <Repeat className="w-2.5 h-2.5 text-primary" /> <span>連續播放模式</span>
                  </div>
                  <Separator />
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase">
                        <div className="flex items-center gap-1.5"><Volume2 className="w-3 h-3" /> 音量</div>
                        <span>{Math.round(volume * 100)}%</span>
                      </div>
                      <Slider value={[volume * 100]} max={100} onValueChange={(v) => setVolume(v[0] / 100)} className="h-4" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase">
                        <div className="flex items-center gap-1.5"><Timer className="w-3 h-3" /> 同步偏移</div>
                        <Badge variant="secondary" className="px-1 h-3.5 text-[8px] bg-orange-500/10 text-orange-600 border-none">
                          {syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(1)}s
                        </Badge>
                      </div>
                      <Slider value={[syncOffset]} min={-2} max={2} step={0.1} onValueChange={(v) => setSyncOffset(v[0])} className="h-4" />
                    </div>
                    <div className="space-y-4 pt-2">
                      <p className="text-[9px] text-muted-foreground uppercase font-bold opacity-50">外觀設定</p>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] flex items-center gap-1.5 uppercase opacity-60"><Type className="w-2.5 h-2.5" /> 字體</Label>
                          <Select value={fontSize} onValueChange={setFontSize}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sm">小 (Small)</SelectItem><SelectItem value="md">中 (Medium)</SelectItem><SelectItem value="lg">大 (Large)</SelectItem><SelectItem value="xl">超大 (XL)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] flex items-center gap-1.5 uppercase opacity-60"><Palette className="w-2.5 h-2.5" /> 歌詞顏色</Label>
                          <Select value={activeColor} onValueChange={setActiveColor}><SelectTrigger className="h-8 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="secondary">青色</SelectItem><SelectItem value="white">白色</SelectItem><SelectItem value="yellow">金黃</SelectItem><SelectItem value="green">萊姆</SelectItem><SelectItem value="pink">粉紅</SelectItem><SelectItem value="cyan">藍色</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-20 text-center opacity-20">
                  <Play className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-[10px] uppercase font-bold">待機中</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </main>

      <AlertDialog open={!!trackToDelete} onOpenChange={(open) => !open && setTrackToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>刪除歌曲？</AlertDialogTitle>
            <AlertDialogDescription>這將永久移除歌曲與歌詞。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (trackToDelete) {
                await deleteTrackFromDB(trackToDelete);
                setPlaylist(playlist.filter(t => t.id !== trackToDelete));
                setTrackToDelete(null);
                toast({ title: "已刪除", description: "歌曲已移除。" });
              }
            }} className="bg-destructive text-destructive-foreground">確認刪除</AlertDialogAction>
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

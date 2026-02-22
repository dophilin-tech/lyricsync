"use client";

import React, { useState, useRef, useEffect } from "react";
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
  HardDrive
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
import { correctLyricSynchronization } from "@/ai/flows/correct-lyric-synchronization";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { saveTrackToDB, getAllTracksFromDB, deleteTrackFromDB, TrackData } from "@/lib/db";

interface Track extends Omit<TrackData, 'mp3Blob'> {
  audioUrl: string;
  mp3DataUri: string; // 用於 AI 處理
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

  // 初始化載入資料庫
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
        console.error("Failed to load tracks from DB", error);
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
        audioRef.current.play().catch(e => console.log("Auto-play prevented", e));
      }
    }
  }, [currentTrackIndex]); // Only trigger on track index change

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(error => {
        console.error("Playback failed:", error);
        toast({ title: "Playback Error", description: "Browser blocked audio playback.", variant: "destructive" });
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
      toast({ title: "Error", description: "MP3 file is required.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const audioUrl = URL.createObjectURL(newMp3File);
      const mp3DataUri = await readFileAsDataURL(newMp3File);
      
      const finalTitle = newTitle || newMp3File.name.replace(/\.[^/.]+$/, "");
      const finalArtist = newArtist || "Unknown Artist";

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
          toast({ title: "Syncing", description: "AI is analyzing audio for perfect timing..." });
          const aiRes = await generateLrcFromMp3AndLyrics({
            mp3DataUri,
            lyricsText: lyricsToProcess,
            songTitle: finalTitle,
            artist: finalArtist
          });
          lrcContent = aiRes.lrcContent;
          parsedLrc = parseLrc(lrcContent);
          toast({ title: "Success", description: "AI generated synchronized lyrics!" });
        } catch (err) {
          console.error(err);
          toast({ title: "AI Error", description: "AI sync failed. Using plain text.", variant: "destructive" });
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
      console.error(error);
      toast({ title: "Upload Failed", description: "An error occurred during file processing.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const refineSync = async () => {
    if (!currentTrack || !currentTrack.lrcContent) return;
    
    setIsProcessing(true);
    try {
      toast({ title: "Refining", description: "Analyzing audio for timing corrections..." });
      const res = await correctLyricSynchronization({
        mp3DataUri: currentTrack.mp3DataUri,
        currentLrcContent: currentTrack.lrcContent,
        userFeedback: "Analyze vocals to ensure timestamps perfectly match the start of each phrase."
      });

      const updatedTrack = {
        ...currentTrack,
        lrcContent: res.correctedLrcContent,
        parsedLrc: parseLrc(res.correctedLrcContent)
      };

      const dbTracks = await getAllTracksFromDB();
      const dbTrack = dbTracks.find(t => t.id === currentTrack.id);
      if (dbTrack) {
        await saveTrackToDB({
          ...dbTrack,
          lrcContent: res.correctedLrcContent
        });
      }

      const newPlaylist = [...playlist];
      newPlaylist[currentTrackIndex] = updatedTrack;
      setPlaylist(newPlaylist);
      toast({ title: "Refinement Complete", description: res.correctionsSummary });
    } catch (err) {
      console.error(err);
      toast({ title: "Refinement Failed", description: "AI sync correction failed.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTrack = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTrackFromDB(id);
      const indexToRemove = playlist.findIndex(t => t.id === id);
      const newPlaylist = playlist.filter(t => t.id !== id);
      
      setPlaylist(newPlaylist);
      
      if (currentTrackIndex === indexToRemove) {
        setCurrentTrackIndex(-1);
        setIsPlaying(false);
      } else if (currentTrackIndex > indexToRemove) {
        setCurrentTrackIndex(currentTrackIndex - 1);
      }
      toast({ title: "Deleted", description: "Track removed from device storage." });
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to delete track.", variant: "destructive" });
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
        // Reset scroll to top when track resets
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
      <header className="w-full max-w-7xl flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
            <Music className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">LyricSync</h1>
        </div>
        
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-secondary hover:bg-secondary/90 shadow-lg">
              <Upload className="w-4 h-4" /> Upload Song
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Upload New Track</DialogTitle>
              <DialogDescription>
                Add an MP3 and lyrics. Files will be saved locally on your device.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="mp3">MP3 File *</Label>
                <Input 
                  id="mp3" 
                  type="file" 
                  accept="audio/mpeg" 
                  onChange={e => setNewMp3File(e.target.files ? e.target.files[0] : null)} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="title">Song Title (Optional)</Label>
                <Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Bohemian Rhapsody" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="artist">Artist Name (Optional)</Label>
                <Input id="artist" value={newArtist} onChange={e => setNewArtist(e.target.value)} placeholder="e.g. Queen" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lyricFile">Lyric File (.txt, .lrc)</Label>
                <Input 
                  id="lyricFile" 
                  type="file" 
                  accept=".txt,.lrc" 
                  onChange={e => setNewLyricsFile(e.target.files ? e.target.files[0] : null)} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lyrics">Or Paste Lyrics</Label>
                <textarea 
                  id="lyrics" 
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={newLyricsText}
                  onChange={e => setNewLyricsText(e.target.value)}
                  placeholder="Paste lyrics here..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={handleFileUpload} 
                disabled={isProcessing || !newMp3File}
                className="w-full"
              >
                {isProcessing ? "Analyzing..." : "Start AI Sync"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch">
        <Card className="lg:col-span-3 h-full flex flex-col overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur">
          <div className="p-4 border-b flex items-center justify-between bg-muted/30">
            <h2 className="font-semibold flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-primary" /> Playlist
            </h2>
            <div className="flex flex-col items-end">
              <span className="text-xs text-muted-foreground font-medium">
                {isLoadingDB ? "Loading..." : `${playlist.length} Tracks`}
              </span>
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60 uppercase font-bold tracking-tighter">
                <HardDrive className="w-2.5 h-2.5" /> On Device
              </div>
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-[300px]">
            {playlist.length === 0 && !isLoadingDB ? (
              <div className="p-12 text-center text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-sm">No tracks added yet.</p>
              </div>
            ) : (
              playlist.map((track, index) => (
                <div 
                  key={track.id}
                  onClick={() => setCurrentTrackIndex(index)}
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
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeleteTrack(track.id, e)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </ScrollArea>
        </Card>

        <Card className={cn(
          "lg:col-span-6 h-[650px] relative overflow-hidden border-none shadow-2xl transition-colors duration-500 rounded-3xl",
          getBgThemeClass(),
          "text-white"
        )}>
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />
          
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
                      <p className="text-xl max-w-sm">No lyrics found.</p>
                    </div>
                  )}
                </div>
                {/* Gradient Masks */}
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
              <h3 className="text-2xl font-bold font-headline">Select a track to start</h3>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3 h-full flex flex-col border-none shadow-xl bg-card/80 backdrop-blur-md">
          <div className="p-4 border-b bg-muted/30">
            <h2 className="font-semibold flex items-center gap-2">
              <Info className="w-4 h-4 text-primary" /> Now Playing
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

                  <Separator />

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase">
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-3 h-3" /> Volume
                        </div>
                        <span>{Math.round(volume * 100)}%</span>
                      </div>
                      <Slider value={[volume * 100]} max={100} onValueChange={(v) => setVolume(v[0] / 100)} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase">
                        <div className="flex items-center gap-2">
                          <Timer className="w-3 h-3" /> Sync Offset
                        </div>
                        <Badge variant="secondary" className="px-1.5 h-4 text-[9px] bg-orange-500/10 text-orange-600 border-none">
                          {syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(1)}s
                        </Badge>
                      </div>
                      <Slider value={[syncOffset]} min={-2} max={2} step={0.1} onValueChange={(v) => setSyncOffset(v[0])} />
                    </div>

                    <div className="space-y-4">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Visual Settings</p>
                      
                      <div className="space-y-2">
                        <Label className="text-[10px] flex items-center gap-2 uppercase opacity-70">
                          <Type className="w-3 h-3" /> Size
                        </Label>
                        <Select value={fontSize} onValueChange={setFontSize}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="Font Size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sm">Small</SelectItem>
                            <SelectItem value="md">Medium</SelectItem>
                            <SelectItem value="lg">Large</SelectItem>
                            <SelectItem value="xl">Extra Large</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] flex items-center gap-2 uppercase opacity-70">
                          <Palette className="w-3 h-3" /> Lyric Color
                        </Label>
                        <Select value={activeColor} onValueChange={setActiveColor}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="Color" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="secondary">Teal (Default)</SelectItem>
                            <SelectItem value="white">Pure White</SelectItem>
                            <SelectItem value="yellow">Golden Yellow</SelectItem>
                            <SelectItem value="green">Lime Green</SelectItem>
                            <SelectItem value="pink">Hot Pink</SelectItem>
                            <SelectItem value="cyan">Electric Cyan</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] flex items-center gap-2 uppercase opacity-70">
                          <Layout className="w-3 h-3" /> Background
                        </Label>
                        <Select value={bgTheme} onValueChange={setBgTheme}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="Background" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="slate-900">Slate (Default)</SelectItem>
                            <SelectItem value="black">Pure Black</SelectItem>
                            <SelectItem value="indigo-950">Midnight Blue</SelectItem>
                            <SelectItem value="zinc-900">Dark Zinc</SelectItem>
                            <SelectItem value="rose-950">Deep Burgundy</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">AI Tools</p>
                    <Button 
                      variant="outline" 
                      className="w-full justify-start gap-2 h-9 text-xs" 
                      onClick={refineSync}
                      disabled={isProcessing || !currentTrack.lrcContent}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-500" /> 
                      {isProcessing ? "Refining..." : "Fine-tune with AI"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-20 text-center opacity-30">
                  <Play className="w-12 h-12 mx-auto mb-4" />
                  <p className="text-xs uppercase font-bold tracking-widest">No Active Track</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>
      </main>

      <audio 
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => skipTrack('next')}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      <Toaster />
    </div>
  );
}

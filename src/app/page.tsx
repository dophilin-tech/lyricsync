"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
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
  CheckCircle2,
  Settings2,
  Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
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
import { parseLrc, LrcLine, formatTime } from "@/lib/lrc-parser";
import { generateLrcFromMp3AndLyrics } from "@/ai/flows/generate-lrc-from-mp3-and-lyrics";
import { correctLyricSynchronization } from "@/ai/flows/correct-lyric-synchronization";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";

interface Track {
  id: string;
  title: string;
  artist: string;
  audioUrl: string; // Blob URL for playback
  mp3DataUri: string; // Base64 for AI flows
  lyricsText?: string;
  lrcContent?: string;
  parsedLrc?: LrcLine[];
}

export default function LyricSyncApp() {
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [syncOffset, setSyncOffset] = useState(0); // Offset in seconds
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // New Upload Form State
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newMp3File, setNewMp3File] = useState<File | null>(null);
  const [newLyricsFile, setNewLyricsFile] = useState<File | null>(null);
  const [newLyricsText, setNewLyricsText] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricScrollRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : null;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = currentTrack.audioUrl;
      audioRef.current.load();
      setSyncOffset(0); // Reset offset for new track
      
      if (isPlaying) {
        audioRef.current.play().catch(e => console.log("Auto-play prevented", e));
      }
    }
  }, [currentTrack]);

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
    if (!newMp3File || !newTitle) {
      toast({ title: "Error", description: "Title and MP3 file are required.", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      const audioUrl = URL.createObjectURL(newMp3File);
      const mp3DataUri = await readFileAsDataURL(newMp3File);
      
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
            songTitle: newTitle,
            artist: newArtist
          });
          lrcContent = aiRes.lrcContent;
          parsedLrc = parseLrc(lrcContent);
          toast({ title: "Success", description: "AI generated synchronized lyrics!" });
        } catch (err) {
          console.error(err);
          toast({ title: "AI Error", description: "AI sync failed. Using plain text.", variant: "destructive" });
        }
      }

      const newTrack: Track = {
        id: Date.now().toString(),
        title: newTitle,
        artist: newArtist || "Unknown Artist",
        audioUrl,
        mp3DataUri,
        lyricsText: lyricsToProcess || (isLrcFile ? lrcContent.replace(/\[.*?\]/g, '') : ""),
        lrcContent,
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

  // Adjust playback time with user offset for lyric matching
  const adjustedCurrentTime = currentTime - syncOffset;
  const activeLyricIndex = currentTrack?.parsedLrc?.findLastIndex(l => l.time <= adjustedCurrentTime) ?? -1;

  useEffect(() => {
    if (lyricScrollRef.current && activeLyricIndex !== -1) {
      const activeEl = lyricScrollRef.current.children[activeLyricIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeLyricIndex]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-6xl flex justify-between items-center mb-8">
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
                Add an MP3 and lyrics. Our AI uses multimodal analysis to "listen" and sync!
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Song Title *</Label>
                <Input id="title" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Bohemian Rhapsody" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="artist">Artist Name</Label>
                <Input id="artist" value={newArtist} onChange={e => setNewArtist(e.target.value)} placeholder="e.g. Queen" />
              </div>
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
                disabled={isProcessing || !newMp3File || !newTitle}
                className="w-full"
              >
                {isProcessing ? "Analyzing Audio..." : "Start AI Sync"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 items-start">
        {/* Playlist Sidebar */}
        <Card className="lg:col-span-4 h-[600px] flex flex-col overflow-hidden border-none shadow-xl bg-card/50 backdrop-blur">
          <div className="p-4 border-b flex items-center justify-between bg-muted/30">
            <h2 className="font-semibold flex items-center gap-2">
              <ListMusic className="w-4 h-4 text-primary" /> Playlist
            </h2>
            <span className="text-xs text-muted-foreground font-medium">{playlist.length} Tracks</span>
          </div>
          <ScrollArea className="flex-1">
            {playlist.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No tracks added yet.</p>
              </div>
            ) : (
              playlist.map((track, index) => (
                <div 
                  key={track.id}
                  onClick={() => {
                    setCurrentTrackIndex(index);
                  }}
                  className={`group p-4 flex items-center gap-4 cursor-pointer border-b last:border-0 transition-colors ${index === currentTrackIndex ? 'bg-primary/10 border-l-4 border-l-primary' : 'hover:bg-muted/50'}`}
                >
                  <div className="relative w-10 h-10 bg-primary/20 rounded-md flex items-center justify-center text-primary group-hover:bg-primary/30 transition-colors">
                    {index === currentTrackIndex && isPlaying ? (
                      <div className="flex gap-0.5 items-end h-3">
                        <div className="w-1 bg-primary animate-bounce delay-75 h-full"></div>
                        <div className="w-1 bg-primary animate-bounce delay-150 h-2/3"></div>
                        <div className="w-1 bg-primary animate-bounce delay-0 h-full"></div>
                      </div>
                    ) : (
                      <Music className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate leading-none mb-1">{track.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                  {track.parsedLrc && track.parsedLrc.length > 0 && <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newPlaylist = playlist.filter(t => t.id !== track.id);
                      setPlaylist(newPlaylist);
                      if (currentTrackIndex === index) {
                        setCurrentTrackIndex(-1);
                        setIsPlaying(false);
                      } else if (currentTrackIndex > index) {
                        setCurrentTrackIndex(currentTrackIndex - 1);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </ScrollArea>
        </Card>

        {/* Player & Karaoke Area */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <Card className="flex-1 min-h-[450px] relative overflow-hidden border-none shadow-2xl bg-slate-900 text-white rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-transparent to-teal-900/40 pointer-events-none" />
            
            {currentTrack ? (
              <div className="relative h-full flex flex-col p-8">
                <div className="flex justify-between items-start mb-8">
                  <div className="max-w-[70%]">
                    <h2 className="text-3xl font-bold font-headline mb-1 truncate">{currentTrack.title}</h2>
                    <p className="text-indigo-200/80 truncate">{currentTrack.artist}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {currentTrack.lrcContent && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={refineSync}
                        disabled={isProcessing}
                        className="bg-white/10 border-white/20 hover:bg-white/20 text-white gap-2 rounded-full shrink-0"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> 
                        {isProcessing ? "AI Refining..." : "Fix Sync with AI"}
                      </Button>
                    )}
                    {syncOffset !== 0 && (
                      <Badge variant="secondary" className="bg-orange-500/20 text-orange-200 border-none">
                        Offset: {syncOffset > 0 ? '+' : ''}{syncOffset.toFixed(1)}s
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <div 
                    ref={lyricScrollRef}
                    className="h-full space-y-6 overflow-y-auto no-scrollbar pt-[20%] pb-[20%]"
                  >
                    {currentTrack.parsedLrc && currentTrack.parsedLrc.length > 0 ? (
                      currentTrack.parsedLrc.map((line, i) => (
                        <div 
                          key={i} 
                          className={`text-2xl md:text-4xl font-bold transition-all duration-300 transform ${i === activeLyricIndex ? 'text-secondary scale-105 origin-left opacity-100 drop-shadow-sm' : 'text-white/20 hover:text-white/40 opacity-100'}`}
                        >
                          {line.text}
                        </div>
                      ))
                    ) : currentTrack.lyricsText ? (
                      <div className="text-center space-y-4 pt-10">
                        <div className="inline-flex items-center gap-2 bg-yellow-500/20 text-yellow-200 px-3 py-1 rounded-full text-xs mb-4">
                          <Sparkles className="w-3 h-3 animate-pulse" /> AI Synchronization pending...
                        </div>
                        {currentTrack.lyricsText.split('\n').map((line, i) => (
                          <div key={i} className="text-xl md:text-2xl font-medium text-white/60">
                            {line}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                        <FileText className="w-16 h-16 mb-4" />
                        <p className="text-xl max-w-sm">No lyrics found for this track.</p>
                      </div>
                    )}
                  </div>
                  <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-900 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-6 opacity-60">
                <div className="w-24 h-24 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <Play className="w-12 h-12 text-indigo-400 fill-indigo-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold mb-2 font-headline">LyricSync Player</h3>
                  <p className="max-w-xs text-indigo-200/70">Upload a song to experience multimodal AI lyric synchronization.</p>
                </div>
              </div>
            )}
          </Card>

          {/* Controls Bar */}
          <Card className="p-6 border-none shadow-lg bg-card/80 backdrop-blur-md rounded-2xl">
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono text-muted-foreground w-12 text-right">{formatTime(currentTime)}</span>
                <Slider 
                  value={[currentTime]} 
                  max={duration || 100} 
                  step={0.1}
                  onValueChange={handleSeek}
                  className="flex-1 cursor-pointer"
                />
                <span className="text-xs font-mono text-muted-foreground w-12">{formatTime(duration)}</span>
              </div>

              <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="hover:text-primary h-10 w-10" 
                    onClick={() => skipTrack('prev')}
                  >
                    <SkipBack className="w-6 h-6" />
                  </Button>
                  <Button 
                    size="icon" 
                    className="h-16 w-16 rounded-full bg-primary hover:bg-primary/90 shadow-xl shadow-primary/30 transition-all hover:scale-105 active:scale-95"
                    onClick={togglePlay}
                  >
                    {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="hover:text-primary h-10 w-10" 
                    onClick={() => skipTrack('next')}
                  >
                    <SkipForward className="w-6 h-6" />
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-8 w-full lg:w-auto">
                  {/* Manual Sync Offset Adjustment */}
                  <div className="flex items-center gap-3 w-full sm:w-48">
                    <Timer className="w-4 h-4 text-orange-500 shrink-0" />
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                        <span>Sync Offset</span>
                        <span>{syncOffset.toFixed(1)}s</span>
                      </div>
                      <Slider 
                        value={[syncOffset]} 
                        min={-2}
                        max={2}
                        step={0.1}
                        onValueChange={(v) => setSyncOffset(v[0])}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-40">
                    <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <Slider 
                      value={[volume * 100]} 
                      max={100} 
                      onValueChange={(v) => setVolume(v[0] / 100)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
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

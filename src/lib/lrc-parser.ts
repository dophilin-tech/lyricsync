export interface LrcLine {
  time: number; // in seconds
  text: string;
}

export function parseLrc(lrcContent: string): LrcLine[] {
  if (!lrcContent) return [];
  
  const lines = lrcContent.split('\n');
  const result: LrcLine[] = [];
  // Improved regex to handle various formats: [mm:ss.xx], [m:ss.x], [mm:ss]
  const timeRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  lines.forEach((line) => {
    let match;
    // Reset regex state for global search if needed, though we usually match once per line in LRC
    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const hundredths = match[3] ? parseInt(match[3].padEnd(3, '0').substring(0, 2), 10) : 0;
      const time = minutes * 60 + seconds + hundredths / 100;
      const text = line.replace(/\[.*?\]/g, '').trim();
      
      if (text || line.includes(']')) {
        result.push({ time, text });
      }
    }
  });

  return result.sort((a, b) => a.time - b.time);
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

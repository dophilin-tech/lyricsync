export interface LrcLine {
  time: number; // in seconds
  text: string;
}

export function parseLrc(lrcContent: string): LrcLine[] {
  const lines = lrcContent.split('\n');
  const result: LrcLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  lines.forEach((line) => {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const hundredths = parseInt(match[3], 10);
      const time = minutes * 60 + seconds + hundredths / 100;
      const text = line.replace(timeRegex, '').trim();
      if (text || line.includes(']')) {
        result.push({ time, text });
      }
    }
  });

  return result.sort((a, b) => a.time - b.time);
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

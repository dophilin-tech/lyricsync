'use server';
/**
 * @fileOverview This file implements a Genkit flow for generating synchronized LRC
 * (Lyrics Karaoke) files from an MP3 audio and its corresponding lyrics text.
 * It leverages Gemini's multimodal capabilities to analyze audio for accurate timestamping.
 *
 * - generateLrcFromMp3AndLyrics - A function that orchestrates the LRC generation process.
 * - GenerateLrcInput - The input type for the generateLrcFromMp3AndLyrics function.
 * - GenerateLrcOutput - The return type for the generateLrcFromMp3AndLyrics function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateLrcInputSchema = z.object({
  mp3DataUri: z
    .string()
    .describe(
      "The MP3 audio file as a data URI, including MIME type and Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  lyricsText: z.string().describe('The complete lyrics of the song.'),
  songTitle: z.string().optional().describe('Optional title of the song.'),
  artist: z.string().optional().describe('Optional artist of the song.'),
});
export type GenerateLrcInput = z.infer<typeof GenerateLrcInputSchema>;

const GenerateLrcOutputSchema = z.object({
  lrcContent: z.string().describe('The generated LRC file content.'),
});
export type GenerateLrcOutput = z.infer<typeof GenerateLrcOutputSchema>;

export async function generateLrcFromMp3AndLyrics(
  input: GenerateLrcInput
): Promise<GenerateLrcOutput> {
  return generateLrcFromMp3AndLyricsFlow(input);
}

const generateLrcPrompt = ai.definePrompt({
  name: 'generateLrcPrompt',
  input: {schema: GenerateLrcInputSchema},
  output: {schema: GenerateLrcOutputSchema},
  prompt: `You are an AI assistant specialized in creating accurate LRC (Lyrics Karaoke) files. 

Your task is to listen to the provided MP3 audio and generate an LRC file by assigning precise timestamps to each line of the lyrics text.

Audio: {{media url=mp3DataUri}}

Song Title: {{{songTitle}}}
Artist: {{{artist}}}

Lyrics Text:
{{{lyricsText}}}

Instructions:
1. Listen carefully to the audio to determine exactly when each lyric line starts.
2. Start with metadata tags: [ar:{{{artist}}}] and [ti:{{{songTitle}}}].
3. Assign accurate [mm:ss.xx] timestamps to every line.
4. Ensure timestamps are perfectly synchronized with the vocals in the audio.
5. Output only the LRC content.

Example LRC format:
[ar:Artist Name]
[ti:Song Title]
[00:05.12]This is the first line.
[00:08.45]This is the second line.
`,
});

const generateLrcFromMp3AndLyricsFlow = ai.defineFlow(
  {
    name: 'generateLrcFromMp3AndLyricsFlow',
    inputSchema: GenerateLrcInputSchema,
    outputSchema: GenerateLrcOutputSchema,
  },
  async input => {
    const {output} = await generateLrcPrompt(input);
    return output!;
  }
);

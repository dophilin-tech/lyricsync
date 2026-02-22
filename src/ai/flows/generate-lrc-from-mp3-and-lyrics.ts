'use server';
/**
 * @fileOverview This file implements a Genkit flow for generating synchronized LRC
 * (Lyrics Karaoke) files from an MP3 audio and its corresponding lyrics text.
 * It simulates AI-powered lyric extraction and timestamping to produce an LRC file.
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
  prompt: `You are an AI assistant specialized in creating accurate LRC (Lyrics Karaoke) files. Your task is to generate an LRC file by assigning realistic and sequential timestamps to each line of the provided lyrics. You have simulated an analysis of the provided MP3 audio and will produce timestamps that are plausible for a typical song length (e.g., 3-5 minutes).

Use the following information:

Song Title: {{{songTitle}}}
Artist: {{{artist}}}

Lyrics:
{{{lyricsText}}}

Instructions:
1. Start with metadata tags: [ar:{{{artist}}}] and [ti:{{{songTitle}}}]. Only include them if the values are provided.
2. Assign unique, sequential, and plausible timestamps to each line of the lyrics. Timestamps should be in the format [mm:ss.xx], where 'mm' is minutes, 'ss' is seconds, and 'xx' is hundredths of a second.
3. Ensure the timestamps increase monotonically.
4. Output only the LRC content, no other conversational text.

Example LRC format:
[ar:Artist Name]
[ti:Song Title]
[00:05.12]This is the first line.
[00:08.45]This is the second line.
[00:12.78]And so on.
`,
});

const generateLrcFromMp3AndLyricsFlow = ai.defineFlow(
  {
    name: 'generateLrcFromMp3AndLyricsFlow',
    inputSchema: GenerateLrcInputSchema,
    outputSchema: GenerateLrcOutputSchema,
  },
  async input => {
    // Although mp3DataUri is provided in the input, the current LLM (Gemini-Pro)
    // is text-based and cannot directly process audio to extract timestamps.
    // The prompt guides the LLM to *simulate* this analysis and generate plausible
    // timestamps based on the provided lyrics and general song structure.
    // A real-world implementation would involve an external audio analysis service
    // (e.g., speech-to-text with word-level timestamps) integrated via a Genkit tool.
    const {output} = await generateLrcPrompt(input);
    return output!;
  }
);

'use server';
/**
 * @fileOverview An AI agent for correcting lyric synchronization in LRC files based on audio analysis.
 *
 * - correctLyricSynchronization - A function that handles the AI-assisted lyric synchronization correction process.
 * - CorrectLyricSynchronizationInput - The input type for the correctLyricSynchronization function.
 * - CorrectLyricSynchronizationOutput - The return type for the correctLyricSynchronization function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CorrectLyricSynchronizationInputSchema = z.object({
  mp3DataUri: z
    .string()
    .describe(
      "The MP3 audio file as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  currentLrcContent: z
    .string()
    .describe('The current LRC file content, containing lyrics and timestamps.'),
  userFeedback: z
    .string()
    .optional()
    .describe(
      'Optional user feedback describing specific timing discrepancies or sections to review.'
    ),
});
export type CorrectLyricSynchronizationInput = z.infer<
  typeof CorrectLyricSynchronizationInputSchema
>;

const CorrectLyricSynchronizationOutputSchema = z.object({
  correctedLrcContent: z
    .string()
    .describe('The AI-corrected LRC file content with adjusted timestamps.'),
  correctionsSummary: z
    .string()
    .describe(
      'A summary of the corrections made by the AI, explaining what was changed and why.'
    ),
  confidenceScore: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "A confidence score (0-100) indicating the AI's certainty in the accuracy of the corrections."
    ),
});
export type CorrectLyricSynchronizationOutput = z.infer<
  typeof CorrectLyricSynchronizationOutputSchema
>;

export async function correctLyricSynchronization(
  input: CorrectLyricSynchronizationInput
): Promise<CorrectLyricSynchronizationOutput> {
  return correctLyricSynchronizationFlow(input);
}

const prompt = ai.definePrompt({
  name: 'correctLyricSynchronizationPrompt',
  input: {schema: CorrectLyricSynchronizationInputSchema},
  output: {schema: CorrectLyricSynchronizationOutputSchema},
  prompt: `You are an expert lyric synchronizer AI. Your task is to review and correct the synchronization of lyrics in an LRC file with the provided audio.

The LRC file format looks like this:
[mm:ss.xx]Lyric line 1
[mm:ss.xx]Lyric line 2
...

Here's the MP3 audio: {{media url=mp3DataUri}}

Here's the current LRC content:
---
{{{currentLrcContent}}}
---

{{#if userFeedback}}
The user has provided the following specific feedback on potential discrepancies:
---
{{{userFeedback}}}
---
Please prioritize addressing these specific issues.
{{/if}}

Analyze the audio and compare the timings in the \`currentLrcContent\` to the actual vocal timings in the MP3. Adjust the timestamps in the LRC file to achieve perfect synchronization, especially focusing on the start time of each lyric line. Ensure the outputted LRC file is well-formatted and valid.

Your output must be a JSON object conforming to the \`CorrectLyricSynchronizationOutputSchema\`. Ensure the \`correctedLrcContent\` is a valid LRC string with adjusted timestamps. Provide a \`correctionsSummary\` explaining the changes and a \`confidenceScore\` from 0-100.`,
});

const correctLyricSynchronizationFlow = ai.defineFlow(
  {
    name: 'correctLyricSynchronizationFlow',
    inputSchema: CorrectLyricSynchronizationInputSchema,
    outputSchema: CorrectLyricSynchronizationOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

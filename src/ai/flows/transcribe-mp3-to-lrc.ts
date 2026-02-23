'use server';
/**
 * @fileOverview 此檔案實作了 AI 自動聽寫功能。當使用者僅提供 MP3 而無歌詞文字時，
 * 透過 Gemini 的多模態能力直接從音訊中擷取歌詞並生成標準 LRC 格式。
 *
 * - transcribeMp3ToLrc - 執行音訊聽寫並生成 LRC 的函式。
 * - TranscribeInput - 輸入格式：MP3 Data URI、歌曲名稱與歌手。
 * - TranscribeOutput - 輸出格式：生成的 LRC 內容。
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranscribeInputSchema = z.object({
  mp3DataUri: z
    .string()
    .describe(
      "MP3 音訊檔案的 Data URI，需包含 MIME 類型與 Base64 編碼。格式：'data:<mimetype>;base64,<encoded_data>'。"
    ),
  songTitle: z.string().optional(),
  artist: z.string().optional(),
});
export type TranscribeInput = z.infer<typeof TranscribeInputSchema>;

const TranscribeOutputSchema = z.object({
  lrcContent: z.string().describe('由 AI 自動聽寫並生成的標準 LRC 檔案內容。'),
});
export type TranscribeOutput = z.infer<typeof TranscribeOutputSchema>;

export async function transcribeMp3ToLrc(input: TranscribeInput): Promise<TranscribeOutput> {
  return transcribeMp3ToLrcFlow(input);
}

const transcribePrompt = ai.definePrompt({
  name: 'transcribePrompt',
  input: {schema: TranscribeInputSchema},
  output: {schema: TranscribeOutputSchema},
  prompt: `您是一位專業的音樂聽寫員與歌詞同步專家。

您的任務是聆聽提供的 MP3 音訊，辨識其歌詞，並根據歌聲的起點為每句歌詞分配精確的時間戳記，最終生成標準的 LRC 檔案。

音訊資料：{{media url=mp3DataUri}}

歌曲名稱：{{{songTitle}}}
演唱歌手：{{{artist}}}

指示：
1. 仔細辨識音訊中的每一句歌詞。
2. 為每一行歌詞加上 [mm:ss.xx] 格式的時間戳記，確保與歌聲同步。
3. 包含必要的元數據標籤：[ti:{{{songTitle}}}] 和 [ar:{{{artist}}}]。
4. 如果音訊中包含間奏，請留出適當的時間間隔。
5. 輸出結果必須僅包含 LRC 格式的內容。

LRC 格式範例：
[ti:歌曲名稱]
[ar:歌手名稱]
[00:12.45]這是第一句歌詞
[00:15.80]這是第二句歌詞
`,
});

const transcribeMp3ToLrcFlow = ai.defineFlow(
  {
    name: 'transcribeMp3ToLrcFlow',
    inputSchema: TranscribeInputSchema,
    outputSchema: TranscribeOutputSchema,
  },
  async input => {
    const {output} = await transcribePrompt(input);
    return output!;
  }
);

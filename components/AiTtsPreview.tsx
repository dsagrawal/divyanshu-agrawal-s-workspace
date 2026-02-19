
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Play, Square, Loader2, Volume2, AlertCircle, ChevronDown, Users, Download, Bookmark, Check } from 'lucide-react';
import { Voice, ScriptPart } from '../types';
import AudioVisualizer from './AudioVisualizer';

interface AiTtsPreviewProps {
  text: string;
  voices: Voice[];
  isMultiSpeaker?: boolean;
  scriptParts?: ScriptPart[];
}

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Creates a WAV file blob from raw PCM 16-bit mono 24kHz data.
 */
function createWavBlob(pcmData: Uint8Array, sampleRate: number = 24000): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, pcmData.length, true);

  return new Blob([header, pcmData], { type: 'audio/wav' });
}

const AiTtsPreview: React.FC<AiTtsPreviewProps> = ({ text, voices, isMultiSpeaker, scriptParts }) => {
  const [selectedVoiceName, setSelectedVoiceName] = useState(voices[0]?.name || '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      stopAudio();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error);
      }
    };
  }, []);

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (isMountedRef.current) setIsPlaying(false);
  };

  const handlePlay = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isLoading) return;
    if (isPlaying) { stopAudio(); return; }
    
    // If we already have the blob, just play it
    if (audioBlob) {
        await playFromBlob(audioBlob);
        return;
    }

    setIsLoading(true);
    setError(null);
    setAudioBlob(null);
    setIsSaved(false);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let response;

      if (isMultiSpeaker && scriptParts && scriptParts.length > 0) {
        const prompt = `TTS the following conversation:\n` + scriptParts.map(p => `${p.speaker}: ${p.text}`).join('\n');
        const uniqueSpeakers = Array.from(new Set(scriptParts.map(p => p.speaker))).slice(0, 2);
        const speakerConfigs = uniqueSpeakers.map(speakerName => {
          const part = scriptParts.find(p => p.speaker === speakerName);
          return {
            speaker: speakerName,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: part?.voiceName || 'Kore' } }
          };
        });

        if (speakerConfigs.length === 1) {
            speakerConfigs.push({
                speaker: 'Narrator',
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            });
        }

        response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: speakerConfigs
              }
            }
          }
        });
      } else {
        response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: { parts: [{ text: text }] },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoiceName } },
            },
          },
        });
      }
      
      if (!isMountedRef.current) return;

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) throw new Error("No audio data received from API");

      const rawBytes = decodeBase64(audioData);
      const blob = createWavBlob(rawBytes, 24000);
      setAudioBlob(blob);

      await playFromBlob(blob);

    } catch (err: any) {
      console.error("TTS Error:", err);
      if (isMountedRef.current) setError("Failed to generate speech. Multi-speaker may have limits.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const playFromBlob = async (blob: Blob) => {
      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        } else if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        const arrayBuffer = await blob.arrayBuffer();
        // Since it's a WAV now, we can skip the custom decoding or use standard decodeAudioData
        // But for consistency with our PCM utility, we know the bytes are [header(44) + data]
        // Actually, decodeAudioData works great for WAVs.
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        if (!isMountedRef.current) return;

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => { if (isMountedRef.current) setIsPlaying(false); };
        
        sourceNodeRef.current = source;
        source.start();
        setIsPlaying(true);
      } catch (e) {
          console.error("Playback error:", e);
          setError("Playback failed.");
      }
  };

  const handleDownload = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!audioBlob) return;
      
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voice_gen_${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleSave = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!audioBlob) return;
      setIsSaved(true);
      // Logic for saving to library could go here (e.g., IndexedDB or state)
      setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="w-full bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white dark:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-700">
            
            {isMultiSpeaker ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                <Users size={14} className="text-indigo-500" />
                Multi-Speaker Preview
              </div>
            ) : (
              <div className="relative group w-full sm:w-auto">
                  <select
                      value={selectedVoiceName}
                      onChange={(e) => {
                          setSelectedVoiceName(e.target.value);
                          setAudioBlob(null); // Reset cache if voice changes
                      }}
                      className="appearance-none w-full sm:w-48 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 py-2 pl-3 pr-10 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-200 cursor-pointer transition-all hover:bg-zinc-100"
                      disabled={isLoading || isPlaying}
                  >
                      {voices.map(voice => (
                          <option key={voice.name} value={voice.name}>
                              {voice.name} ({voice.analysis.gender})
                          </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400">
                      <ChevronDown size={14} />
                  </div>
              </div>
            )}

            <div className="flex items-center gap-2">
                {audioBlob && !isLoading && (
                    <div className="flex gap-2 mr-2">
                        <button 
                            onClick={handleSave}
                            className={`p-2 rounded-lg transition-all ${isSaved ? 'bg-green-50 text-green-600 dark:bg-green-900/30' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'}`}
                            title="Save to Library"
                        >
                            {isSaved ? <Check size={16} /> : <Bookmark size={16} />}
                        </button>
                        <button 
                            onClick={handleDownload}
                            className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all"
                            title="Download WAV"
                        >
                            <Download size={16} />
                        </button>
                    </div>
                )}
                
                <button
                    onClick={handlePlay}
                    disabled={isLoading}
                    className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 transform active:scale-95 ${
                        isPlaying 
                        ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-white border border-zinc-200' 
                        : 'bg-zinc-900 dark:bg-indigo-600 text-white hover:bg-zinc-800 shadow-md'
                    } ${isLoading ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                    {isLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : isPlaying ? (
                        <Square size={16} className="fill-current" />
                    ) : (
                        <Play size={16} className="fill-current" />
                    )}
                    <span>{isLoading ? 'Generating...' : isPlaying ? 'Stop' : (audioBlob ? 'Replay' : 'Generate')}</span>
                </button>
            </div>
        </div>

        <div 
            className={`h-24 relative flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 overflow-hidden group cursor-pointer`} 
            onClick={handlePlay}
        >
             <div className="absolute inset-0 opacity-[0.05] dark:opacity-[0.1]" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '8px 8px' }}></div>
            
             <div className="w-full h-full absolute inset-0 flex items-center justify-center pointer-events-none">
                 {isPlaying ? (
                     <div className="w-full h-full opacity-80">
                         <AudioVisualizer isPlaying={true} color={document.documentElement.classList.contains('dark') ? '#a5b4fc' : '#18181b'} />
                     </div>
                 ) : (
                     <div className="flex flex-col items-center gap-2 text-zinc-300 dark:text-zinc-600">
                         <Volume2 size={24} />
                         <span className="text-xs font-medium">Click to play {isMultiSpeaker ? 'scene' : 'audio'}</span>
                     </div>
                 )}
             </div>

             {error && (
                 <div className="absolute inset-0 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-red-500 gap-2 text-sm z-20">
                     <AlertCircle size={16} />
                     <span>{error}</span>
                 </div>
             )}
        </div>
    </div>
  );
};

export default AiTtsPreview;

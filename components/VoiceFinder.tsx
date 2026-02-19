
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Sparkles, Loader2, X, ArrowRight, Wand2, MessageSquare, User } from 'lucide-react';
import { Voice, AiRecommendation } from '../types';

interface VoiceFinderProps {
  voices: Voice[];
  onRecommendation: (rec: AiRecommendation | null) => void;
  onClose: () => void;
}

const VoiceFinder: React.FC<VoiceFinderProps> = ({ voices, onRecommendation, onClose }) => {
  const [mode, setMode] = useState<'persona' | 'script'>('persona');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textAreaRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const examples = mode === 'persona' ? [
    { label: "Narrator", text: "A warm, deep male voice with a British accent for a nature documentary." },
    { label: "Heroine", text: "An energetic young female with a confident and slightly raspy tone." }
  ] : [
    { label: "Dialogue", text: "Alex: We found it. The secret entrance.\nSarah: Be careful, we don't know what's inside." },
    { label: "Announcement", text: "PA System: Attention all passengers. The train to London is now boarding." }
  ];

  const handleAnalyze = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const simplifiedVoices = voices.map(v => ({
        name: v.name,
        gender: v.analysis.gender,
        characteristics: v.analysis.characteristics,
      }));

      const personaPrompt = `Analyze this voice description: "${query}". 
      Available voices: ${JSON.stringify(simplifiedVoices)}.
      Recommend top 3 voices. Return a sample text and system instruction. Provide a 'systemInstruction' that includes specific details about the required emotional delivery and pacing.`;

      const scriptPrompt = `
        You are an expert script analyzer and casting director. 
        Analyze the following script for character emotions, subtext, and pacing:
        "${query}"
        
        Available voices: ${JSON.stringify(simplifiedVoices)}
        
        Task:
        1. Identify the primary 2 characters.
        2. Determine the emotional state (e.g., anxious, joyful, threatening) and pacing (e.g., rapid-fire, slow and deliberate) for each character in this specific scene.
        3. Map each character to the most fitting voice from the available list.
        4. Break the script into Turns (scriptParts).
        5. Provide a 'systemInstruction' that captures the overall atmospheric tone and detailed instructions on how the voices should express the detected emotions and timing.
        
        Return structured JSON matching the schema.
      `;

      const schema = {
        type: Type.OBJECT,
        properties: mode === 'persona' ? {
          recommendedVoices: { type: Type.ARRAY, items: { type: Type.STRING } },
          systemInstruction: { type: Type.STRING, description: "Markdown formatted director's notes including emotion and pacing details." },
          sampleText: { type: Type.STRING }
        } : {
          scriptParts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                speaker: { type: Type.STRING },
                text: { type: Type.STRING },
                voiceName: { type: Type.STRING }
              },
              required: ['speaker', 'text', 'voiceName']
            }
          },
          systemInstruction: { type: Type.STRING, description: "Detailed Markdown notes on the scene's emotional arc, character dynamics, and pacing instructions." },
          sampleText: { type: Type.STRING }
        },
        required: mode === 'persona' ? ['recommendedVoices', 'systemInstruction', 'sampleText'] : ['scriptParts', 'systemInstruction', 'sampleText']
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: mode === 'persona' ? personaPrompt : scriptPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const result = JSON.parse(response.text || '{}');
      if (mode === 'persona') {
        onRecommendation({
          voiceNames: result.recommendedVoices || [],
          systemInstruction: result.systemInstruction || "",
          sampleText: result.sampleText || "",
          isMultiSpeaker: false
        });
      } else {
        onRecommendation({
          voiceNames: Array.from(new Set((result.scriptParts || []).map((p: any) => p.voiceName))),
          systemInstruction: result.systemInstruction || "",
          sampleText: result.sampleText || "",
          isMultiSpeaker: true,
          scriptParts: result.scriptParts || []
        });
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze. Check your script or try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div ref={modalRef} className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden animate-slide-up ring-1 ring-zinc-900/5">
        <div className="p-8">
          <div className="flex justify-between mb-6">
            <h2 className="text-2xl font-serif font-bold text-zinc-900 dark:text-white">AI Casting Director</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><X size={20} /></button>
          </div>
          <div className="flex gap-2 mb-6">
            <button onClick={() => setMode('persona')} className={`px-4 py-2 rounded-full text-sm font-medium ${mode === 'persona' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>Description</button>
            <button onClick={() => setMode('script')} className={`px-4 py-2 rounded-full text-sm font-medium ${mode === 'script' ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'}`}>Script Analysis</button>
          </div>
          <textarea
            ref={textAreaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'persona' ? "Describe the voice you need..." : "Paste script dialogue here..."}
            className="w-full h-40 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-lg focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none"
          />
          <div className="flex gap-2 mt-4">
            {examples.map(ex => (
              <button key={ex.label} onClick={() => setQuery(ex.text)} className="text-xs px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium">{ex.label}</button>
            ))}
          </div>
          <div className="flex justify-between items-center mt-8">
            <p className="text-xs text-zinc-400">{error || "AI will analyze character emotions and scene pacing"}</p>
            <button onClick={handleAnalyze} disabled={loading || !query.trim()} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold flex items-center gap-2 shadow-lg disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              Analyze
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceFinder;

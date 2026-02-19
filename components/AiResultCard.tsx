
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AiRecommendation, Voice } from '../types';
import { Sparkles, Copy, Check, Quote, X, MessageSquare } from 'lucide-react';
import AiTtsPreview from './AiTtsPreview';
import ReactMarkdown from 'react-markdown';

interface AiResultCardProps {
  result: AiRecommendation;
  voices: Voice[];
  onClose: () => void;
}

const AiResultCard: React.FC<AiResultCardProps> = ({ result, voices, onClose }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const formattedInstruction = useMemo(() => {
    if (!result.systemInstruction) return '';
    let text = result.systemInstruction;
    text = text.replace(/([^\n])\s*(##)/g, '$1\n\n$2');
    return text;
  }, [result.systemInstruction]);

  return (
    <div 
        ref={cardRef}
        tabIndex={-1}
        className="w-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-white/60 dark:border-zinc-800 shadow-2xl overflow-hidden relative group outline-none h-full flex flex-col"
    >
        <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-50"
            aria-label="Close dialog"
        >
            <X size={18} />
        </button>

        <div className="absolute inset-0 bg-gradient-to-r from-indigo-50/40 via-blue-50/40 to-white/0 dark:from-indigo-900/20 dark:via-blue-900/20 dark:to-transparent -z-10"></div>
        
        <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8 overflow-y-auto max-h-[85vh] md:max-h-[600px] md:h-auto">
            
            {/* Left: Persona Info / Script Info */}
            <div className="flex-1 space-y-4 min-w-0 flex flex-col">
                <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                         {result.isMultiSpeaker ? <MessageSquare size={18} /> : <Sparkles size={18} />}
                    </div>
                    <div>
                        <h2 id="ai-result-title" className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight leading-tight">
                          {result.isMultiSpeaker ? 'AI Script Analysis' : 'AI Suggested Persona'}
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                          {result.isMultiSpeaker ? 'Multi-speaker conversation' : 'Based on your description'}
                        </p>
                    </div>
                </div>

                <div className="bg-white/60 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/50 dark:border-zinc-700/50 shadow-sm relative group/code flex-1 flex flex-col min-h-[200px] md:min-h-0 overflow-hidden">
                    <div className="flex justify-between items-center p-4 pb-2 border-b border-zinc-100/50 dark:border-zinc-700/50 flex-shrink-0">
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                            {result.isMultiSpeaker ? 'Scene Direction' : 'System Prompt'}
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-zinc-50/30 dark:bg-zinc-900/30">
                         <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none text-sm">
                            <ReactMarkdown>{formattedInstruction}</ReactMarkdown>
                         </div>
                    </div>
                </div>
            </div>

            {/* Right: Audio Preview & Script Parts */}
            <div className="flex-1 flex flex-col justify-center space-y-5 pt-2">
                 {result.isMultiSpeaker ? (
                   <div className="space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30 p-4 rounded-xl border border-zinc-100 dark:border-zinc-700/50">
                      {result.scriptParts?.map((part, idx) => (
                        <div key={idx} className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter">
                            {part.speaker} ({part.voiceName})
                          </span>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 italic">"{part.text}"</p>
                        </div>
                      ))}
                   </div>
                 ) : (
                   <div className="relative pl-8">
                      <Quote size={24} className="absolute -top-1 left-0 text-indigo-200 dark:text-indigo-800" />
                      <p className="text-lg text-zinc-700 dark:text-zinc-200 italic font-serif leading-relaxed">
                          "{result.sampleText}"
                      </p>
                   </div>
                 )}
                 
                 <div className="bg-white dark:bg-zinc-800 p-1 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700">
                    <AiTtsPreview 
                      text={result.sampleText} 
                      voices={voices} 
                      isMultiSpeaker={result.isMultiSpeaker}
                      scriptParts={result.scriptParts}
                    />
                 </div>
            </div>
        </div>
    </div>
  );
};

export default AiResultCard;


/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface VoiceAnalysis {
  gender: string;
  pitch: string;
  characteristics: string[];
  visualDescription: string;
}

export interface Voice {
  name: string;
  pitch: string;
  characteristics: string[];
  audioSampleUrl: string;
  fileUri: string;
  analysis: VoiceAnalysis;
  imageUrl: string; 
}

export interface FilterState {
  gender: string | 'All';
  pitch: string | 'All';
  search: string;
}

export interface ScriptPart {
  speaker: string;
  text: string;
  voiceName: string;
}

export interface AiRecommendation {
  voiceNames: string[];
  systemInstruction: string;
  sampleText: string;
  isMultiSpeaker?: boolean;
  scriptParts?: ScriptPart[];
}

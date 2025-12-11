import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Note } from '../types';

interface VoiceAssistantProps {
  notes: Note[];
  isOnline?: boolean;
  isSyncing?: boolean;
}

// --- AUDIO UTILS ---

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function downsampleTo16k(input: Float32Array, sampleRate: number): Int16Array {
    if (sampleRate === 16000) {
        const res = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            res[i] = Math.max(-1, Math.min(1, input[i])) * 32767;
        }
        return res;
    }

    const ratio = sampleRate / 16000;
    const newLength = Math.round(input.length / ratio);
    const result = new Int16Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
        const offset = Math.floor(i * ratio);
        const nextOffset = Math.floor((i + 1) * ratio);
        let sum = 0;
        let count = 0;
        
        for (let j = offset; j < nextOffset && j < input.length; j++) {
            sum += input[j];
            count++;
        }
        
        const avg = count > 0 ? sum / count : input[offset];
        result[i] = Math.max(-1, Math.min(1, avg)) * 32767;
    }
    return result;
}

/**
 * Manually decodes raw PCM (Int16) data into an AudioBuffer.
 * Gemini Live API sends raw PCM at 24kHz (usually).
 */
function pcmToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): AudioBuffer {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
        // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ notes, isOnline = true, isSyncing = false }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const isSessionOpenRef = useRef<boolean>(false);

  const cleanupAudio = useCallback(() => {
    // 1. Stop Recording
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // 2. Stop Playing
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // 3. Close Context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const stopSession = useCallback(() => {
    isSessionOpenRef.current = false;
    cleanupAudio();

    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
         try { session.close(); } catch(e) { console.warn("Session close error", e); }
      }).catch(() => {});
      sessionPromiseRef.current = null;
    }

    setIsActive(false);
    setStatus('idle');
  }, [cleanupAudio]);

  const startSession = async () => {
    if (!isOnline) {
        setError("Internet required");
        return;
    }
    setError(null);
    setStatus('connecting');

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");

      // --- CRITICAL CHANGE: Initialize Audio IN THE USER GESTURE ---
      // This prevents mobile browsers from blocking the microphone or suspending the context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass(); 
      audioContextRef.current = ctx;
      
      // Force resume immediately
      await ctx.resume();

      // Get Stream immediately
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
          } 
      });
      mediaStreamRef.current = stream;

      // -----------------------------------------------------------

      const kbText = notes.map(n => `- [${n.type.toUpperCase()}] ${n.content} (Added: ${new Date(n.timestamp).toLocaleDateString()})`).join('\n');
      const systemInstruction = `
        You are a smart, helpful voice assistant for a personal knowledge base app.
        
        CRITICAL INSTRUCTIONS:
        1. You have access to the user's specific Knowledge Base (KB) below.
        2. ALWAYS check the KB first to answer questions.
        3. If the answer is found in the KB, answer directly based on it.
        4. If the answer is NOT in the KB, use your tools or general knowledge, but mention "I couldn't find that in your notes...".
        5. Keep answers concise and conversational.

        USER KNOWLEDGE BASE:
        ${kbText || "(Empty)"}
      `;

      const ai = new GoogleGenAI({ apiKey });
      
      // Connect to Gemini
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemInstruction,
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            tools: [{ googleSearch: {} }]
        },
        callbacks: {
          onopen: async () => {
            console.log("Session Opened");
            isSessionOpenRef.current = true;
            setStatus('listening');

            // Setup audio pipeline now that we have everything ready
            setupAudioPipeline(ctx, stream);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                playAudioChunk(base64Audio);
            }

            if (msg.serverContent?.interrupted) {
                activeSourcesRef.current.forEach(s => {
                    try { s.stop(); } catch(e) {}
                });
                activeSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setStatus('listening');
            }
          },
          onclose: (e) => {
             console.log("Session Closed", e);
             if (isActive) stopSession(); 
          },
          onerror: (err) => {
             console.error("Session Error", err);
             setError("Connection error");
             stopSession();
          }
        }
      });

      setIsActive(true);

    } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to start");
        setStatus('idle');
    }
  };

  const setupAudioPipeline = (ctx: AudioContext, stream: MediaStream) => {
      if (!ctx || !stream) return;

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      
      // Create a ScriptProcessor
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
          if (!isSessionOpenRef.current) return;

          const inputData = e.inputBuffer.getChannelData(0);
          
          // Downsample to 16kHz
          const pcm16 = downsampleTo16k(inputData, ctx.sampleRate);
          
          // Convert to Base64
          const b64 = arrayBufferToBase64(pcm16.buffer);

          sessionPromiseRef.current?.then(session => {
             session.sendRealtimeInput({ 
                media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: b64
                }
             });
          });
      };

      source.connect(processor);
      
      // Keep processor alive hack
      const muteNode = ctx.createGain();
      muteNode.gain.value = 0;
      processor.connect(muteNode);
      muteNode.connect(ctx.destination);
  };

  const playAudioChunk = async (base64Audio: string) => {
      if (!audioContextRef.current) return;
      
      setStatus('speaking');
      const ctx = audioContextRef.current;
      
      try {
          const audioBytes = base64ToUint8Array(base64Audio);
          
          // Use MANUAL PCM decoding instead of ctx.decodeAudioData
          const audioBuffer = pcmToAudioBuffer(audioBytes, ctx, 24000);
          
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          
          const currentTime = ctx.currentTime;
          const startTime = Math.max(currentTime, nextStartTimeRef.current);
          
          source.start(startTime);
          nextStartTimeRef.current = startTime + audioBuffer.duration;
          
          activeSourcesRef.current.add(source);
          
          source.onended = () => {
              activeSourcesRef.current.delete(source);
              if (activeSourcesRef.current.size === 0) {
                  setTimeout(() => {
                      if (activeSourcesRef.current.size === 0 && isSessionOpenRef.current) {
                          setStatus('listening');
                      }
                  }, 200);
              }
          };
      } catch (err) {
          console.error("Audio Decode Error", err);
          setError("Audio decode failed");
      }
  };

  const toggleSession = () => {
    if (isActive) {
        stopSession();
    } else {
        startSession();
    }
  };

  useEffect(() => {
    if (!isOnline && isActive) {
        stopSession();
        setError("Connection lost");
    }
  }, [isOnline, isActive, stopSession]);

  useEffect(() => {
      return () => {
          cleanupAudio();
      };
  }, [cleanupAudio]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative">
       {/* Error Toast */}
       {error && (
         <div className="absolute top-4 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm font-medium animate-bounce z-50">
           {error}
         </div>
       )}

       {isSyncing && (
         <div className="absolute top-16 bg-blue-500/90 text-white px-4 py-1 rounded-full text-xs font-medium animate-pulse z-50 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">sync</span>
            Syncing Offline Data...
         </div>
       )}

       {/* Status Text */}
       <div className="absolute top-10 text-center w-full px-4">
         <h2 className="text-2xl font-bold text-white mb-2 tracking-wide">
            {!isOnline ? 'Offline' : (isActive ? (status === 'speaking' ? 'Assistant Speaking...' : (status === 'connecting' ? 'Connecting...' : 'Listening...')) : 'Voice Assistant')}
         </h2>
         <p className="text-zinc-400 text-sm">
            {!isOnline ? 'Voice Unavailable' : (isActive ? 'Tap to stop' : 'Tap mic to start')}
         </p>
       </div>

       {/* Visualizer / Button */}
       <div className="relative flex items-center justify-center">
         {/* Glow Effect */}
         <div className={`absolute h-64 w-64 rounded-full transition-opacity duration-500 ${(isActive || !isOnline) ? 'opacity-100' : 'opacity-0'}`}>
            <div className={`w-full h-full rounded-full blur-3xl opacity-40 ${!isOnline ? 'bg-zinc-700' : 'bg-red-600'} ${status === 'speaking' ? 'animate-pulse' : 'animate-pulse-slow'}`}></div>
         </div>

         <button 
           onClick={toggleSession}
           disabled={!isOnline}
           className={`relative flex h-64 w-64 items-center justify-center rounded-full 
             transition-all duration-300 ease-out
             ${!isOnline 
                ? 'bg-zinc-800 border-4 border-zinc-700 cursor-not-allowed opacity-80' 
                : (isActive 
                    ? 'bg-gradient-to-b from-red-600 to-red-900 shadow-[0_0_50px_rgba(220,38,38,0.5)] scale-105 cursor-pointer' 
                    : 'bg-gradient-to-b from-zinc-700 to-zinc-900 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_4px_10px_rgba(255,255,255,0.1)] hover:scale-105 cursor-pointer')}
             `}
         >
           <span className={`material-symbols-outlined text-white transition-all duration-300`} 
                 style={{ fontSize: '100px' }}>
             {!isOnline ? 'wifi_off' : (isActive ? (status === 'connecting' ? 'cloud_sync' : 'graphic_eq') : 'mic')}
           </span>
         </button>
       </div>
       
       <div className="mt-12 text-center max-w-xs text-zinc-500 text-xs">
         <p>{!isOnline ? 'Connect to internet to use Assistant' : 'Uses Gemini Live API with Search Grounding'}</p>
       </div>
    </div>
  );
};

export default VoiceAssistant;
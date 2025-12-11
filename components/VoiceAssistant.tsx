import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Note } from '../types';

interface VoiceAssistantProps {
  notes: Note[];
  isOnline?: boolean;
  isSyncing?: boolean;
}

// Audio helpers
function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Robust Downsampling Function (Any Rate -> 16kHz)
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
        
        // Simple averaging for better quality than dropping samples
        for (let j = offset; j < nextOffset && j < input.length; j++) {
            sum += input[j];
            count++;
        }
        
        const avg = count > 0 ? sum / count : input[offset];
        result[i] = Math.max(-1, Math.min(1, avg)) * 32767;
    }
    return result;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
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

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ notes, isOnline = true, isSyncing = false }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Refs for audio handling
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const stopSession = useCallback(() => {
    // Cleanup Web Audio
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    
    // Close session
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
         try { session.close(); } catch(e) { console.warn("Session close error", e); }
      });
      sessionPromiseRef.current = null;
    }

    setIsActive(false);
    setStatus('idle');
  }, []);

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

      const ai = new GoogleGenAI({ apiKey });

      // Construct System Instruction from Notes
      const kbText = notes.map(n => `- [${n.type.toUpperCase()}] ${n.content} (Added: ${new Date(n.timestamp).toLocaleDateString()})`).join('\n');
      
      const systemInstruction = `
        You are a smart, helpful voice assistant for a personal knowledge base app.
        
        CRITICAL INSTRUCTIONS:
        1. You have access to the user's specific Knowledge Base (KB) below.
        2. ALWAYS check the KB first to answer questions.
        3. If the answer is found in the KB, answer directly based on it.
        4. If the answer is NOT in the KB, you MUST use your search tools or general knowledge to answer, but explicitly mention "I couldn't find that in your notes, but I found online that..." or "I don't see that in your notes, but...".
        5. Keep answers concise and conversational (suitable for voice output).

        USER KNOWLEDGE BASE:
        ${kbText || "(Empty)"}
      `;

      // Setup Audio Contexts
      // NOTE: We do NOT force sampleRate: 16000 here anymore, because mobile browsers often ignore it or fail.
      // We will handle resampling manually.
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Ensure context is running (fixes iOS autoplay policy)
      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const outputNode = outputAudioContextRef.current!.createGain();
      outputNode.connect(outputAudioContextRef.current!.destination);

      // Get Mic Stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } 
      });
      streamRef.current = stream;

      // Connect to Gemini Live
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setStatus('listening');

            // Setup Input Processing
            if (!inputAudioContextRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            // Buffer size 4096 gives decent latency/performance balance
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
               // 1. Get raw float data (usually 44.1k or 48k on mobile)
               const inputData = e.inputBuffer.getChannelData(0);
               const currentRate = inputAudioContextRef.current?.sampleRate || 16000;
               
               // 2. Downsample to 16k
               const pcm16 = downsampleTo16k(inputData, currentRate);
               
               // 3. Convert to Base64
               const bytes = new Uint8Array(pcm16.buffer);
               let binary = '';
               const len = bytes.byteLength;
               for (let i = 0; i < len; i++) {
                 binary += String.fromCharCode(bytes[i]);
               }
               const b64 = btoa(binary);

               // 4. Send
               sessionPromiseRef.current?.then(session => {
                 session.sendRealtimeInput({ 
                    media: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: b64
                    }
                 });
               });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio && outputAudioContextRef.current) {
                setStatus('speaking');
                
                const ctx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const audioBuffer = await decodeAudioData(
                    base64ToUint8Array(base64Audio),
                    ctx,
                    24000,
                    1
                );
                
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                
                source.onended = () => {
                   sourcesRef.current.delete(source);
                   if (sourcesRef.current.size === 0) {
                       setStatus('listening');
                   }
                };
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
            }

            // Handle Interruption
            if (msg.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setStatus('listening');
            }
          },
          onclose: (e) => {
             console.log("Session Closed", e);
             setStatus('idle');
             setIsActive(false);
          },
          onerror: (err) => {
             console.error("Session Error", err);
             // More descriptive error
             setError("Session error. Check API Key or Connection.");
             stopSession();
          }
        },
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemInstruction,
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            },
            tools: [{ googleSearch: {} }]
        }
      });

      setIsActive(true);

    } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to start");
        setStatus('idle');
    }
  };

  const toggleSession = () => {
    if (isActive) {
        stopSession();
    } else {
        startSession();
    }
  };

  // Force stop if went offline
  useEffect(() => {
    if (!isOnline && isActive) {
        stopSession();
        setError("Connection lost");
    }
  }, [isOnline, isActive, stopSession]);

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
            {!isOnline ? 'Offline' : (isActive ? (status === 'speaking' ? 'Assistant Speaking...' : 'Listening...') : 'Voice Assistant')}
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
             {!isOnline ? 'wifi_off' : (isActive ? 'graphic_eq' : 'mic')}
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
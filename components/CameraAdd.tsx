import React, { useState, useRef } from 'react';
import { Note } from '../types';
import { GoogleGenAI } from '@google/genai';

interface CameraAddProps {
  onAdd: (note: Note) => void;
  onCancel: () => void;
  isOnline: boolean;
}

const CameraAdd: React.FC<CameraAddProps> = ({ onAdd, onCancel, isOnline }) => {
  const [textInput, setTextInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeAndSave = async () => {
    if (!textInput && !selectedImage) return;

    setIsAnalyzing(true);
    let finalContent = textInput;
    let type: Note['type'] = selectedImage ? 'image' : 'text';
    let pendingAnalysis = false;

    try {
      const apiKey = process.env.API_KEY;
      const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

      if (selectedImage) {
        // --- IMAGE + OPTIONAL TEXT FLOW ---
        if (!isOnline || !ai) {
            // Offline: Save raw
            finalContent = textInput ? `[User Note: ${textInput}]` : "Image saved (Offline - Waiting for sync)";
            pendingAnalysis = true;
        } else {
            // Online: Analyze Image
            const base64Data = selectedImage.split(',')[1];
            const prompt = textInput 
                ? `Analyze this image in the context of: "${textInput}". Provide a detailed description suitable for a knowledge base.`
                : "Describe this image in detail so it can be stored in a text-based knowledge base.";

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                        { text: prompt }
                    ]
                }
            });
            
            const analysis = response.text || "Image processed but no description generated.";
            finalContent = textInput 
                ? `[User Note: ${textInput}]\n\n[AI Vision Analysis]: ${analysis}`
                : `[AI Vision Analysis]: ${analysis}`;
        }
      } else {
        // --- TEXT ONLY FLOW ---
        // "By analogy with Motor Oils" -> Structure the data
        if (!isOnline || !ai) {
            finalContent = textInput; // Save raw if offline
        } else {
            // Enhance text to look like a structured report
            const prompt = `
                You are a professional archivist. Format the following raw user note into a structured Knowledge Base entry.
                1. Create a short, relevant Title.
                2. Fix any grammar issues.
                3. Structure the facts with bullet points if applicable.
                4. Keep the tone factual and concise.
                
                Raw Note: "${textInput}"
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { text: prompt }
            });

            const structuredText = response.text;
            if (structuredText) {
                finalContent = structuredText;
            } else {
                finalContent = textInput; // Fallback
            }
        }
      }

      const newNote: Note = {
        id: Date.now().toString(),
        content: finalContent,
        type: type,
        timestamp: Date.now(),
        imageUrl: selectedImage || undefined,
        pendingAnalysis: pendingAnalysis
      };

      onAdd(newNote);
    } catch (e) {
      console.error("Analysis failed", e);
      // Fallback to saving whatever we have
      const newNote: Note = {
          id: Date.now().toString(),
          content: textInput || "Content saved (Analysis failed)",
          type: type,
          timestamp: Date.now(),
          imageUrl: selectedImage || undefined
      };
      onAdd(newNote);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#101622] w-full p-4">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onCancel} className="text-zinc-400 p-2">Cancel</button>
        <h2 className="text-white font-bold">Add to Knowledge</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 flex flex-col gap-4 max-w-md mx-auto w-full">
        {/* Image Preview Area */}
        <div 
            onClick={() => fileInputRef.current?.click()}
            className={`
            aspect-video w-full rounded-2xl border-2 border-dashed border-zinc-700 
            flex flex-col items-center justify-center cursor-pointer overflow-hidden
            hover:border-blue-500 transition-colors bg-zinc-900/50
            ${selectedImage ? 'border-solid border-zinc-600' : ''}
            `}
        >
            {selectedImage ? (
                <div className="relative w-full h-full">
                    <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        Tap to change
                    </div>
                </div>
            ) : (
                <div className="text-center p-6">
                    <span className="material-symbols-outlined text-4xl text-zinc-500 mb-2">add_a_photo</span>
                    <p className="text-zinc-400 text-sm">Tap to add photo (Optional)</p>
                </div>
            )}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                capture="environment"
                onChange={handleFileChange} 
            />
        </div>

        {/* Text Input */}
        <div className="flex-1 min-h-[150px] relative">
            <textarea
                className="w-full h-full bg-zinc-800 text-white rounded-xl p-4 border border-zinc-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none align-top"
                placeholder="Type your note here. The AI will structure and organize it for you..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
            />
        </div>

        {/* Action Button */}
        <button 
            disabled={isAnalyzing || (!textInput && !selectedImage)}
            onClick={handleAnalyzeAndSave}
            className={`
                mt-auto w-full h-14 rounded-xl font-bold text-lg flex items-center justify-center gap-2
                ${isAnalyzing 
                    ? 'bg-zinc-700 text-zinc-400' 
                    : (!isOnline && selectedImage ? 'bg-amber-700 text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/20 active:scale-95 transition-transform')}
            `}
        >
            {isAnalyzing ? (
                <>
                    <span className="animate-spin material-symbols-outlined">progress_activity</span>
                    {selectedImage ? 'Analyzing Vision...' : 'Structuring Text...'}
                </>
            ) : (
                <>
                    <span className="material-symbols-outlined">
                        {!isOnline && selectedImage ? 'cloud_off' : (selectedImage ? 'document_scanner' : 'auto_fix_high')}
                    </span>
                    {!isOnline && selectedImage ? 'Save (Offline)' : 'Process & Save'}
                </>
            )}
        </button>
      </div>
    </div>
  );
};

export default CameraAdd;
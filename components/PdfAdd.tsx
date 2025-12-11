import React, { useState, useRef } from 'react';
import { Note } from '../types';
import { GoogleGenAI } from '@google/genai';

interface PdfAddProps {
  onAdd: (note: Note) => void;
  onCancel: () => void;
  isOnline: boolean;
}

const PdfAdd: React.FC<PdfAddProps> = ({ onAdd, onCancel, isOnline }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file.');
        return;
      }
      setFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProcessAndSave = async () => {
    if (!fileData) return;

    setIsAnalyzing(true);
    let finalContent = `PDF Document: ${fileName}`;
    let pendingAnalysis = false;

    try {
      if (!isOnline) {
         finalContent = `[PDF: ${fileName}] saved (Offline - Waiting for analysis)`;
         pendingAnalysis = true;
      } else {
         const apiKey = process.env.API_KEY;
         if (apiKey) {
             const ai = new GoogleGenAI({ apiKey });
             // Strip data url header (data:application/pdf;base64,)
             const base64Data = fileData.split(',')[1];
             
             const prompt = "Analyze this PDF document. Extract the key information, summaries, and important details to store in a personal knowledge base. Keep it structured and comprehensive.";

             const response = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents: {
                     parts: [
                         { inlineData: { mimeType: 'application/pdf', data: base64Data } },
                         { text: prompt }
                     ]
                 }
             });
             
             finalContent = response.text || "PDF processed but no text generated.";
             finalContent = `[PDF Source: ${fileName}]\n\n${finalContent}`;
         } else {
             finalContent = `[PDF: ${fileName}] saved (Analysis unavailable without API Key)`;
         }
      }

      const newNote: Note = {
        id: Date.now().toString(),
        content: finalContent,
        type: 'pdf',
        timestamp: Date.now(),
        fileData: fileData,
        mimeType: 'application/pdf',
        pendingAnalysis: pendingAnalysis
      };

      onAdd(newNote);
    } catch (e) {
      console.error("PDF Analysis failed", e);
      const newNote: Note = {
          id: Date.now().toString(),
          content: `[PDF: ${fileName}] - Analysis failed. \n${e}`,
          type: 'pdf',
          timestamp: Date.now(),
          fileData: fileData,
          mimeType: 'application/pdf'
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
        <h2 className="text-white font-bold">Add PDF</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-md mx-auto w-full">
        
        <div 
            onClick={() => fileInputRef.current?.click()}
            className={`
            w-full h-64 rounded-3xl border-2 border-dashed border-zinc-700 
            flex flex-col items-center justify-center cursor-pointer 
            hover:border-red-500 hover:bg-zinc-900/50 transition-all
            ${fileName ? 'border-solid border-red-500/50 bg-red-500/5' : ''}
            `}
        >
            <span className={`material-symbols-outlined text-6xl mb-4 ${fileName ? 'text-red-400' : 'text-zinc-600'}`}>
                picture_as_pdf
            </span>
            {fileName ? (
                <div className="text-center px-4">
                    <p className="text-white font-medium break-all">{fileName}</p>
                    <p className="text-zinc-500 text-sm mt-2">Tap to replace</p>
                </div>
            ) : (
                <div className="text-center">
                    <p className="text-zinc-300 font-medium">Upload PDF</p>
                    <p className="text-zinc-500 text-sm mt-1">Tap to browse files</p>
                </div>
            )}
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf" 
                onChange={handleFileChange} 
            />
        </div>

        <div className="w-full text-center text-zinc-500 text-sm px-4">
            <p>The AI will read and summarize the document for your knowledge base.</p>
        </div>

        {/* Action Button */}
        <button 
            disabled={isAnalyzing || !fileData}
            onClick={handleProcessAndSave}
            className={`
                mt-auto w-full h-14 rounded-xl font-bold text-lg flex items-center justify-center gap-2
                ${isAnalyzing 
                    ? 'bg-zinc-700 text-zinc-400' 
                    : (!isOnline && fileData ? 'bg-amber-700 text-white' : 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-lg shadow-red-900/20 active:scale-95 transition-transform')}
                disabled:opacity-50 disabled:cursor-not-allowed
            `}
        >
            {isAnalyzing ? (
                <>
                    <span className="animate-spin material-symbols-outlined">progress_activity</span>
                    Reading PDF...
                </>
            ) : (
                <>
                    <span className="material-symbols-outlined">{!isOnline && fileData ? 'cloud_off' : 'auto_awesome'}</span>
                    {!isOnline && fileData ? 'Save (Offline)' : 'Analyze & Save'}
                </>
            )}
        </button>
      </div>
    </div>
  );
};

export default PdfAdd;
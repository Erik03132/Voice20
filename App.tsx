import React, { useState, useEffect } from 'react';
import VoiceAssistant from './components/VoiceAssistant';
import RegistryView from './components/RegistryView';
import CameraAdd from './components/CameraAdd';
import PdfAdd from './components/PdfAdd';
import MenuOverlay from './components/MenuOverlay';
import { getNotes, saveNote, deleteNote, updateNote } from './services/storageService';
import { Note, ViewState } from './types';
import { GoogleGenAI } from '@google/genai';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.HOME);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initial load
  useEffect(() => {
    loadNotes();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadNotes = async () => {
    const loaded = await getNotes();
    setNotes(loaded);
  };

  // Sync logic when coming online
  useEffect(() => {
    if (isOnline) {
      processPendingNotes();
    }
  }, [isOnline]);

  const processPendingNotes = async () => {
    const currentNotes = await getNotes();
    const pendingNotes = currentNotes.filter(n => n.pendingAnalysis);
    
    if (pendingNotes.length === 0) {
        setNotes(currentNotes);
        return;
    }

    setIsSyncing(true);
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        setIsSyncing(false);
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    for (const note of pendingNotes) {
        try {
            let base64Data = '';
            let mimeType = '';
            let prompt = '';
            let updateContentPrefix = '';

            if (note.type === 'image' && note.imageUrl) {
                base64Data = note.imageUrl.split(',')[1];
                mimeType = 'image/jpeg';
                prompt = "Analyze this previously saved image for the knowledge base. Provide a detailed description.";
                updateContentPrefix = note.content;
            } else if (note.type === 'pdf' && note.fileData) {
                base64Data = note.fileData.split(',')[1];
                mimeType = 'application/pdf';
                prompt = "Analyze this previously saved PDF document. Extract key information and summaries for the knowledge base.";
                updateContentPrefix = `[PDF Source]`;
            } else {
                continue; // Skip if unknown type
            }
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        { inlineData: { mimeType: mimeType, data: base64Data } },
                        { text: prompt }
                    ]
                }
            });
            
            const analysis = response.text || "Analysis completed.";
            const newContent = `${updateContentPrefix}\n\n[Synced AI Analysis]: ${analysis}`;
            
            const updatedList = await updateNote(note.id, { 
                content: newContent,
                pendingAnalysis: false 
            });
            setNotes(updatedList);
        } catch (e) {
            console.error("Sync failed for note", note.id, e);
        }
    }
    setIsSyncing(false);
  };

  const handleAddNote = async (note: Note) => {
    const updated = await saveNote(note);
    setNotes(updated);
    setCurrentView(ViewState.HOME);
  };

  const handleDeleteNote = async (id: string) => {
    const updated = await deleteNote(id);
    setNotes(updated);
  };

  const renderContent = () => {
    switch (currentView) {
      case ViewState.CAMERA_ADD:
        return (
            <div className="absolute inset-0 z-20 bg-[#101622] animate-in slide-in-from-bottom duration-300">
                <CameraAdd 
                    onAdd={handleAddNote} 
                    onCancel={() => setCurrentView(ViewState.HOME)} 
                    isOnline={isOnline}
                />
            </div>
        );
      case ViewState.PDF_ADD:
        return (
            <div className="absolute inset-0 z-20 bg-[#101622] animate-in slide-in-from-bottom duration-300">
                <PdfAdd
                    onAdd={handleAddNote}
                    onCancel={() => setCurrentView(ViewState.HOME)}
                    isOnline={isOnline}
                />
            </div>
        );
      case ViewState.REGISTRY:
        return (
            <div className="absolute inset-0 z-20 bg-[#101622] animate-in slide-in-from-right duration-300">
                <RegistryView 
                    notes={notes} 
                    onDelete={handleDeleteNote} 
                    onBack={() => setCurrentView(ViewState.HOME)} 
                />
            </div>
        );
      default:
        return <VoiceAssistant notes={notes} isOnline={isOnline} isSyncing={isSyncing} />;
    }
  };

  return (
    <div className="relative h-[100dvh] w-full bg-[#101622] text-white font-sans overflow-hidden flex flex-col">
      
      {!isOnline && (
          <div className="bg-amber-600/90 text-white text-xs text-center py-1 absolute top-0 w-full z-50">
              Offline Mode - Changes will be synced when online
          </div>
      )}
      
      <main className="flex-1 relative w-full max-w-md mx-auto">
        {renderContent()}
      </main>

      {currentView === ViewState.HOME && (
        <footer className="w-full px-6 pb-8 pt-4 absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-[#101622] via-[#101622] to-transparent">
          <div className="mx-auto grid max-w-[400px] grid-cols-3 gap-6 items-end">
            
            {/* Left: PDF Add (Replaces Registry) */}
            <button 
              onClick={() => setCurrentView(ViewState.PDF_ADD)}
              className="flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-zinc-800/80 backdrop-blur-md border border-white/5 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-red-400 text-2xl">picture_as_pdf</span>
            </button>

            {/* Center: Camera/Add */}
            <button 
              onClick={() => setCurrentView(ViewState.CAMERA_ADD)}
              className="flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-white/20 -mb-2 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-white text-3xl">add_a_photo</span>
            </button>

            {/* Right: Menu */}
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-zinc-800/80 backdrop-blur-md border border-white/5 active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-zinc-300 text-2xl">grid_view</span>
            </button>

          </div>
        </footer>
      )}

      <MenuOverlay 
        isOpen={isMenuOpen} 
        onClose={() => setIsMenuOpen(false)} 
        onNavigate={(view) => {
            setCurrentView(view);
            setIsMenuOpen(false);
        }}
      />
    </div>
  );
};

export default App;
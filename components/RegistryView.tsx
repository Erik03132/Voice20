import React, { useState } from 'react';
import { Note } from '../types';

interface RegistryViewProps {
  notes: Note[];
  onDelete: (id: string) => void;
  onBack: () => void;
}

const RegistryView: React.FC<RegistryViewProps> = ({ notes, onDelete, onBack }) => {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Helper to extract a title-like string
  const getShortTitle = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 0) {
        // Remove brackets usually added by AI system prompt like [PDF]
        return lines[0].replace(/^\[.*?\]\s*/, '').substring(0, 50);
    }
    return "Untitled Note";
  };

  // Helper to extract description
  const getShortDescription = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 1) return lines[1].substring(0, 80) + (lines[1].length > 80 ? '...' : '');
    if (lines.length > 0 && lines[0].length > 50) return lines[0].substring(50, 100) + '...';
    return "No additional details";
  };

  // Detail View
  if (selectedNote) {
    return (
      <div className="flex flex-col h-full bg-background w-full animate-in slide-in-from-right duration-200">
         {/* Detail Header */}
         <div className="flex items-center p-4 border-b border-white/10 bg-[#101622] sticky top-0 z-10">
            <button onClick={() => setSelectedNote(null)} className="p-2 -ml-2 text-zinc-400 hover:text-white flex items-center gap-1">
              <span className="material-symbols-outlined">arrow_back_ios_new</span>
              <span className="font-medium">Back</span>
            </button>
            <div className="flex-1"></div>
            <button 
                onClick={() => {
                    if(window.confirm('Delete this note permanently?')) {
                        onDelete(selectedNote.id);
                        setSelectedNote(null);
                    }
                }}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
            >
                <span className="material-symbols-outlined">delete</span>
            </button>
         </div>
         
         {/* Detail Body */}
         <div className="flex-1 overflow-y-auto p-5 pb-24">
             {/* Meta Header */}
             <div className="flex items-center justify-between mb-6">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider
                    ${selectedNote.type === 'image' ? 'bg-purple-500/20 text-purple-300' : 
                      selectedNote.type === 'pdf' ? 'bg-red-500/20 text-red-300' :
                      selectedNote.type === 'text' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-green-500/20 text-green-300'
                    }`}>
                    <span className="material-symbols-outlined text-[16px]">
                        {selectedNote.type === 'image' ? 'image' : 
                         selectedNote.type === 'pdf' ? 'picture_as_pdf' :
                         selectedNote.type === 'voice' ? 'mic' : 'description'}
                    </span>
                    {selectedNote.type}
                </div>
                <span className="text-zinc-500 text-xs font-mono">
                    {new Date(selectedNote.timestamp).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                </span>
             </div>

             {/* Image Asset */}
             {selectedNote.imageUrl && (
                 <div className="mb-6 rounded-2xl overflow-hidden shadow-lg border border-white/10 bg-black">
                    <img src={selectedNote.imageUrl} alt="Note asset" className="w-full h-auto object-contain max-h-[50vh]" />
                 </div>
             )}
             
             {/* Content */}
             <div className="prose prose-invert max-w-none">
                 <p className="text-zinc-100 whitespace-pre-wrap leading-7 text-base font-light">
                     {selectedNote.content}
                 </p>
             </div>
             
             {selectedNote.pendingAnalysis && (
                 <div className="mt-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm flex items-start gap-3">
                     <span className="material-symbols-outlined text-amber-500">sync_problem</span>
                     <div>
                         <p className="font-bold">Pending Analysis</p>
                         <p className="opacity-80">Content will be updated with AI analysis once synced online.</p>
                     </div>
                 </div>
             )}
         </div>
      </div>
    );
  }

  // List View
  return (
    <div className="flex flex-col h-full bg-background w-full">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-white/10 bg-[#101622] sticky top-0 z-10">
        <button onClick={onBack} className="p-2 -ml-2 text-zinc-400 hover:text-white">
          <span className="material-symbols-outlined">arrow_back_ios_new</span>
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-white mr-8">Registry</h1>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-24">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
             <span className="material-symbols-outlined text-6xl mb-4 opacity-50">inbox</span>
             <p>No notes found</p>
          </div>
        ) : (
          notes.map((note) => (
            <div 
                key={note.id} 
                className="bg-zinc-800/40 border border-white/5 rounded-2xl p-3 flex gap-4 items-center active:bg-zinc-800/80 active:scale-[0.99] transition-all cursor-pointer group"
                onClick={() => setSelectedNote(note)}
            >
               {/* Icon Box */}
               <div className={`w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center shadow-inner
                    ${note.type === 'image' ? 'bg-purple-500/10 text-purple-400' : 
                      note.type === 'pdf' ? 'bg-red-500/10 text-red-400' :
                      note.type === 'text' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-green-500/10 text-green-400'
                    }`}>
                    <span className="material-symbols-outlined text-2xl">
                        {note.type === 'image' ? 'image' : 
                         note.type === 'pdf' ? 'picture_as_pdf' :
                         note.type === 'voice' ? 'mic' : 'description'}
                    </span>
               </div>

               {/* Text Info */}
               <div className="flex-1 min-w-0 py-1">
                   <div className="flex justify-between items-center mb-1">
                       <p className="text-white text-sm font-bold truncate pr-2">
                           {getShortTitle(note.content)}
                       </p>
                       <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                           {new Date(note.timestamp).toLocaleDateString()}
                       </span>
                   </div>
                   <p className="text-zinc-400 text-xs truncate leading-relaxed">
                       {getShortDescription(note.content)}
                   </p>
               </div>

               {/* Delete Action */}
               <button 
                 onClick={(e) => {
                     e.stopPropagation();
                     if(window.confirm('Delete this note?')) onDelete(note.id);
                 }}
                 className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all"
               >
                 <span className="material-symbols-outlined">delete</span>
               </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RegistryView;
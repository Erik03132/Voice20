import React from 'react';
import { ViewState } from '../types';

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewState) => void;
}

const MenuOverlay: React.FC<MenuOverlayProps> = ({ isOpen, onClose, onNavigate }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-[#1a202c] rounded-t-3xl p-6 pb-12 w-full max-w-md mx-auto border-t border-white/10 shadow-2xl transform transition-transform duration-300 translate-y-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mb-6"></div>
        
        <h3 className="text-white text-lg font-bold mb-4 px-2">Quick Access</h3>
        
        <div className="grid grid-cols-2 gap-4">
            {/* Main Panel Buttons */}
            
            <button 
                onClick={() => { onNavigate(ViewState.CAMERA_ADD); onClose(); }}
                className="flex flex-col items-center justify-center p-4 bg-zinc-800 rounded-2xl border border-white/5 active:bg-zinc-700"
            >
                <div className="flex gap-1 mb-2">
                    <span className="material-symbols-outlined text-3xl text-blue-400">add_a_photo</span>
                    <span className="material-symbols-outlined text-3xl text-blue-400">edit_note</span>
                </div>
                <span className="text-zinc-200 font-medium">Add Visual/Text</span>
            </button>
            
            <button 
                onClick={() => { onNavigate(ViewState.PDF_ADD); onClose(); }}
                className="flex flex-col items-center justify-center p-4 bg-zinc-800 rounded-2xl border border-white/5 active:bg-zinc-700"
            >
                <span className="material-symbols-outlined text-3xl text-red-400 mb-2">picture_as_pdf</span>
                <span className="text-zinc-200 font-medium">Add PDF File</span>
            </button>

             <button 
                onClick={() => { onNavigate(ViewState.REGISTRY); onClose(); }}
                className="flex flex-col items-center justify-center p-4 bg-zinc-800 rounded-2xl border border-white/5 active:bg-zinc-700"
            >
                <span className="material-symbols-outlined text-3xl text-purple-400 mb-2">library_books</span>
                <span className="text-zinc-200 font-medium">Registry</span>
            </button>

             <button 
                onClick={onClose}
                className="flex flex-col items-center justify-center p-4 bg-zinc-800 rounded-2xl border border-white/5 active:bg-zinc-700"
            >
                <span className="material-symbols-outlined text-3xl text-zinc-500 mb-2">close</span>
                <span className="text-zinc-200 font-medium">Close Menu</span>
            </button>
        </div>
      </div>
    </div>
  );
};

export default MenuOverlay;
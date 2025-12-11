export interface Note {
  id: string;
  content: string;
  type: 'text' | 'image' | 'voice' | 'url' | 'pdf';
  timestamp: number;
  imageUrl?: string;
  fileData?: string; // Base64 data for files like PDF
  mimeType?: string;
  pendingAnalysis?: boolean;
}

export enum ViewState {
  HOME = 'HOME',
  REGISTRY = 'REGISTRY',
  CAMERA_ADD = 'CAMERA_ADD',
  PDF_ADD = 'PDF_ADD',
  MENU = 'MENU'
}

export interface LiveConfig {
  voiceName: string;
}
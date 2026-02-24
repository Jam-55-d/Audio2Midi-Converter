import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileAudio, 
  Music, 
  Download, 
  Loader2, 
  Play, 
  Pause,
  AlertCircle,
  CheckCircle2,
  Waves,
  Save,
  FolderOpen,
  Trash2,
  Plus,
  Undo2,
  Redo2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { transcribeAudioToMidi, MidiNote } from './services/gemini';
import { generateMidiFile, MidiOptions } from './utils/midi';
import { PianoRoll } from './components/PianoRoll';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Settings2, SlidersHorizontal } from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  options: MidiOptions;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'default-piano',
    name: 'Default Piano',
    options: { bpm: 120, timeSignature: [4, 4], instrument: 1, quantize: { enabled: false, grid: 16, strength: 1 } }
  },
  {
    id: 'lofi-hiphop',
    name: 'Lo-Fi Beats',
    options: { bpm: 85, timeSignature: [4, 4], instrument: 5, quantize: { enabled: true, grid: 8, strength: 0.6 } }
  }
];

const GM_INSTRUMENTS = [
  { id: 1, name: 'Acoustic Grand Piano' },
  { id: 5, name: 'Electric Piano' },
  { id: 7, name: 'Harpsichord' },
  { id: 17, name: 'Drawbar Organ' },
  { id: 25, name: 'Acoustic Guitar (nylon)' },
  { id: 26, name: 'Acoustic Guitar (steel)' },
  { id: 33, name: 'Acoustic Bass' },
  { id: 34, name: 'Electric Bass (finger)' },
  { id: 41, name: 'Violin' },
  { id: 49, name: 'String Ensemble 1' },
  { id: 57, name: 'Trumpet' },
  { id: 65, name: 'Soprano Sax' },
  { id: 73, name: 'Flute' },
  { id: 81, name: 'Lead 1 (square)' },
  { id: 89, name: 'Pad 1 (new age)' },
];

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [midiDataUri, setMidiDataUri] = useState<string | null>(null);
  const [notes, setNotes] = useState<MidiNote[]>([]);
  const [history, setHistory] = useState<MidiNote[][]>([]);
  const [future, setFuture] = useState<MidiNote[][]>([]);

  const pushToHistory = useCallback((newNotes: MidiNote[]) => {
    setHistory(prev => [...prev, notes]);
    setFuture([]);
    setNotes(newNotes);
  }, [notes]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture(prev => [notes, ...prev]);
    setHistory(prev => prev.slice(0, -1));
    setNotes(previous);
  }, [history, notes]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory(prev => [...prev, notes]);
    setFuture(prev => prev.slice(1));
    setNotes(next);
  }, [future, notes]);

  // Keyboard shortcuts for Undo/Redo
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [midiOptions, setMidiOptions] = useState<MidiOptions>({
    bpm: 120,
    timeSignature: [4, 4],
    instrument: 1,
    quantize: {
      enabled: false,
      grid: 16,
      strength: 1
    }
  });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Load presets from localStorage
  React.useEffect(() => {
    const saved = localStorage.getItem('midi-presets');
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        setPresets(DEFAULT_PRESETS);
      }
    } else {
      setPresets(DEFAULT_PRESETS);
    }
  }, []);

  // Save presets to localStorage
  React.useEffect(() => {
    if (presets.length > 0) {
      localStorage.setItem('midi-presets', JSON.stringify(presets));
    }
  }, [presets]);

  // Clean up object URL to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Regenerate MIDI file when options change
  React.useEffect(() => {
    if (notes.length > 0) {
      const dataUri = generateMidiFile(notes, midiOptions);
      setMidiDataUri(dataUri);
    }
  }, [midiOptions, notes]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setAudioUrl(URL.createObjectURL(selectedFile));
      setCurrentTime(0);
      setDuration(0);
      setMidiDataUri(null);
      setNotes([]);
      setHistory([]);
      setFuture([]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.m4a', '.ogg', '.flac']
    },
    multiple: false
  } as any);

  const handleConvert = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64 = await base64Promise;

      const transcribedNotes = await transcribeAudioToMidi(base64, file.type);
      
      if (transcribedNotes.length === 0) {
        throw new Error("No notes were detected in the audio. Try a clearer recording.");
      }

      setNotes(transcribedNotes);
      // MIDI file is generated by the useEffect above
    } catch (err: any) {
      console.error(err);
      let errorMessage = "An error occurred during conversion.";
      if (err.message) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const saveCurrentAsPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: Preset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      options: { ...midiOptions }
    };
    setPresets(prev => [...prev, newPreset]);
    setNewPresetName('');
    setShowSaveDialog(false);
  };

  const deletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  const applyPreset = (preset: Preset) => {
    setMidiOptions(preset.options);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-900/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900/10 blur-[120px] rounded-full" />
      </div>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 md:py-20">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4"
          >
            <Music className="w-3 h-3" />
            AI-POWERED TRANSCRIPTION
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-4xl md:text-6xl font-bold tracking-tight mb-4 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent"
          >
            Audio2MIDI
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-zinc-400 text-lg max-w-xl mx-auto"
          >
            Convert your audio recordings into high-fidelity MIDI files ready for your favorite DAW.
          </motion.p>
        </header>

        {/* Main Interface */}
        <div className="grid gap-8">
          {/* Upload Section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 backdrop-blur-xl"
          >
            <div
              {...getRootProps()}
              className={cn(
                "relative group cursor-pointer border-2 border-dashed rounded-2xl p-12 transition-all duration-300 flex flex-col items-center justify-center text-center",
                isDragActive 
                  ? "border-emerald-500 bg-emerald-500/5" 
                  : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
              )}
            >
              <input {...getInputProps()} />
              
              <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                {file ? (
                  <FileAudio className="w-8 h-8 text-emerald-400" />
                ) : (
                  <Upload className="w-8 h-8 text-zinc-400" />
                )}
              </div>

              {file ? (
                <div>
                  <p className="text-white font-medium mb-1">{file.name}</p>
                  <p className="text-zinc-500 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <p className="text-white font-medium mb-1">
                    {isDragActive ? "Drop it here" : "Click or drag audio file"}
                  </p>
                  <p className="text-zinc-500 text-sm">MP3, WAV, M4A up to 20MB</p>
                </div>
              )}
            </div>

            {/* Integrated Export Settings - Always visible for pre-configuration */}
            <div className="mt-8 pt-8 border-t border-zinc-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-bold text-white">Export Settings</h3>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <button 
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-300 hover:text-white hover:border-zinc-500 transition-all"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Presets
                    </button>
                    
                    <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
                      <div className="max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-zinc-700">
                        {presets.map(preset => (
                          <div 
                            key={preset.id}
                            className="flex items-center justify-between p-2 hover:bg-zinc-800 rounded-xl group/item"
                          >
                            <button 
                              onClick={() => applyPreset(preset)}
                              className="flex-1 text-left text-xs text-zinc-300 hover:text-emerald-400 transition-colors truncate pr-2"
                            >
                              {preset.name}
                            </button>
                            <button 
                              onClick={() => deletePreset(preset.id)}
                              className="opacity-0 group-hover/item:opacity-100 p-1 text-zinc-500 hover:text-red-400 transition-all"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-zinc-800">
                        <button 
                          onClick={() => setShowSaveDialog(true)}
                          className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          SAVE CURRENT AS PRESET
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {showSaveDialog && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-8 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row items-center gap-3"
                >
                  <input 
                    type="text"
                    placeholder="Preset Name (e.g. My Studio Piano)"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
                    autoFocus
                  />
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button 
                      onClick={saveCurrentAsPreset}
                      className="flex-1 sm:flex-none px-4 py-2 bg-emerald-500 text-black text-xs font-bold rounded-xl hover:bg-emerald-400 transition-all"
                    >
                      SAVE
                    </button>
                    <button 
                      onClick={() => setShowSaveDialog(false)}
                      className="flex-1 sm:flex-none px-4 py-2 bg-zinc-800 text-zinc-400 text-xs font-bold rounded-xl hover:text-white transition-all"
                    >
                      CANCEL
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* BPM */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Tempo (BPM)</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="40" 
                      max="240" 
                      value={midiOptions.bpm}
                      onChange={(e) => setMidiOptions(prev => ({ ...prev, bpm: parseInt(e.target.value) }))}
                      className="flex-1 accent-emerald-500"
                    />
                    <span className="w-12 text-right font-mono text-emerald-400">{midiOptions.bpm}</span>
                  </div>
                </div>

                {/* Time Signature */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Time Signature</label>
                  <div className="flex items-center gap-2">
                    <select 
                      value={midiOptions.timeSignature[0]}
                      onChange={(e) => setMidiOptions(prev => ({ ...prev, timeSignature: [parseInt(e.target.value), prev.timeSignature[1]] }))}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9, 12].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-zinc-500">/</span>
                    <select 
                      value={midiOptions.timeSignature[1]}
                      onChange={(e) => setMidiOptions(prev => ({ ...prev, timeSignature: [prev.timeSignature[0], parseInt(e.target.value)] }))}
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                    >
                      {[2, 4, 8, 16].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                {/* Instrument */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Instrument</label>
                  <select 
                    value={midiOptions.instrument}
                    onChange={(e) => setMidiOptions(prev => ({ ...prev, instrument: parseInt(e.target.value) }))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                  >
                    {GM_INSTRUMENTS.map(inst => (
                      <option key={inst.id} value={inst.id}>{inst.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantization Section */}
              <div className="mt-8 pt-8 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-lg font-bold text-white">Quantization</h3>
                  </div>
                  <button
                    onClick={() => setMidiOptions(prev => ({ ...prev, quantize: { ...prev.quantize, enabled: !prev.quantize.enabled } }))}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                      midiOptions.quantize.enabled 
                        ? "bg-emerald-500 text-black" 
                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                    )}
                  >
                    {midiOptions.quantize.enabled ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <div className={cn(
                  "grid grid-cols-1 md:grid-cols-2 gap-8 transition-opacity duration-300",
                  !midiOptions.quantize.enabled && "opacity-30 pointer-events-none"
                )}>
                  {/* Grid Selection */}
                  <div className="space-y-4">
                    <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Grid Resolution</label>
                    <div className="flex gap-2">
                      {[4, 8, 16, 32].map(g => (
                        <button
                          key={g}
                          onClick={() => setMidiOptions(prev => ({ ...prev, quantize: { ...prev.quantize, grid: g } }))}
                          className={cn(
                            "flex-1 py-2 rounded-lg border text-sm font-mono transition-all",
                            midiOptions.quantize.grid === g
                              ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                              : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                          )}
                        >
                          1/{g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Strength Slider */}
                  <div className="space-y-4">
                    <label className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Quantize Strength</label>
                    <div className="flex items-center gap-4">
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={midiOptions.quantize.strength * 100}
                        onChange={(e) => setMidiOptions(prev => ({ ...prev, quantize: { ...prev.quantize, strength: parseInt(e.target.value) / 100 } }))}
                        className="flex-1 accent-emerald-500"
                      />
                      <span className="w-12 text-right font-mono text-emerald-400">{Math.round(midiOptions.quantize.strength * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {file && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 space-y-8"
              >
                {/* Audio Preview */}
                <div className="pt-8 border-t border-zinc-800 flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-1 w-full bg-zinc-800/50 rounded-2xl p-4 flex items-center gap-4">
                    <button 
                      onClick={togglePlayback}
                      className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shrink-0"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Waves className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Audio Preview</span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500">
                          {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                      </div>
                      <div className="relative group/seek h-1 flex items-center">
                        <input 
                          type="range"
                          min="0"
                          max={duration || 0}
                          step="0.01"
                          value={currentTime}
                          onChange={handleSeek}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-full h-1 bg-zinc-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500"
                            style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    {audioUrl && (
                      <audio 
                        key={audioUrl}
                        ref={audioRef} 
                        src={audioUrl} 
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden"
                        preload="auto"
                      />
                    )}
                  </div>
                </div>

                <div className="pt-8 border-t border-zinc-800">
                  <button
                    onClick={handleConvert}
                    disabled={isProcessing}
                    className="w-full px-8 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Music className="w-5 h-5" />
                        Convert to MIDI
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Results Section */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 text-red-400"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </motion.div>
            )}

            {midiDataUri && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-8 backdrop-blur-xl"
              >
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Conversion Complete</h3>
                      <p className="text-zinc-400">{notes.length} notes identified</p>
                    </div>
                  </div>

                  <a
                    href={midiDataUri}
                    download={`${file?.name.split('.')[0] || 'audio'}.mid`}
                    className="w-full md:w-auto px-8 py-4 bg-zinc-100 hover:bg-white text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download MIDI
                  </a>
                </div>

                {/* Piano Roll Visualization */}
                <div className="mt-8 pt-8 border-t border-zinc-800">
                  <div className="flex items-center justify-end gap-2 mb-4">
                    <button
                      onClick={undo}
                      disabled={history.length === 0}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-xs font-mono"
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 className="w-4 h-4" />
                      UNDO
                    </button>
                    <button
                      onClick={redo}
                      disabled={future.length === 0}
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-zinc-400 hover:text-white transition-all flex items-center gap-2 text-xs font-mono"
                      title="Redo (Ctrl+Y)"
                    >
                      <Redo2 className="w-4 h-4" />
                      REDO
                    </button>
                  </div>
                  <PianoRoll 
                    notes={notes} 
                    onNotesChange={setNotes}
                    onNotesCommit={pushToHistory}
                    bpm={midiOptions.bpm}
                    timeSignature={midiOptions.timeSignature}
                    quantize={midiOptions.quantize}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Info */}
        <footer className="mt-20 text-center">
          <p className="text-zinc-600 text-sm">
            Powered by Gemini 2.5 Flash & MIDI Writer JS
          </p>
        </footer>
      </main>
    </div>
  );
}

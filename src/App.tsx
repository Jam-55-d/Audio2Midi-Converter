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
  Waves
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { transcribeAudioToMidi, MidiNote } from './services/gemini';
import { generateMidiFile } from './utils/midi';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [midiDataUri, setMidiDataUri] = useState<string | null>(null);
  const [notes, setNotes] = useState<MidiNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      setAudioUrl(URL.createObjectURL(selectedFile));
      setMidiDataUri(null);
      setNotes([]);
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
      const dataUri = generateMidiFile(transcribedNotes);
      setMidiDataUri(dataUri);
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

            {file && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 flex flex-col sm:flex-row items-center gap-4"
              >
                <div className="flex-1 w-full bg-zinc-800/50 rounded-2xl p-4 flex items-center gap-4">
                  <button 
                    onClick={togglePlayback}
                    className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Waves className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">Audio Preview</span>
                    </div>
                    <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-emerald-500"
                        animate={{ width: isPlaying ? "100%" : "0%" }}
                        transition={{ duration: audioRef.current?.duration || 0, ease: "linear" }}
                      />
                    </div>
                  </div>
                  <audio 
                    ref={audioRef} 
                    src={audioUrl || ""} 
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />
                </div>

                <button
                  onClick={handleConvert}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
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

                {/* Visualizer Placeholder */}
                <div className="mt-8 pt-8 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Note Map</span>
                    <span className="text-xs font-mono text-zinc-500">120 BPM</span>
                  </div>
                  <div className="h-32 bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden relative">
                    {notes.slice(0, 50).map((note, i) => (
                      <div 
                        key={i}
                        className="absolute bg-emerald-500/40 rounded-sm"
                        style={{
                          left: `${(note.startTime / Math.max(...notes.map(n => n.startTime + n.duration))) * 100}%`,
                          top: `${100 - ((note.pitch - 21) / 88) * 100}%`,
                          width: `${(note.duration / Math.max(...notes.map(n => n.startTime + n.duration))) * 100}%`,
                          height: '4px'
                        }}
                      />
                    ))}
                  </div>
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

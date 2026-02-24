import React, { useMemo, useRef, useEffect } from 'react';
import { MidiNote } from '../services/gemini';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PianoRollProps {
  notes: MidiNote[];
  onNotesChange?: (notes: MidiNote[]) => void;
  onNotesCommit?: (notes: MidiNote[]) => void;
  bpm?: number;
  timeSignature?: [number, number];
  quantize?: {
    enabled: boolean;
    grid: number;
  };
}

const PIANO_RANGE = { min: 21, max: 108 }; // Standard 88-key piano
const BASE_NOTE_HEIGHT = 12;
const BASE_PIXELS_PER_SECOND = 100;

const GM_INSTRUMENTS: Record<number, string> = {
  1: 'Acoustic Grand Piano',
  2: 'Bright Acoustic Piano',
  5: 'Electric Piano 1',
  6: 'Electric Piano 2',
  7: 'Harpsichord',
  8: 'Clavinet',
  10: 'Glockenspiel',
  12: 'Vibraphone',
  13: 'Marimba',
  14: 'Xylophone',
  15: 'Tubular Bells',
  17: 'Drawbar Organ',
  18: 'Percussive Organ',
  19: 'Rock Organ',
  20: 'Church Organ',
  22: 'Accordion',
  25: 'Acoustic Guitar (nylon)',
  26: 'Acoustic Guitar (steel)',
  27: 'Electric Guitar (jazz)',
  28: 'Electric Guitar (clean)',
  29: 'Electric Guitar (muted)',
  30: 'Overdriven Guitar',
  31: 'Distortion Guitar',
  33: 'Acoustic Bass',
  34: 'Electric Bass (finger)',
  35: 'Electric Bass (pick)',
  36: 'Fretless Bass',
  37: 'Slap Bass 1',
  39: 'Synth Bass 1',
  41: 'Violin',
  42: 'Viola',
  43: 'Cello',
  44: 'Contrabass',
  45: 'Tremolo Strings',
  46: 'Pizzicato Strings',
  47: 'Orchestral Harp',
  48: 'Timpani',
  49: 'String Ensemble 1',
  50: 'String Ensemble 2',
  51: 'SynthStrings 1',
  53: 'Choir Aahs',
  54: 'Voice Oohs',
  55: 'Synth Voice',
  56: 'Orchestra Hit',
  57: 'Trumpet',
  58: 'Trombone',
  59: 'Tuba',
  60: 'Muted Trumpet',
  61: 'French Horn',
  62: 'Brass Section',
  63: 'SynthBrass 1',
  65: 'Soprano Sax',
  66: 'Alto Sax',
  67: 'Tenor Sax',
  68: 'Baritone Sax',
  69: 'Oboe',
  70: 'English Horn',
  71: 'Bassoon',
  72: 'Clarinet',
  73: 'Flute',
  74: 'Piccolo',
  75: 'Recorder',
  76: 'Pan Flute',
  79: 'Whistle',
  80: 'Ocarina',
  81: 'Lead 1 (square)',
  82: 'Lead 2 (sawtooth)',
  83: 'Lead 3 (calliope)',
  85: 'Lead 5 (charang)',
  86: 'Lead 6 (voice)',
  88: 'Lead 8 (bass + lead)',
  89: 'Pad 1 (new age)',
  90: 'Pad 2 (warm)',
  91: 'Pad 3 (polysynth)',
  92: 'Pad 4 (choir)',
  93: 'Pad 5 (bowed)',
  95: 'Pad 7 (halo)',
  96: 'Pad 8 (sweep)',
  97: 'FX 1 (rain)',
  98: 'FX 2 (soundtrack)',
  99: 'FX 3 (crystal)',
  101: 'FX 5 (brightness)',
  103: 'FX 7 (echoes)',
  104: 'FX 8 (sci-fi)',
  105: 'Sitar',
  106: 'Banjo',
  107: 'Shamisen',
  108: 'Koto',
  110: 'Bagpipe',
  112: 'Shanai',
  113: 'Tinkle Bell',
  115: 'Steel Drums',
  116: 'Woodblock',
  117: 'Taiko Drum',
  118: 'Melodic Tom',
  119: 'Synth Drum',
  121: 'Guitar Fret Noise',
  123: 'Seashore',
  124: 'Bird Tweet',
  125: 'Telephone Ring',
  126: 'Helicopter',
  128: 'Gunshot',
};

const getInstrumentColor = (inst: number) => {
  const colors = [
    '#10b981', // emerald
    '#3b82f6', // blue
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
  ];
  return colors[inst % colors.length];
};

export const PianoRoll: React.FC<PianoRollProps> = ({ 
  notes, 
  onNotesChange, 
  onNotesCommit, 
  bpm = 120, 
  timeSignature = [4, 4],
  quantize 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNoteIndex, setSelectedNoteIndex] = React.useState<number | null>(null);
  const [zoomX, setZoomX] = React.useState(1);
  const [zoomY, setZoomY] = React.useState(1);
  
  const noteHeight = BASE_NOTE_HEIGHT * zoomY;
  const pixelsPerSecond = BASE_PIXELS_PER_SECOND * zoomX;

  const [dragState, setDragState] = React.useState<{
    type: 'move' | 'resize';
    noteIndex: number;
    startX: number;
    startY: number;
    originalNote: MidiNote;
  } | null>(null);

  const gridInSeconds = useMemo(() => {
    if (!quantize?.enabled) return 0;
    return (60 / bpm) * (4 / quantize.grid);
  }, [bpm, quantize]);

  const snap = (val: number) => {
    if (gridInSeconds === 0) return val;
    return Math.round(val / gridInSeconds) * gridInSeconds;
  };

  const { maxTime, minPitch, maxPitch } = useMemo(() => {
    if (notes.length === 0) return { maxTime: 0, minPitch: 60, maxPitch: 72 };
    
    let maxT = 0;
    let minP = 127;
    let maxP = 0;

    notes.forEach(n => {
      maxT = Math.max(maxT, n.startTime + n.duration);
      minP = Math.min(minP, n.pitch);
      maxP = Math.max(maxP, n.pitch);
    });

    // Ensure we show at least an octave around the notes
    return {
      maxTime: maxT,
      minPitch: Math.max(0, minP - 6),
      maxPitch: Math.min(127, maxP + 6)
    };
  }, [notes]);

  const beatDuration = 60 / bpm;
  const beatsPerBar = timeSignature[0];

  const totalHeight = (maxPitch - minPitch + 1) * noteHeight + 24; // +24 for time ruler
  const totalWidth = Math.max(800, maxTime * pixelsPerSecond + 100);

  // Auto-scroll to the first note
  useEffect(() => {
    if (notes.length > 0 && containerRef.current) {
      const firstNote = notes.reduce((prev, curr) => prev.startTime < curr.startTime ? prev : curr);
      const scrollLeft = Math.max(0, firstNote.startTime * pixelsPerSecond - 100);
      containerRef.current.scrollLeft = scrollLeft;
      
      // Vertical scroll to center the notes
      const midPitch = (minPitch + maxPitch) / 2;
      const scrollTop = (maxPitch - midPitch) * noteHeight - 100;
      containerRef.current.scrollTop = scrollTop;
    }
  }, [notes, minPitch, maxPitch, noteHeight, pixelsPerSecond]);

  const renderGrid = () => {
    const lines = [];
    // Horizontal lines (pitches)
    for (let p = minPitch; p <= maxPitch; p++) {
      const isBlackKey = [1, 3, 6, 8, 10].includes(p % 12);
      lines.push(
        <rect
          key={`bg-${p}`}
          x={0}
          y={(maxPitch - p) * noteHeight + 24}
          width={totalWidth}
          height={noteHeight}
          fill={isBlackKey ? 'rgba(255,255,255,0.03)' : 'transparent'}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={0.5}
        />
      );
    }

    // Beat and Bar lines
    const totalBeats = Math.ceil(maxTime / beatDuration) + beatsPerBar;

    for (let b = 0; b <= totalBeats; b++) {
      const time = b * beatDuration;
      const x = time * pixelsPerSecond;
      const isBar = b % beatsPerBar === 0;
      
      if (x > totalWidth) break;

      lines.push(
        <line
          key={`beat-${b}`}
          x1={x}
          y1={0}
          x2={x}
          y2={totalHeight}
          stroke={isBar ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"}
          strokeWidth={isBar ? 1 : 0.5}
          strokeDasharray={isBar ? "" : "2,2"}
        />
      );
    }

    // Vertical lines (seconds) - kept for reference but made more subtle
    for (let t = 0; t <= maxTime; t++) {
      lines.push(
        <line
          key={`time-${t}`}
          x1={t * pixelsPerSecond}
          y1={0}
          x2={t * pixelsPerSecond}
          y2={totalHeight}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1.5}
          opacity={0.3}
        />
      );
    }
    return lines;
  };

  const getNoteName = (p: number) => {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(p / 12) - 1;
    return `${names[p % 12]}${octave}`;
  };

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize' | 'create', index?: number) => {
    e.stopPropagation();
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (type === 'create') {
      const time = snap(x / pixelsPerSecond);
      const pitch = maxPitch - Math.floor((y - 24) / noteHeight);
      
      const newNote: MidiNote = {
        pitch,
        startTime: time,
        duration: gridInSeconds > 0 ? gridInSeconds : 0.5,
        velocity: 80,
        instrument: notes[0]?.instrument || 1,
        type: 'melody'
      };
      
      const newNotes = [...notes, newNote];
      onNotesChange?.(newNotes);
      onNotesCommit?.(newNotes);
      setSelectedNoteIndex(newNotes.length - 1);
      return;
    }

    if (index !== undefined) {
      setSelectedNoteIndex(index);
      setDragState({
        type,
        noteIndex: index,
        startX: x,
        startY: y,
        originalNote: { ...notes[index] }
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState || !svgRef.current || !onNotesChange) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = (x - dragState.startX) / pixelsPerSecond;
    const dy = Math.round((y - dragState.startY) / noteHeight);

    const updatedNotes = [...notes];
    const note = { ...dragState.originalNote };

    if (dragState.type === 'move') {
      note.startTime = snap(Math.max(0, note.startTime + dx));
      note.pitch = Math.max(0, Math.min(127, note.pitch - dy));
    } else if (dragState.type === 'resize') {
      note.duration = Math.max(gridInSeconds > 0 ? gridInSeconds : 0.05, snap(note.duration + dx));
    }

    updatedNotes[dragState.noteIndex] = note;
    onNotesChange(updatedNotes);
  };

  const handleMouseUp = () => {
    if (dragState && onNotesCommit) {
      onNotesCommit(notes);
    }
    setDragState(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedNoteIndex === null || !onNotesChange) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const newNotes = notes.filter((_, i) => i !== selectedNoteIndex);
      onNotesChange?.(newNotes);
      onNotesCommit?.(newNotes);
      setSelectedNoteIndex(null);
    }
  };

  const handleToggleType = () => {
    if (selectedNoteIndex === null || !onNotesChange) return;
    const updatedNotes = [...notes];
    const note = { ...updatedNotes[selectedNoteIndex] };
    note.type = note.type === 'melody' ? 'harmony' : 'melody';
    updatedNotes[selectedNoteIndex] = note;
    onNotesChange(updatedNotes);
    onNotesCommit?.(updatedNotes);
  };

  const handleDelete = () => {
    if (selectedNoteIndex === null || !onNotesChange) return;
    const newNotes = notes.filter((_, i) => i !== selectedNoteIndex);
    onNotesChange(newNotes);
    onNotesCommit?.(newNotes);
    setSelectedNoteIndex(null);
  };

  return (
    <div 
      className="flex flex-col gap-4" 
      role="region" 
      aria-label="MIDI Piano Roll Visualization"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest" id="piano-roll-title">Interactive Piano Roll</span>
          <div className="px-1.5 py-0.5 rounded bg-zinc-800 text-[8px] font-mono text-zinc-400" aria-hidden="true">SCROLLABLE</div>
          <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[8px] font-mono text-emerald-400 border border-emerald-500/20">EDITABLE</div>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Zoom Controls */}
          <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-zinc-500 uppercase">Time</span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setZoomX(prev => Math.max(0.2, prev - 0.2))}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => setZoomX(prev => Math.min(5, prev + 0.2))}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="w-px h-3 bg-zinc-800" />
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-zinc-500 uppercase">Pitch</span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setZoomY(prev => Math.max(0.5, prev - 0.2))}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => setZoomY(prev => Math.min(3, prev + 0.2))}
                  className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
            <button 
              onClick={() => { setZoomX(1); setZoomY(1); }}
              className="ml-1 p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-emerald-400 transition-colors"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>

          <AnimatePresence>
            {selectedNoteIndex !== null && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1"
              >
                <button
                  onClick={handleToggleType}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[8px] font-bold transition-all",
                    notes[selectedNoteIndex].type === 'melody' 
                      ? "bg-emerald-500 text-black" 
                      : "bg-blue-500 text-white"
                  )}
                >
                  {notes[selectedNoteIndex].type.toUpperCase()}
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-lg transition-all"
                  title="Delete Note"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="hidden lg:flex items-center gap-4">
            <span className="text-[8px] font-mono text-zinc-600">CLICK GRID TO ADD</span>
            <span className="text-[8px] font-mono text-zinc-600">DRAG TO MOVE/RESIZE</span>
            <span className="text-[8px] font-mono text-zinc-600">DEL TO REMOVE</span>
          </div>
          
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest" aria-live="polite">
            {notes.length} Notes • {maxTime.toFixed(1)}s
          </span>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="h-[400px] bg-zinc-950 rounded-2xl border border-zinc-800 overflow-auto relative scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent focus-within:ring-2 focus-within:ring-emerald-500/50 outline-none"
        tabIndex={0}
        aria-labelledby="piano-roll-title"
      >
        <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
          {/* Time Ruler (Sticky Top) */}
          <div className="sticky top-0 left-0 w-full h-6 bg-zinc-900/95 border-b border-zinc-800 z-30 flex items-center">
            {/* Corner Piece */}
            <div className="sticky left-0 w-10 h-full bg-zinc-900 border-r border-zinc-800 z-40 flex items-center justify-center">
              <span className="text-[8px] font-mono text-zinc-600">P\T</span>
            </div>
            {/* Ruler Ticks */}
            <div className="relative h-full flex-1">
              {/* Bars */}
              {Array.from({ length: Math.ceil(maxTime / (beatDuration * beatsPerBar)) + 1 }).map((_, b) => (
                <div 
                  key={`bar-${b}`}
                  className="absolute top-0 h-full border-l border-zinc-500 flex items-start pt-0.5 pl-1"
                  style={{ left: b * beatsPerBar * beatDuration * pixelsPerSecond }}
                >
                  <span className="text-[7px] font-mono text-zinc-400">BAR {b + 1}</span>
                </div>
              ))}
              {/* Seconds */}
              {Array.from({ length: Math.ceil(maxTime) + 1 }).map((_, t) => (
                <div 
                  key={t}
                  className="absolute top-0 h-full border-l border-zinc-700 flex items-end pb-1 pl-1"
                  style={{ left: t * pixelsPerSecond }}
                >
                  <span className="text-[8px] font-mono text-zinc-500">{t}s</span>
                </div>
              ))}
            </div>
          </div>

          <svg 
            ref={svgRef}
            width={totalWidth} 
            height={totalHeight} 
            className="absolute top-0 left-0 cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={(e) => {
              if (!dragState) handleMouseDown(e, 'create');
            }}
          >
            {/* Background Grid */}
            <g>{renderGrid()}</g>

            {/* Notes */}
            {notes.map((note, i) => {
              const x = note.startTime * pixelsPerSecond;
              const y = (maxPitch - note.pitch) * noteHeight + 24;
              const width = note.duration * pixelsPerSecond;
              const isSelected = selectedNoteIndex === i;
              const color = getInstrumentColor(note.instrument || 1);

              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={noteHeight - 2}
                    rx={2}
                    fill={color}
                    fillOpacity={0.8}
                    className={cn(
                      "transition-all cursor-move",
                      isSelected ? "stroke-white stroke-2 brightness-125" : "hover:brightness-110"
                    )}
                    onMouseDown={(e) => handleMouseDown(e, 'move', i)}
                    tabIndex={0}
                    role="img"
                    aria-label={`${GM_INSTRUMENTS[note.instrument] || 'Instrument ' + note.instrument} note, pitch ${getNoteName(note.pitch)}, starts at ${note.startTime.toFixed(2)} seconds, lasts ${note.duration.toFixed(2)} seconds`}
                  >
                    <title>{GM_INSTRUMENTS[note.instrument] || 'Instrument ' + note.instrument} | Pitch: {getNoteName(note.pitch)} ({note.pitch}) | Time: {note.startTime.toFixed(2)}s | Dur: {note.duration.toFixed(2)}s</title>
                  </rect>
                  {/* Resize Handle */}
                  <rect
                    x={x + width - 6}
                    y={y}
                    width={6}
                    height={noteHeight - 2}
                    fill="transparent"
                    className="cursor-ew-resize"
                    onMouseDown={(e) => handleMouseDown(e, 'resize', i)}
                  />
                </g>
              );
            })}

            <defs>
              <linearGradient id="melodyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="harmonyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
            </defs>
          </svg>

          {/* Pitch Labels Overlay (Sticky Left) */}
          <div 
            className="sticky left-0 w-10 bg-zinc-900 border-r border-zinc-800 z-20 pointer-events-none" 
            style={{ top: 24, height: (maxPitch - minPitch + 1) * noteHeight }}
          >
            {Array.from({ length: maxPitch - minPitch + 1 }).map((_, i) => {
              const p = maxPitch - i;
              const isBlackKey = [1, 3, 6, 8, 10].includes(p % 12);
              return (
                <div 
                  key={p}
                  className={cn(
                    "flex items-center justify-end pr-1 text-[7px] font-mono leading-none",
                    isBlackKey ? "text-zinc-500 bg-zinc-950/30" : "text-zinc-400"
                  )}
                  style={{ height: noteHeight }}
                >
                  {getNoteName(p)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap justify-center gap-4 text-[10px] text-zinc-600 font-mono uppercase tracking-tighter" aria-label="Legend">
        {Array.from(new Set(notes.map(n => n.instrument || 1))).map(inst => (
          <div key={inst as number} className="flex items-center gap-1">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: getInstrumentColor(inst as number) }} 
              aria-hidden="true" 
            />
            <span>{GM_INSTRUMENTS[inst as number] || `Instrument ${inst}`}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

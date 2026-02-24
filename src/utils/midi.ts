import MidiWriter from 'midi-writer-js';
import { MidiNote } from '../services/gemini';

export interface MidiOptions {
  bpm: number;
  timeSignature: [number, number];
  instrument: number;
  quantize: {
    enabled: boolean;
    grid: number; // 4 for 1/4, 8 for 1/8, 16 for 1/16, etc.
    strength: number; // 0 to 1 (0% to 100%)
  };
}

function quantizeValue(value: number, gridInSeconds: number, strength: number): number {
  const target = Math.round(value / gridInSeconds) * gridInSeconds;
  return value + (target - value) * strength;
}

export function generateMidiFile(notes: MidiNote[], options: MidiOptions = { 
  bpm: 120, 
  timeSignature: [4, 4], 
  instrument: 1,
  quantize: { enabled: false, grid: 16, strength: 1 }
}): string {
  const BPM = options.bpm;
  const TICKS_PER_SECOND = (BPM / 60) * 128; 
  const gridInSeconds = options.quantize.enabled ? (60 / BPM) * (4 / options.quantize.grid) : 0;

  const processedNotes = notes.map(note => {
    if (!options.quantize.enabled) return note;

    const quantizedStart = quantizeValue(note.startTime, gridInSeconds, options.quantize.strength);
    const quantizedEnd = quantizeValue(note.startTime + note.duration, gridInSeconds, options.quantize.strength);
    
    return {
      ...note,
      startTime: quantizedStart,
      duration: Math.max(0.01, quantizedEnd - quantizedStart)
    };
  });

  // Group notes by instrument
  const notesByInstrument = processedNotes.reduce((acc, note) => {
    const inst = note.instrument || options.instrument;
    if (!acc[inst]) acc[inst] = [];
    acc[inst].push(note);
    return acc;
  }, {} as Record<number, MidiNote[]>);

  const tracks: any[] = [];

  Object.entries(notesByInstrument).forEach(([instStr, instNotes]) => {
    const inst = parseInt(instStr);
    const track = new MidiWriter.Track();
    
    track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: inst - 1 }));
    track.setTempo(BPM);
    track.setTimeSignature(options.timeSignature[0], options.timeSignature[1], 24, 8);

    // Sort notes by start time
    const sortedNotes = [...instNotes].sort((a, b) => a.startTime - b.startTime);

    sortedNotes.forEach((note) => {
      const startTick = Math.round(note.startTime * TICKS_PER_SECOND);
      const durationTicks = Math.round(note.duration * TICKS_PER_SECOND);
      
      track.addEvent(
        new MidiWriter.NoteEvent({
          pitch: [note.pitch],
          duration: `T${durationTicks}`,
          velocity: note.velocity,
          startTick: startTick,
        })
      );
    });

    tracks.push(track);
  });

  const write = new MidiWriter.Writer(tracks);
  return write.dataUri();
}

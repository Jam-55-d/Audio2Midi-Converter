import MidiWriter from 'midi-writer-js';
import { MidiNote } from '../services/gemini';

export function generateMidiFile(notes: MidiNote[]): string {
  const track = new MidiWriter.Track();

  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.startTime - b.startTime);

  // MIDI Writer uses ticks or durations like '4', '8', etc.
  // We have seconds. We need to convert seconds to ticks.
  // Default PPQ (Pulses Per Quarter Note) is usually 128 or 480.
  // Let's assume a tempo of 120 BPM.
  // 120 BPM = 2 beats per second.
  // 1 beat = 0.5 seconds.
  // If PPQ is 128, then 0.5 seconds = 128 ticks.
  // 1 second = 256 ticks.
  
  const BPM = 120;
  const TICKS_PER_SECOND = (BPM / 60) * 128; // 128 is default PPQ in midi-writer-js? 
  // Actually midi-writer-js uses its own duration strings or ticks.
  
  track.setTempo(BPM);

  let lastTick = 0;

  sortedNotes.forEach((note) => {
    const startTick = Math.round(note.startTime * TICKS_PER_SECOND);
    const durationTicks = Math.round(note.duration * TICKS_PER_SECOND);
    
    // Calculate wait time from last note
    // Wait time is relative to the previous event in the track
    const waitTicks = Math.max(0, startTick - lastTick);

    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [note.pitch],
        duration: `T${durationTicks}`,
        velocity: note.velocity,
        startTick: startTick, // Some versions support startTick directly
      })
    );
    
    // If startTick is used, we don't necessarily need wait, 
    // but midi-writer-js often prefers sequential events or explicit startTicks.
    // In recent versions, NoteEvent can take a 'startTick' property.
  });

  const write = new MidiWriter.Writer(track);
  return write.dataUri();
}

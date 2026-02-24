import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface MidiNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
  instrument: number; // General MIDI program number (1-128)
  type: 'melody' | 'harmony';
}

export async function transcribeAudioToMidi(audioBase64: string, mimeType: string, prioritizedInstruments: number[] = []): Promise<MidiNote[]> {
  const model = "gemini-3-flash-preview";
  
  const instrumentContext = prioritizedInstruments.length > 0 
    ? `PRIORITIZED INSTRUMENTS: Focus specifically on identifying notes from these General MIDI instruments: ${prioritizedInstruments.join(', ')}. Ensure every note from these instruments is captured.`
    : "";

  const prompt = `You are a world-class music transcription expert and multi-instrumentalist with superhuman hearing. 
  Analyze this audio file with extreme care and transcribe every single note you hear into a sequence of MIDI notes, identifying the specific instrument for each note.
  
  ${instrumentContext}

  CRITICAL INSTRUCTIONS:
  1. Instrument Recognition: Identify the instrument for every note. Use General MIDI program numbers (1-128). 
     Be extremely specific. Distinguish between different types of guitars, pianos, synths, and orchestral instruments.
  2. Catch ALL possible notes: This includes the main melody, all harmony notes, bass lines, and even subtle "ghost notes", quick transients, or faint background textures. Do not leave any note behind.
  3. Polyphony & Layering: If multiple notes or instruments are playing at once, transcribe all of them. Capture the full harmonic and timbral richness.
  4. Precision: Be extremely precise with 'startTime' and 'duration' (use at least 4 decimal places).
  5. Pitch Accuracy: Ensure the MIDI 'pitch' (0-127) matches the frequency exactly.
  6. Dynamics: Reflect the volume and articulation of each note in the 'velocity' (0-127).
  7. Classification: Distinguish between 'melody' (the leading voice) and 'harmony' (supporting notes/chords).
  
  Return a JSON array of objects, where each object has:
  - 'pitch': MIDI note number (0-127)
  - 'startTime': start time in seconds
  - 'duration': duration in seconds
  - 'velocity': velocity (0-127)
  - 'instrument': General MIDI program number (1-128)
  - 'type': either 'melody' or 'harmony'
  
  Do not skip any sections of the audio. Transcribe the entire duration with maximum detail.`;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      systemInstruction: "You are a professional polyphonic music transcription engine capable of multi-instrument recognition. Your goal is 100% accuracy in capturing every note, its timing, its pitch, and its source instrument from the provided audio.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            pitch: { type: Type.INTEGER },
            startTime: { type: Type.NUMBER },
            duration: { type: Type.NUMBER },
            velocity: { type: Type.INTEGER },
            instrument: { type: Type.INTEGER },
            type: { type: Type.STRING, enum: ['melody', 'harmony'] },
          },
          required: ["pitch", "startTime", "duration", "velocity", "instrument", "type"],
        },
      },
    },
  });

  try {
    const text = response.text || "[]";
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    return [];
  }
}

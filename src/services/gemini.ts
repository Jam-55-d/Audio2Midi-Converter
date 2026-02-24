import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface MidiNote {
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
}

export async function transcribeAudioToMidi(audioBase64: string, mimeType: string): Promise<MidiNote[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analyze this audio file and transcribe it into a sequence of MIDI notes. 
  Identify the main melody and harmony. 
  Return a JSON array of objects, where each object has:
  - 'pitch': MIDI note number (0-127)
  - 'startTime': start time in seconds
  - 'duration': duration in seconds
  - 'velocity': velocity (0-127, default to 80 if unsure)
  
  Be as precise as possible with timing and pitch.`;

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
          },
          required: ["pitch", "startTime", "duration", "velocity"],
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

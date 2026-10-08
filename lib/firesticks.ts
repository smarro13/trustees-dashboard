// The clubhouse Firesticks that can be sent a YouTube link, and the links they
// accept. These are the device ids and link hosts the Club Automation API
// accepts — it rejects anything else.

export const FIRESTICKS = [
  { id: 'firestick-1', label: 'Firestick 1' },
  { id: 'firestick-2', label: 'Firestick 2' },
] as const;

export type FirestickId = (typeof FIRESTICKS)[number]['id'];

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

export const isYouTubeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && YOUTUBE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};

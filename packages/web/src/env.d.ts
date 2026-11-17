/** Stylesheets are bundled by Vite; importing one only has side effects. */
declare module "*.css";

/** The Web Speech API recogniser. Chrome and Edge ship it, Chrome under a prefix; TypeScript's DOM types omit it. */
interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface Window {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
}

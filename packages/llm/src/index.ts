export {
  createAnthropicModel,
  DEFAULT_ANTHROPIC_MODEL,
  messageText,
  type AnthropicEffort,
  type AnthropicModelOptions,
} from "./anthropic.js";
export { failureForStatus } from "./failures.js";
export {
  collectCompletion,
  completionText,
  createOpenAICompatibleModel,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  type OpenAICompatibleModelOptions,
} from "./openai-compatible.js";
export {
  createModel,
  createSpeech,
  describeModel,
  providerOf,
  type ModelSettings,
  type Provider,
  type SpeechSettings,
} from "./settings.js";
export {
  audioFileName,
  createSpeechEndpoint,
  createWhisperTranscriber,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_SPEECH_VOICE,
  DEFAULT_TRANSCRIPTION_MODEL,
  VERBATIM_PROMPT,
  type SpeakerOptions,
  type TranscriberOptions,
} from "./speech.js";

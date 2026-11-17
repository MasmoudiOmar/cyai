# Local speech server

An OpenAI-compatible speech server for cyai's spoken interviews, running entirely on your computer:

- `POST /v1/audio/transcriptions`: [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (`small.en` on CPU by default). cyai sends a verbatim prompt, so "um", "uh" and "you know" stay in the transcript and count in your delivery score.
- `POST /v1/audio/speech`: [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) text-to-speech, much more natural than most browser voices.

It listens on 127.0.0.1 only and keeps nothing: audio is transcribed in memory and discarded.

## Install and run

Needs Python 3.10 to 3.13 and about 700 MB of disk for the models.

```bash
tools/speech-server/setup.sh
~/.cyai/speech/venv/bin/python tools/speech-server/server.py
```

The first start downloads the Whisper model. Then, in another terminal:

```bash
cyai ui --stt-url http://127.0.0.1:8000/v1 --tts-url http://127.0.0.1:8000/v1
```

Options: `--port` (default 8000), `--whisper` (any faster-whisper model, e.g. `base.en` for speed or `medium.en` for accuracy), `--voice` (default `af_heart`; also `af_bella`, `am_michael`, `bf_emma` and others), `--models` (default `~/.cyai/speech/models`).

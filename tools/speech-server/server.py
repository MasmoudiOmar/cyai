"""A local, OpenAI-compatible speech server for cyai's spoken interviews.

POST /v1/audio/transcriptions  Whisper (faster-whisper, CPU), verbatim: keeps ums and restarts.
POST /v1/audio/speech          Kokoro text-to-speech, returned as WAV.
GET  /health                   Readiness check.

Standard library HTTP only; it listens on 127.0.0.1 and is meant for one local user.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import tempfile
import wave
from email.parser import BytesParser
from email.policy import HTTP
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock

import numpy as np
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro

# Requests carrying more than this are refused (Whisper servers accept up to 25 MB).
MAX_BODY_BYTES = 25 * 1024 * 1024
MAX_SPEECH_CHARS = 2_000


class Speech:
    """The loaded models. Inference is serialised: one candidate, one request at a time."""

    def __init__(self, whisper: WhisperModel, kokoro: Kokoro, default_voice: str) -> None:
        self.whisper = whisper
        self.kokoro = kokoro
        self.default_voice = default_voice
        self.voices = set(kokoro.get_voices())
        self.lock = Lock()

    def transcribe(self, audio: bytes, suffix: str, prompt: str | None, language: str | None) -> str:
        # PyAV decodes webm/ogg/mp4/wav from a file; a temporary one keeps that path simple.
        with tempfile.NamedTemporaryFile(suffix=suffix) as file:
            file.write(audio)
            file.flush()
            with self.lock:
                segments, _ = self.whisper.transcribe(
                    file.name,
                    language=language or "en",
                    initial_prompt=prompt,
                    beam_size=5,
                    # Keep the hesitations: no smoothing over silence or disfluency.
                    vad_filter=False,
                    condition_on_previous_text=False,
                )
                return " ".join(segment.text.strip() for segment in segments).strip()

    def speak(self, text: str, voice: str | None) -> bytes:
        chosen = voice if voice in self.voices else self.default_voice
        with self.lock:
            samples, rate = self.kokoro.create(text, voice=chosen, speed=1.0, lang="en-us")
        pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(rate)
            out.writeframes(pcm)
        return buffer.getvalue()


def multipart_fields(content_type: str, body: bytes) -> dict[str, tuple[bytes, str | None]]:
    """Field name -> (bytes, filename) from a multipart/form-data body."""
    message = BytesParser(policy=HTTP).parsebytes(b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body)
    fields: dict[str, tuple[bytes, str | None]] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        payload = part.get_payload(decode=True)
        if isinstance(name, str) and isinstance(payload, bytes):
            fields[name] = (payload, part.get_filename())
    return fields


def text_field(fields: dict[str, tuple[bytes, str | None]], name: str) -> str | None:
    return fields[name][0].decode() if name in fields else None


def handler_for(speech: Speech) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "cyai-speech/1"

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002 - BaseHTTPRequestHandler's name
            sys.stderr.write(f"{self.command} {self.path} {args[1] if len(args) > 1 else ''}\n")

        def send(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, status: HTTPStatus, value: object) -> None:
            self.send(status, json.dumps(value).encode(), "application/json")

        def fail(self, status: HTTPStatus, message: str) -> None:
            self.send_json(status, {"error": {"message": message}})

        def read_body(self) -> bytes | None:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                self.fail(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "The request is too large.")
                return None
            return self.rfile.read(length)

        def do_GET(self) -> None:  # noqa: N802 - http.server naming
            if self.path == "/health":
                self.send_json(HTTPStatus.OK, {"status": "ok"})
            else:
                self.fail(HTTPStatus.NOT_FOUND, "Not found.")

        def do_POST(self) -> None:  # noqa: N802 - http.server naming
            body = self.read_body()
            if body is None:
                return
            try:
                if self.path == "/v1/audio/transcriptions":
                    self.transcriptions(body)
                elif self.path == "/v1/audio/speech":
                    self.speech(body)
                else:
                    self.fail(HTTPStatus.NOT_FOUND, "Not found.")
            except Exception as error:  # noqa: BLE001 - report any model failure to the client
                self.fail(HTTPStatus.INTERNAL_SERVER_ERROR, str(error))

        def transcriptions(self, body: bytes) -> None:
            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data"):
                self.fail(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "Send multipart/form-data.")
                return
            fields = multipart_fields(content_type, body)
            if "file" not in fields:
                self.fail(HTTPStatus.BAD_REQUEST, "The file field is missing.")
                return
            audio, filename = fields["file"]
            suffix = Path(filename or "answer.webm").suffix or ".webm"
            text = speech.transcribe(audio, suffix, text_field(fields, "prompt"), text_field(fields, "language"))
            self.send_json(HTTPStatus.OK, {"text": text})

        def speech(self, body: bytes) -> None:
            request = json.loads(body or b"{}")
            text = str(request.get("input", "")).strip()
            if not text or len(text) > MAX_SPEECH_CHARS:
                self.fail(HTTPStatus.BAD_REQUEST, f"input must be 1 to {MAX_SPEECH_CHARS} characters.")
                return
            voice = request.get("voice")
            self.send(HTTPStatus.OK, speech.speak(text, voice if isinstance(voice, str) else None), "audio/wav")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--models", type=Path, default=Path.home() / ".cyai" / "speech" / "models")
    parser.add_argument("--whisper", default="small.en", help="faster-whisper model name or path (default: small.en)")
    parser.add_argument("--voice", default="af_heart", help="default Kokoro voice (default: af_heart)")
    args = parser.parse_args()

    print(f"Loading Whisper {args.whisper} and Kokoro from {args.models} ...", file=sys.stderr)
    whisper = WhisperModel(args.whisper, device="cpu", compute_type="int8", download_root=str(args.models / "whisper"))
    kokoro = Kokoro(str(args.models / "kokoro-v1.0.int8.onnx"), str(args.models / "voices-v1.0.bin"))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(Speech(whisper, kokoro, args.voice)))
    print(f"cyai speech server on http://127.0.0.1:{args.port}/v1", file=sys.stderr)
    server.serve_forever()


if __name__ == "__main__":
    main()

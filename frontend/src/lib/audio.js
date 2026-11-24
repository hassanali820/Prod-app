// Browser audio helpers: microphone, text-to-speech (German) and recording.
export const PREP_SECONDS = 10;
export const ANSWER_SECONDS = 50;
export const LEVELS = ["A1", "A2", "B1", "B1+", "B2"];
const AUDIO_BITRATE = 24000; // 24 kbps ≈ 150 KB per 50 s clip

export async function openMicrophone() {
  if (!window.isSecureContext) {
    throw new Error(
      `The microphone only works on https:// or localhost. This page is ${location.protocol}//${location.host}.`
    );
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error("Your browser does not support audio recording. Please use Chrome, Edge, Firefox or Safari.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      throw new Error("Microphone access was blocked. Allow it in your browser settings and try again.");
    }
    throw new Error(err.message || "Could not access microphone.");
  }
}

export function stopMicrophone(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// ---------------------------------------------------------------- speech
function germanVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "de-DE" && /google|natural|online/i.test(v.name)) ||
    voices.find((v) => v.lang === "de-DE") ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("de"))
  );
}

if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

// iOS Safari only allows speech after a user gesture: call this inside a click handler.
export function unlockSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = 0.9;
    const voice = germanVoice();
    if (voice) u.voice = voice;
    const fallback = setTimeout(resolve, Math.max(6000, text.length * 110)); // never hang the exam
    u.onend = u.onerror = () => { clearTimeout(fallback); resolve(); };
    window.speechSynthesis.speak(u);
  });
}

// ---------------------------------------------------------------- recording
function pickMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Records from `stream` until the `untilDone` promise resolves. Returns { mimeType, data (base64) }.
export async function record(stream, untilDone) {
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITRATE, ...(mimeType ? { mimeType } : {}) });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const stopped = new Promise((r) => (recorder.onstop = r));

  recorder.start(1000);
  await untilDone;
  if (recorder.state !== "inactive") recorder.stop();
  await stopped;

  const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
  const blob = new Blob(chunks, { type });
  return { mimeType: type, data: blob.size ? await blobToBase64(blob) : "" };
}

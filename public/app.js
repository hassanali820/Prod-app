// GerLinx Sprachtest — frontend
// Supabase URL + anon key are loaded from /api/config (set in server env vars).

const PREP_SECONDS = 10;
const ANSWER_SECONDS = 50;
const AUDIO_BITRATE = 24000; // 24 kbps ≈ 150 KB per 50 s clip
const LEVELS = ["A1", "A2", "B1", "B1+", "B2"];

const $ = (id) => document.getElementById(id);
const SECTIONS = ["loadingSection", "authSection", "profileSection", "dashSection", "verifySection",
  "precheckSection", "examSection", "gradingSection", "resultSection"];

let sb = null;
let currentUser = null;
let isRegisterMode = true;
let currentAttemptId = null;
let questions = [];
let recordedAnswers = [];
let micStream = null;
let examRunning = false;
let wakeLock = null;

// ---------------------------------------------------------------- helpers
function show(id) {
  SECTIONS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  window.scrollTo({ top: 0 });
}

function flash(msg, type = "info") {
  const el = $("globalMsg");
  if (!msg) return el.classList.add("hidden");
  const styles = {
    info: "bg-sky-50 text-sky-800 border border-sky-200",
    error: "bg-red-50 text-red-800 border border-red-200",
    success: "bg-emerald-50 text-emerald-800 border border-emerald-200"
  };
  el.className = `mb-4 rounded-lg px-4 py-3 text-sm ${styles[type]}`;
  el.textContent = msg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {})
  });
  let payload = {};
  try { payload = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(payload.error || `Request failed (${res.status})`);
    err.retryable = payload.retryable;
    err.status = res.status;
    throw err;
  }
  return payload;
}

function clearUrlParams() {
  history.replaceState(null, "", window.location.pathname);
}

// ---------------------------------------------------------------- init
async function init() {
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("Server is missing Supabase configuration.");
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    if (cfg.testMode) {
      const b = document.createElement("div");
      b.className = "bg-amber-400 text-amber-950 text-xs font-bold text-center py-1";
      b.textContent = "TEST MODE — mock payment / mock AI grading";
      document.body.prepend(b);
    }
  } catch (e) {
    show("authSection");
    flash(e.message || "Could not load configuration.", "error");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("payment") === "cancelled") {
    flash("Payment was cancelled. You have not been charged.", "info");
    clearUrlParams();
  }

  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      currentUser = null;
      $("logoutBtn").classList.add("hidden");
      show("authSection");
    } else if (event === "PASSWORD_RECOVERY") {
      const pw = prompt("Enter a new password (min. 6 characters):");
      if (pw) sb.auth.updateUser({ password: pw }).then(({ error }) =>
        flash(error ? error.message : "Password updated.", error ? "error" : "success"));
    } else if (session?.user) {
      currentUser = session.user;
    }
  });

  if (!currentUser) return show("authSection");

  if (params.get("payment") === "success" && params.get("attemptId")) {
    const attemptId = params.get("attemptId");
    clearUrlParams();
    return afterLogin(attemptId);
  }
  afterLogin();
}

// ---------------------------------------------------------------- auth
function setMode(register) {
  isRegisterMode = register;
  $("registerFields").classList.toggle("hidden", !register);
  $("consentRow").classList.toggle("hidden", !register);
  $("forgotBtn").classList.toggle("hidden", register);
  $("authSubmitBtn").textContent = register ? "Create Account & Continue" : "Login";
  $("password").autocomplete = register ? "new-password" : "current-password";
  const on = "font-semibold text-amber-600 border-b-2 border-amber-600 pb-1";
  const off = "font-semibold text-slate-500 pb-1";
  $("tabRegister").className = register ? on : off;
  $("tabLogin").className = register ? off : on;
  $("authError").classList.add("hidden");
}
$("tabRegister").onclick = () => setMode(true);
$("tabLogin").onclick = () => setMode(false);

$("forgotBtn").onclick = async () => {
  const email = $("email").value.trim();
  if (!email) return showAuthError("Enter your email above first.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  flash(error ? error.message : "Password reset link sent — check your email.", error ? "error" : "success");
};

function showAuthError(msg) {
  const el = $("authError");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function validateProfile(p) {
  if (!p.full_name || !p.date_of_birth || !p.city || !p.mobile_number) {
    return "Please fill in your full name, date of birth, city, and mobile number.";
  }
  const dob = new Date(p.date_of_birth);
  const age = (Date.now() - dob.getTime()) / (365.25 * 864e5);
  if (isNaN(age) || age < 14 || age > 80) return "Please enter a valid date of birth.";
  if (!/^\+?[0-9\s\-()]{7,20}$/.test(p.mobile_number)) return "Please enter a valid mobile number.";
  return null;
}

$("authForm").onsubmit = async (e) => {
  e.preventDefault();
  $("authError").classList.add("hidden");
  flash(null);
  const btn = $("authSubmitBtn");
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || password.length < 6) return showAuthError("Enter your email and a password of at least 6 characters.");

  btn.disabled = true;
  try {
    if (isRegisterMode) {
      const profile = {
        full_name: $("fullName").value.trim(),
        date_of_birth: $("dob").value,
        city: $("city").value.trim(),
        mobile_number: $("mobile").value.trim()
      };
      const problem = validateProfile(profile);
      if (problem) throw new Error(problem);
      if (!$("consent").checked) throw new Error("Please accept the privacy notice to continue.");

      // Profile row is created by the DB trigger from this metadata.
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: profile } });
      if (error) throw error;
      if (!data.session) {
        flash("Account created. Please confirm your email address, then log in.", "success");
        setMode(false);
        return;
      }
      currentUser = data.user;
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
    }
    afterLogin();
  } catch (err) {
    showAuthError(err.message || "Something went wrong.");
  } finally {
    btn.disabled = false;
  }
};

$("logoutBtn").onclick = async () => {
  if (examRunning && !confirm("Leave the exam? Your attempt may be lost.")) return;
  examRunning = false;
  await sb.auth.signOut();
};

// ---------------------------------------------------------------- profile / dashboard
async function afterLogin(paidAttemptId) {
  $("logoutBtn").classList.remove("hidden");
  const { data: profile } = await sb.from("candidates").select("*").eq("id", currentUser.id).maybeSingle();

  if (!profile) {
    const meta = currentUser.user_metadata || {};
    $("pFullName").value = meta.full_name || "";
    $("pDob").value = meta.date_of_birth || "";
    $("pCity").value = meta.city || "";
    $("pMobile").value = meta.mobile_number || "";
    return show("profileSection");
  }

  if (paidAttemptId) return waitForPayment(paidAttemptId);
  loadDashboard(profile);
}

$("profileForm").onsubmit = async (e) => {
  e.preventDefault();
  const p = {
    id: currentUser.id,
    email: currentUser.email,
    full_name: $("pFullName").value.trim(),
    date_of_birth: $("pDob").value,
    city: $("pCity").value.trim(),
    mobile_number: $("pMobile").value.trim()
  };
  const problem = validateProfile(p);
  const errEl = $("profileError");
  if (problem) { errEl.textContent = problem; return errEl.classList.remove("hidden"); }
  const { error } = await sb.from("candidates").insert(p);
  if (error) { errEl.textContent = error.message; return errEl.classList.remove("hidden"); }
  afterLogin();
};

async function loadDashboard(profile) {
  if (!profile) {
    const r = await sb.from("candidates").select("*").eq("id", currentUser.id).maybeSingle();
    profile = r.data;
  }
  $("dashName").textContent = profile?.full_name || currentUser.email;

  const { data: attempts } = await sb
    .from("exam_attempts")
    .select("id, paid, completed, total_score, passed, cefr_estimate, created_at, completed_at")
    .eq("candidate_id", currentUser.id)
    .order("created_at", { ascending: false });

  const open = (attempts || []).find((a) => a.paid && !a.completed);
  $("paidAttemptBox").classList.toggle("hidden", !open);
  $("payBtn").classList.toggle("hidden", !!open);
  if (open) $("resumeBtn").onclick = () => goToPrecheck(open.id);

  const done = (attempts || []).filter((a) => a.completed);
  $("historyBox").classList.toggle("hidden", done.length === 0);
  $("historyList").innerHTML = "";
  done.forEach((a) => {
    const li = document.createElement("li");
    li.className = "py-2 flex justify-between items-center";
    const left = document.createElement("span");
    left.textContent = new Date(a.completed_at || a.created_at).toLocaleString();
    const right = document.createElement("span");
    right.className = `font-semibold ${a.passed ? "text-emerald-700" : "text-red-700"}`;
    right.textContent = `${a.total_score}/100 · ${a.cefr_estimate || "-"} · ${a.passed ? "Passed" : "Not passed"}`;
    li.append(left, right);
    $("historyList").appendChild(li);
  });

  show("dashSection");
}

$("payBtn").onclick = async () => {
  const btn = $("payBtn");
  btn.disabled = true;
  btn.textContent = "Redirecting to secure payment…";
  try {
    const { url } = await api("create-checkout");
    window.location.href = url;
  } catch (err) {
    flash(err.message, "error");
    btn.disabled = false;
    btn.textContent = "Pay €1.00 & Start Test";
  }
};

// Stripe redirects back before/after the webhook arrives — poll until paid.
async function waitForPayment(attemptId) {
  show("verifySection");
  for (let i = 0; i < 30; i++) {
    const { data } = await sb.from("exam_attempts").select("paid, completed").eq("id", attemptId).maybeSingle();
    if (data?.paid && !data.completed) {
      flash("Payment confirmed. Good luck!", "success");
      return goToPrecheck(attemptId);
    }
    if (data?.completed) break;
    if (i === 10) $("verifyHint").textContent = "Still waiting for Stripe… please don't close this page.";
    await sleep(2000);
  }
  flash("We could not confirm your payment yet. If you were charged, refresh this page in a minute — your attempt will appear on the dashboard.", "error");
  loadDashboard();
}

// ---------------------------------------------------------------- pre-check / mic
function goToPrecheck(attemptId) {
  currentAttemptId = attemptId;
  recordedAnswers = [];
  $("startExamBtn").disabled = !micStream;
  show("precheckSection");
}

$("micBtn").onclick = async () => {
  try {
    if (!window.isSecureContext) {
      throw new Error(`Microphone is blocked because this page is not secure (${location.protocol}//${location.host}). Please open the site via https://`);
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Your browser does not support audio recording. Please use Chrome, Edge, Firefox or Safari.");
    if (!window.MediaRecorder) throw new Error("Audio recording is not supported in this browser. Please update it or use Chrome.");
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    $("micStatus").textContent = "Microphone active. Speak — the bar should move.";
    $("micBtn").classList.add("hidden");
    $("startExamBtn").disabled = false;
    startLevelMeter(micStream);
  } catch (err) {
    $("micStatus").textContent = err.name === "NotAllowedError"
      ? "Microphone access was blocked. Allow it in your browser settings and try again."
      : (err.message || "Could not access microphone.");
    $("micStatus").className = "text-xs text-red-600";
  }
};

function startLevelMeter(stream) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if ($("precheckSection").classList.contains("hidden")) return ctx.close();
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      $("micLevel").style.width = `${Math.min(100, (peak / 64) * 100)}%`;
      requestAnimationFrame(tick);
    };
    tick();
  } catch { /* meter is optional */ }
}

// ---------------------------------------------------------------- speech synthesis
function pickGermanVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === "de-DE" && /google|natural|online/i.test(v.name)) ||
    voices.find((v) => v.lang === "de-DE") ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("de"));
}

function speak(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    u.rate = 0.9;
    const voice = pickGermanVoice();
    if (voice) u.voice = voice;
    const fallback = setTimeout(resolve, Math.max(6000, text.length * 110)); // never hang the exam
    u.onend = u.onerror = () => { clearTimeout(fallback); resolve(); };
    speechSynthesis.speak(u);
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

// Countdown that can be ended early via a button. Resolves when time is up or button pressed.
function countdown(seconds, { label, barColor, earlyBtn }) {
  return new Promise((resolve) => {
    $("phaseLabel").textContent = label;
    $("phaseBar").className = `h-full ${barColor}`;
    const start = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(iv);
      if (earlyBtn) { earlyBtn.classList.add("hidden"); earlyBtn.onclick = null; }
      resolve();
    };
    const update = () => {
      const elapsed = (performance.now() - start) / 1000;
      const left = Math.max(0, seconds - elapsed);
      $("countdown").textContent = Math.ceil(left);
      $("phaseBar").style.width = `${Math.min(100, (elapsed / seconds) * 100)}%`;
      if (left <= 0 || !examRunning) finish();
    };
    const iv = setInterval(update, 200);
    update();
    if (earlyBtn) { earlyBtn.classList.remove("hidden"); earlyBtn.onclick = finish; }
  });
}

async function recordAnswer(seconds) {
  const mimeType = pickMimeType();
  const opts = { audioBitsPerSecond: AUDIO_BITRATE };
  if (mimeType) opts.mimeType = mimeType;
  const recorder = new MediaRecorder(micStream, opts);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  const stopped = new Promise((r) => (recorder.onstop = r));

  recorder.start(1000);
  $("recDot").classList.remove("hidden");
  await countdown(seconds, { label: "🎙️ Recording — answer in German", barColor: "bg-red-500", earlyBtn: $("finishBtn") });
  if (recorder.state !== "inactive") recorder.stop();
  await stopped;
  $("recDot").classList.add("hidden");

  const type = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
  const blob = new Blob(chunks, { type });
  return { mimeType: type, data: blob.size ? await blobToBase64(blob) : "" };
}

// ---------------------------------------------------------------- exam flow
$("startExamBtn").onclick = async () => {
  const btn = $("startExamBtn");
  btn.disabled = true;
  btn.textContent = "Preparing questions…";

  // iOS Safari: speech must be unlocked inside the user gesture.
  if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));

  try {
    const res = await api("start-exam", { attemptId: currentAttemptId });
    questions = res.questions;
  } catch (err) {
    flash(err.message, "error");
    btn.disabled = false;
    btn.textContent = "Start Exam (5 minutes)";
    if (err.status === 400 || err.status === 403) loadDashboard();
    return;
  }
  btn.textContent = "Start Exam (5 minutes)";
  runExam();
};

function renderDots(active) {
  $("qDots").innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const d = document.createElement("div");
    d.className = `h-1.5 flex-1 rounded-full ${i < active ? "bg-emerald-500" : i === active ? "bg-amber-500" : "bg-slate-200"}`;
    $("qDots").appendChild(d);
  }
}

async function runExam() {
  examRunning = true;
  recordedAnswers = [];
  flash(null);
  show("examSection");
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ }

  for (let i = 0; i < questions.length && examRunning; i++) {
    renderDots(i);
    $("qCounter").textContent = `Frage ${i + 1} / 5`;
    $("qLevel").textContent = LEVELS[i];
    $("qText").textContent = questions[i];
    $("countdown").textContent = "--";
    $("phaseBar").style.width = "0%";
    $("phaseLabel").textContent = "🔊 Frage wird vorgelesen…";

    await speak(questions[i]);
    if (!examRunning) break;

    $("replayBtn").classList.remove("hidden");
    $("replayBtn").onclick = () => speak(questions[i]);
    await countdown(PREP_SECONDS, { label: "Preparation time", barColor: "bg-amber-500", earlyBtn: $("skipPrepBtn") });
    $("replayBtn").classList.add("hidden");
    if ("speechSynthesis" in window) speechSynthesis.cancel(); // don't record the TTS voice
    if (!examRunning) break;

    recordedAnswers.push(await recordAnswer(ANSWER_SECONDS));
  }

  try { await wakeLock?.release(); } catch { /* ignore */ }
  if (!examRunning) return;
  examRunning = false;
  renderDots(5);
  submitAnswers();
}

async function submitAnswers() {
  show("gradingSection");
  $("retryBtn").classList.add("hidden");
  $("gradingSpinner").classList.remove("hidden");
  $("gradingText").textContent = "Your answers are being evaluated…";
  try {
    const result = await api("evaluate-exam", { attemptId: currentAttemptId, answers: recordedAnswers });
    renderResult(result);
  } catch (err) {
    $("gradingSpinner").classList.add("hidden");
    $("gradingText").textContent = err.message;
    if (err.retryable !== false && err.status !== 403) {
      $("retryBtn").classList.remove("hidden");
    } else {
      setTimeout(loadDashboard, 4000);
    }
  }
}
$("retryBtn").onclick = submitAnswers;

window.addEventListener("beforeunload", (e) => {
  if (examRunning || !$("gradingSection").classList.contains("hidden")) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------------------------------------------------------------- results
function renderResult(r) {
  $("resScore").textContent = `${r.total_score} / 100`;
  $("resScore").className = `text-5xl font-bold ${r.passed ? "text-emerald-600" : "text-red-600"}`;
  $("resBadge").textContent = r.passed ? "PASSED ✓" : "NOT PASSED";
  $("resBadge").className = `inline-block text-sm font-bold px-3 py-1 rounded-full ${r.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`;
  $("resCefr").textContent = r.cefr_level;

  const bars = [
    ["Grammar", r.grammar_score],
    ["Vocabulary", r.vocabulary_score],
    ["Pronunciation", r.pronunciation_score],
    ["Sentence structure", r.sentence_structure_score]
  ];
  $("resBars").innerHTML = "";
  bars.forEach(([label, val]) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="flex justify-between text-sm mb-1"><span></span><span class="font-semibold"></span></div>
      <div class="h-2.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full bg-amber-500"></div></div>`;
    wrap.querySelector("span").textContent = label;
    wrap.querySelectorAll("span")[1].textContent = `${val} / 25`;
    wrap.querySelector(".bg-amber-500").style.width = `${(val / 25) * 100}%`;
    $("resBars").appendChild(wrap);
  });

  $("resSummary").textContent = r.summary || "";
  $("resLists").innerHTML = "";
  [["Strengths", r.strengths], ["To improve", r.improvements]].forEach(([title, items]) => {
    if (!items?.length) return;
    const h = document.createElement("p");
    h.className = "font-semibold";
    h.textContent = title;
    const ul = document.createElement("ul");
    ul.className = "list-disc pl-5";
    items.forEach((t) => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    $("resLists").append(h, ul);
  });

  $("resAnswers").innerHTML = "";
  (r.answers || []).forEach((a) => {
    const box = document.createElement("div");
    box.className = "border rounded-lg p-3 text-sm space-y-1";
    const head = document.createElement("p");
    head.className = "text-xs text-slate-500";
    head.textContent = `Frage ${a.question_number} · ${a.level}`;
    const q = document.createElement("p");
    q.className = "font-semibold";
    q.textContent = a.question;
    const t = document.createElement("p");
    t.className = "text-slate-700 italic";
    t.textContent = `„${a.transcript}“`;
    const f = document.createElement("p");
    f.className = "text-slate-600";
    f.textContent = a.feedback || "";
    box.append(head, q, t, f);
    $("resAnswers").appendChild(box);
  });

  show("resultSection");
}

$("backBtn").onclick = () => loadDashboard();

// ---------------------------------------------------------------- go
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
setMode(true);
init();

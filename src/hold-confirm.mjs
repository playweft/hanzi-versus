// Hold-to-confirm with a circular progress ring.
//
// Press and hold: the ring fills. Release early: the ring retracts and nothing
// fires. Ring full: committed — the action runs once the ring has visibly
// closed, and a following pointerup is deliberately ignored. The fill *is* the
// confirmation, so there is no second "now release" step.
//
// Keyboard, VoiceOver and other synthetic activation skip the hold entirely:
// a gesture must never be the only way to reach an action.

const FALLBACK_RADIUS = 22;
// A hidden tab pauses rAF; clamp the gap so the ring resumes instead of jumping
// straight to full and firing behind the user's back.
const MAX_FRAME_GAP = 64;

// Vibration API is Android-only: iOS Safari and WKWebView never expose it. In a
// cross-origin iframe the call is also gated by the "vibrate" policy-controlled
// feature, so it can silently return false when the embedder does not allow it.
function buzz(ms) {
  if (!ms) return;
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

export function holdToConfirm(
  button,
  { duration = 500, settle = 90, retract = 240, haptic = 12, onConfirm } = {},
) {
  const fill = button.querySelector("[data-hold-fill]");
  const radius = Number(fill?.getAttribute("r")) || FALLBACK_RADIUS;
  const circumference = 2 * Math.PI * radius;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  let mode = "idle"; // idle | filling | retracting | committed
  let progress = 0; // 0..1
  let from = 0;
  let elapsed = 0;
  let lastFrame = 0;
  let startedAt = 0;
  let frame = 0;
  let settleTimer = 0;
  let fromPointer = false;

  if (fill) fill.setAttribute("stroke-dasharray", String(circumference));

  function paint() {
    if (fill)
      fill.setAttribute(
        "stroke-dashoffset",
        String(circumference * (1 - progress)),
      );
  }

  function stopFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function rest() {
    stopFrame();
    progress = 0;
    paint();
    mode = "idle";
    button.classList.remove("is-holding");
  }

  function fillTick(now) {
    frame = 0;
    if (mode !== "filling") return;
    if (lastFrame) elapsed += Math.min(now - lastFrame, MAX_FRAME_GAP);
    lastFrame = now;
    progress = Math.min(1, from + elapsed / duration);
    paint();
    if (progress >= 1) return commit();
    frame = requestAnimationFrame(fillTick);
  }

  function retractTick(now) {
    frame = 0;
    if (mode !== "retracting") return;
    const t = Math.min(1, (now - startedAt) / retract);
    progress = from * (1 - t) * (1 - t);
    paint();
    if (t < 1) return void (frame = requestAnimationFrame(retractTick));
    rest();
  }

  function start() {
    if (button.hidden || button.disabled) return;
    if (mode === "filling" || mode === "committed") return;
    stopFrame();
    clearTimeout(settleTimer);
    mode = "filling";
    from = 0;
    elapsed = 0;
    lastFrame = 0;
    progress = 0;
    paint();
    button.classList.add("is-holding");
    frame = requestAnimationFrame(fillTick);
  }

  // Release before full: fall back to empty, fire nothing.
  function cancel() {
    if (mode !== "filling") return;
    stopFrame();
    if (reduced.matches || retract <= 0) return rest();
    from = progress;
    startedAt = performance.now();
    mode = "retracting";
    frame = requestAnimationFrame(retractTick);
  }

  // Full ring: lock in. Once here, releasing is a no-op.
  function commit() {
    if (mode === "committed") return;
    stopFrame();
    clearTimeout(settleTimer);
    mode = "committed";
    progress = 1;
    paint();
    button.classList.add("is-holding");
    buzz(haptic); // the ring closing is the confirmation, so buzz with it
    // Let the closed ring paint for a beat before the card switches state.
    settleTimer = setTimeout(() => {
      rest();
      onConfirm?.();
    }, settle);
  }

  function activate() {
    if (button.hidden || button.disabled) return;
    if (mode === "filling" || mode === "committed") return;
    button.classList.add("is-holding");
    buzz(haptic);
    commit();
  }

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    fromPointer = true;
    event.preventDefault(); // no iOS callout, no text selection while holding
    start();
  });
  // Listen on the window so a finger that drifts off the 44pt target still
  // resolves into a release instead of a stuck ring.
  function onRelease() {
    cancel();
    // Clear on the click's own task, after the compatibility click was ignored.
    window.setTimeout(() => (fromPointer = false), 0);
  }
  window.addEventListener("pointerup", onRelease, true);
  window.addEventListener("pointercancel", onRelease, true);
  window.addEventListener("blur", cancel);
  button.addEventListener("contextmenu", (event) => event.preventDefault());

  button.addEventListener("click", () => {
    // A pointer sequence already ran the hold; only synthetic activation
    // (keyboard, VoiceOver, switch control) reaches here.
    if (fromPointer) return;
    activate();
  });

  return { cancel, restart: start };
}

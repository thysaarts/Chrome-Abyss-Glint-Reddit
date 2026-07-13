import { useCallback, useEffect, useRef } from "react";
import { TileVal } from "../game/engine";
import { TileGem } from "./TileGem";
import { sfx } from "../audio/sfx";

/**
 * THE RUSH WHEEL — the endgame hand as a drag-driven scrub wheel ("Feel B":
 * notched — heavy friction, firm snap; a swipe moves about one tile and clicks
 * into place). Two ways to drive it: SLIDE the wheel, or TAP any resting tile to
 * spring it round into the active slot.
 *
 * Rendered as an OVERLAY inside the footer so the footer's own geometry stays
 * EXACTLY as the classic layout: the NOW PLACING label, the raised 86px stage,
 * the gem name — all untouched and screen-centred. Each frame the overlay
 * measures the stage (the active slot sits precisely on its centre) and the
 * footer buttons (the rail's hit band and the tiles' visible range are clamped
 * to the space between them, so nothing ever overlaps a button).
 *
 * The wheel look: resting tiles are SMALL and tightly pitched; a tile inflates
 * only inside a narrow window around the active slot (swelling late on the way
 * in, collapsing fast on the way out). Toward the ends tiles shrink further,
 * dip slightly and fade out early — the rim of a 3D wheel turning away.
 */

const BIG = 62; // the active tile — the classic NOW PLACING size
const SMALL = 24; // resting tiles
const PITCH = 34; // px between resting slots
const FRICTION = 0.82; // Feel B: kills speed fast
const SNAP = 0.09; // Feel B: firm spring to the nearest notch
const WINDOW = 0.62; // rel distance inside which a tile inflates

export function RushWheel({
  hand,
  onRotate,
  getStage,
}: {
  hand: TileVal[];
  onRotate: (i: number) => void;
  /** the NOW PLACING stage element — the active slot rides its centre */
  getStage: () => HTMLElement | null;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const tileRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ghostRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hoverRefs = useRef<(HTMLDivElement | null)[]>([]);
  const offsetRef = useRef(0); // float, slot units — hand index at the active slot
  const velRef = useRef(0);
  const draggingRef = useRef(false);
  const restingRef = useRef(true); // true only when the spring has fully settled
  const committedRef = useRef(false);
  const goalRef = useRef<number | null>(null); // TAP-TO-SELECT: spring eases to this notch
  const pointerXRef = useRef(0); // the pointer-DOWN x: a tap's hit-test + the moved threshold
  const rafRef = useRef<number | null>(null);
  const activePointerRef = useRef<number | null>(null); // the ONE finger driving the wheel
  const lastNotchRef = useRef(0);
  const handLive = useRef(hand);
  handLive.current = hand;
  // how deep the hexagon seat sits on the arc: −3 with a 5+ hand (three gems
  // on the left arm), −2 below that
  const seatRef = useRef(2);
  seatRef.current = hand.length >= 5 ? 3 : 2;
  const onRotateRef = useRef(onRotate);
  onRotateRef.current = onRotate;
  // getStage arrives as a fresh closure every parent render. Hold it in a ref so
  // `layout` (and therefore tick/kick and the effects below) stay STABLE across
  // re-renders — otherwise every parent re-render re-ran the layout effect, whose
  // cleanup cancelled the rAF loop and froze the wheel (the multi-touch bug: a
  // 2nd finger on the board re-renders App → killed the wheel's render loop).
  const getStageRef = useRef(getStage);
  getStageRef.current = getStage;

  // wrap so the queue rests LEFT of the apex: everything except the single
  // half-faded right slot (hand[1]) sits on the left arm (threshold 2; a
  // two-tile hand keeps its lone companion on the left)
  const wrapRel = (x: number, n: number) => {
    const r = ((x % n) + n) % n;
    const t = n <= 2 ? 1 : 2;
    return r >= t ? r - n : r;
  };

  const layout = useCallback(() => {
    const overlay = overlayRef.current;
    const stage = getStageRef.current();
    if (!overlay || !stage) return;
    const wrap = overlay.parentElement as HTMLElement | null;
    if (!wrap) return;
    const or = overlay.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    if (or.width === 0 || sr.width === 0) return;
    // the active slot rides the stage's GEM position (the classic NOW PLACING
    // gem floats high in the 86px stage — top 6 + half of 62 ≈ 43% down, not
    // the geometric centre), so the wheel's active gem floats just as high
    const ax = sr.left + sr.width / 2 - or.left;
    const ay = sr.top + sr.height * 0.43 - or.top;
    // the space we actually own: between the buttons flanking the stage
    let leftBound = 6;
    let rightBound = or.width - 6;
    for (const btn of wrap.querySelectorAll<HTMLElement>("[data-fbtn]")) {
      const br = btn.getBoundingClientRect();
      const bl = br.left - or.left;
      const brr = br.right - or.left;
      if (brr < ax && brr + 8 > leftBound) leftBound = brr + 8;
      if (bl > ax && bl - 8 < rightBound) rightBound = bl - 8;
    }
    // THE RAINBOW: gems ride a circular arc whose apex is the active slot
    // (the stage centre) and whose left end lands EXACTLY on the up-next hex
    // (the single subtle outline in the old stack's spot) at rel −3. One slot
    // continues past the apex on the right. The circle is fitted from the two
    // measured anchors every frame — no magic layout constants.
    let R = 0;
    let step = 0;
    let stepR = 0;
    const upHex = wrap.querySelector<HTMLElement>("[data-uphex]");
    if (upHex) {
      const hr = upHex.getBoundingClientRect();
      // the hex outline's centre inside its 64×60 viewBox is (29, 32)
      const ux = hr.left + (hr.width * 29) / 64 - or.left;
      const uy = hr.top + (hr.height * 32) / 60 - or.top;
      const dx = Math.max(24, ax - ux);
      const dy = Math.max(10, uy - ay);
      const thetaA = 2 * Math.atan2(dy, dx); // apex-to-anchor arc angle
      R = dx / Math.sin(thetaA);
      // the hex seat: 3 left of the apex with a 5+ hand, 2 with a smaller one.
      // The RIGHT slot always uses the tighter 3-step pitch — the resting
      // half-faded gem sits the same distance from the apex in every mode
      // (and clears COMBOS on narrow screens).
      step = thetaA / seatRef.current;
      stepR = thetaA / 3;
    }
    const arc = (rel: number): { x: number; y: number } => {
      if (!R) return { x: ax + rel * PITCH, y: ay }; // fallback: flat rail
      const th = rel * (rel > 0 ? stepR : step);
      return { x: ax + R * Math.sin(th), y: ay + R * (1 - Math.cos(th)) };
    };

    // the drag band (the only interactive part of the overlay) — FULL height
    // between the buttons, so a slide can never start outside it and end up
    // synthesising a click on a neighbouring control
    const band = bandRef.current;
    if (band) {
      band.style.left = `${leftBound}px`;
      band.style.width = `${Math.max(0, rightBound - leftBound)}px`;
      band.style.top = "0";
      band.style.height = `${or.height}px`;
    }

    const tiles = handLive.current;
    const n = tiles.length;
    const offset = offsetRef.current;
    // slot assignment must be STABLE while the spring bounces around a notch —
    // wrap from the rounded target and add the fractional part as pure motion,
    // so the settle flourish never flips a gem across the wrap seam
    const anchorNotch = Math.round(offset);
    const bounce = anchorNotch - offset;
    // position/size/fade for a tile drawn at wheel coordinate `e` (slot units,
    // 0 = the active apex, −2 = seated in the hexagon)
    const seat = seatRef.current;
    const paint = (el: HTMLElement, e: number, isPrimary: boolean, i: number) => {
      const d = Math.abs(e);
      if (e <= -(seat + 0.55) || e >= 1.35) {
        el.style.opacity = "0";
        return;
      }
      const tw = Math.max(0, 1 - d / WINDOW);
      const f = tw * tw * (3 - 2 * tw);
      // the hex-seated gem is sized to SIT INSIDE the hexagon outline; the
      // right-side rest gem stays SMALL so it reads beside the active gem
      // instead of vanishing behind a wide one (pearls!)
      let size = d <= 1 ? SMALL + (BIG - SMALL) * f : Math.max(20, SMALL - 2 * (d - 1));
      if (e > 0.5) size = Math.min(size, 16);
      // BREATHING ROOM (5+ hands): push the ±1 neighbours away from the active
      // gem symmetrically — the left floater eases toward its arm-mate, the
      // right gem takes the open space; the hex anchor never moves
      let pe = e;
      if (seat === 3) {
        const w = d <= 1 ? d : Math.max(0, (seat - d) / (seat - 1));
        pe = e + Math.sign(e) * 0.34 * w;
      }
      let { x, y } = arc(pe);
      // the hex-seated gem floats gently UP the hexagon — between centred and
      // the old too-high ride (review round 2)
      if (e < 0) y -= 2.5 * Math.max(0, Math.min(1, -e - (seat - 1)));
      // the hex-seated gem shows FULL strength (a faded gem inside the outline
      // reads wrong); fading happens scrubbing PAST the hex, and off the right.
      // Hands of 4+ REST a half-faded gem on the right slot; with ≤3 tiles that
      // slot is for FADING ONLY (its resident appears in the hexagon instead,
      // via the cyclic ghost).
      const leftFade = e < -(seat + 0.05) ? Math.max(0, (e + seat + 0.5) / 0.45) : 1;
      const rightFade = e > 0.45 ? Math.max(0, 1 - (e - 0.45) / (n <= 3 ? 0.55 : 0.95)) : 1;
      const half = size / 2;
      // right-side gems slide inward to fit rather than disappear — the resting
      // half-faded gem must survive narrow screens; the left arm is anchored by
      // the hex so it only ever hides past the seat
      // the COMBOS button has ~18px of empty padding before its disc; a small
      // half-faded gem may borrow a sliver of it so the right gap can match
      // the left one instead of huddling against the active gem
      const tileRight = rightBound + 18;
      let cx = x;
      if (e > 0 && cx + half > tileRight - 2) cx = tileRight - 2 - half;
      const inBounds = cx - half >= leftBound - 26;
      const op = inBounds ? Math.min(leftFade, rightFade) : 0;
      el.style.opacity = op.toFixed(2);
      el.style.transform = `translate(${(cx - BIG / 2).toFixed(1)}px, ${(y - BIG / 2).toFixed(1)}px) scale(${(size / BIG).toFixed(3)})`;
      el.style.zIndex = String(60 - Math.round(d * 10));
      if (isPrimary) {
        const halo = el.firstElementChild as HTMLElement | null;
        if (halo) halo.style.opacity = f > 0.85 ? "1" : "0";
        // the classic levitation bob — only once the wheel has fully settled
        const hov = hoverRefs.current[i];
        if (hov) hov.className = f > 0.97 && !draggingRef.current && restingRef.current ? "gl-np-hover" : "";
      }
    };
    for (let i = 0; i < tiles.length; i++) {
      const el = tileRefs.current[i];
      if (!el) continue;
      const rel = n > 1 ? wrapRel(i - anchorNotch, n) + bounce : 0;
      // TWO tiles: compress the whole path so the resting gem lives IN the hex
      // (rel −1 draws at the hex, flowing hex↔apex through the floating slot)
      const e = n === 2 ? rel * 2 : rel;
      paint(el, e, true, i);
      // THREE tiles: the right slot's resident cyclically IS the hex's — draw
      // its ghost seated in the hexagon, crossfading as the primary fades right
      const g = ghostRefs.current[i];
      if (g) {
        if (n === 3 && rel > 0.4) paint(g, rel - n, false, i);
        else g.style.opacity = "0";
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback(() => {
    rafRef.current = null;
    const n = handLive.current.length;
    let settled = false;
    if (!draggingRef.current && n > 1 && !committedRef.current) {
      // TAP-TO-SELECT drives the wheel to an explicit goal notch; otherwise the
      // spring snaps to the nearest notch as before
      const target = goalRef.current ?? Math.round(offsetRef.current);
      velRef.current += (target - offsetRef.current) * SNAP;
      velRef.current *= FRICTION;
      offsetRef.current += velRef.current;
      restingRef.current = false;
      if (Math.abs(velRef.current) < 0.002 && Math.abs(target - offsetRef.current) < 0.006) {
        offsetRef.current = target;
        velRef.current = 0;
        goalRef.current = null;
        settled = true;
        restingRef.current = true;
        const idx = ((target % n) + n) % n;
        if (idx !== 0) {
          committedRef.current = true;
          onRotateRef.current(idx);
          // a rejected commit (e.g. a placement staged mid-settle) never swaps
          // the hand — spring back home instead of freezing. kick() restarts the
          // spring so the wheel is immediately live again.
          window.setTimeout(() => {
            if (committedRef.current) {
              committedRef.current = false;
              offsetRef.current = 0;
              velRef.current = 0;
              layout();
              if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
            }
          }, 400);
        }
      }
    }
    const notch = Math.round(offsetRef.current);
    if (notch !== lastNotchRef.current) {
      lastNotchRef.current = notch;
      sfx.countdownTick(2);
    }
    layout();
    // integrate until GENUINELY settled — a velocity-only stop can die between
    // thresholds and freeze the wheel one notch out with nothing committed
    if (
      draggingRef.current ||
      (!settled && !committedRef.current && n > 1 && (goalRef.current != null || Math.abs(velRef.current) > 0.0004 || Math.abs(Math.round(offsetRef.current) - offsetRef.current) > 0.004))
    ) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [layout]);
  const kick = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // hand changed (a pick committed / a tile placed): active is hand[0] again —
  // re-zero with no visual jump (positions are identical)
  useEffect(() => {
    offsetRef.current = 0;
    velRef.current = 0;
    committedRef.current = false;
    goalRef.current = null;
    restingRef.current = true;
    lastNotchRef.current = 0;
    layout();
  }, [hand, layout]);

  useEffect(() => {
    layout();
    const ro = new ResizeObserver(() => layout());
    if (overlayRef.current?.parentElement) ro.observe(overlayRef.current.parentElement);
    return () => ro.disconnect();
  }, [layout]);

  // cancel the animation loop ONLY on unmount — NEVER on a re-render. Cancelling it
  // in a re-running effect's cleanup (and not nulling rafRef) is what froze the
  // wheel: kick() then saw rafRef != null and refused to restart the loop.
  useEffect(() => () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // MIS-CLICK GUARD: while a drag is live (and for a beat after one that
  // actually moved), swallow every click at the document's capture phase —
  // a slide released over RESTART must never restart the game. Normal taps
  // are untouched: the guard only bites mid-drag or within 280ms of a real
  // drag, so buttons feel instantly live again.
  const dragMovedRef = useRef(false);
  const dragEndRef = useRef(0);
  useEffect(() => {
    const block = (ev: Event) => {
      if (draggingRef.current || performance.now() - dragEndRef.current < 280) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    };
    document.addEventListener("click", block, true);
    // BACKSTOP: if a pointerup/cancel is ever missed by the band (capture lost
    // mid-drag on some mobile browsers), draggingRef would stay true forever —
    // the click guard above would then swallow EVERY button press. A
    // document-level release always ends the drag.
    const release = (e: PointerEvent) => {
      // ONLY the wheel's own finger ends the wheel drag — a second finger lifting
      // off the board (which bubbles a pointerup here) must never drop the drag,
      // or the mis-click guard lifts and that finger's tap places a tile.
      if (e.pointerId !== activePointerRef.current) return;
      activePointerRef.current = null;
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (dragMovedRef.current) dragEndRef.current = performance.now();
      dragMovedRef.current = false;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    };
    // BUBBLE phase (not capture): the band's own onPointerUp runs first and does
    // the tap-vs-drag work; this only bites when that handler was skipped.
    document.addEventListener("pointerup", release, false);
    document.addEventListener("pointercancel", release, false);
    return () => {
      document.removeEventListener("click", block, true);
      document.removeEventListener("pointerup", release, false);
      document.removeEventListener("pointercancel", release, false);
    };
  }, [tick]);

  // ---- the drag: the wheel is GLUED to the finger; flick = momentum ----
  const dragState = useRef({ x: 0, t: 0 });
  const onDown = (e: React.PointerEvent) => {
    if (handLive.current.length < 2) return;
    // TAKE-OVER (never ignore): a fresh touch on the band ALWAYS becomes the
    // driving pointer. Ignoring a second touch risked a permanent freeze — if the
    // browser silently stops delivering the first finger's move events (mobile
    // multi-touch) without a pointercancel, draggingRef/activePointerRef would
    // stay stuck on that dead finger and every later tap would be refused. Taking
    // over means a new tap always revives the wheel. onMove/onUp are still scoped
    // to the active pointer, so a stray second finger can't corrupt the drag.
    if (activePointerRef.current !== null && activePointerRef.current !== e.pointerId) {
      try { bandRef.current?.releasePointerCapture(activePointerRef.current); } catch { /* the old pointer may already be gone */ }
    }
    activePointerRef.current = e.pointerId;
    // SELF-HEAL: a stuck pending commit (rejected/lost) must never freeze the
    // wheel — a fresh touch always clears it and takes over.
    if (committedRef.current) {
      committedRef.current = false;
      offsetRef.current = 0;
      velRef.current = 0;
    }
    goalRef.current = null;
    draggingRef.current = true;
    restingRef.current = false;
    dragMovedRef.current = false;
    try { bandRef.current?.setPointerCapture(e.pointerId); } catch { /* capture can fail on some mobile browsers — the doc-level backstop covers release */ }
    dragState.current = { x: e.clientX, t: performance.now() };
    pointerXRef.current = e.clientX;
    velRef.current = 0;
    kick();
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointerRef.current || !draggingRef.current) return;
    const now = performance.now();
    const dx = e.clientX - dragState.current.x;
    const dOff = -dx / PITCH; // finger right → wheel right → earlier tile active
    // pointerXRef stays pinned to the pointer-DOWN x, so this is total travel
    // (not a per-event delta) — a slow drag still counts as a drag, not a tap
    if (Math.abs(e.clientX - pointerXRef.current) > 3) dragMovedRef.current = true;
    offsetRef.current += dOff;
    velRef.current = (dOff / Math.max(1, now - dragState.current.t)) * 16;
    dragState.current = { x: e.clientX, t: now };
    kick();
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null;
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragMovedRef.current) {
      dragEndRef.current = performance.now();
    } else {
      // a TAP (no real movement): turn the wheel to the tile under the finger
      selectTileAt(pointerXRef.current);
    }
    dragMovedRef.current = false;
    kick();
  };

  // TAP-TO-SELECT: find the visible tile nearest the tap x and spring the wheel
  // so it becomes the active (apex) tile.
  const selectTileAt = (clientX: number) => {
    const n = handLive.current.length;
    if (n < 2) return;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const el = tileRefs.current[i];
      if (!el || (parseFloat(el.style.opacity || "0") < 0.25)) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - clientX);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    const active = ((Math.round(offsetRef.current) % n) + n) % n;
    if (best === active) return; // already the active tile — nothing to turn to
    // shortest signed step count from the active tile to the tapped one
    let step = ((best - active) % n + n) % n;
    if (step > n / 2) step -= n;
    goalRef.current = Math.round(offsetRef.current) + step;
    restingRef.current = false;
    kick();
  };

  return (
    <div ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }} aria-hidden>
      {/* the drag band — the only interactive strip, sized between the buttons */}
      <div
        ref={bandRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          position: "absolute",
          pointerEvents: "auto",
          touchAction: "pan-y",
          cursor: hand.length > 1 ? "grab" : "default",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />
      {hand.map((v, i) => (
        <div
          key={`ghost-${i}-${v}`}
          ref={(el) => (ghostRefs.current[i] = el)}
          style={{ position: "absolute", left: 0, top: 0, width: BIG, height: BIG, pointerEvents: "none", transformOrigin: "center", willChange: "transform, opacity", opacity: 0 }}
        >
          <TileGem value={v} size={BIG} />
        </div>
      ))}
      {hand.map((v, i) => (
        <div
          key={`${i}-${v}`}
          ref={(el) => (tileRefs.current[i] = el)}
          style={{ position: "absolute", left: 0, top: 0, width: BIG, height: BIG, pointerEvents: "none", transformOrigin: "center", willChange: "transform, opacity" }}
        >
          <span
            style={{
              position: "absolute",
              inset: -10,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(157,123,255,0.38), transparent 70%)",
              opacity: 0,
              transition: "opacity 0.15s",
            }}
          />
          <div ref={(el) => (hoverRefs.current[i] = el)} style={{ position: "absolute", inset: 0 }}>
            <TileGem value={v} size={BIG} />
          </div>
        </div>
      ))}
    </div>
  );
}

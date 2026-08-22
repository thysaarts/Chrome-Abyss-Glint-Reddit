/**
 * YOU VS THE HOUSE — the Broker duel entry on the Challenges tab (2026-08-20):
 * a versus game against the house AI, staked in Nebulite. Win pays double the
 * stake; the house keeps a loss. The higher the stake, the sharper she plays
 * (brokerAI tiers). Locked until the Academy is complete (frontier ≥ 2);
 * fully greyed with no Nebulite at all; individual stakes you can't cover are
 * blocked. Copy is CMS (content.characters.duel).
 *
 * TogetherSlider wraps this card and the YOU vs THE WORLD card in a
 * FEATURED-style two-slide carousel: title tabs (gold = active), 10s
 * auto-swap, swipe, and the dots underneath.
 */
import { useEffect, useRef, useState } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { NebuliteGem } from "./GameHeader";

export const DUEL_BETS = [10, 20, 30] as const;
export const DUEL_MIN_BET = DUEL_BETS[0];

export function HouseDuelCard({ nebulite, locked, onPlay }: {
  nebulite: number;
  /** the Academy isn't complete yet — the table is closed */
  locked: boolean;
  onPlay: (bet: number) => void;
}) {
  const C = CONTENT.characters.duel;
  const broke = nebulite <= 0;
  const dimmed = locked || broke;
  const [bet, setBet] = useState<number>(DUEL_MIN_BET);
  // keep the selection on a stake the player can actually cover
  const effBet = nebulite >= bet ? bet : DUEL_BETS.filter((b) => b <= nebulite).pop() ?? DUEL_MIN_BET;
  return (
    <div style={{ ...card, ...(dimmed ? { opacity: 0.55, filter: "saturate(0.5)" } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src="/avatars/broker-lg.webp" alt="" className={dimmed ? undefined : "gl-float-y"} style={{ width: 64, height: "auto", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.55))" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.5, color: theme.color.dim }}>{C.sub}</div>
          <div style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.14em", color: theme.color.faint, marginTop: 5 }}>{C.tierNote}</div>
        </div>
      </div>

      {locked ? (
        <div style={gateNote}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          {C.locked}
        </div>
      ) : broke ? (
        <div style={gateNote}>{C.broke.replace("{min}", String(DUEL_MIN_BET))}</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.18em", color: theme.color.faint, flex: "0 0 auto" }}>{C.betLabel}</span>
            {DUEL_BETS.map((b) => {
              const can = nebulite >= b;
              const active = effBet === b;
              return (
                <button
                  key={b}
                  disabled={!can}
                  onClick={() => { if (can) { sfx.click(); setBet(b); } }}
                  style={{ ...betBtn, ...(active && can ? betActive : {}), ...(can ? {} : betBlocked) }}
                >
                  <NebuliteGem size={12} /> {b}
                </button>
              );
            })}
          </div>
          <button
            style={playBtn}
            disabled={nebulite < DUEL_MIN_BET}
            onClick={() => { if (nebulite >= effBet) onPlay(effBet); }}
          >
            ▶ {C.play}
          </button>
        </>
      )}
    </div>
  );
}

/** Two-slide carousel for the Challenges tab header pair: YOU vs THE WORLD and
 *  YOU vs THE HOUSE. Gold title = the active slide; swaps every 10s; swipe or
 *  tap the titles; FEATURED-style dots underneath. */
export function TogetherSlider({ titles, children, initial = 0 }: { titles: [string, string]; children: [React.ReactNode, React.ReactNode]; initial?: number }) {
  const [idx, setIdx] = useState(initial);
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const manual = useRef(false);
  // bumped on every drag release so the auto-swap re-arms even when the swipe
  // didn't change idx (a timer firing MID-drag used to leave it dead for good)
  const [rearm, setRearm] = useState(0);

  // auto-swap every 10s (a touch longer right after a manual gesture)
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (dragging.current) return; // sit out a live drag; the release re-arms
      setIdx((v) => (v + 1) % 2); manual.current = false;
    }, manual.current ? 15000 : 10000);
    return () => window.clearTimeout(t);
  }, [idx, rearm]);

  const go = (i: number) => { if (i !== idx) { sfx.click(); manual.current = true; setIdx(i); } };
  const onDown = (e: React.PointerEvent) => {
    dragging.current = true; startX.current = e.clientX;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    // capture only once a REAL drag starts, so a mouse released OUTSIDE the
    // container still ends it — capturing on pointer-down would retarget the
    // click and silently kill every button inside the slider
    if (Math.abs(dx) > 10 && !(e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    setDragX(dx);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX < -40) { manual.current = true; setIdx(1); }
    else if (dragX > 40) { manual.current = true; setIdx(0); }
    setDragX(0);
    setRearm((v) => v + 1);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        {titles.map((t, i) => (
          <button
            key={t}
            onClick={() => go(i)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: "0.22em",
              color: i === idx ? theme.color.gold : theme.color.faint,
              textShadow: i === idx ? "0 0 12px rgba(232,181,63,0.4)" : "none",
              transition: "color 0.3s",
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        style={{ overflow: "hidden", touchAction: "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div style={{ display: "flex", width: "200%", transform: `translateX(calc(${idx * -50}% + ${dragX / 2}px))`, transition: dragging.current ? "none" : "transform 0.38s cubic-bezier(.4,0,.2,1)" }}>
          <div style={{ width: "50%", flexShrink: 0, paddingRight: 2 }}>{children[0]}</div>
          <div style={{ width: "50%", flexShrink: 0, paddingLeft: 2 }}>{children[1]}</div>
        </div>
      </div>
      {/* the FEATURED-style slide dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 7, marginTop: 10 }}>
        {[0, 1].map((i) => (
          <button
            key={i}
            aria-label={titles[i]}
            onClick={() => go(i)}
            style={{ width: 7, height: 7, borderRadius: "50%", padding: 0, border: "none", cursor: "pointer", background: i === idx ? theme.color.accent : "rgba(157,123,255,0.25)", transition: "background 0.2s" }}
          />
        ))}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  padding: "16px 16px 14px",
  borderRadius: 16,
  background: `radial-gradient(340px 200px at 20% -10%, rgba(232,181,63,0.1), transparent 60%), linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))`,
  border: "1px solid rgba(232,181,63,0.35)",
  boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7)",
};
const gateNote: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 14, padding: "10px 12px", borderRadius: 11, background: "rgba(232,181,63,0.08)", border: "1px solid rgba(232,181,63,0.3)", fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.12em", color: theme.color.gold, textAlign: "center" };
const betBtn: React.CSSProperties = { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 11, border: `1px solid ${theme.color.border}`, background: "rgba(255,255,255,0.03)", color: theme.color.dim, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 13, cursor: "pointer", fontVariantNumeric: "tabular-nums" };
const betActive: React.CSSProperties = { border: "1px solid rgba(232,181,63,0.65)", background: "rgba(232,181,63,0.14)", color: theme.color.gold, boxShadow: "0 0 14px rgba(232,181,63,0.25)" };
const betBlocked: React.CSSProperties = { opacity: 0.35, cursor: "default" };
const playBtn: React.CSSProperties = { width: "100%", marginTop: 12, padding: "12px 14px", borderRadius: 12, border: "none", borderBottom: "3px solid #b98a1d", boxShadow: "0 10px 22px -8px rgba(232,181,63,0.5)", background: "linear-gradient(180deg,#ffe9b3,#e8b53f)", color: "#2a1c04", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, letterSpacing: "0.04em", cursor: "pointer" };

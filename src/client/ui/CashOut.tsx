import { useEffect, useRef, useState } from "react";
import { theme, bevelPrimary } from "../theme/theme";
import { GameState, TileVal, GLINT, CORE, cashOutValue } from "../game/engine";
import { TileGem } from "./TileGem";
import { sfx } from "../audio/sfx";

/**
 * CASH OUT — shared between the real game (App) and the scripted tutorial, so
 * the button and the ceremony look and behave identically in both.
 */

interface XY { x: number; y: number }

/** CASH OUT (GLINT RUSH only) — a small gold pill in the board's top-right dead
 *  space. Tapping it opens the cash-out ceremony (nothing commits until the
 *  player CONFIRMS there). Never auto-triggers. */
export function CashOutButton({ value, onOpen, btnRef }: { value: number; onOpen: () => void; btnRef?: React.Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={btnRef}
      onClick={() => {
        sfx.click();
        onOpen();
      }}
      style={{
        position: "absolute",
        top: 2,
        right: 2,
        zIndex: 12,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 999,
        border: "1px solid rgba(232,181,63,0.45)",
        background: "rgba(22,17,6,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        color: theme.color.gold,
        fontFamily: theme.fonts.disp,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: "0.08em",
        cursor: "pointer",
        boxShadow: "0 10px 24px -8px rgba(0,0,0,0.7)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 10l5 5 5-5" />
        <path d="M4 21h16" />
      </svg>
      {`CASH OUT +${value.toLocaleString()}`}
    </button>
  );
}

/** The cash-out decision moment: a dark veil, and the counted resources fly from
 *  their homes (BUSTS card, BANKS card, the hand) into the tally rows. CONFIRM
 *  sends the total to the score and ends the run; Cancel poofs everything away
 *  and play resumes exactly where it was. */
export function CashOutCeremony({
  state,
  anchors,
  onConfirm,
  onCancel,
}: {
  state: GameState;
  anchors: { score: () => XY | null; busts: () => XY | null; banks: () => XY | null; hand: () => XY | null };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const v = cashOutValue(state);
  const gems = state.hand.filter((t): t is TileVal => t !== null && t !== GLINT && t !== CORE);
  // A big hand wraps instead of widening the card: up to 3 gems on one line,
  // 4-8 across two lines (never more than 4 per line), 9+ across three.
  const gemRows = (() => {
    const n = gems.length;
    if (n === 0) return [] as TileVal[][];
    const per = n <= 3 ? n : n <= 8 ? Math.min(4, Math.ceil(n / 2)) : Math.ceil(n / 3);
    const rows: TileVal[][] = [];
    for (let i = 0; i < n; i += per) rows.push(gems.slice(i, i + per));
    return rows;
  })();
  const [landed, setLanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [flyers, setFlyers] = useState<{ id: string; from: XY; to: XY; delay: number; node: React.ReactNode }[]>([]);
  const [scoreFly, setScoreFly] = useState<{ from: XY; to: XY } | null>(null);
  const bustsRowRef = useRef<HTMLDivElement | null>(null);
  const banksRowRef = useRef<HTMLDivElement | null>(null);
  const gemsRowRef = useRef<HTMLDivElement | null>(null);
  const totalRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  // GATHER: hearts, diamonds and gems fly from their homes into the tally rows
  useEffect(() => {
    const centre = (el: HTMLElement | null): XY | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const raf = requestAnimationFrame(() => {
      const fl: { id: string; from: XY; to: XY; delay: number; node: React.ReactNode }[] = [];
      const spread = (count: number, from: XY | null, to: XY | null, step: number, node: (i: number) => React.ReactNode, tag: string, baseDelay: number) => {
        if (!from || !to || count <= 0) return;
        for (let i = 0; i < count; i++) {
          fl.push({ id: `${tag}-${i}`, from, to: { x: to.x + (i - (count - 1) / 2) * step, y: to.y }, delay: baseDelay + i * 90, node: node(i) });
        }
      };
      spread(state.livesLeft, anchors.busts(), centre(bustsRowRef.current), 18, () => <HeartMini />, "life", 0);
      spread(state.freeBanksLeft, anchors.banks(), centre(banksRowRef.current), 18, () => <DiamondMini />, "bank", 120);
      // gems fly to their FINAL positions in the 1/2/3-line layout — measured off
      // the (hidden, but laid-out) static rows — so they never snap to a new
      // distribution after landing, however many gems the hand holds.
      const handFrom = anchors.hand();
      const gemEls = gemsRowRef.current?.querySelectorAll<HTMLElement>("[data-gemidx]");
      if (handFrom && gemEls) {
        gemEls.forEach((el, i) => {
          const c = centre(el);
          if (c) fl.push({ id: `gem-${i}`, from: handFrom, to: c, delay: 240 + i * 90, node: <TileGem value={gems[i]} size={22} /> });
        });
      }
      setFlyers(fl);
      sfx.tileToHand();
      const settle = 750 + (fl.length ? fl[fl.length - 1].delay : 0);
      timersRef.current.push(window.setTimeout(() => setLanded(true), settle));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    if (confirming) return;
    setConfirming(true);
    sfx.bankNowClick();
    // the total dives into the score, THEN the run ends (end card follows)
    const r = totalRef.current?.getBoundingClientRect();
    const to = anchors.score();
    if (r && to) setScoreFly({ from: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, to });
    timersRef.current.push(window.setTimeout(onConfirm, 720));
  };

  return (
    <div style={ceremonyScrim}>
      <div className="gl-fade" style={{ ...ceremonyCard, opacity: confirming ? 0.25 : 1, transition: "opacity 400ms ease" }}>
        <div style={ceremonyTitle}>CASH OUT</div>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 14 }}>
          <div style={ceremonyCol}>
            <div style={ceremonyColLabel}>BUSTS LEFT</div>
            <div ref={bustsRowRef} style={ceremonyIconRow}>
              {landed && (state.livesLeft > 0 ? Array.from({ length: state.livesLeft }).map((_, i) => <HeartMini key={i} />) : <span style={ceremonyNone}>—</span>)}
            </div>
            <div style={ceremonyColVal}>+{v.lives.toLocaleString()}</div>
          </div>
          <div style={ceremonyCol}>
            <div style={ceremonyColLabel}>BANKS LEFT</div>
            <div ref={banksRowRef} style={ceremonyIconRow}>
              {landed && (state.freeBanksLeft > 0 ? Array.from({ length: state.freeBanksLeft }).map((_, i) => <DiamondMini key={i} />) : <span style={ceremonyNone}>—</span>)}
            </div>
            <div style={ceremonyColVal}>+{v.banks.toLocaleString()}</div>
          </div>
          <div style={ceremonyCol}>
            <div style={ceremonyColLabel}>GEMS LEFT</div>
            {/* the rows are ALWAYS laid out (so the flyers can measure their final
                slots and the card doesn't reflow), but stay invisible until the
                gems land — then they fade in exactly where the flyers arrived */}
            <div ref={gemsRowRef} style={{ ...ceremonyIconRow, flexDirection: "column", gap: 3, opacity: landed ? 1 : 0, transition: "opacity 180ms ease" }}>
              {gems.length > 0 ? (
                (() => {
                  let gi = 0;
                  return gemRows.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                      {row.map((g) => {
                        const idx = gi++;
                        return <span key={idx} data-gemidx={idx} style={{ display: "inline-flex" }}><TileGem value={g} size={22} /></span>;
                      })}
                    </div>
                  ));
                })()
              ) : (
                <span style={ceremonyNone}>—</span>
              )}
            </div>
            {/* the gem row shows any Zenith tile too, so its flat bonus prints here —
                keeping lives + banks + this row = the total below */}
            <div style={ceremonyColVal}>+{(v.gems + v.zeniths).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ ...ceremonyColLabel, marginTop: 18 }}>CASH OUT VALUE</div>
        <div ref={totalRef} style={ceremonyTotal}>
          +{v.total.toLocaleString()}
        </div>

        <button style={{ ...primaryBtn, ...ceremonyConfirm }} onClick={confirm}>
          CONFIRM
        </button>
        <button style={ceremonyCancel} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* the gathering flyers (unmount once everything has landed) */}
      {!landed &&
        flyers.map((f) => (
          <CeremonyFlyer key={f.id} from={f.from} to={f.to} delay={f.delay}>
            {f.node}
          </CeremonyFlyer>
        ))}

      {/* CONFIRM: the total dives into the score */}
      {scoreFly && (
        <CeremonyFlyer from={scoreFly.from} to={scoreFly.to} delay={0} shrink>
          <span style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 26, color: theme.color.gold, textShadow: "0 2px 10px rgba(0,0,0,0.6)", whiteSpace: "nowrap" }}>
            +{v.total.toLocaleString()}
          </span>
        </CeremonyFlyer>
      )}
    </div>
  );
}

function CeremonyFlyer({ from, to, delay, shrink, children }: { from: XY; to: XY; delay: number; shrink?: boolean; children: React.ReactNode }) {
  const [pos, setPos] = useState(from);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setPos(to);
      if (shrink) setGone(true);
    }, 30 + delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        transform: `translate(-50%, -50%) scale(${gone ? 0.4 : 1})`,
        opacity: gone ? 0.25 : 1,
        zIndex: 66,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "left 650ms cubic-bezier(0.4, 0, 0.3, 1), top 650ms cubic-bezier(0.4, 0, 0.3, 1), transform 650ms ease, opacity 600ms ease-in",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))",
      }}
    >
      {children}
    </div>
  );
}

function HeartMini() {
  return (
    <svg width="16" height="15" viewBox="0 0 14 13">
      <path d="M7 12.2C2 8.2 0.4 5.6 0.4 3.4A3.1 3.1 0 0 1 7 2.1A3.1 3.1 0 0 1 13.6 3.4C13.6 5.6 12 8.2 7 12.2Z" fill={theme.color.bad} />
    </svg>
  );
}

function DiamondMini() {
  return (
    <span
      style={{
        width: 11,
        height: 11,
        display: "inline-block",
        transform: "rotate(45deg)",
        borderRadius: 3,
        background: "linear-gradient(135deg,#f4d885,#e8b53f)",
        boxShadow: "0 0 8px rgba(232,181,63,0.5)",
      }}
    />
  );
}

/* ---------- styles ---------- */

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "13px 30px",
  borderRadius: 14,
  ...bevelPrimary,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 15,
};
const ceremonyScrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(3,4,9,0.82)",
  backdropFilter: "blur(3px)",
  WebkitBackdropFilter: "blur(3px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 58,
  padding: 20,
};
const ceremonyCard: React.CSSProperties = {
  position: "relative",
  width: 360,
  maxWidth: "94vw",
  textAlign: "center",
  padding: "26px 22px 24px",
  borderRadius: 22,
  background: "linear-gradient(180deg, rgba(30,24,10,0.6), rgba(13,11,5,0.7)), #0c0e18",
  border: "1px solid rgba(232,181,63,0.4)",
  boxShadow: "0 40px 90px -24px rgba(0,0,0,0.8)",
};
const ceremonyTitle: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 30,
  letterSpacing: "0.12em",
  color: theme.color.gold,
  textShadow: "0 0 22px rgba(232,181,63,0.5)",
};
const ceremonyCol: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 7,
  padding: "10px 4px",
  borderRadius: 14,
  background: "rgba(232,181,63,0.05)",
  border: "1px solid rgba(232,181,63,0.16)",
};
const ceremonyColLabel: React.CSSProperties = {
  fontFamily: theme.fonts.mono,
  fontSize: 8,
  letterSpacing: "0.18em",
  color: theme.color.faint,
};
const ceremonyIconRow: React.CSSProperties = {
  minHeight: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
};
const ceremonyNone: React.CSSProperties = {
  color: theme.color.faint,
  fontFamily: theme.fonts.mono,
  fontSize: 12,
};
const ceremonyColVal: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 15,
  color: theme.color.gold,
};
const ceremonyTotal: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 44,
  lineHeight: 1.1,
  color: theme.color.gold,
  textShadow: "0 0 26px rgba(232,181,63,0.4)",
  marginTop: 2,
};
const ceremonyConfirm: React.CSSProperties = {
  width: "100%",
  justifyContent: "center",
  marginTop: 18,
  background: "linear-gradient(180deg, #ffe6a8, #e8b53f)",
  border: "none",
  borderBottom: "3px solid #8a6420",
  color: "#2a1c04",
  letterSpacing: "0.08em",
};
const ceremonyCancel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  marginTop: 10,
  padding: "10px 0",
  borderRadius: 14,
  background: "none",
  border: `1px solid ${theme.color.border}`,
  color: theme.color.dim,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

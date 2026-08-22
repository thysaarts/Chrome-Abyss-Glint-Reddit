/**
 * BEAT THE HOUSE — the one-time signpost for YOU vs THE HOUSE (2026-08-21).
 * A short cut-scene (CMS video, tap to skip) flows into a card: the Broker's
 * portrait, the title, her quote, the duel pitch (the SAME CMS line the
 * Challenges card uses), a play button and a quiet close. All copy + the video
 * URL are CMS (content.characters.duelPromo).
 *
 * Shown by App on the Ascent after start-up, at most once per 48 hours (and
 * never twice in a local day) — and only when it can deliver: the player has
 * MORE than 10 Nebulite, today's three dailies are done, and the table is
 * unlocked (Academy complete).
 */
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { sfx } from "../audio/sfx";
import { MiniPopup } from "./PopupCard";

const PROMO_KEY = "glint.brokerPromo.v1";

export function brokerPromoSeenAt(): number {
  try {
    const raw = localStorage.getItem(PROMO_KEY);
    const at = raw ? Number(JSON.parse(raw)?.at) : 0;
    return Number.isFinite(at) ? at : 0;
  } catch { return 0; }
}
export function markBrokerPromoSeen(): void {
  try { localStorage.setItem(PROMO_KEY, JSON.stringify({ at: Date.now() })); } catch { /* ignore */ }
}

export function BrokerPromoPopup({ onPlay, onClose }: { onPlay: () => void; onClose: () => void }) {
  const P = CONTENT.characters.duelPromo;
  const D = CONTENT.characters.duel;
  // REDDIT ADAPTATION: the cut-scene video (6.3MB) does not ship in this
  // build — the promo goes straight to the card. All copy stays CMS-driven.
  return (
    <MiniPopup onClose={onClose} width={392} zIndex={96} cardStyle={cardSkin}>
      <img src="/avatars/broker-lg.webp" alt="" className="gl-float-y" style={{ width: 104, height: "auto", display: "block", margin: "2px auto 0", filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.55))" }} />
      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 24, letterSpacing: "0.05em", color: theme.color.gold, textShadow: "0 0 24px rgba(232,181,63,0.4)", textAlign: "center", marginTop: 12 }}>
        {P.title}
      </div>
      <p style={{ fontFamily: theme.fonts.sans, fontStyle: "italic", fontSize: 13.5, lineHeight: 1.5, color: "#cdb9ff", margin: "10px 8px 0", textAlign: "center" }}>“{P.quote}”</p>
      <p style={{ fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.55, color: theme.color.dim, margin: "12px 6px 0", textAlign: "center" }}>{D.sub}</p>
      <button style={playBtn} onClick={() => { sfx.click(); onPlay(); }}>▶ {P.playButton}</button>
      <button style={closeBtn} onClick={() => { sfx.click(); onClose(); }}>{P.closeButton}</button>
    </MiniPopup>
  );
}

const cardSkin: React.CSSProperties = {
  padding: "24px 22px 20px",
  borderRadius: 20,
  background: `radial-gradient(460px 260px at 50% -12%, rgba(232,181,63,0.14), transparent 62%), ${theme.color.panel}`,
  border: "1px solid rgba(232,181,63,0.4)",
};
const playBtn: React.CSSProperties = { width: "100%", marginTop: 16, padding: "13px 16px", borderRadius: 12, border: "none", borderBottom: "3px solid #b98a1d", boxShadow: "0 10px 22px -8px rgba(232,181,63,0.5)", background: "linear-gradient(180deg,#ffe9b3,#e8b53f)", color: "#2a1c04", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, letterSpacing: "0.04em", cursor: "pointer" };
const closeBtn: React.CSSProperties = { width: "100%", marginTop: 10, padding: "11px 16px", borderRadius: 12, border: `1px solid ${theme.color.border}`, background: "transparent", color: theme.color.dim, fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 13, cursor: "pointer" };

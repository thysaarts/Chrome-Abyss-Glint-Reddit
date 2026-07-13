import { useState, useEffect, useRef, useMemo } from "react";
import { theme } from "../theme/theme";
import { CONTENT } from "../content/content";
import { REGIONS } from "../theme/regions";
import { ThemePreview } from "./ThemePreview";
import { sfx } from "../audio/sfx";
import { NebuliteGem } from "./GameHeader";
import { todayKey } from "../game/stats";
import { shopThemes, shopMusic, ascentAsDecor, themeOwned, musicOwned, decorOwned, shopOrder } from "../game/collection";
import type { DecorItem, ThemeItem, MusicItem } from "../game/collection";
import {
  DetailShell, ThemeMockup, MusicPreview, DecorArt, DecorPreview, NoteIcon, LockIcon, decorTypeLabel,
  cancelBtn, primaryModalBtn, bannerOwned, bannerLocked,
} from "./ItemDetail";

/**
 * SHOP — spend Nebulite on shop-exclusive board themes, music tracks and Ascent
 * Decor (all CMS-driven, distinct from the Collection's won items). Each section
 * shows the top 6 (unowned first, priciest "premiums" leading, then a low↔high
 * mix; owned sink to the bottom) with a Show-more toggle. Tapping any item opens
 * a detail modal — big art, a live theme mock-up or a track preview player — with
 * the Buy action (locked until the player can afford it).
 */

const TYPE_LABEL = { themes: "Board Theme", music: "Music Track" } as const;
const PREVIEW_LIMIT = 6;
const DECOR_LIMIT = 12; // decor shows 4 rows of 3 before the expand toggle
// compact type labels for the Ascent-scene cards (landmark objects vs sky layers)
const DECOR_KIND: Record<string, string> = { prop: "Landmark", particle: "Particle", light: "Light", pattern: "Sky" };

type Detail =
  | { kind: "themes"; item: ThemeItem }
  | { kind: "music"; item: MusicItem }
  | { kind: "decor"; item: DecorItem };

export function ShopPage({
  nebulite,
  onBuy,
  onOpenDecorSettings,
  openItem,
  onItemHandled,
  onViewInCollection,
}: {
  nebulite: number;
  onBuy: (kind: "themes" | "music" | "decor", key: string, price: number) => void;
  onOpenDecorSettings: () => void;
  openItem?: { kind: "themes" | "music" | "decor"; key: string } | null;
  onItemHandled?: () => void;
  onViewInCollection?: (kind: "themes" | "music" | "decor", key: string) => void;
}) {
  const C = CONTENT.collection;
  const themesRaw = shopOrder(shopThemes(), themeOwned, (t) => t.price);
  const musicRaw = shopOrder(shopMusic(), musicOwned, (m) => m.price);
  // standard baseline elements (Nebula/Stars/Galaxy glow) are free — never sold
  const decorRaw = shopOrder(ascentAsDecor().filter((d) => !d.standard), decorOwned, (d) => d.price);

  // FEATURED: up to 3 UNOWNED shop items, premium-leaning, rotated daily. Empty (section
  // hidden) once everything is owned. Recomputed per day via the date key.
  const featured = useMemo(() => pickFeatured([
    ...shopThemes().filter((t) => !themeOwned(t)).map((t) => ({ kind: "themes", item: t } as Detail)),
    ...shopMusic().filter((m) => !musicOwned(m)).map((m) => ({ kind: "music", item: m } as Detail)),
    ...ascentAsDecor().filter((d) => !d.standard && !decorOwned(d)).map((d) => ({ kind: "decor", item: d } as Detail)),
  ], todayKey()), []);
  const featuredKeys = new Set(featured.map((f) => f.item.key));
  // featured items sit up top, so push them BEHIND their category's Show-more fold (out of
  // the first 6). If a category has too few non-featured to fill 6, some featured fill in.
  const deprio = <T extends { key: string }>(list: T[]) =>
    [...list.filter((x) => !featuredKeys.has(x.key)), ...list.filter((x) => featuredKeys.has(x.key))];
  const themesAll = deprio(themesRaw);
  const musicAll = deprio(musicRaw);
  const decorAll = deprio(decorRaw);

  const [openThemes, setOpenThemes] = useState(false);
  const [openMusic, setOpenMusic] = useState(false);
  const [openDecor, setOpenDecor] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [confirm, setConfirm] = useState<Detail | null>(null); // the slide-to-buy pop-up

  // DEEP-LINK: a Challenge/Milestone reward chip can open a specific item's detail here.
  useEffect(() => {
    if (!openItem) return;
    const found =
      openItem.kind === "themes" ? themesAll.find((t) => t.key === openItem.key) && ({ kind: "themes", item: themesAll.find((t) => t.key === openItem.key)! } as Detail)
      : openItem.kind === "music" ? musicAll.find((m) => m.key === openItem.key) && ({ kind: "music", item: musicAll.find((m) => m.key === openItem.key)! } as Detail)
      : decorAll.find((d) => d.key === openItem.key) && ({ kind: "decor", item: decorAll.find((d) => d.key === openItem.key)! } as Detail);
    if (found) setDetail(found);
    onItemHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItem]);

  const priceChip = (owned: boolean, price: number) =>
    owned ? (
      <span style={ownedChip}>{C.ownedTag}</span>
    ) : (
      <span style={{ ...priceChipS, opacity: nebulite >= price ? 1 : 0.6 }}>
        <NebuliteGem size={12} /> {price.toLocaleString()}
      </span>
    );

  const openDetail = (d: Detail) => { sfx.click(); setDetail(d); };

  return (
    <div style={page}>
      {/* FEATURED — hidden once everything is owned */}
      {featured.length > 0 && (
        <FeaturedCarousel items={featured} nebulite={nebulite} onLearnMore={(d) => openDetail(d)} onBuy={(d) => { sfx.click(); setConfirm(d); }} />
      )}

      {/* BOARD THEMES */}
      <div style={eyebrow}><span>{C.themesLabel}</span></div>
      {themesAll.length === 0 ? (
        <Empty text={C.emptyShop} />
      ) : (
        <>
          <div style={themeGrid}>
            {(openThemes ? themesAll : themesAll.slice(0, PREVIEW_LIMIT)).map((t) => (
              <button key={t.key} style={cardBtn} onClick={() => openDetail({ kind: "themes", item: t })}>
                <ThemePreview region={t.region ? REGIONS[t.region] : null} image={t.image} />
                <div style={cardFoot}>
                  <span style={cardName}>{t.name}</span>
                  {priceChip(themeOwned(t), t.price)}
                </div>
              </button>
            ))}
          </div>
          <MoreToggle open={openThemes} count={themesAll.length} limit={PREVIEW_LIMIT} onClick={() => { sfx.click(); setOpenThemes((v) => !v); }} />
        </>
      )}

      {/* MUSIC */}
      <div style={eyebrow}><span>{C.musicLabel}</span></div>
      {musicAll.length === 0 ? (
        <Empty text={C.emptyShop} />
      ) : (
        <>
          <div style={{ ...card, overflow: "hidden" }}>
            {(openMusic ? musicAll : musicAll.slice(0, PREVIEW_LIMIT)).map((m, i, arr) => (
              <button key={m.key} style={{ ...rowBtn, borderBottom: i === arr.length - 1 ? "none" : `1px solid ${theme.color.border}` }} onClick={() => openDetail({ kind: "music", item: m })}>
                <div style={musicThumb}>
                  {m.image ? <img src={m.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <NoteIcon />}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={cardName}>{m.name}</div>
                  <div style={{ fontFamily: theme.fonts.sans, fontSize: 10.5, color: theme.color.dim, marginTop: 1 }}>{m.sub}</div>
                </div>
                {priceChip(musicOwned(m), m.price)}
              </button>
            ))}
          </div>
          <MoreToggle open={openMusic} count={musicAll.length} limit={PREVIEW_LIMIT} onClick={() => { sfx.click(); setOpenMusic((v) => !v); }} />
        </>
      )}

      {/* THE ASCENT — the 3D scene's elements (the old decor is retired) */}
      <div style={eyebrow}><span>{C.ascentLabel ?? C.decorLabel}</span></div>
      <div style={{ fontFamily: theme.fonts.sans, fontSize: 11.5, color: theme.color.dim, margin: "-4px 2px 12px", lineHeight: 1.4 }}>
        {C.ascentLead ?? C.decorLead}{" "}
        <button onClick={() => { sfx.click(); onOpenDecorSettings(); }} style={linkBtn}>Open Settings › Decor</button>
      </div>
      {decorAll.length === 0 ? (
        <Empty text={C.emptyShop} />
      ) : (
        <>
          <div style={decorGrid}>
            {(openDecor ? decorAll : decorAll.slice(0, DECOR_LIMIT)).map((d) => (
              <button key={d.key} style={cardBtn} onClick={() => openDetail({ kind: "decor", item: d })}>
                <div style={{ height: 64, position: "relative", overflow: "hidden", background: "radial-gradient(120% 100% at 50% 0%, rgba(60,40,120,0.5), #0a0812 75%)" }}>
                  {d.image ? (
                    <img src={d.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <DecorPreview d={d} />
                  )}
                </div>
                <div style={{ padding: "7px 9px 9px" }}>
                  {/* the title gets its own row; the type + price sit on the row below */}
                  <div style={{ ...cardName, fontSize: 11 }}>{d.name}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 4 }}>
                    <span style={decorType}>{DECOR_KIND[d.kind] ?? d.kind}</span>
                    {priceChip(decorOwned(d), d.price)}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <MoreToggle open={openDecor} count={decorAll.length} limit={DECOR_LIMIT} onClick={() => { sfx.click(); setOpenDecor((v) => !v); }} />
        </>
      )}

      {detail && (
        <BuyModal
          detail={detail}
          nebulite={nebulite}
          onClose={() => setDetail(null)}
          onRequestBuy={() => { setConfirm(detail); setDetail(null); }}
        />
      )}
      {confirm && (
        <BuyConfirm
          detail={confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => onBuy(confirm.kind, confirm.item.key, confirm.item.price)}
          onView={() => { onViewInCollection?.(confirm.kind, confirm.item.key); setConfirm(null); }}
        />
      )}
    </div>
  );
}

/**
 * BUY CONFIRM — a slide-to-spend pop-up. Shows the item's type / title / thumbnail and a
 * slider carrying the price; sliding it right pays, plays the ka-ching, and swaps the card
 * to a "added to your Collection" success state with Close + View in Collection.
 */
function BuyConfirm({
  detail, onCancel, onConfirm, onView,
}: {
  detail: Detail;
  onCancel: () => void;
  onConfirm: () => void;
  onView: () => void;
}) {
  const C = CONTENT.collection;
  const B = C.buyConfirm;
  const { kind, item } = detail;
  const typeLabel = kind === "decor" ? decorTypeLabel(item as DecorItem) : TYPE_LABEL[kind];
  const [paid, setPaid] = useState(false);

  const pay = () => {
    if (paid) return;
    setPaid(true);
    sfx.purchase();
    onConfirm();
  };

  return (
    <div style={confScrim} className="gl-fade" onClick={paid ? undefined : onCancel}>
      <div style={confCard} className="gl-screen-in" onClick={(e) => e.stopPropagation()}>
        <div style={confType}>{typeLabel}</div>
        <div style={confTitle}>{item.name}</div>
        <div style={confThumb}>
          {kind === "themes" && <ThemePreview region={(item as ThemeItem).region ? REGIONS[(item as ThemeItem).region!] : null} image={item.image} fill />}
          {kind === "music" && (item.image ? <img src={item.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "grid", placeItems: "center", height: "100%" }}><NoteIcon /></div>)}
          {kind === "decor" && ((item as DecorItem).image ? <img src={(item as DecorItem).image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <DecorPreview d={item as DecorItem} />)}
        </div>

        {!paid ? (
          <SlideToBuy price={item.price} label={B.slide} onComplete={pay} />
        ) : (
          <div className="gl-rise-in" style={{ textAlign: "center" }}>
            <div style={confSuccessTitle}><CheckIcon /> {B.successTitle}</div>
            <p style={confSuccessBody}>{B.successBody.replace("{name}", item.name)}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={cancelBtn} onClick={() => { sfx.click(); onCancel(); }}>{B.close}</button>
              <button style={primaryModalBtn} onClick={() => { sfx.click(); onView(); }}>{B.view}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Slide-to-confirm: drag the thumb fully right to fire onComplete (snaps back otherwise). */
function SlideToBuy({ price, label, onComplete }: { price: number; label: string; onComplete: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  const dragging = useRef(false);
  const THUMB = 54;
  const maxX = () => Math.max(0, (trackRef.current?.clientWidth ?? 0) - THUMB - 6);
  const onDown = (e: React.PointerEvent) => {
    if (done) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || done || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    setX(Math.max(0, Math.min(maxX(), e.clientX - rect.left - THUMB / 2)));
  };
  const onUp = () => {
    if (!dragging.current || done) return;
    dragging.current = false;
    if (x >= maxX() - 6) { setX(maxX()); setDone(true); onComplete(); }
    else setX(0);
  };
  const pct = maxX() ? x / maxX() : 0;
  return (
    <div ref={trackRef} style={sliderTrack}>
      <div style={{ ...sliderFill, width: x + THUMB + 3 }} />
      <div style={{ ...sliderLabel, opacity: Math.max(0, 1 - pct * 1.8) }}>
        {label} · <NebuliteGem size={13} /> {price.toLocaleString()}
      </div>
      <div
        style={{ ...sliderThumb, left: 3 + x, transition: dragging.current ? "none" : "left 0.25s cubic-bezier(0.25,0.8,0.3,1)" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {done ? <CheckIcon /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a0b2e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /><path d="M4 6l6 6-6 6" opacity="0.5" /></svg>}
      </div>
    </div>
  );
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-2px" }}><path d="M20 6L9 17l-5-5" /></svg>;
}

// a stable per-string hash, for the daily featured rotation
function dayHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Up to 3 featured items: PREMIUM-leaning (priciest first) and unowned, rotated by day so
 *  the trio changes daily while still favouring premiums. */
function pickFeatured(items: Detail[], dayKey: string): Detail[] {
  if (items.length <= 3) return items;
  const sorted = [...items].sort((a, b) => b.item.price - a.item.price);
  const pool = sorted.slice(0, Math.min(sorted.length, 9)); // top premiums
  const off = dayHash(dayKey) % pool.length;
  const out: Detail[] = [];
  for (let i = 0; i < pool.length && out.length < 3; i++) out.push(pool[(off + i) % pool.length]);
  return out;
}

/** One featured slide: type / title / thumbnail / description with Learn more + Buy. Off-
 *  screen (peeking) slides pass interactive=false so a drag can't fire their buttons. */
function FeaturedSlide({ d, nebulite, interactive, onLearnMore, onBuy }: { d: Detail; nebulite: number; interactive: boolean; onLearnMore: (d: Detail) => void; onBuy: (d: Detail) => void }) {
  const C = CONTENT.collection;
  const { kind, item } = d;
  const typeLabel = kind === "decor" ? decorTypeLabel(item as DecorItem) : TYPE_LABEL[kind];
  const canAfford = nebulite >= item.price;
  return (
    <div style={{ ...featCard, pointerEvents: interactive ? "auto" : "none" }}>
      <div style={featThumb}>
        {kind === "themes" && <ThemePreview region={(item as ThemeItem).region ? REGIONS[(item as ThemeItem).region!] : null} image={item.image} fill />}
        {kind === "music" && (item.image ? <img src={item.image} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "grid", placeItems: "center", height: "100%" }}><NoteIcon /></div>)}
        {kind === "decor" && ((item as DecorItem).image ? <img src={(item as DecorItem).image} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <DecorPreview d={item as DecorItem} />)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={featType}>{typeLabel}</div>
        <div style={featTitle}>{item.name}</div>
        <div style={featDesc}>{(item as { desc?: string }).desc}</div>
        <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 10 }}>
          <button style={featLearn} onClick={() => { sfx.click(); onLearnMore(d); }}>{C.learnMore}</button>
          <button
            style={{ ...featBuy, opacity: canAfford ? 1 : 0.5, cursor: canAfford ? "pointer" : "not-allowed", filter: canAfford ? "none" : "grayscale(0.5)" }}
            disabled={!canAfford}
            onClick={() => { if (!canAfford) return; onBuy(d); }}
          >
            {canAfford ? <>{C.buyTag} · <NebuliteGem size={13} /> {item.price.toLocaleString()}</> : <><LockIcon /> <NebuliteGem size={13} /> {item.price.toLocaleString()}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** FEATURED carousel — a SWIPEABLE slider (drag to peek the next/previous card, release to
 *  settle in the swipe direction). Auto-advances every 5s; a manual gesture pauses it and,
 *  on release, waits a little longer before the auto-cycle resumes. Tap a dot to jump. */
function FeaturedCarousel({ items, nebulite, onLearnMore, onBuy }: { items: Detail[]; nebulite: number; onLearnMore: (d: Detail) => void; onBuy: (d: Detail) => void }) {
  const C = CONTENT.collection;
  const n = items.length;
  const [fi, setFi] = useState(0);
  const i = ((fi % n) + n) % n;
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settle, setSettle] = useState(0); // -1 → prev, 1 → next, 0 → none (drag/idle)
  const [anim, setAnim] = useState(true);
  const startX = useRef(0), pid = useRef(-1), started = useRef(false), manual = useRef(false);

  // auto-advance; paused while dragging or settling; waits longer right after a gesture
  useEffect(() => {
    if (n <= 1 || dragging || settle !== 0) return;
    const delay = manual.current ? 8500 : 5000;
    manual.current = false;
    const t = window.setTimeout(() => setFi((v) => v + 1), delay);
    return () => window.clearTimeout(t);
  }, [fi, n, dragging, settle]);

  // after the settle animation, adopt the new index with the strip re-centred (no visible
  // jump: the content shifts by one exactly as the transform shifts back by 100%)
  const commit = (dir: number) => {
    manual.current = true;
    setAnim(false); setSettle(0); setDragX(0); setFi((v) => v + dir);
    requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true)));
  };

  const onDown = (e: React.PointerEvent) => { if (n <= 1) return; startX.current = e.clientX; pid.current = e.pointerId; started.current = false; };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current || settle !== 0) return;
    const dx = e.clientX - startX.current;
    if (!started.current) {
      if (Math.abs(dx) < 8) return; // a small move isn't a drag — let taps click through
      started.current = true; setDragging(true); setAnim(false);
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    setDragX(dx);
  };
  const onUp = () => {
    if (!started.current) return; // a tap — buttons/dots handle it
    started.current = false; setDragging(false); setAnim(true);
    if (dragX <= -50) { setSettle(1); window.setTimeout(() => commit(1), 300); }
    else if (dragX >= 50) { setSettle(-1); window.setTimeout(() => commit(-1), 300); }
    else { setDragX(0); manual.current = true; } // didn't cross the threshold — snap back
  };

  const prev = (i - 1 + n) % n, next = (i + 1) % n;
  const transform = settle === 1 ? "translateX(-200%)" : settle === -1 ? "translateX(0%)" : `translateX(calc(-100% + ${dragX}px))`;

  return (
    <div style={featWrap}>
      <div style={featEyebrow}><span>{C.featuredLabel}</span></div>
      <div style={featViewport} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div style={{ display: "flex", transform, transition: anim ? "transform 0.3s cubic-bezier(0.25,0.8,0.3,1)" : "none", cursor: dragging ? "grabbing" : n > 1 ? "grab" : "default", touchAction: "pan-y" }}>
          <div style={featSlide}><FeaturedSlide d={items[prev]} nebulite={nebulite} interactive={false} onLearnMore={onLearnMore} onBuy={onBuy} /></div>
          <div style={featSlide}><FeaturedSlide d={items[i]} nebulite={nebulite} interactive={!dragging && settle === 0} onLearnMore={onLearnMore} onBuy={onBuy} /></div>
          <div style={featSlide}><FeaturedSlide d={items[next]} nebulite={nebulite} interactive={false} onLearnMore={onLearnMore} onBuy={onBuy} /></div>
        </div>
      </div>
      {n > 1 && (
        <div style={featDots}>
          {items.map((_, k) => (
            <button key={k} aria-label={`Featured ${k + 1}`} style={{ ...featDot, ...(k === i ? featDotOn : {}) }} onClick={() => { sfx.click(); manual.current = true; setAnim(false); setSettle(0); setDragX(0); setFi(k); requestAnimationFrame(() => requestAnimationFrame(() => setAnim(true))); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuyModal({
  detail, nebulite, onClose, onRequestBuy,
}: {
  detail: Detail;
  nebulite: number;
  onClose: () => void;
  onRequestBuy: () => void;
}) {
  const C = CONTENT.collection;
  const { kind, item } = detail;
  const owned = kind === "themes" ? themeOwned(item as ThemeItem) : kind === "music" ? musicOwned(item as MusicItem) : decorOwned(item as DecorItem);
  const price = item.price;
  const canAfford = nebulite >= price;
  const typeLabel = kind === "decor" ? decorTypeLabel(item as DecorItem) : TYPE_LABEL[kind];

  const banner = owned ? (
    <div style={bannerOwned}>{C.ownedTag}</div>
  ) : !canAfford ? (
    <div style={bannerLocked}><LockIcon /> Locked — need <NebuliteGem size={12} /> {(price - nebulite).toLocaleString()} more</div>
  ) : undefined;

  const actions = (
    <>
      <button style={cancelBtn} onClick={() => { sfx.click(); onClose(); }}>Cancel</button>
      {owned ? (
        <span style={{ ...ownedChip, padding: "10px 16px", fontSize: 10, flex: 1, justifyContent: "center", display: "inline-flex", alignItems: "center" }}>{C.ownedTag}</span>
      ) : (
        <button
          style={{ ...primaryModalBtn, opacity: canAfford ? 1 : 0.45, cursor: canAfford ? "pointer" : "not-allowed", filter: canAfford ? "none" : "grayscale(0.6)" }}
          disabled={!canAfford}
          title={canAfford ? undefined : C.cantAfford}
          onClick={() => { if (!canAfford) return; sfx.click(); onRequestBuy(); }}
        >
          {canAfford ? <>Buy · <NebuliteGem size={14} /> {price.toLocaleString()}</> : <><LockIcon /> <NebuliteGem size={14} /> {price.toLocaleString()}</>}
        </button>
      )}
    </>
  );

  return (
    <DetailShell typeLabel={typeLabel} title={item.name} desc={(item as { desc?: string }).desc} banner={banner} actions={actions} onClose={onClose}>
      {kind === "themes" && <ThemeMockup item={item as ThemeItem} />}
      {kind === "music" && <MusicPreview item={item as MusicItem} />}
      {kind === "decor" && <DecorArt item={item as DecorItem} />}
    </DetailShell>
  );
}

function MoreToggle({ open, count, limit, onClick }: { open: boolean; count: number; limit: number; onClick: () => void }) {
  if (count <= limit) return null;
  return (
    <button style={moreBtn} onClick={onClick}>
      {open ? "Show less" : `Show ${count - limit} more`}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ ...card, padding: "18px 14px", textAlign: "center", fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.color.faint }}>{text}</div>;
}

/* ---- styles ---- */
const page: React.CSSProperties = { position: "absolute", inset: 0, overflowY: "auto", paddingTop: 2, paddingBottom: 30, paddingLeft: "max(18px, calc(50% - 212px))", paddingRight: "max(18px, calc(50% - 212px))" };
const eyebrow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.faint, margin: "20px 2px 12px" };
const card: React.CSSProperties = { background: "linear-gradient(180deg, var(--panel-hi, #1a1d2e), var(--panel, #101322))", border: `1px solid ${theme.color.border}`, borderRadius: 15, boxShadow: "0 10px 22px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)" };
const cardBtn: React.CSSProperties = { ...card, overflow: "hidden", padding: 0, textAlign: "left", cursor: "pointer", display: "block", width: "100%", font: "inherit", color: "inherit" };
const cardFoot: React.CSSProperties = { padding: "9px 11px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 };
const cardName: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12.5, color: theme.color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const rowBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", width: "100%", background: "none", border: "none", borderRadius: 0, cursor: "pointer", font: "inherit", color: "inherit" };
const musicThumb: React.CSSProperties = { width: 40, height: 40, flexShrink: 0, borderRadius: 11, overflow: "hidden", display: "grid", placeItems: "center", background: "radial-gradient(circle at 35% 30%, rgba(157,123,255,0.28), rgba(157,123,255,0.05))", border: "1px solid rgba(157,123,255,0.35)" };
const themeGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const decorGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };
const decorType: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.color.faint, whiteSpace: "nowrap" };
const priceChipS: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11.5, color: theme.color.text, background: "rgba(157,123,255,0.14)", border: "1px solid rgba(157,123,255,0.4)", borderRadius: 8, padding: "3px 8px", whiteSpace: "nowrap", flex: "0 0 auto" };
const ownedChip: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.1em", padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", color: theme.color.good, border: "1px solid rgba(52,217,139,0.45)", background: "rgba(52,217,139,0.1)", flex: "0 0 auto" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", padding: 0, color: theme.color.accent, fontFamily: theme.fonts.sans, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 };
const moreBtn: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: 10, padding: "9px 0", background: "rgba(157,123,255,0.08)", border: `1px solid ${theme.color.border}`, borderRadius: 10, color: theme.color.accent, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, cursor: "pointer" };

/* ---- buy-confirm pop-up ---- */
const confScrim: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 97, background: "rgba(4,4,10,0.8)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const confCard: React.CSSProperties = { position: "relative", width: 380, maxWidth: "92vw", padding: "24px 22px 22px", borderRadius: 20, textAlign: "center", boxShadow: theme.color.shadow, background: `radial-gradient(440px 240px at 50% -10%, rgba(157,123,255,0.16), transparent 62%), ${theme.color.panel}`, border: "1px solid rgba(157,123,255,0.4)" };
const confType: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: theme.color.faint };
const confTitle: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 21, color: theme.color.text, marginTop: 4, lineHeight: 1.1 };
const confThumb: React.CSSProperties = { position: "relative", height: 112, margin: "16px auto 18px", width: "72%", borderRadius: 14, overflow: "hidden", border: `1px solid ${theme.color.border}`, background: "radial-gradient(120% 100% at 50% 0%, rgba(60,40,120,0.5), #0a0812 75%)" };
const confSuccessTitle: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 17, color: theme.color.good, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };
const confSuccessBody: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.dim, margin: "10px 6px 0" };
const sliderTrack: React.CSSProperties = { position: "relative", height: 58, borderRadius: 14, background: "rgba(157,123,255,0.1)", border: "1px solid rgba(157,123,255,0.32)", overflow: "hidden", userSelect: "none", touchAction: "none" };
const sliderFill: React.CSSProperties = { position: "absolute", left: 0, top: 0, bottom: 0, background: "linear-gradient(90deg, rgba(176,107,245,0.35), rgba(176,107,245,0.55))", borderRadius: 14, pointerEvents: "none" };
const sliderLabel: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 14, color: "#e2bbff", letterSpacing: "0.02em", pointerEvents: "none" };
const sliderThumb: React.CSSProperties = { position: "absolute", top: 3, bottom: 3, width: 54, borderRadius: 11, display: "grid", placeItems: "center", cursor: "grab", touchAction: "none", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", borderBottom: "3px solid #7d3fc4", boxShadow: "0 6px 16px -4px rgba(176,107,245,0.7)", color: "#1a0b2e" };

/* ---- featured carousel ---- */
const featWrap: React.CSSProperties = { marginTop: 4 };
const featViewport: React.CSSProperties = { overflow: "hidden", touchAction: "pan-y" };
const featSlide: React.CSSProperties = { flex: "0 0 100%", minWidth: 0, boxSizing: "border-box", padding: "3px 4px 9px" };
const featEyebrow: React.CSSProperties = { display: "flex", alignItems: "center", fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.22em", color: theme.color.gold, textTransform: "uppercase", margin: "14px 2px 10px" };
const featCard: React.CSSProperties = { display: "flex", gap: 14, padding: 14, borderRadius: 16, background: "linear-gradient(180deg, rgba(157,123,255,0.13), rgba(16,19,34,0.92))", border: "1px solid rgba(157,123,255,0.42)", boxShadow: "0 16px 34px -16px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)" };
// position:relative is load-bearing — DecorPreview's art is absolutely
// positioned and must resolve against THIS box, not the carousel track
const featThumb: React.CSSProperties = { position: "relative", width: 118, height: 118, flexShrink: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${theme.color.border}`, background: "radial-gradient(120% 100% at 50% 0%, rgba(60,40,120,0.5), #0a0812 75%)" };
const featType: React.CSSProperties = { fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.color.faint };
const featTitle: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 17, color: theme.color.text, lineHeight: 1.1, marginTop: 2 };
const featDesc: React.CSSProperties = { fontFamily: theme.fonts.sans, fontSize: 11.5, lineHeight: 1.4, color: theme.color.dim, marginTop: 5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" };
const featLearn: React.CSSProperties = { flex: "0 0 auto", padding: "9px 13px", borderRadius: 10, background: "none", border: "1px solid rgba(157,123,255,0.42)", color: theme.color.accent, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 11.5, cursor: "pointer" };
const featBuy: React.CSSProperties = { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "none", borderBottom: "3px solid #7d3fc4", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", color: "#1a0b2e", fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap", cursor: "pointer" };
const featDots: React.CSSProperties = { display: "flex", justifyContent: "center", gap: 7, marginTop: 11 };
const featDot: React.CSSProperties = { width: 7, height: 7, borderRadius: 999, border: "none", padding: 0, background: "rgba(157,123,255,0.32)", cursor: "pointer", transition: "width .2s, background .2s" };
const featDotOn: React.CSSProperties = { background: theme.color.accent, width: 18 };

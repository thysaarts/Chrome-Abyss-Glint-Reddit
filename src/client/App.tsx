import { useCallback, useEffect, useRef, useState } from "react";
import { theme, bevelPrimary, SEAT_GREEN, SEAT_PURPLE } from "./theme/theme";
import { REGIONS, regionVars } from "./theme/regions";
import { Backdrop } from "./ui/Backdrop";
import { RegionBackdrop } from "./ui/RegionBackdrop";
import { GameState, CORE, GLINT, RESURRECT, QUADRIANT, ZENITH, TileVal, EndTallyKind, cashOutValue, bestPlacementHint } from "./game/engine";
import { CONTENT, DEFAULT_CONTENT } from "./content/content";
import { Board } from "./ui/Board";
import { TileGem } from "./ui/TileGem";
import { HUD, Footer, ComboLegend, TileLegend, LogPanel } from "./ui/Panels";
import { createPortal } from "react-dom";
import { useNebuliteGame, Mapper } from "./ui/useNebuliteGame";
import { FlyingOverlay } from "./ui/FlyingOverlay";
import { ComboLineupOverlay } from "./ui/ComboLineupOverlay";
import { CashOutButton, CashOutCeremony } from "./ui/CashOut";
import { RushOverlay, RushWind } from "./ui/RushOverlay";
import { ZenithArrival } from "./ui/ZenithArrival";
import {
  BigBanner,
  BankedPlate,
  ToastPill,
  FloatingToast,
  LogDrawer,
  FOOTER_POKE,
  boardPanel,
  boardGlow,
  boardCastShadow,
  toastBand,
  floatToastWrap,
  hudBankOverlay,
  sheenClip,
  sheenBar,
  overlayScrim,
} from "./ui/gameChrome";
import { EarlyBankButton } from "./ui/EarlyBankButton";
import { StartScreen } from "./ui/StartScreen";
import { LevelSelect, Leaderboard } from "./ui/LevelSelect";
import { TabBar, ComingSoon, LockedTab, HomeTab, TAB_BAR_HEIGHT, ShellHeader, HEADER_HEIGHT } from "./ui/Tabs";
import { ChallengesPage } from "./ui/ChallengesPage";
import { DailyChallengePopup } from "./ui/DailyChallengePopup";
import { DailyClearedPopup } from "./ui/DailyClearedPopup";
import type { DailyClearedSlide } from "./ui/DailyClearedPopup";
import type { DailyEntry } from "./game/challenges";
import { AchievementsPage } from "./ui/AchievementsPage";
import { CollectionPage } from "./ui/CollectionPage";
import { recordRun, recordVersusWin, todayKey, loadStats, loadDaily, loadDailyPopupSeen, markDailyPopupSeen } from "./game/stats";
import { evalDailyForRun, pickDailyChallenges, crossedMilestoneTiers, abilityUnlocked, abilityAchieved, celebratedAbilities, markAbilitiesCelebrated, computeAchievements, SET_BONUS_NEBULITE, extraGemsFor, extraGemsForLevel } from "./game/challenges";
import { communityPopupSeenDay, dailyRun, fetchDaily, markCommunityPopupSeen, submitAllTimeScore, submitDailyScore } from "./game/redditDaily";
import { dailyGame, dailySnapshot, measureDaily } from "./game/daily";
import { DailyResultPopup, type DailyResult } from "./ui/DailyResultPopup";
import { useToastQueue } from "./ui/useToastQueue";
import { GameFxLayer, setWordGate } from "./ui/gameFx";
import { CommunityDailyPopup } from "./ui/CommunityDailyPopup";
import type { DailyMetric, DailyResponse } from "../shared/api";
import { reconcileGrants, earnItem, grant, ownedMusic, stickers, musicTracks, rewardTarget, factionPacks, factionForRegion, factionOwned, factionTheme, factionMusic } from "./game/collection";
import type { EarnedReward } from "./game/collection";
import { TutorialComplete } from "./ui/TutorialComplete";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { haptic } from "./game/haptics";
import { RewardReveal } from "./ui/RewardReveal";
import { AbilityReward, AbilityUnlock } from "./ui/AbilityReward";
import { PuzzleReveal } from "./ui/PuzzleReveal";
import { PuzzleIntro } from "./ui/PuzzleIntro";
import { puzzleIntroSeen, markPuzzleIntroSeen } from "./game/puzzleintro";
import { markUnseen, markSeen, unseenCount } from "./game/unseen";
import { academyFlags, markIntroSeen, markRushSeen, markBankTipSeen, academyCheerSeen, markAcademyCheerSeen } from "./game/academy";
import { GameHeader } from "./ui/GameHeader";
import { ShopPage } from "./ui/ShopPage";
import { loadWallet, saveWallet } from "./game/wallet";
import { BrokerPromoPopup, brokerPromoSeenAt, markBrokerPromoSeen } from "./ui/BrokerPromo";
import { DUEL_MIN_BET } from "./ui/HouseDuel";
import { chooseBrokerAction, shouldBankNow, tierForBet, type BrokerTier } from "./game/brokerAI";
import type { Avatar } from "./game/avatars";
import { AvatarGem } from "./ui/AvatarGem";
import { fmt } from "./content/content";
import { MiniPopup, PopupCard } from "./ui/PopupCard";
import { StarField } from "./ui/StarField";
import { TutorAvatar } from "./ui/TutorAvatar";
import { renderRich } from "./ui/richText";
import { quickTipFlags, markQuickIntroSeen, markQuickBankSeen, markQuickRushSeen } from "./game/quickplay";
import { Tutorial } from "./ui/Tutorial";
import { TutorialLevel } from "./ui/TutorialLevel";
import { Level, LEVELS, LEVEL_DEFS, RunResult, levelScoreLabel } from "./levels/levels";
import { recordScore, completeLevel, recordLevelResult, storedFrontier, levelStatus, tutorialDone, markTutorialDone } from "./levels/progress";
import { sfx } from "./audio/sfx";
import { music, MusicTheme } from "./audio/music";
import { Settings, DEFAULT_SETTINGS, loadSettings, saveSettings, applySettings, visualOptions, osPrefersReducedMotion } from "./ui/settings";
import { SettingsScreen } from "./ui/SettingsScreen";
import { DebugTracePanel } from "./ui/DebugTracePanel";

// Touch devices: a coarse pointer is imprecise, so the "zoom on press" shifts the
// board under the finger and causes misclicks. On coarse pointers we DON'T zoom on
// press (the board stays perfectly still as direct tap feedback) and rest at 1.0 (no
// base zoom, so nothing shifts) — the focus zoom still fires DURING the placement
// animation, and a touch bit stronger (+10%) since there's more screen to lean into.
const COARSE_POINTER =
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
// Board zoom: rests slightly enlarged (fills the width), and "focuses in" on the
// action while an action animates — see the `focused` flag in the game hook.
const ZOOM_BASE = COARSE_POINTER ? 1.0 : 1.05;
const ZOOM_IN = COARSE_POINTER ? 1.28 : 1.18;
const ABILITY_TILE: Record<string, number> = { invincible: RESURRECT, crimsonEndurance: QUADRIANT, superluminal: ZENITH };
function pendingAbilityCelebrations(stats = loadStats()): AbilityUnlock[] {
  const celebrated = celebratedAbilities();
  return ((CONTENT.achievements.abilityUnlock?.gems ?? []) as { key: string; gemName: string; blurb: string }[])
    .filter((g) => !celebrated.has(g.key) && abilityAchieved(g.key, stats))
    .map((g) => ({ key: g.key, gemName: g.gemName, tileValue: ABILITY_TILE[g.key], blurb: g.blurb }));
}

export default function App() {
  const { state, anim, settling, onPlace, start, setMapper, earlyBankOffer, bankNow, swapHand, rotateHand, cashOutNow, handRevealed, setBoardHeld, versusPass, claimOffer, startRecording, getRecordedMoves } = useNebuliteGame(6);
  // which top-level screen is showing, plus the shared overlays.
  // "tutorial0" is Level 0's scripted walkthrough — it hands off into a real run.
  const [screen, setScreen] = useState<"start" | "levels" | "game" | "tutorial0">("start");
  // which tab of the home shell is showing (Home = the level map)
  const [homeTab, setHomeTab] = useState<HomeTab>("ascent");
  // "Exit Level?" confirm, shown before leaving an active run — the value is where
  // to go once confirmed (Exit button → Ascent; tapping Nebulite → Shop).
  const [exitConfirm, setExitConfirm] = useState<null | "shop" | "ascent">(null);
  // Start → Ascent transition: true briefly while the start screen dives away
  const [startExiting, setStartExiting] = useState(false);
  // the daily-challenge pop-up shown on the Ascent menu (once/day per kind)
  const [dailyPopup, setDailyPopup] = useState<null | "new" | "done">(null);
  // DAILY CLEARED — the run-end character celebration queue (one slide per
  // completed daily; the CHALLENGE COMPLETED finale joins when the set closed).
  // Session-memory only: a skipped queue resurfaces on the next Ascent visit.
  const [dailyCleared, setDailyCleared] = useState<{ slides: DailyClearedSlide[]; withSetDone: boolean } | null>(null);
  const [dailyClearedOpen, setDailyClearedOpen] = useState(false);
  const dailyClearedSourceRef = useRef<"endcard" | "ambient">("endcard");
  const [endDaily, setEndDaily] = useState<DailyResponse | null>(null);
  const [communityPopup, setCommunityPopup] = useState<DailyResponse | null>(null);
  // the Collection page's two sub-tabs — Customise opens first
  const [collectionSub, setCollectionSub] = useState<"customise" | "book">("customise");
  // deep-link a reward chip → the Collection: open a theme/music detail, or focus a sticker
  const [openCustomiseItem, setOpenCustomiseItem] = useState<{ kind: "themes" | "music"; key: string } | null>(null);
  const [focusSticker, setFocusSticker] = useState<string | null>(null);
  // deep-link a reward chip → the Shop, opening that item's detail (for an unowned shop item)
  const [openShopItem, setOpenShopItem] = useState<{ kind: "themes" | "music" | "decor"; key: string } | null>(null);
  const openReward = useCallback((kind: "sticker" | "music" | "theme", id: string) => {
    // route to the page where the item actually LIVES (Shop for unowned shop items, else Collection)
    if (kind !== "sticker" && rewardTarget(kind, id) === "shop") {
      setOpenShopItem({ kind: kind === "theme" ? "themes" : "music", key: id });
      setHomeTab("shop");
      return;
    }
    if (kind === "sticker") { setCollectionSub("book"); setFocusSticker(id); }
    else { setCollectionSub("customise"); setOpenCustomiseItem({ kind: kind === "theme" ? "themes" : "music", key: id }); }
    setHomeTab("collection");
  }, []);
  // TUTORIAL GATE: until the scripted Tutorial is finished, nothing is earned and
  // the Collection / Achievements / Shop tabs are locked. `tutDone` mirrors the
  // stored flag so the shell re-renders the instant it flips.
  const [tutDone, setTutDone] = useState(tutorialDone());
  // the end-of-Tutorial celebration (grants the first music track, then hands off)
  const [tutorialCompleteOpen, setTutorialCompleteOpen] = useState(false);
  // THE DAILY BOARD'S RESULT — a short beat before the end card, on every daily
  // metric except `score` (which the end card already leads with).
  const [dailyResult, setDailyResult] = useState<DailyResult | null>(null);
  // the end-of-ACADEMY celebration (Level 1 — grants the first sticker)
  const [academyCompleteOpen, setAcademyCompleteOpen] = useState<null | { fresh: boolean }>(null);
  // the one-off ASCENT CHEER, played once the Academy's unlock celebration has
  // finished on the level map
  const [academyCheer, setAcademyCheer] = useState(false);
  // collectibles earned by the just-finished run → the reward-reveal card (shown
  // AFTER the game-end pop-up: earned collectibles wait behind the end card's
  // Continue button (revealOpen). Skipping the reveal (Play again / exit /
  // reload) leaves them flagged "unseen" — a dot on the Collection tab until
  // the player visits the page. forceTabRef lets "View in Collection" survive
  // the levels-screen tab reset below.
  const [rewards, setRewards] = useState<EarnedReward[]>([]);
  const [revealOpen, setRevealOpen] = useState(false);
  // bonus-gem abilities first unlocked by the just-finished run (their own pop-up,
  // shown before the collection reveal)
  const [abilityUnlocks, setAbilityUnlocks] = useState<AbilityUnlock[]>([]);
  const [abilityRevealOpen, setAbilityRevealOpen] = useState(false);
  // end-card chain routes onward; an AMBIENT showing (Ascent / run start) just closes
  const abilityRevealSourceRef = useRef<"endcard" | "ambient">("endcard");
  // PUZZLE BOARD clear: the full revealed image animates up into a pop-up
  const [puzzleReveal, setPuzzleReveal] = useState<string | null>(null);
  // a cleared puzzle board waits for the final tiles to peel off (uncovering the
  // whole image ON the board) before the reveal pop-up rises — set on the win,
  // resolved once the animations settle and the peel has had time to finish.
  const [puzzleRevealPending, setPuzzleRevealPending] = useState<string | null>(null);
  const [collectionAlert, setCollectionAlert] = useState(() => unseenCount() > 0);
  const forceTabRef = useRef<HomeTab | null>(null);
  useEffect(() => {
    // the pop-up is on screen — these rewards are officially seen
    if (revealOpen && rewards.length) {
      markSeen(rewards);
      setCollectionAlert(unseenCount() > 0);
    }
  }, [revealOpen, rewards]);
  const [currentLevel, setCurrentLevel] = useState<Level | null>(null); // null = a Quick Start (non-campaign) game
  const [sheet, setSheet] = useState<null | "combos">(null);
  const [logOpen, setLogOpen] = useState(false);
  // the tutorial can open over the start screen or over the game; the source
  // decides what "Got it — Play" does.
  const [tutorial, setTutorial] = useState<null | "start" | "game">(null);
  const [boardPressed, setBoardPressed] = useState(false);
  // bug027: the board's max height is MEASURED, not estimated — the fit layout
  // (mobile) flexes the sheen area to the leftover viewport space; the board may
  // use all of it minus the toast band. null = desktop flow layout (64vh cap).
  const sheenRef = useRef<HTMLDivElement | null>(null);
  const [boardFitH, setBoardFitH] = useState<number | null>(null);

  // player settings (theme / motion / audio), persisted + applied globally
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"visual" | "audio" | "game" | "data" | "decor" | "about">("visual");
  const [showLB, setShowLB] = useState(false); // high-scores popup, opened from the shell header
  // Nebulite currency (earned from dailies + in-run Nebulites, spent in the Shop)
  const [nebulite, setNebulite] = useState(loadWallet);
  const addNebulite = useCallback((n: number) => setNebulite((v) => { const nv = Math.max(0, v + n); saveWallet(nv); return nv; }), []);
  const openSettings = useCallback((section: "visual" | "audio" | "game" | "data" | "decor" | "about" = "visual") => { sfx.click(); setSettingsSection(section); setShowSettings(true); }, []);
  // Shop purchase: spend Nebulite and grant the item (theme / track / faction pack)
  const buyItem = useCallback(
    (kind: "themes" | "music" | "decor" | "faction", key: string, price: number) => {
      if (nebulite < price) return;
      sfx.click();
      if (kind === "faction") {
        // a FACTION PACK is a bundle: one payment grants BOTH member items
        const p = factionPacks().find((f) => f.key === key);
        if (!p) return;
        addNebulite(-price);
        grant("themes", p.themeKey);
        grant("music", p.musicKey);
      } else {
        addNebulite(-price);
        grant(kind, key);
      }
    },
    [nebulite, addNebulite]
  );
  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
  }, [settings]);
  const updateSettings = (patch: Partial<Settings>) => {
    sfx.unlock();
    // Apply SYNCHRONOUSLY as well as in the effect above: the board camera reads
    // visualOptions during render, and the effect only runs after that render has
    // committed — so without this the board would lag one frame behind the toggle.
    // The effect still re-applies (identically) and persists.
    applySettings({ ...settings, ...patch });
    setSettings((s) => ({ ...s, ...patch }));
  };

  // SELF-HEAL: an equipped music track that isn't owned (e.g. a stale pick that's
  // since been locked) falls back to the standard — the game track to Nebula Drift,
  // the Sticker Book track to Interstellar.
  useEffect(() => {
    const owned = new Set(ownedMusic().map((m) => m.theme));
    const patch: Partial<Settings> = {};
    if (!owned.has(settings.musicGeneric)) patch.musicGeneric = DEFAULT_SETTINGS.musicGeneric;
    if (!owned.has(settings.musicInterstellar)) patch.musicInterstellar = DEFAULT_SETTINGS.musicInterstellar;
    if (Object.keys(patch).length) setSettings((s) => ({ ...s, ...patch }));
    // once on mount — the owned set only grows during play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the header mute button silences EVERYTHING — sound effects AND music: both
  // volumes drop to 0 and restore to their last non-zero levels (remembered here).
  const muted = settings.sfxVolume === 0 && settings.musicVolume === 0;
  const lastVolRef = useRef({ sfx: settings.sfxVolume || 0.9, music: settings.musicVolume || 0.7 });
  useEffect(() => {
    if (settings.sfxVolume > 0) lastVolRef.current.sfx = settings.sfxVolume;
    if (settings.musicVolume > 0) lastVolRef.current.music = settings.musicVolume;
  }, [settings.sfxVolume, settings.musicVolume]);
  const toggleMute = () => {
    sfx.unlock();
    setSettings((s) =>
      s.sfxVolume === 0 && s.musicVolume === 0
        ? { ...s, sfxVolume: lastVolRef.current.sfx || 0.9, musicVolume: lastVolRef.current.music || 0.7 }
        : { ...s, sfxVolume: 0, musicVolume: 0 }
    );
  };

  // Best-effort autoplay: browsers hold audio until the first user gesture, so
  // every pointer/key event anywhere pokes the context awake — the start
  // screen's music comes in from a tap on empty space, no button needed.
  // Deliberately NOT `once`: a scroll's pointerdown doesn't count as a real
  // activation (the resume silently fails), so a one-shot listener would be
  // consumed without unlocking anything and later taps would do nothing.
  // Keeping them attached also heals iOS re-suspending the context after an
  // interruption (a call, Siri, another app taking the audio session). The
  // listeners are no-ops once audio runs, so the cost is nil.
  useEffect(() => {
    // Try to start audio at launch too: every BROWSER refuses this (the context
    // just parks "suspended" until the first tap — today's behaviour, plus a
    // harmless console notice), but a NATIVE app shell with autoplay enabled
    // (WKWebView mediaPlaybackRequiresUserAction=false / Android equivalent)
    // lets it through — start-screen music then plays from launch, no changes.
    sfx.unlock();
    const kick = () => { sfx.unlock(); };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
    for (const e of events) window.addEventListener(e, kick, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, kick);
    };
  }, []);
  // Where the board zoom focuses. Set to where the user pressed so the zoom keeps
  // that spot fixed (edge actions stay in view instead of falling off-screen).
  // Numeric (percent) so the fit pass below can clamp it; the transform-origin
  // string is derived at render.
  const [boardOrigin, setBoardOrigin] = useState({ x: 50, y: 50 });
  // The fit pass can also back the zoom off when a selection spans too far to
  // fit at ZOOM_IN (null = the standard zoom).
  const [fitScale, setFitScale] = useState<number | null>(null);

  // anchors for flying-tile targets
  const scoreRef = useRef<HTMLDivElement | null>(null);
  const nebRef = useRef<HTMLDivElement | null>(null);
  const bustRef = useRef<HTMLDivElement | null>(null);
  const banksRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  // the CASH OUT ceremony overlay (GLINT RUSH only; nothing commits until CONFIRM)
  const [cashCeremony, setCashCeremony] = useState(false);
  // SECTOR 01 OUTPOST (Level 2): the paged tips briefing. Auto-opens on the very
  // first launch of that level (Nebulite page) and on the first GLINT RUSH there
  // (rush page); the TIP pill re-opens it any time on that level.
  const [academyTips, setAcademyTips] = useState<{ open: boolean; page: number; solo?: boolean }>({ open: false, page: 0 });
  // the OPENING CHOREOGRAPHY (rain, specials dropping, GO!) releases the anim —
  // board-start pop-ups wait on this, so none can land before the Dross arrives
  const [boardSettled, setBoardSettled] = useState(false);
  // QUICK PLAY new-starter tips (frontier < 2): pill + three one-time pop-ups.
  // REDDIT ADAPTATION: this build has no Academy OPT-OUT flow (web's TutorialLevel
  // feature) — the ref stays false and the web-shaped gating below just works.
  const optOutRunRef = useRef(false);
  const [preAcademy, setPreAcademy] = useState(() => storedFrontier() < 2);
  const [quickTips, setQuickTips] = useState<{ open: boolean; page: number }>({ open: false, page: 0 });
  // QUICK PLAY tips eligibility — a plain solo run, pre-Academy; the Academy's
  // CLOSING board carries the same tips. A COMMUNITY DAILY is never a quick run:
  // it is a competitive, server-verified board and nobody's first board, so the
  // new-starter pop-ups must not force themselves over it (web parity).
  const isQuickRun = !currentLevel && !dailyRun.day && !state.coop && !state.versus;
  const quickTipsEligible = isQuickRun && preAcademy;
  const onAcademyBoard = currentLevel?.num === 1;
  const quickPageUnlocked = (key: string) =>
    key === "clearing" ? quickTipFlags().bankReached || state.banks >= 1
    : key === "rush" ? quickTipFlags().rushReached || state.deathMatch
    : true; // ropes — always
  const quickPages = !quickTips.open
    ? []
    : onAcademyBoard && !optOutRunRef.current
      ? (CONTENT.quickPlayTips ?? DEFAULT_CONTENT.quickPlayTips).pages
      : (CONTENT.quickPlayTips ?? DEFAULT_CONTENT.quickPlayTips).pages.filter((pg) => quickPageUnlocked(pg.key));
  // the one-time PUZZLE BOARD briefing, opened over the board the first time the
  // first puzzle level is launched
  const [puzzleIntroOpen, setPuzzleIntroOpen] = useState(false);
  // pages UNLOCKED so far — each tip becomes accessible (in the cycle AND on the pill)
  // only once its moment has happened, so the briefing grows one slide at a time:
  // Nebulite from the start, Clearing after the first bank, GLINT RUSH once rush hits.
  const academyPageUnlocked = (key: string) =>
    key === "clearing" ? academyFlags().seenBankTip
    : key === "rush" ? academyFlags().rushReached || (currentLevel?.num === 2 && state.deathMatch)
    : true; // nebulite (the opening slide) is always available
  const academyCycle = CONTENT.academyTips.pages.filter((pg) => academyPageUnlocked(pg.key));
  // the LAUNCH intro is the Nebulite page alone; every other opening shows the cycle
  const academyPages = academyTips.solo ? academyCycle.filter((pg) => pg.key === "nebulite") : academyCycle;
  const boardBoxRef = useRef<HTMLDivElement | null>(null); // unscaled board box, for focus math
  const boardViewportRef = useRef<HTMLDivElement | null>(null); // the CLIP window (bleeds below the board)
  const boardTiltRef = useRef<HTMLDivElement | null>(null); // the actual tilted board surface
  // centre of the BOARD (the tilted surface), in screen coords — where the count-in "GO"
  // and the hand-reveal eye sit. Uses the board surface, NOT the clip viewport, whose box
  // bleeds ~76px below the board (padding to the footer) and would drag the GO down.
  const boardCenter = () => {
    const el = boardTiltRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // Focus the zoom on where the user pressed (as a % of the board box). The board
  // grows around this point, so a tile tapped near the edge stays on screen.
  const focusFromPointer = (e: React.PointerEvent) => {
    const box = boardBoxRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const fx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const fy = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    setBoardOrigin({ x: fx, y: fy });
  };

  // FIT PASS — the zoom must never push what the player has to LOOK AT out of
  // the viewport. Whenever a selection is on the board (the combo picker's blue
  // + grey chains, a bank's gold light-up, an activation's white reveal), work
  // out the cells' unscaled positions and clamp the zoom origin so every one of
  // them stays inside the clipped board window — and if the selection spans too
  // far to fit at the standard zoom, back the zoom itself off just enough.
  // A point at fraction p renders at o + (p - o) · S, so keeping it in [0,1]
  // bounds the origin o to [(pmax·S − 1)/(S − 1), pmin·S/(S − 1)] per axis.
  const boardFractionsRef = useRef<((key: string) => { fx: number; fy: number } | null) | null>(null);
  const handleFractionMapper = useCallback((fn: (key: string) => { fx: number; fy: number } | null) => {
    boardFractionsRef.current = fn;
  }, []);
  useEffect(() => {
    // camera off: nothing zooms, so there's nothing to fit or re-pivot. Bail before
    // the per-cell maths rather than letting it churn on every reveal for no effect.
    if (!visualOptions.boardZoom || !anim.focused) {
      setFitScale(null);
      return;
    }
    const cells = new Set<string>();
    if (anim.choice) {
      anim.choice.blue.forEach((k) => cells.add(k));
      anim.choice.grey.forEach((k) => cells.add(k));
      cells.add(anim.choice.key);
    }
    anim.litCells?.forEach((k) => cells.add(k));
    anim.activateReveal?.forEach((k) => cells.add(k));
    if (cells.size === 0) return;
    const pts = [...cells].map((k) => boardFractionsRef.current?.(k)).filter(Boolean) as { fx: number; fy: number }[];
    if (pts.length === 0) return;
    const PAD = 0.075; // roughly a hex of breathing room past the outermost gem
    const lo = { x: Math.max(0, Math.min(...pts.map((p) => p.fx)) - PAD), y: Math.max(0, Math.min(...pts.map((p) => p.fy)) - PAD) };
    const hi = { x: Math.min(1, Math.max(...pts.map((p) => p.fx)) + PAD), y: Math.min(1, Math.max(...pts.map((p) => p.fy)) + PAD) };
    // the zoom that still fits the selection's span (never below 1 = full view)
    const span = Math.max(hi.x - lo.x, hi.y - lo.y);
    // quantise the fit scale (0.05 steps) so the incremental reveal doesn't nudge
    // it every frame — fewer target changes means a steadier, less jittery camera
    const S = Math.max(1, Math.min(ZOOM_IN, Math.round((span > 0 ? 1 / span : ZOOM_IN) * 20) / 20));
    setFitScale((prev) => {
      const next = S < ZOOM_IN - 0.001 ? S : null;
      return prev != null && next != null && Math.abs(prev - next) < 0.03 ? prev : next;
    });
    if (S <= 1.001) return; // whole board visible — any origin works
    const clampAxis = (o: number, pmin: number, pmax: number) => {
      const min = ((pmax * S - 1) / (S - 1)) * 100;
      const max = ((pmin * S) / (S - 1)) * 100;
      return min > max ? (min + max) / 2 : Math.max(min, Math.min(max, o));
    };
    setBoardOrigin((o) => {
      const x = clampAxis(o.x, lo.x, hi.x);
      const y = clampAxis(o.y, lo.y, hi.y);
      // wider dead-zone: ignore small pivot shifts so the camera holds steady
      // through the reveal instead of twitching toward each newly-lit cell
      return Math.abs(x - o.x) < 1.5 && Math.abs(y - o.y) < 1.5 ? o : { x, y };
    });
  }, [anim.focused, anim.choice, anim.litCells, anim.activateReveal]);

  const mapperRef = useRef<Mapper | null>(null);
  const handleMapper = useCallback(
    (fn: Mapper) => {
      mapperRef.current = fn;
      setMapper(fn);
    },
    [setMapper]
  );

  const anchorOf = (ref: React.RefObject<HTMLElement>) => () => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const gapResolver = (key: string) => mapperRef.current?.(key) ?? null;

  // A Quick Start / generic game — the standard full board, outside the campaign.
  // Dev affordance: `?seed=N` in the URL makes quick starts reproducible.
  const startFresh = useCallback(() => {
    sfx.unlock(); sfx.click();
    setCelebrate(null);
    setCurrentLevel(null);
    dailyRun.day = null;
    dailyGameRef.current = null;
    const seedParam = new URLSearchParams(window.location.search).get("seed");
    // Quick Play sits at no depth, so it pays what the player has EARNED
    const extraGems = extraGemsFor();
    start({ handSize: 9 + extraGems, extraGems, ...(seedParam ? { seed: Number(seedParam) } : {}) });
    setScreen("game");
  }, [start]);
  // The REDDIT DAILY CHALLENGE — a quick game on today's shared seed; the score
  // lands on the subreddit leaderboard when the run ends.
  const dailyGameRef = useRef<{ day: string; seed: number; metric: DailyMetric } | null>(null);
  const startDaily = useCallback((day: string, seed: number, metric: DailyMetric) => {
    sfx.unlock(); sfx.click();
    setCelebrate(null);
    setCurrentLevel(null);
    dailyRun.day = day;
    dailyRun.metric = metric;
    dailyGameRef.current = { day, seed, metric };
    // THE COMPETITIVE BOARD IS EXACT (web parity): dailyGame pins the whole
    // config — no difficulty shift, no bonus gems, no bust rescue — and exact
    // mode keeps it that way, so every player fights the identical board and
    // the server's replay verifier re-derives it from the seed alone. The
    // refine-rig parity rule rides in dailyGame (a "Most Nebulite refined" day
    // deals the campaign's guaranteed refinable setup).
    start({ ...dailyGame(seed, metric), exact: true });
    startRecording(); // ANTI-CHEAT: capture the move stream for server verification
    setScreen("game");
  }, [start]);

  // ================= YOU vs THE HOUSE — the Broker duel (local versus) =================
  // The stake is escrowed up front: win pays 2x back, a tie refunds, a loss
  // (or walking out mid-game after your first placement) forfeits it to the house.
  const newRunSeed = () => (Math.random() * 0x7fffffff) | 0 || 1;
  const [brokerDuel, setBrokerDuel] = useState<{ bet: number; tier: BrokerTier } | null>(null);
  const brokerDuelRef = useRef(brokerDuel);
  useEffect(() => { brokerDuelRef.current = brokerDuel; });
  const stateRef2 = useRef(state);
  useEffect(() => { stateRef2.current = state; });
  // the Broker's transient catchphrase bubble (rendered by CoopFooterHud)
  const [championSay, setChampionSay] = useState<{ seat: number; champion: string; text: string; id: number } | null>(null);
  const champSeq = useRef(0);
  const championSayTimer = useRef<number | null>(null);
  // REDDIT ADAPTATION: the player has no champion at the Broker's table and there
  // is no online versus here, so champion catchphrases for PLAYER seats are a
  // no-op — only the Broker speaks (via setFace's duelLines below).
  const sayChampionRef = useRef<(seat: number, event: string) => void>(() => {});
  // HER FACE — the duel-only expression system (5 portraits, min 4s each,
  // some held until a side's next placement; CMS lines ride the same bubble)
  const [brokerFace, setBrokerFace] = useState<"neutral" | "shocked" | "angry" | "defeated" | "laugh">("neutral");
  const faceRef = useRef<{ face: typeof brokerFace; since: number; hold: "brokerMove" | "playerMove" | "sticky" | null }>({ face: "neutral", since: 0, hold: null });
  const faceTimer = useRef<number | null>(null);
  const setFace = useCallback((face: "neutral" | "shocked" | "angry" | "defeated" | "laugh", hold: "brokerMove" | "playerMove" | "sticky" | null) => {
    if (faceRef.current.hold === "sticky" && hold !== "sticky") return; // defeat/victory owns the face
    faceRef.current = { face, since: Date.now(), hold };
    if (faceTimer.current) window.clearTimeout(faceTimer.current);
    setBrokerFace(face);
    const lines = (CONTENT.characters.duelLines ?? {}) as Record<string, string>;
    const line = face === "laugh" && hold === "sticky" ? lines.victory : lines[face];
    if (face !== "neutral" && line) {
      champSeq.current += 1;
      setChampionSay({ seat: brokerSeatOf(stateRef2.current), champion: "broker", text: line, id: champSeq.current });
      if (championSayTimer.current) window.clearTimeout(championSayTimer.current);
      championSayTimer.current = window.setTimeout(() => setChampionSay(null), 5200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** a held expression relaxes to neutral once its release condition met AND 4s shown */
  const relaxFace = useCallback((movedBy: "brokerMove" | "playerMove") => {
    const f = faceRef.current;
    if (f.hold !== movedBy) return;
    const left = Math.max(0, 4000 - (Date.now() - f.since));
    if (faceTimer.current) window.clearTimeout(faceTimer.current);
    faceTimer.current = window.setTimeout(() => {
      if (faceRef.current.hold !== "sticky") { faceRef.current = { face: "neutral", since: Date.now(), hold: null }; setBrokerFace("neutral"); }
    }, left);
  }, []);
  // her activated combos, for the ANGRY trigger: cells SHE activated that the
  // player later banks. Reset per duel.
  const herCellsRef = useRef<Set<string>>(new Set());

  // the opening RITUAL reseats players (highest gem opens as seat 0) — the
  // Broker is passed as ENTRY 1, so her SEAT comes from seatByEntry, never
  // assumed (bug049: she won the ritual and played from the player's side)
  const brokerSeatOf = (s: GameState): 0 | 1 => (s.versus?.seatByEntry?.[1] ?? 1) as 0 | 1;
  const duelPlayerSeatOf = (s: GameState): 0 | 1 => (s.versus?.seatByEntry?.[0] ?? 0) as 0 | 1;
  const duelSettledRef = useRef(false);
  // re-arm the settle guard whenever no result is on the table (a fresh game)
  useEffect(() => { if (!state.versus?.result) duelSettledRef.current = false; }, [state.versus?.result]);
  const duelStartLatch = useRef(0);
  const startBrokerDuel = useCallback((bet: number) => {
    // double-fire guard: multiple call sites debit the wallet — a double tap
    // before the screen swap must not escrow two stakes for one game
    if (Date.now() - duelStartLatch.current < 1500) return;
    if (loadWallet() < bet) return;
    duelStartLatch.current = Date.now();
    sfx.unlock(); sfx.click();
    addNebulite(-bet); // the stake goes to the table
    duelSettledRef.current = false;
    faceRef.current = { face: "neutral", since: 0, hold: null };
    setBrokerFace("neutral");
    herCellsRef.current = new Set();
    // a rematch reuses the "duel" tracker key — reset per-game event state or
    // busts/idle/victory-shown carry across games (stale defeated face, no splash)
    champTrackRef.current = null;
    victoryShownRef.current = null;
    pendingPlaceRef.current = null;
    duelPlayerMovedRef.current = false; // fresh table -> the refund window re-opens
    setBrokerDuel({ bet, tier: tierForBet(bet) });
    setCelebrate(null);
    setCurrentLevel(null);
    dailyRun.day = null;
    dailyGameRef.current = null;
    // HOUSE RULE: the clearer takes the WHOLE board-clear bonus (no split) —
    // online versus keeps the classic split on its bigger board (Thys 2026-08-22)
    start({ seed: newRunSeed(), versus: { names: [CONTENT.friends.playerFallback, CONTENT.characters.duel.opponentName], clearWinnerTakesAll: true } });
    setScreen("game");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);
  // leaving a duel mid-game (exit / play again elsewhere) keeps the forfeit:
  // the stake was already taken — clear the table when a NON-duel run starts
  useEffect(() => {
    if (!state.versus && brokerDuelRef.current) setBrokerDuel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // THE SILENT PASS: once a placement's beats settle (and any BANK NOW / CLAIM
  // window has closed), the turn flows on its own — the footer's animated YOUR
  // TURN block is the announcement, not a popup. This is the ONLY thing that
  // hands a turn over after a move: without it a duel deadlocks on the very
  // first placement (web parity — App.tsx's `passReady`).
  const together = state.versus;
  const passReady =
    !!together?.moved && screen === "game" && state.phase === "playing" &&
    !anim.playing && !settling && !earlyBankOffer && !claimOffer && !anim.choice;
  useEffect(() => {
    if (!passReady) return;
    const t = setTimeout(() => versusPass(), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passReady]);

  // the handoff chime — keyed to the TURN ITSELF, so a forced mid-action swap
  // (a hand emptying) announces exactly like a normal pass
  const coopTurnRef = useRef<number | null>(null);
  useEffect(() => {
    const turn = state.versus?.turn ?? null;
    if (turn !== null && coopTurnRef.current !== null && turn !== coopTurnRef.current) sfx.turnChange();
    coopTurnRef.current = turn;
  }, [state.versus?.turn]);

  // THE REFUND WINDOW: has the PLAYER placed anything this duel? Latched from
  // the turn state (the Broker winning the ritual and moving first must NOT
  // close the window — only the player's own first placement does).
  const duelPlayerMovedRef = useRef(false);
  useEffect(() => {
    if (!brokerDuel || !state.versus) return;
    if (state.versus.moved && state.versus.turn === duelPlayerSeatOf(state)) duelPlayerMovedRef.current = true;
  }, [state, brokerDuel]);
  // HER TURN — the AI driver. Runs when the board settles on her seat: think for
  // a human beat, optionally rotate to the chosen tile, then place (or cash
  // out). The BANK NOW window gets its own decision below.
  const pendingPlaceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!brokerDuel || screen !== "game" || !state.versus) return;
    if (state.phase !== "playing" || state.versus.turn !== brokerSeatOf(state) || state.versus.moved) return;
    if (anim.playing || settling || earlyBankOffer || claimOffer) return;
    let cancelled = false;
    // a rotation from the previous pass re-fires this effect (hand is in the
    // deps, so the cleanup cancelled the scheduled place) — finish the committed
    // placement instead of re-thinking, which doubled her delay and let tier-1
    // noise re-roll into another rotation
    if (pendingPlaceRef.current) {
      const cell = pendingPlaceRef.current;
      pendingPlaceRef.current = null;
      const t = window.setTimeout(() => { if (!cancelled) onPlace(cell); }, 420);
      return () => { cancelled = true; window.clearTimeout(t); };
    }
    const think = window.setTimeout(() => {
      if (cancelled) return;
      const action = chooseBrokerAction(state, brokerDuel.tier, Math.random, { noBank: true });
      if (!action) { versusPass(); return; } // nothing she can do — hand it back
      if (action.kind === "cashout") { cashOutNow(); return; }
      if (action.kind === "place" && (action.rotateTo ?? 0) > 0 && action.cell) {
        pendingPlaceRef.current = action.cell;
        rotateHand(action.rotateTo!);
      } else if (action.kind === "place" && action.cell) {
        onPlace(action.cell);
      }
    }, 850 + Math.random() * 700);
    return () => { cancelled = true; window.clearTimeout(think); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerDuel, screen, state, anim.playing, settling, earlyBankOffer, claimOffer]);

  // her BANK NOW window: bank when the maths says so, else let it lapse
  useEffect(() => {
    if (!brokerDuel || !state.versus || state.versus.turn !== brokerSeatOf(state) || !earlyBankOffer) return;
    const t = window.setTimeout(() => {
      if (shouldBankNow(stateRef2.current, earlyBankOffer.cellKey, brokerDuel.tier)) bankNow();
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerDuel, earlyBankOffer, state.versus?.turn]);

  // a completed daily becomes a DAILY CLEARED slide and pays its reward —
  // shared by the run-end path and the duel settle (web parity)
  const dailySlidesFor = (todays: DailyEntry[], newly: string[]): { slides: DailyClearedSlide[]; neb: number } => {
    const per = CONTENT.challenges.nebulitePerDaily ?? 5;
    const slides: DailyClearedSlide[] = [];
    let neb = 0;
    for (const id of newly) {
      const entry = todays.find((e) => e.id === id);
      if (!entry) continue;
      if (entry.rewardKind === "nebulite") { neb += per; slides.push({ entry, reward: { kind: "nebulite", amount: per } }); }
      else {
        const earned = earnItem(entry.rewardKind, entry.rewardId);
        if (earned) { slides.push({ entry, reward: earned }); markUnseen([earned]); setCollectionAlert(true); }
        else { neb += per; slides.push({ entry, reward: { kind: "nebulite", amount: per } }); } // item already owned — the daily still pays
      }
    }
    return { slides, neb };
  };

  // SETTLE the duel the moment the result lands: win pays 2x the stake, a tie
  // refunds it, a loss pays nothing (the stake was escrowed at the start).
  // A win also counts toward today's "versus" dailies (and can complete them).
  useEffect(() => {
    const r = state.versus?.result;
    if (!r || duelSettledRef.current || !brokerDuel) return;
    duelSettledRef.current = true;
    const pSeat = duelPlayerSeatOf(state);
    if (r.winner === pSeat) setFace("defeated", "sticky");
    else if (r.winner !== -1) setFace("laugh", "sticky"); // the house wins — she savours it
    if (r.winner === pSeat) addNebulite(brokerDuel.bet * 2);
    else if (r.winner === -1) addNebulite(brokerDuel.bet);
    if (r.winner === pSeat) {
      const todays = pickDailyChallenges(todayKey());
      const { slides, neb } = dailySlidesFor(todays, recordVersusWin(todays, "duel"));
      const doneNow = loadDaily().done;
      const setDoneNow = todays.length > 0 && todays.every((c) => doneNow.includes(c.id));
      const total = neb + (setDoneNow && slides.length ? SET_BONUS_NEBULITE : 0);
      if (total > 0) addNebulite(total);
      if (slides.length) setDailyCleared((prev) => ({ slides: [...(prev?.slides ?? []), ...slides], withSetDone: (prev?.withSetDone ?? false) || setDoneNow }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.versus?.result, brokerDuel]);

  // VICTORY SPLASH (versus): a brief celebration of the WINNER'S champion,
  // shown once per match over the end card, before the summary is read.
  // Auto-dismisses (tap skips); the player has no champion, so only HER wins splash.
  const [victorySplash, setVictorySplash] = useState<{ champion: string; name: string } | null>(null);
  const victoryShownRef = useRef<string | null>(null);
  const victoryTimer = useRef<number | null>(null);
  useEffect(() => {
    const vres = state.versus?.result;
    if (!vres || vres.winner < 0 || state.phase === "playing" || screen !== "game") return;
    if (victoryShownRef.current === "duel") return;
    victoryShownRef.current = "duel"; // once per match, champion known or not
    const winnerChamp = brokerDuelRef.current
      ? (vres.winner === duelPlayerSeatOf(state) ? null : "broker")
      : null;
    if (!winnerChamp) return;
    setVictorySplash({ champion: winnerChamp, name: state.versus!.names[vres.winner as 0 | 1] });
    if (victoryTimer.current) window.clearTimeout(victoryTimer.current);
    victoryTimer.current = window.setTimeout(() => setVictorySplash(null), 2800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.versus?.result, state.phase, screen]);

  // per-game event tracker: busts per seat, idle-once, chain baseline — drives
  // HER FACE (the player's champion lines are a no-op on Reddit, see sayChampionRef)
  const champTrackRef = useRef<{ key: string; busts: [number, number]; saidIdle: boolean; chains: number; lives: number; score: number; act: string[]; turn: number; lastActivity: number } | null>(null);
  useEffect(() => {
    const tg = state.coop ?? state.versus;
    if (!brokerDuelRef.current || !tg) { champTrackRef.current = null; return; }
    const key = "duel";
    const chains = (state.chainCounts.Convergence ?? 0) + (state.chainCounts.Harmony ?? 0) + (state.chainCounts.Accord ?? 0) + (state.chainCounts.Sweep ?? 0);
    const t = champTrackRef.current;
    if (!t || t.key !== key) {
      champTrackRef.current = { key, busts: [0, 0], saidIdle: false, chains, lives: state.livesLeft, score: state.score, act: state.activatedCells.slice(), turn: tg.turn, lastActivity: Date.now() };
      return;
    }
    const actor = t.turn; // the seat whose action produced this state
    const bSeat: number = brokerSeatOf(state);
    const sameTurn = tg.turn === t.turn;
    // chains compare only while the turn is UNCHANGED — the counters swap
    // seats on the flip exactly like lives (cross-turn compare false-fired)
    if (sameTurn && chains > t.chains && actor === bSeat) setFace("laugh", "playerMove"); // her 3-chain — she gloats until you answer
    if (sameTurn) {
      // maintain HER activated combos; a player bank that eats one riles her
      const prevAct = new Set(t.act);
      const nextAct = new Set(state.activatedCells);
      if (actor === bSeat) {
        for (const c of nextAct) if (!prevAct.has(c)) herCellsRef.current.add(c);
      } else {
        const removed = [...prevAct].filter((c) => !nextAct.has(c));
        const ateHers = removed.some((c) => herCellsRef.current.has(c));
        for (const c of removed) herCellsRef.current.delete(c);
        if (ateHers && state.score > t.score) setFace("angry", "brokerMove");
        else if (chains > t.chains) setFace("shocked", "brokerMove"); // your 3-chain stuns her
      }
      // a completed action lets held expressions relax (min 4s enforced inside)
      relaxFace(actor === bSeat ? "brokerMove" : "playerMove");
    }
    // lives compare only while the turn is UNCHANGED — in versus the state's
    // livesLeft swaps to the other player's on the turn flip (hot-seat mirror)
    if (sameTurn && state.livesLeft < t.lives) {
      t.busts[actor] = (t.busts[actor] ?? 0) + 1;
      if (actor === bSeat && t.busts[actor] >= 3) setFace("defeated", "sticky"); // her third bust breaks her
    }
    t.chains = chains; t.lives = state.livesLeft; t.score = state.score; t.act = state.activatedCells.slice(); t.turn = tg.turn; t.lastActivity = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // SPECTATING her turn: taps on the board are hers, not yours
  const spectating = !!brokerDuel && !!state.versus && state.versus.turn === brokerSeatOf(state);
  // THE WORD GATE (Thys 2026-08-26): the commentary belongs to the player —
  // the Broker is silenced (both hands share one viewport). The only versus on
  // this build IS the duel, so the rule is that simple. At word time the turn
  // has not yet passed, so state.versus.turn is the mover's seat.
  const wordCtxRef = useRef({ turn: null as number | null, playerSeat: null as number | null, isDuel: false });
  wordCtxRef.current = {
    turn: state.versus?.turn ?? null,
    playerSeat: brokerDuel ? duelPlayerSeatOf(state) : null,
    isDuel: !!brokerDuel && !!state.versus,
  };
  useEffect(() => {
    setWordGate(() => {
      const c = wordCtxRef.current;
      return !c.isDuel || (c.playerSeat !== null && c.turn === c.playerSeat);
    });
    return () => setWordGate(() => true);
  }, []);
  // Restart in a duel RE-STAKES the table: the same bet if the wallet covers it,
  // else the minimum stake, else the button greys out (web 9d4a7a8)
  const duelRestartBet = !brokerDuel ? null
    : nebulite >= brokerDuel.bet ? brokerDuel.bet
    : nebulite >= DUEL_MIN_BET ? DUEL_MIN_BET
    : null;


  // QUICK PLAY routes to the COMMUNITY DAILY until the player has a score on
  // today's board — the shared board IS the quick game of the day. Once scored
  // (or outside Reddit, or with a dev ?seed), quick play deals a fresh board.
  const startQuick = useCallback(() => {
    if (new URLSearchParams(window.location.search).get("seed")) { startFresh(); return; }
    void (async () => {
      const d = await fetchDaily();
      if (d && d.yourScore == null) startDaily(d.day, d.seed, d.metric);
      else startFresh();
    })();
  }, [startDaily, startFresh]);
  // Launch a campaign level's ENGINE game with its generator parameters. The NEXT
  // level's unlock requirement opens the log ("Bank 3 times to unlock Level 2") —
  // the goal to play for — as long as it hasn't been unlocked yet.
  const launchLevel = useCallback((level: Level, extra?: { obstacleSeed?: number }) => {
    sfx.unlock(); sfx.click();
    dailyRun.day = null; // a campaign level is never a daily attempt
    dailyGameRef.current = null;
    setCelebrate(null);
    setCurrentLevel(level);
    const { side, nebulites, dross, collapseAt1, collapseAt2, gaps, obstacles, boardShape, singularityAt } = level.params;
    const next = LEVELS[level.num + 1];
    const openingLog = next && next.num > storedFrontier() ? `${next.unlock} Level ${next.num}` : undefined;
    // RIG the board when clearing THIS level must let the player refine Nebulite(s)
    // — i.e. the NEXT level unlocks via "Acquire N Nebulite". Guarantees a 12-tile
    // Duneglass + Vigilite setup so the refine is achievable.
    const nebuliteRig = LEVEL_DEFS[level.num + 1]?.unlockRule?.type === "nebuliteAcquired";
    // The teaching levels (1 The Academy, 2 Sector 01 Outpost) skip the 3-2-1-GO
    // count-in — they carry `countdown: false` in their defs, because their tips
    // briefings ARE their intros and the count-in would just talk over them.
    const countdown = level.countdown;
    // EXTRA GEMS: the depth reward (content achievements.extraGem tiers). The
    // LEVEL decides the reward, not the frontier — replaying an old board plays
    // it as it was. (The per-level `extraTiles` param is retired, matching web.)
    const extraGems = extraGemsForLevel(level.num);
    start({
      side, nebulites, dross, collapseAt1, collapseAt2, gaps, obstacles, shape: boardShape, singularityAt,
      handSize: 9 + extraGems, extraGems, openingLog, countdown, nebuliteRig,
      // the GUIDED boards (Level 0's practice runs, Level 1 The Academy's
      // closing board) deal kindly — see engine tutorialRig/rigRevealHand
      tutorialRig: level.num === 0 || level.num === 1,
      ...extra,
    });
    setScreen("game");
    // SECTOR 01 OUTPOST (Level 2) introduces the Nebulite — its explainer pops over
    // the fresh board before play begins (only on a fresh launch, not on Restart).
    // the Nebulite briefing auto-opens on the FIRST Sector 01 Outpost launch only
    if (level.num === 2 && !extra && !academyFlags().seenIntro) {
      markIntroSeen();
      setAcademyTips({ open: true, page: 0, solo: true });
    }
    // PUZZLE LEVEL: the "Uncover the Picture" briefing pops over the board the first
    // time this puzzle level is opened (not a Restart). Tracked per level num so a
    // reorganised campaign (a puzzle moving levels) still shows it at its new home.
    if (level.puzzleImage && !extra && !puzzleIntroSeen(level.num)) {
      markPuzzleIntroSeen(level.num);
      setPuzzleIntroOpen(true);
    }
  }, [start]);
  // Play a level from the menu. Level 0 opens the SCRIPTED tutorial walkthrough
  // first; its final Continue hands off into the real Level-0 run (launchLevel).
  const startLevel = useCallback((level: Level) => {
    if (level.num === 0) {
      sfx.unlock(); sfx.click();
      setCelebrate(null);
      setCurrentLevel(level);
      setScreen("tutorial0");
      return;
    }
    launchLevel(level);
  }, [launchLevel]);
  // The scripted Tutorial finished: unlock every app feature, hand over the
  // FIRST sticker (Blue Giant) — granting it here also SUPPRESSES the automatic
  // reward-reveal it would otherwise trigger, since it's now already owned — and
  // raise the custom completion pop-up. Its Continue drops into the Level-0 run.
  // The GUIDED walkthrough's final Continue: unlock the app's features (the user
  // is fine with this happening after the guided bit) and hand into the UNGUIDED
  // Level-0 engine game. No reward pop-up yet — that fires at the very end of the
  // tutorial LEVEL (the unguided game ending, or an Exit), in finishTutorial.
  const completeTutorial = useCallback(() => {
    markTutorialDone();
    setTutDone(true);
    haptic("unlock");
    launchLevel(LEVELS[0]);
  }, [launchLevel]);
  // The tutorial LEVEL is over (unguided game ended, or the player hit Exit at
  // any point): unlock features, hand over the FIRST sticker (Blue Giant) the one
  // and only time, and show the celebration. Idempotent — a revisit owns Blue
  // Giant already, so it just leaves. Nothing else is ever earned here.
  const finishTutorial = useCallback(() => {
    markTutorialDone();
    setTutDone(true);
    const r = earnItem("sticker", "bluegiant");
    if (r) {
      haptic("unlock");
      markUnseen([r]);
      setCollectionAlert(true);
      setTutorialCompleteOpen(true);
    } else {
      setCelebrate(null);
      setScreen("levels");
    }
  }, []);
  // "Restart" inside a game re-runs the SAME context (the current level, or a quick
  // game) — never back into the tutorial script (that has its own Restart). The
  // gems, gaps and specials respawn fresh, but the BOARD ITSELF (its obstacle
  // holes) stays exactly as it was — a whole new board mid-level feels wrong.
  // Launching from the levels menu still generates a fresh board.
  const startGame = useCallback(() => {
    if (currentLevel) launchLevel(currentLevel, { obstacleSeed: state.obstacleSeed });
    else if (dailyGameRef.current) {
      // the run was the DAILY CHALLENGE — Play again / Restart re-enters the same
      // daily: the same shared board, and the next result still counts
      const dcx = dailyGameRef.current;
      startDaily(dcx.day, dcx.seed, dcx.metric);
    } else start({ obstacleSeed: state.obstacleSeed });
  }, [currentLevel, launchLevel, start, startDaily, state.obstacleSeed]);

  // On game end, record the score and (for a campaign level) the per-level result,
  // and evaluate whether the run unlocks the next level. `endNav` drives the end
  // card's Continue button: set when the next level is unlocked (fresh = it JUST
  // unlocked, which plays the menu celebration). Guarded so it fires once per game.
  const recordedRef = useRef(false);
  const [endNav, setEndNav] = useState<{ nextNum: number; fresh: boolean } | null>(null);
  // the level-menu unlock celebration payload (set when Continue is pressed)
  const [celebrate, setCelebrate] = useState<{ played: number; next: number | null } | null>(null);

  // THE BROKER'S PITCH — the start-up promo card. Fires on the Ascent landing when:
  // >min-stake Nebulite, today's three dailies DONE, the table unlocked,
  // and at most once per 48h / once per local day (persisted timestamp).
  const [brokerPromo, setBrokerPromo] = useState(false);
  const [houseSlideFirst, setHouseSlideFirst] = useState(false);
  // the house-first hint is one visit's worth — leaving the tab clears it
  useEffect(() => { if (homeTab !== "challenges" && houseSlideFirst) setHouseSlideFirst(false); }, [homeTab, houseSlideFirst]);
  const promoTriedRef = useRef(false);
  useEffect(() => {
    if (promoTriedRef.current || brokerPromo) return;
    if (!(screen === "levels" && homeTab === "ascent" && !celebrate && !abilityRevealOpen && !revealOpen)) return;
    promoTriedRef.current = true; // the start-up landing is consumed either way
    const last = brokerPromoSeenAt();
    const now = Date.now();
    if (now - last < 48 * 3600_000) return;
    if (new Date(last).toDateString() === new Date(now).toDateString()) return;
    if (loadWallet() <= DUEL_MIN_BET) return; // strictly MORE than the min stake to be worth pitching
    if (storedFrontier() < 2) return; // her table is still locked
    const dailyNow = loadDaily();
    const todays = pickDailyChallenges(todayKey());
    if (!(todays.length > 0 && todays.every((c) => dailyNow.done.includes(c.id)))) return;
    markBrokerPromoSeen();
    setBrokerPromo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, homeTab, celebrate, abilityRevealOpen, revealOpen, brokerPromo]);

  // AMBIENT DAILY CLEARED: a queue skipped at its run end (Play again / exit ✕)
  // resurfaces once the player lands on the Ascent — this session only, never
  // across an app restart (the state deliberately lives in memory alone)
  useEffect(() => {
    if (!dailyCleared || dailyClearedOpen || abilityRevealOpen || revealOpen) return;
    if (!(screen === "levels" && homeTab === "ascent" && !celebrate && !dailyPopup && !communityPopup)) return;
    const t = window.setTimeout(() => {
      dailyClearedSourceRef.current = "ambient";
      setDailyClearedOpen(true);
    }, 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyCleared, dailyClearedOpen, screen, homeTab, celebrate, dailyPopup, communityPopup, abilityRevealOpen, revealOpen]);

  // AMBIENT ability celebrations: an unlock pop-up skipped at its run end
  // resurfaces on the Ascent or shortly after a run starts — until seen
  useEffect(() => {
    if (abilityRevealOpen) return;
    const onAscent = screen === "levels" && homeTab === "ascent" && !celebrate;
    const atGameStart = screen === "game" && state.phase === "playing" && state.moves === 0;
    if (!onAscent && !atGameStart) return;
    const t = window.setTimeout(() => {
      const pending = pendingAbilityCelebrations();
      if (!pending.length) return;
      abilityRevealSourceRef.current = "ambient";
      setAbilityUnlocks(pending);
      setAbilityRevealOpen(true);
    }, atGameStart ? 1800 : 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, homeTab, celebrate, state.phase, state.moves, abilityRevealOpen]);
  useEffect(() => {
    if (state.phase === "playing") { recordedRef.current = false; setEndNav(null); setRewards([]); setRevealOpen(false); setAbilityUnlocks([]); setAbilityRevealOpen(false); setPuzzleReveal(null); setPuzzleRevealPending(null); setDailyResult(null); return; }
    if (recordedRef.current) return;
    recordedRef.current = true;
    // GAME OVER = busted out of lives (not a cash-out). Nothing ACQUIRED in a game-over
    // run counts toward any target: it doesn't advance the campaign (below), and its
    // resource gains — Nebulites refined, dross cleared, banks — are zeroed out of the
    // stats/dailies/grants/milestones/achievements below, matching the wallet Nebulite
    // forfeit. A win, cash-out, or running out of tiles all still count in full; the
    // leaderboard score and skill feats (biggest bank, reached GLINT RUSH) are kept.
    const gameOver = state.phase === "lost" && state.cashedOut === 0 && state.livesLeft <= 0;
    const run: RunResult = {
      score: state.finalScore, banks: state.banks, busts: state.busts,
      coreBanked: state.coreBanked, nebulitesAcquired: state.nebulitesRefined,
      drossCleared: state.drossCleared,
      boardCleared: state.phase === "won",
    };
    // HARD TUTORIAL GATE: Level 0 (the Tutorial) NEVER earns anything — no
    // leaderboard, no stats, no dailies, no stickers/achievements/Nebulite — not
    // even on a revisit after everything is unlocked. Only the campaign frontier
    // advances (progression), and the FIRST completion hands over the first MUSIC
    // TRACK (Interstellar) via the celebration pop-up — the Academy (Level 1),
    // not this level, is the one that hands over Blue Giant.
    if (currentLevel?.num === 0) {
      const fresh = completeLevel(currentLevel.num, run);
      const next = LEVELS[currentLevel.num + 1];
      const nav = next && (fresh || levelStatus(next.num) !== "locked") ? { nextNum: next.num, fresh } : null;
      markTutorialDone(); // Level 0 COMPLETED → the tabs + earning unlock (not before)
      setTutDone(true);
      setPreAcademy(storedFrontier() < 2);
      const r = earnItem("music", "interstellar"); // non-null only on the FIRST completion
      if (r) {
        haptic("unlock");
        markUnseen([r]);
        setCollectionAlert(true);
        setTutorialCompleteOpen(true); // suppresses the normal end card (see its guard)
      } else if (nav) {
        setEndNav(nav); // a revisit shows the normal end card purely to navigate onward
      }
      return;
    }
    // GAME-OVER FORFEIT (web 2026-08-04, ported with the freeze lift): a busted
    // run forfeits ALL competitive output — the personal top scores, the
    // community all-time board, and EVERY daily metric, skill feats included.
    // What survives is the record of EXPERIENCE: reached GLINT RUSH, a game
    // played, the no-bust streak resetting.
    if (!gameOver) {
      recordScore(state.finalScore, currentLevel ? levelScoreLabel(currentLevel) : "Quick Start");
      // COMMUNITY LEADERBOARD: every legitimately finished run reports its score
      // (the server keeps each redditor's best); fire-and-forget, a no-op outside Reddit
      void submitAllTimeScore(state.finalScore, currentLevel ? levelScoreLabel(currentLevel) : "Quick Start");
    }
    // DAILY CHALLENGE run -> submit today's METRIC to the subreddit board.
    // A forfeited run submits nothing on ANY metric.
    if (dailyRun.day && !currentLevel) {
      // the fold + the metric both come from the SHARED module the server
      // verifier replays through — this block used to re-derive the value by
      // hand, which is exactly how a client and its verifier drift apart.
      const snap = dailySnapshot(state);
      const metricValue = measureDaily(dailyRun.metric, snap);
      // YOUR SCORE — the board's own number, which only reaches the player here.
      // `score` is skipped (the end card leads with it); every other metric,
      // `nebulite` included, gets its moment. A bust-out forfeits to 0, so the
      // reached value rides along to be shown struck through beside it.
      if (dailyRun.metric !== "score") {
        setDailyResult({
          metric: dailyRun.metric,
          reached: measureDaily(dailyRun.metric, { ...snap, gameOver: false }),
          submitted: metricValue,
          forfeited: snap.gameOver,
        });
      }
      // zeros never go up (a forfeited game-over would read as a broken "0" row)
      // the recorded stream rides along — the server replays it and posts the
      // score the replay produces (the metricValue is the legacy fallback)
      if (metricValue > 0) void submitDailyScore(metricValue, dailyRun.day, getRecordedMoves());
      dailyRun.day = null;
    }
    // fold this run into the lifetime stats + today's daily-challenge progress.
    // GAME-OVER FORFEIT (2026-08-04): a busted run forfeits EVERYTHING it could
    // be credited for — resources, score, biggest bank, chains, feat latches
    // (Harmonizer, Full Drift). What survives is the record of EXPERIENCE:
    // reached GLINT RUSH (+count), a game played, the streak resetting.
    const finished = {
      score: gameOver ? 0 : state.finalScore,
      won: state.phase === "won",
      busts: state.busts,
      drossCleared: gameOver ? 0 : state.drossCleared,
      nebulitesAcquired: gameOver ? 0 : state.nebulitesRefined,
      banks: gameOver ? 0 : state.banks,
      reachedRush: state.deathMatch,
      cashedOut: state.cashedOut > 0,
      fullDrift: !gameOver && (state.comboCounts.FullDrift ?? 0) > 0,
      fullDrifts: gameOver ? 0 : state.comboCounts.FullDrift ?? 0,
      levelNum: currentLevel?.num ?? -1,
      // Shape Shifter counts any non-hexagon EXCEPT the square — the square has
      // its own achievement (Four Corners)
      shaped: currentLevel ? currentLevel.params.boardShape !== "hexagon" && currentLevel.params.boardShape !== "square" : false,
      square: currentLevel?.params.boardShape === "square",
      harmony: !gameOver && (state.chainCounts.Harmony ?? 0) > 0,
      boss: currentLevel?.boss === true,
      maxBankScore: gameOver ? 0 : state.maxBankScore,
      chains: gameOver
        ? { convergence: 0, harmony: 0, accord: 0, turn: 0 }
        : {
            convergence: state.chainCounts.Convergence ?? 0,
            harmony: state.chainCounts.Harmony ?? 0,
            accord: state.chainCounts.Accord ?? 0,
            turn: state.chainCounts.Sweep ?? 0, // internal name; player-facing = CMS
          },
    };
    const prevStats = loadStats(); // pre-run tallies, for milestone tier crossings
    // TUTORIAL GATE: before the Tutorial is finished nothing is earned — daily
    // progress isn't even tallied (so a daily can't be silently spent), and the
    // grant/reveal/Nebulite block below is skipped entirely.
    const newDailies = recordRun(finished, tutDone ? (r) => evalDailyForRun(todayKey(), r) : () => []);
    // BONUS-GEM ABILITIES: every EARNED gem whose celebration hasn't been seen
    // gets the unlock pop-up (before the collection reveal) — persistent until a
    // Continue actually shows it (Play again / exit / reload used to discard it).
    const postStats = loadStats();
    const newAbilities: AbilityUnlock[] = pendingAbilityCelebrations(postStats);
    // record the campaign result + advance the frontier FIRST, so a "level"-trigger
    // Collection item (e.g. a puzzle sticker) sees the just-unlocked level below.
    let endNavNext: { nextNum: number; fresh: boolean } | null = null;
    if (currentLevel) {
      recordLevelResult(currentLevel.num, run);
      // A level's target only counts on a LEGITIMATE finish — cleared the board, cashed
      // out, or ran out of tiles. A game over never advances the campaign, even if the
      // target's number was hit mid-run (see `gameOver` above). Exit doesn't reach here.
      // THE TWO TUTORIAL LEVELS ARE THE EXCEPTION: 0 and 1 complete on ANY finish — the
      // campaign never demands a successful run to leave the teaching behind, busting
      // out included. Levels 2+ keep the rule.
      const fresh = completeLevel(currentLevel.num, run, currentLevel.num === 1 || !gameOver);
      const next = LEVELS[currentLevel.num + 1];
      if (next && (fresh || levelStatus(next.num) !== "locked")) endNavNext = { nextNum: next.num, fresh };
      if (fresh) setPreAcademy(storedFrontier() < 2); // a frontier advance can end the pre-Academy phase
      // THE ACADEMY (Level 1) completed for the first time: hand over the first
      // sticker (Blue Giant) with its own pop-up. earnItem is the once-only gate —
      // a revisit already owns it and gets the normal end card instead. ANY end of
      // the closing run completes the Academy, busting out included: the pop-up's
      // Continue is the guaranteed way forward. A game over only forfeits the run's
      // RESOURCES (zeroed into `finished` above), never the completion.
      if (currentLevel.num === 1) {
        const r = earnItem("sticker", "bluegiant");
        if (r) {
          haptic("unlock");
          markUnseen([r]);
          setCollectionAlert(true);
          setAcademyCompleteOpen({ fresh: endNavNext?.fresh ?? false });
        }
      }
    }
    // EARNING — only once the Tutorial is complete (the first sticker is handed
    // over by the completion pop-up, not here).
    if (tutDone) {
      // auto-grant any Collection items whose FEAT this run satisfied
      const earned = reconcileGrants(finished, loadStats());
      // resolve each completed DAILY's reward: a points reward pays Nebulite (+5),
      // any other reward grants its linked Collection item
      // wallet credit: Nebulite must be BANKED to be earned — banked/cleared on
      // the board, or still in hand when a win/cash-out converts it (the engine
      // adds those to coresCollected). Refining alone pays nothing; refinement
      // remains its own family of goals/achievements. A LOST run (game over or
      // out of tiles) forfeits the lot — only a win or cash-out banks it.
      // A true LOST run (game over / out of tiles) forfeits the collected Nebulite; a
      // CASH-OUT is phase "lost" but cashedOut>0 — a voluntary bank, so it KEEPS them.
      const forfeitedRun = state.phase === "lost" && state.cashedOut === 0;
      let neb = forfeitedRun ? 0 : Math.max(0, state.coresCollected);
      // CLEARING THE BOARD DOUBLES the Nebulite banked from it (the EndCard plays a
      // ×2 count-up). A win is the only board-clear; a cash-out banks at 1×.
      if (state.phase === "won") neb *= 2;
      if (newDailies.length) {
        const todays = pickDailyChallenges(todayKey());
        // each completed daily becomes a DAILY CLEARED slide (the issuing
        // character celebrates the reward there — item dailies bypass the
        // generic RewardReveal, which keeps only the non-daily rewards)
        const cleared = dailySlidesFor(todays, newDailies);
        const clearedSlides = cleared.slides;
        neb += cleared.neb;
        // SET BONUS: closing out ALL THREE of today's dailies pays a one-off cherry
        // (the CHALLENGE COMPLETED finale celebrates it). Fires on the run that
        // completes the last one — a fully-done set completes 0 new dailies.
        const doneNow = loadDaily().done;
        const setDoneNow = todays.length > 0 && todays.every((c) => doneNow.includes(c.id));
        if (setDoneNow) neb += SET_BONUS_NEBULITE;
        if (clearedSlides.length) {
          // append to anything still pending from a skipped earlier run this session
          setDailyCleared((prev) => ({
            slides: [...(prev?.slides ?? []), ...clearedSlides],
            withSetDone: (prev?.withSetDone ?? false) || setDoneNow,
          }));
        }
      }
      // MILESTONE tiers this run crossed pay out for real: Nebulite adds to the
      // wallet, a Collection item is granted (skipped silently if already owned)
      for (const t of crossedMilestoneTiers(prevStats, loadStats())) {
        if (t.rewardKind === "nebulite") neb += Math.max(0, t.amount);
        else if (t.rewardId) {
          const r = earnItem(t.rewardKind as "sticker" | "music" | "theme", t.rewardId);
          if (r) earned.push(r);
        }
      }
      // every ACHIEVEMENT first earned this run pays +10 Nebulite
      const beforeAch = new Set(computeAchievements(prevStats).filter((a) => a.earned).map((a) => a.key));
      const newAch = computeAchievements(postStats).filter((a) => a.earned && !beforeAch.has(a.key));
      if (newAch.length) neb += newAch.length * 10;
      // one reveal, de-duped (a daily item can coincide with a feat grant)
      const seen = new Set<string>();
      const reveal = earned.filter((r) => { const k = r.kind + ":" + r.key; if (seen.has(k)) return false; seen.add(k); return true; });
      if (reveal.length) {
        setRewards(reveal);
        // flagged immediately so no skip path (Play again / exit / reload) loses them
        markUnseen(reveal);
        setCollectionAlert(true);
      }
      if (neb > 0) addNebulite(neb);
    }
    if (newAbilities.length) setAbilityUnlocks(newAbilities);
    // clearing a PUZZLE board reveals its full image in a pop-up (before the end
    // card) — but only AFTER the last tiles have peeled off on the board; the
    // deferred effect below waits for the animations to settle and the peel to run
    if (state.phase === "won" && currentLevel?.puzzleImage) setPuzzleRevealPending(currentLevel.puzzleImage);
    if (endNavNext) setEndNav(endNavNext);
  }, [state.phase, state.finalScore, state.banks, state.busts, state.coreBanked, state.nebulitesRefined, state.drossCleared, currentLevel, tutDone]);

  // DEFERRED PUZZLE REVEAL: hold the image pop-up until the win animations have
  // fully settled (the last combo's banked outline gone, tiles cleared) and the
  // final peel has had time to complete — so the player watches the picture
  // finish assembling on the board before it lifts off into the pop-up.
  useEffect(() => {
    if (!puzzleRevealPending) return;
    if (anim.playing || settling) return; // wait for the win sequence to resolve
    const t = window.setTimeout(() => {
      setPuzzleReveal(puzzleRevealPending);
      setPuzzleRevealPending(null);
    }, 1050); // room for the final tiles' staggered peel-off
    return () => clearTimeout(t);
  }, [puzzleRevealPending, anim.playing, settling]);

  // SECTOR 01 OUTPOST, beat two: after the FIRST bank fully resolves, the briefing
  // returns (the cycle — now leading with Clearing) exactly once per player.
  useEffect(() => {
    if (screen !== "game" || currentLevel?.num !== 2) return;
    if (state.banks < 1 || anim.playing || state.phase !== "playing") return;
    if (academyTips.open || academyFlags().seenBankTip || !academyFlags().seenIntro) return;
    markBankTipSeen(); // unlocks the Clearing slide
    const cycle = CONTENT.academyTips.pages.filter((pg) => academyPageUnlocked(pg.key));
    const clearingIdx = cycle.findIndex((pg) => pg.key === "clearing");
    setAcademyTips({ open: true, page: Math.max(0, clearingIdx) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.banks, anim.playing, screen, currentLevel, state.phase]);

  // First GLINT RUSH in Sector 01 Outpost: auto-open the rush tips page (once the
  // rush announcement animation has finished).
  useEffect(() => {
    if (screen !== "game" || currentLevel?.num !== 2) return;
    if (!state.deathMatch || anim.playing || state.phase !== "playing") return;
    if (academyFlags().seenRush) return;
    markRushSeen(); // unlocks the GLINT RUSH slide
    const cycle = CONTENT.academyTips.pages.filter((pg) => academyPageUnlocked(pg.key));
    const rushIdx = cycle.findIndex((pg) => pg.key === "rush");
    setAcademyTips({ open: true, page: Math.max(0, rushIdx) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.deathMatch, anim.playing, screen, currentLevel, state.phase]);

  // While an animation plays, render the frozen pre-commit board.
  const shownState: GameState = anim.playing && anim.freezeState ? anim.freezeState : state;

  // keep the measured board space current (fit layout only — max-width 979px)
  useEffect(() => {
    if (screen !== "game") return;
    const el = sheenRef.current;
    if (!el || typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 979px)");
    const measure = () => {
      if (!mq.matches) { setBoardFitH(null); return; }
      const h = Math.floor(el.clientHeight - 12); // sheen top padding + a hair of margin
      setBoardFitH(h > 220 ? h : 220);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    mq.addEventListener("change", measure);
    return () => { ro.disconnect(); mq.removeEventListener("change", measure); };
  }, [screen]);
  // THE TOAST BAND plays each burst in order (see useToastQueue) — it used to
  // render state.log[0], which showed only the LAST line of a multi-line turn.
  const { toast, toastId } = useToastQueue(state.log);

  // REGION THEME: a campaign level with a region carries its in-game treatment —
  // the atmosphere backdrop plus CSS-variable overrides that re-tint the chrome.
  // Generic ("blank") levels and Quick Start keep the standard violet nebula.
  // Settings › Themes can SWAP a region's board + track for its aligned faction
  // pack's — honoured only while that pack is actually owned, so a stale
  // setting (collection reset) silently falls back to the standard treatment.
  const levelRegionKey =
    currentLevel && currentLevel.params.theme === "regions" && currentLevel.region ? currentLevel.region : null;
  const swapPack = levelRegionKey ? factionForRegion(levelRegionKey) : undefined;
  const swapPackOwned = !!swapPack && factionOwned(swapPack);
  const themeSwap = levelRegionKey ? settings.regionThemes[levelRegionKey] : undefined;
  const shownRegionKey =
    levelRegionKey && themeSwap && swapPackOwned && factionTheme(swapPack)?.region === themeSwap
      ? themeSwap
      : levelRegionKey;
  const levelRegion = shownRegionKey ? REGIONS[shownRegionKey] ?? null : null;
  // a board theme EQUIPPED in Collection tints quick / blank boards in-game;
  // levels that carry their own region always win. Only applies while playing.
  const equippedRegion = settings.boardTheme && REGIONS[settings.boardTheme] ? REGIONS[settings.boardTheme] : null;
  const regionTheme = levelRegion ?? (screen === "game" ? equippedRegion : null);

  // the OVERSCROLL band (above the top bar on iOS rubber-band) shows the HTML
  // element's paint — keep it matched to the current world
  useEffect(() => {
    const el = document.documentElement;
    el.style.backgroundColor = screen === "game" && regionTheme ? regionTheme.screenBg : "";
    return () => {
      el.style.backgroundColor = "";
    };
  }, [screen, regionTheme]);

  // MUSIC — pick the ambient track: a region's own track while playing that region's
  // level; the Interstellar track while browsing the Sticker Book; else the player's
  // equipped generic track (start / levels / quick game / tutorial / blank levels).
  // Crossfades on change. Only sounds once audio is unlocked.
  // GLINT RUSH overrides everything: one anthem for every rush, every theme —
  // when you hear it, you know. Reverts (crossfades) the moment the run ends.
  const musicTheme: MusicTheme =
    screen === "game" && state.deathMatch && state.phase === "playing"
      ? "Glint Rush"
      : screen === "game" && regionTheme && currentLevel?.region
        ? (() => {
            // the region's own track, unless Settings › Themes swapped in the
            // aligned faction anthem (owned packs only — same guard as the board)
            const want = settings.regionMusic[currentLevel.region];
            return want && swapPackOwned && factionMusic(swapPack!)?.theme === want
              ? want
              : (currentLevel.region as MusicTheme);
          })()
        : screen === "levels" && homeTab === "collection" && collectionSub === "book"
          ? settings.musicInterstellar
          : settings.musicGeneric;
  useEffect(() => {
    music.play(musicTheme);
  }, [musicTheme]);

  // UNSEEN-REWARD ALERT: items are marked seen INDIVIDUALLY as the player
  // actually scrolls them into view inside Collection (see CollectionPage's
  // seen-observer); this just keeps the tab dot in sync as that happens.
  const refreshCollectionAlert = useCallback(() => setCollectionAlert(unseenCount() > 0), []);

  // arriving at the home shell (from the splash, a game, or the tutorial) always
  // lands on the Home tab — the level map — not wherever you last were.
  useEffect(() => {
    if (screen === "levels") {
      setHomeTab(forceTabRef.current ?? "ascent");
      forceTabRef.current = null;
    }
  }, [screen]);

  // when a non-campaign run ends, know today's daily so the end card's PLAY
  // AGAIN deals the shared board (and FRESH BOARD offers the random one)
  useEffect(() => {
    if (state.phase === "playing" || currentLevel) { setEndDaily(null); return; }
    let live = true;
    void fetchDaily().then((d) => { if (live) setEndDaily(d); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, currentLevel]);

  // DAILY-CHALLENGE POP-UP — ~2s after the Ascent menu is shown, at most once a
  // day per kind. Excludes new players (tutorial not completed); quick-start never
  // shows the menu, so it's naturally skipped. Shows CHALLENGE COMPLETED when all
  // three of today's are done, else NEW CHALLENGES when any are outstanding.
  useEffect(() => {
    if (screen !== "levels" || homeTab !== "ascent") return;
    if (!tutorialDone()) return;
    const id = window.setTimeout(() => {
      void (async () => {
        // NEW COMMUNITY CHALLENGE takes priority: shown once per challenge day
        // (UTC). While it's unseen, the DAILY CHALLENGES pop-up WAITS — it gets
        // its turn on the next entry into the Ascent menu. Outside Reddit the
        // fetch resolves null and the regular flow runs untouched.
        const community = await fetchDaily();
        if (community && communityPopupSeenDay() !== community.day) {
          markCommunityPopupSeen(community.day);
          setCommunityPopup(community);
          return;
        }
        const today = todayKey();
        const entries = pickDailyChallenges(today);
        if (entries.length === 0) return;
        const daily = loadDaily();
        const allDone = entries.every((c) => daily.done.includes(c.id));
        const seen = loadDailyPopupSeen();
        if (allDone) {
          if (seen.doneDate === today) return;
          markDailyPopupSeen("done");
          setDailyPopup("done");
        } else {
          if (seen.newDate === today) return;
          markDailyPopupSeen("new");
          setDailyPopup("new");
        }
      })();
    }, 2000);
    return () => window.clearTimeout(id);
  }, [screen, homeTab]);

  // boardSettled: false while the opening owns the screen; true 400ms after it ends
  useEffect(() => {
    if (anim.playing && state.moves === 0) setBoardSettled(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim.playing]);
  useEffect(() => {
    if (screen !== "game") setBoardSettled(false);
  }, [screen]);
  useEffect(() => {
    if (screen !== "game" || state.phase !== "playing" || boardSettled) return;
    if (anim.playing) return; // the opening (rain → specials → GO!) still owns the screen
    const t = window.setTimeout(() => setBoardSettled(true), 400);
    return () => window.clearTimeout(t);
  }, [screen, state.phase, anim.playing, boardSettled]);

  // QUICK PLAY TIPS — beat one: the board settles on an eligible run — once ever.
  useEffect(() => {
    if (screen !== "game" || state.phase !== "playing" || !boardSettled) return;
    if (!quickTipsEligible && !(onAcademyBoard && optOutRunRef.current)) return;
    if (quickTips.open || quickTipFlags().seenIntro) return;
    markQuickIntroSeen();
    setQuickTips({ open: true, page: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state.phase, boardSettled]);
  // beat two: after the first BANK resolves — once ever.
  useEffect(() => {
    if (screen !== "game" || (!quickTipsEligible && !(onAcademyBoard && optOutRunRef.current))) return;
    if (state.banks < 1 || anim.playing || state.phase !== "playing") return;
    if (quickTips.open || quickTipFlags().seenBank) return;
    markQuickBankSeen(); // unlocks the Clearing slide
    const all = (CONTENT.quickPlayTips ?? DEFAULT_CONTENT.quickPlayTips).pages;
    const cycle = onAcademyBoard && !optOutRunRef.current ? all : all.filter((pg) => quickPageUnlocked(pg.key));
    setQuickTips({ open: true, page: Math.max(0, cycle.findIndex((pg) => pg.key === "clearing")) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.banks, anim.playing, screen, state.phase]);
  // beat three: GLINT RUSH arms — once ever.
  useEffect(() => {
    if (screen !== "game" || (!quickTipsEligible && !(onAcademyBoard && optOutRunRef.current))) return;
    if (!state.deathMatch || anim.playing || state.phase !== "playing") return;
    if (quickTips.open || quickTipFlags().seenRush) return;
    markQuickRushSeen(); // unlocks the GLINT RUSH slide
    const all = (CONTENT.quickPlayTips ?? DEFAULT_CONTENT.quickPlayTips).pages;
    const cycle = onAcademyBoard && !optOutRunRef.current ? all : all.filter((pg) => quickPageUnlocked(pg.key));
    setQuickTips({ open: true, page: Math.max(0, cycle.findIndex((pg) => pg.key === "rush")) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.deathMatch, anim.playing, screen, state.phase]);

  // THE TEACHING HINT — on the tutorial levels' real runs (Levels 0 and 1, first
  // two turns, after 2s) and in Sector 01 Outpost (first turn and the turn after
  // each bust, after 3s), the best placement glows tutorial-blue. Runs favour
  // Drifts: clearing runs early pays; sets keep.
  const [autoHint, setAutoHint] = useState<Set<string> | null>(null);
  const prevBustsRef = useRef(0);
  const bustHintArmedRef = useRef(false);
  useEffect(() => {
    if (state.busts > prevBustsRef.current) bustHintArmedRef.current = true;
    prevBustsRef.current = state.busts;
  }, [state.busts]);
  useEffect(() => {
    setAutoHint(null);
    if (screen !== "game" || state.phase !== "playing" || anim.playing || anim.choice) return;
    const lvl = currentLevel?.num;
    const tutorialTurn = (lvl === 0 || lvl === 1) && state.moves < 2; // both tutorial levels' boards open with hints
    const academyTurn = lvl === 2 && (state.moves === 0 || bustHintArmedRef.current);
    if (!tutorialTurn && !academyTurn) return;
    const delay = lvl === 0 || lvl === 1 ? 2000 : 3000;
    const t = setTimeout(() => {
      const cells = bestPlacementHint(state);
      if (cells) {
        setAutoHint(new Set(cells));
        if (academyTurn) bustHintArmedRef.current = false;
      }
    }, delay);
    return () => clearTimeout(t);
    // only the fields that gate/arm the hint — not the whole `state` (which
    // churned this timer on every tick). bestPlacementHint reads the current
    // board in the timeout, and the board only changes on a move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, state.phase, state.moves, state.busts, anim.playing, anim.choice, currentLevel]);

  // THE EYE — the hand-reveal announcement: when the wheel first shows
  // (pre-rush; the rush has its own ceremony), a big translucent eye slams
  // onto the board GO-style, blinks once, and dissolves — with a blink sound.
  const [eyeShow, setEyeShow] = useState(false);
  const prevRevealRef = useRef(false);
  useEffect(() => {
    if (handRevealed && !prevRevealRef.current && screen === "game" && !state.deathMatch) {
      setEyeShow(true);
      sfx.blink();
      const t = setTimeout(() => setEyeShow(false), 1150);
      return () => clearTimeout(t);
    }
    prevRevealRef.current = handRevealed;
  }, [handRevealed, screen, state.deathMatch]);
  useEffect(() => {
    prevRevealRef.current = handRevealed;
  }, [handRevealed]);

  return (
    <>
      {screen === "start" ? (
        <StartScreen
          boardState={state}
          exiting={startExiting}
          onStart={() => {
            if (startExiting) return;
            sfx.click();
            sfx.startWarp(); // the bombastic dive-into-the-Ascent cue
            // dive the start screen away, then swap in the Ascent map (which rises in)
            setStartExiting(true);
            window.setTimeout(() => { setScreen("levels"); setStartExiting(false); }, 340);
          }}
          onQuickStart={startQuick}
          onSettings={() => openSettings("visual")}
          onTutorial={() => setTutorial("start")}
          muted={muted}
          onToggleMute={toggleMute}
        />
      ) : screen === "levels" ? (
        // THE APP SHELL — the tabbed home. Home = the level map (with Quick Start /
        // Continue inside it); the other tabs are client-only features landing in
        // later waves. The bottom tab bar is glued to the bottom across all tabs.
        <div style={{ position: "fixed", inset: 0, background: "var(--bg, #07080f)" }}>
          {/* the persistent top bar — sits ABOVE every tab; pages load in the frame
              between it and the bottom tab bar */}
          <ShellHeader
            nebulite={nebulite}
            onScores={() => setShowLB(true)}
            onHelp={() => setTutorial("start")}
            onSettings={() => openSettings("visual")}
            onExit={() => { sfx.click(); setCelebrate(null); setScreen("start"); }}
            onNebuliteClick={() => { sfx.click(); setHomeTab("shop"); }}
          />
          <div style={{ position: "absolute", left: 0, right: 0, top: HEADER_HEIGHT, bottom: TAB_BAR_HEIGHT }}>
            {/* subtle starry backdrop behind the FEATURE tabs — not Ascent (its own
                parallax scene) and not the Sticker Book (own scene). Pure CSS. */}
            {homeTab !== "ascent" && !(homeTab === "collection" && collectionSub === "book") && (
              <StarField reduceMotion={settings.reduceMotion} />
            )}
            {homeTab === "ascent" ? (
              // same keyed fade as the other tabs, so every tab switch feels alike
              <div key={homeTab} className="gl-rise-in" style={{ position: "absolute", inset: 0 }}>
                <LevelSelect
                  inShell
                  onQuickStart={startQuick}
                  onPlayLevel={startLevel}
                  celebrate={celebrate}
                  onCelebrated={() => {
                    // the Academy's celebration just finished → one-time cheer
                    const played = celebrate?.played;
                    setCelebrate(null);
                    if (played === 1 && !academyCheerSeen()) {
                      markAcademyCheerSeen();
                      setAcademyCheer(true);
                    }
                  }}
                  equippedTheme={settings.boardTheme && REGIONS[settings.boardTheme] ? settings.boardTheme : undefined}
                />
              </div>
            ) : (
              <div key={homeTab} className="gl-rise-in" style={{ position: "absolute", inset: 0 }}>
                {homeTab === "challenges" ? (
                  <ChallengesPage onQuickPlay={startQuick} onPlayLevel={startLevel} onOpenReward={openReward} onPlayDaily={startDaily} nebulite={nebulite} onPlayDuel={startBrokerDuel} focusHouse={houseSlideFirst} onSeeAchievements={() => setHomeTab("achievements")} />
                ) : homeTab === "achievements" ? (
                  <AchievementsPage onOpenLeaderboard={() => setShowLB(true)} />
                ) : homeTab === "collection" ? (
                  <CollectionPage sub={collectionSub} onSub={setCollectionSub} settings={settings} onSettingsChange={updateSettings} onOpenAudioSettings={() => openSettings("audio")} onOpenDecorSettings={() => openSettings("decor")} onOpenShop={() => setHomeTab("shop")} onUnseenChange={refreshCollectionAlert} openItem={openCustomiseItem} onOpenItemHandled={() => setOpenCustomiseItem(null)} focusSticker={focusSticker} onFocusStickerHandled={() => setFocusSticker(null)} />
                ) : homeTab === "shop" ? (
                  <ShopPage
                    nebulite={nebulite}
                    onBuy={buyItem}
                    onOpenDecorSettings={() => openSettings("decor")}
                    openItem={openShopItem}
                    onItemHandled={() => setOpenShopItem(null)}
                    onViewInCollection={(kind, key) => {
                      if (kind !== "decor") { setCollectionSub("customise"); setOpenCustomiseItem({ kind, key }); }
                      setHomeTab("collection");
                    }}
                  />
                ) : (
                  <ComingSoon tab={homeTab} />
                )}
                {/* GATED until the Tutorial is done: every feature tab (this whole
                    branch is the non-Ascent tabs) renders dimmed and inert under
                    a lock — Challenges, Collection, Achievements and Shop. */}
                {!tutDone && <LockedTab />}
              </div>
            )}
          </div>
          <TabBar active={homeTab} onChange={setHomeTab} alerts={{ collection: collectionAlert }} />
          {showLB && <Leaderboard onClose={() => setShowLB(false)} />}
        </div>
      ) : screen === "tutorial0" ? (
        <TutorialLevel
          muted={muted}
          onToggleMute={toggleMute}
          onExit={() => {
            sfx.click();
            // completed tutorial → skip the confirm (finishTutorial just navigates);
            // otherwise confirm before abandoning it
            if (tutorialDone()) finishTutorial();
            else setExitConfirm("ascent");
          }}
          onNebuliteClick={() => { sfx.click(); setExitConfirm("shop"); }}
          onHelp={() => setTutorial("game")}
          onSettings={() => openSettings("visual")}
          onInfo={() => setSheet("combos")}
          onComplete={completeTutorial}
          nebulite={nebulite}
        />
      ) : (
        <div
          className="gl-shell gl-shell--fit gl-screen-in"
          style={{ position: "relative", zIndex: 1, ...(regionTheme ? regionVars(regionTheme) : {}) }}
        >
          {regionTheme ? <RegionBackdrop region={regionTheme} /> : <Backdrop />}
          {/* GLINT RUSH: the constant wind — everything racing right→left */}
          {state.deathMatch && state.phase === "playing" && <RushWind />}
          <GameHeader
            nebRef={nebRef}
            muted={muted}
            onToggleMute={toggleMute}
            onHelp={() => setTutorial("game")}
            onSettings={() => openSettings("visual")}
            onExit={() => {
              sfx.click();
              if (currentLevel?.num === 0) { finishTutorial(); return; }
              // skip the confirm for an already-completed level, or before any move
              const completed = currentLevel != null && levelStatus(currentLevel.num) === "completed";
              if (completed || state.moves === 0) { setCelebrate(null); setScreen("levels"); }
              else setExitConfirm("ascent");
            }}
            onNebuliteClick={() => { sfx.click(); setExitConfirm("shop"); }}
            nebulite={nebulite + (state.phase === "playing" ? state.coresCollected : 0)}
            nebulitePending={state.phase === "playing" && state.coresCollected > 0}
          />

      {/* HUD (the top bar) — the BANK NOW button overlays it (covering SCORE/BANKS/BUSTS)
          when a bankable combo is live, so nothing needs reserving above the footer. */}
      <div style={{ position: "relative" }}>
        {/* VERSUS HUD TINT: the engine swaps the displayed numbers on every
            hand-over (hot-seat), so the boxes wear the ACTIVE seat's colour,
            like the footer. No online versus on this build — no masked-HUD
            case (see web App.tsx for that asymmetry). Co-op stays neutral. */}
        <HUD state={state} scoreRef={scoreRef} bustRef={bustRef} banksRef={banksRef} scorePunch={anim.scorePunch}
          seatColor={state.versus ? (state.versus.turn === 0 ? COOP_GREEN : COOP_PURPLE) : undefined} />
        {earlyBankOffer && (
          <div style={hudBankOverlay}>
            <EarlyBankButton onBank={bankNow} />
          </div>
        )}
      </div>

      <div className="gl-grid">
        {/* ---- left: board + footer ---- */}
        <div>
          {/* The slow specular sweep is clipped to this "sheen area" — it spans from just
              below the HUD (the top bar) down to the top of the footer. Its responsive
              top padding IS the HUD→board clearance, so the sweep starts at the bar's
              bottom rather than over it. */}
          <div className="gl-sheen-area" ref={sheenRef}>
          {/* THE STAGE DIM (Motion Lab card G): lives on the SHEEN AREA —
              HUD-bottom to footer-top — so the dim fills the whole game window,
              not just the board box (Thys, 2026-08-26); the footer's raised
              NOW PLACING paints above it and stays bright. */}
          <div className={"gl-fx-veil" + (anim.dim ? " on" : "")} />
          <div style={boardPanel}>
            <div style={boardGlow} />
            <div ref={boardBoxRef} style={{ position: "relative" }}
              key={`bb-${anim.shakeMicro ?? 0}`}
              className={anim.shake && visualOptions.screenShake ? "gl-shake" : (anim.shakeMicro ?? 0) > 0 && visualOptions.screenShake ? "gl-shake-micro" : undefined}>
              {/* The board lives inside a clipping perspective viewport: the press-zoom
                  and the 3D tilt stay inside this window instead of growing the page's
                  scroll area (which used to shift the whole page on mobile). */}
              <div className="gl-board-viewport" ref={boardViewportRef}>
                {/* elliptical cast shadow on the "ground" beneath the tilted surface */}
                <div style={boardCastShadow} />
                {/* a slow diagonal light sweep across the glass — the board catches
                    the light once per cycle (clipped to the viewport) */}
                <div className="gl-board-glint" aria-hidden />
                {/* the tilted surface you look down onto, with a slow sway */}
                <div className="gl-board-tilt" ref={boardTiltRef}>
                  {/* touch-reactive board that FOCUSES on the action: it zooms in when
                      you place (or on press), keeping the pressed point fixed (so edge
                      taps stay in view), holds the zoom for the whole action animation,
                      then settles back out when it's done. */}
                  <div
                    onPointerDown={(e) => {
                      // a held pointer queues any COLLAPSE / SINGULARITY beat
                      // until release (the board must never resize mid-touch)
                      setBoardHeld(true);
                      // While the COMBO PICKER is open, taps SELECT (switch /
                      // confirm) — they must not re-anchor the camera. The fit
                      // pass has already framed every option; the view holds
                      // one steady position until the pick resolves.
                      if (anim.choice) return;
                      // Camera off: don't re-anchor the origin either. The board still
                      // rests at ZOOM_BASE (1.05 on a fine pointer), so moving the pivot
                      // would nudge it under the cursor — exactly the motion we're killing.
                      if (!visualOptions.boardZoom) return;
                      focusFromPointer(e);
                      setBoardPressed(true);
                    }}
                    onPointerUp={() => { setBoardHeld(false); setBoardPressed(false); }}
                    onPointerLeave={() => { setBoardHeld(false); setBoardPressed(false); }}
                    onPointerCancel={() => { setBoardHeld(false); setBoardPressed(false); }}
                    style={{
                      // press-zoom only on a precise (mouse) pointer; touch stays still on tap
                      // and only zooms once the placement animation runs (anim.focused).
                      // Reduce Motion / Visual › Advanced holds the board at its resting
                      // scale — the camera never travels (see visualOptions in settings.ts).
                      transform: `scale(${visualOptions.boardZoom && (anim.focused || (boardPressed && !COARSE_POINTER)) ? fitScale ?? ZOOM_IN : ZOOM_BASE})`,
                      transformOrigin: `${boardOrigin.x.toFixed(1)}% ${boardOrigin.y.toFixed(1)}%`,
                      // SMOOTH CAMERA: ease BOTH the scale and the pivot (origin). The
                      // fit pass re-targets as cells reveal one-by-one, so a jump-cut
                      // origin (no transition) read as jitter; a matched ease-in-out on
                      // transform + transform-origin glides the camera between targets.
                      transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform-origin 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
                      touchAction: "manipulation",
                    }}
                  >
                    <div className="gl-breathe">
                      <div
                        style={{
                          transform: anim.shrinking ? `scale(${anim.shrinking.scale})` : undefined,
                          transformOrigin: "center center",
                          transition: anim.shrinking
                            ? "transform 0.5s cubic-bezier(0.5, 0, 0.2, 1), filter 0.28s ease"
                            : "filter 0.28s ease",
                          // COLLAPSE: dim (no blur — we want the contraction crisp). BUST /
                          // RESHUFFLE / MOTHER LODE / GLINT RUSH: blur the board slightly so the
                          // overlay text reads (paired with the dark scrim behind it).
                          filter: anim.shrinking
                            ? anim.shrinking.phase >= 2
                              ? "brightness(0.72)"
                              : undefined
                            : anim.banner || anim.motherLode || anim.rushTitle
                            ? "blur(2.5px) brightness(0.82)"
                            : undefined,
                        }}
                      >
                        <Board
                          state={shownState}
                          onPlace={onPlace}
                          interactive={!anim.playing || !!anim.choice}
                          hintCells={anim.choice?.blue ?? autoHint ?? undefined}
                          greyCells={anim.choice?.grey}
                          // the anchor tile to tap: the picker's staged cell, or the
                          // best-hint's placement cell (bestPlacementHint returns it first)
                          focusCell={anim.choice?.key ?? (autoHint ? [...autoHint][0] : null)}
                          litCells={anim.litCells}
                          litWhite={anim.litWhite}
                          snake={anim.snake}
                          releasing={anim.releasing}
                          suppressActivated={anim.suppressActivated ?? undefined}
                          comboGlow
                          claimRings={state.versus ? (state.versus.claims
                            .map((c, i) => (c ? { cells: new Set(c.cells), color: i === 0 ? COOP_GREEN : COOP_PURPLE } : null))
                            .filter(Boolean) as { cells: Set<string>; color: string }[]) : undefined}
                          claimOffer={state.versus && claimOffer ? { cell: claimOffer.cellKey, color: state.versus.turn === 0 ? COOP_GREEN : COOP_PURPLE, n: claimOffer.n } : undefined}
                          redCells={anim.redCells}
                          hiddenCells={anim.hiddenCells}
                          activatedFilter={anim.activateReveal ?? undefined}
                          dropCell={anim.dropCell ?? undefined}
                          spinCells={anim.banner === "RESHUFFLE"}
                          fallCells={anim.fallCells ?? anim.singularity?.cells}
                          fallGo={anim.fallCells ? anim.fallGo : anim.singularity?.phase === 1}
                          fallGemsOnly={!!anim.fallCells}
                          dropAll={anim.entryDrop}
                          puzzleImage={currentLevel?.puzzleImage}
                          puzzleFocalX={currentLevel?.puzzleFocalX}
                          puzzleFocalY={currentLevel?.puzzleFocalY}
                          maxHeightCss={boardFitH ? `${boardFitH}px` : "64vh"}
                          onMapper={handleMapper}
                          onFractionMapper={handleFractionMapper}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* full-field animation overlays (BUST/RESHUFFLE banner, countdown,
                  eye, collapse, singularity, rush, mother lode) live below in the
                  field-covering layer so their scrim spans the whole game area. */}

              {/* BANKED ×N — the gold glass plate stamped bottom-centre while tiles fly */}
              {anim.bankedPlate && <BankedPlate key={anim.bankedPlate} text={anim.bankedPlate} />}

              {/* THE THIRD BUST — the final heart flies to centre and bursts */}
              {anim.finalHeart && <FinalHeartOverlay phase={anim.finalHeart as "fly" | "break"} from={anchorOf(bustRef)()} />}

              {/* QUICK PLAY new-starter TIP pill — until Tutorial + Academy are done */}
              {(quickTipsEligible || onAcademyBoard) && state.phase === "playing" && !quickTips.open && (
                <button
                  onClick={() => { sfx.click(); setQuickTips({ open: true, page: 0 }); }}
                  style={tipPill}
                  aria-label="Open the quick play tips"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.3-1.1 2.2H9.5c0-.9-.4-1.6-1.1-2.2A6 6 0 0 1 12 3z" />
                  </svg>
                  {(CONTENT.quickPlayTips ?? DEFAULT_CONTENT.quickPlayTips).tipLabel}
                </button>
              )}
              {/* SECTOR 01 OUTPOST's TIP pill — reopen the briefing any time (Level 2 only) */}
              {currentLevel?.num === 2 && state.phase === "playing" && !academyTips.open && (
                <button
                  onClick={() => { sfx.click(); setAcademyTips({ open: true, page: 0 }); }}
                  style={tipPill}
                  aria-label="Open the Academy tips"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.3-1.1 2.2H9.5c0-.9-.4-1.6-1.1-2.2A6 6 0 0 1 12 3z" />
                  </svg>
                  {CONTENT.academyTips.tipLabel}
                </button>
              )}

              {/* PUZZLE TIP pill — on any puzzle board, reopen the "Uncover the
                  Picture" briefing once the opening pop-up has been dismissed (or
                  was seen on an earlier puzzle level) */}
              {currentLevel?.puzzleImage && state.phase === "playing" && !puzzleIntroOpen && (
                <button
                  onClick={() => { sfx.click(); setPuzzleIntroOpen(true); }}
                  style={tipPill}
                  aria-label="Open the puzzle briefing"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.7.6-1.1 1.3-1.1 2.2H9.5c0-.9-.4-1.6-1.1-2.2A6 6 0 0 1 12 3z" />
                  </svg>
                  {CONTENT.puzzleText.tipLabel}
                </button>
              )}

              {/* CASH OUT — rush only: bank the run by choice, converting unspent
                  lives / free banks / hand gems into points. Opens the ceremony
                  overlay; nothing commits until CONFIRM. */}
              {state.deathMatch && state.phase === "playing" && !anim.playing && (
                <CashOutButton value={cashOutValue(state).total} onOpen={() => setCashCeremony(true)} />
              )}
            </div>
          </div>

          {/* FIELD-COVERING ANIMATION LAYER — a child of the sheen area, bled out to
              the WHOLE game window the player perceives: to the screen edges (past
              the shell's 9px side padding) and DOWN past NOW PLACING to the footer's
              visual top line (−FOOTER_POKE), with no gaps. Their content stays centred. */}
          <div style={{ position: "absolute", top: 0, left: -9, right: -9, bottom: -FOOTER_POKE, zIndex: 30, pointerEvents: "none" }}>
            {anim.banner && <BigBanner text={anim.banner} />}
            {anim.countdown && <CountdownOverlay value={anim.countdown} anchor={boardCenter()} />}
            {eyeShow && <EyeOverlay anchor={boardCenter()} />}
            {anim.shrinking && (
              <CollapseOverlay phase={anim.shrinking.phase} final={anim.shrinking.final} from={anim.shrinking.fromCells} to={anim.shrinking.toCells} />
            )}
            {anim.singularity && <SingularityOverlay falling={anim.singularity.phase === 1} />}
            {anim.rushTitle && <RushOverlay />}
            {anim.zenithArrival && <ZenithArrival handAnchor={anchorOf(handRef)} />}
            {anim.motherLode && <MotherLodeOverlay ml={anim.motherLode} />}
          </div>

          {/* Slim band between the board and NOW PLACING. The most-recent log line
              FLOATS up from behind the footer into this band, holds ~3s, then floats
              up and fades. (BANK NOW no longer lives here — it overlays the HUD.) */}
          <div style={boardFitH ? { ...toastBand, position: "absolute", left: 0, right: 0, bottom: 7, marginTop: 0, zIndex: 8 } : toastBand}>
            {spectating ? (
              // the Broker has the table — a sticky pill says so, the way the
              // online watcher's does (web parity)
              <FloatingToast key="nyt" kind="info" text={CONTENT.friends.coopNotYourTurn} stay />
            ) : (
              toastId > 0 && toast && (
                <FloatingToast
                  key={toastId}
                  kind={toast.kind}
                  text={toast.text}
                  stay={toast.sticky}
                  who={(() => {
                    // versus name-tags every seat-tagged line in that seat's colour
                    const names = state.versus?.names;
                    return names && toast.seat !== undefined && names[toast.seat]
                      ? { name: names[toast.seat], color: toast.seat === 0 ? COOP_GREEN : COOP_PURPLE }
                      : undefined;
                  })()}
                />
              )
            )}
          </div>

            {/* the slow specular sweep — clipped to this sheen area, so it fits exactly
                between the top bar and the footer */}
            <div style={sheenClip}>
              <div className="gl-sheen" style={sheenBar} />
            </div>
          </div>
          {/* /sheen area */}

          {/* the redesigned footer control bar — paddingTop reserves room for the
              raised NOW PLACING focal point that pokes above the bar. Sits ABOVE the
              sheen (which reaches up behind the focal point). */}
          <div style={{ paddingTop: state.coop || state.versus ? 52 : FOOTER_POKE, position: "relative", zIndex: 6 }}>
            {(state.coop || state.versus) && (
              <CoopFooterHud
                state={state}
                spectate={spectating}
                champs={brokerDuel
                  // no CHOOSE YOUR CHAMPION at a duel's start -> the player side stays
                  // BLANK, in-game and on the end card; champions are multiplayer-only.
                  // Only the Broker fronts her side (Thys ruling, 2026-08-21)
                  ? { mine: null, theirs: "broker" }
                  : null}
                say={championSay}
                mySeat={brokerDuel ? duelPlayerSeatOf(state) : null}
                duelFace={brokerDuel ? brokerFace : null}
              />
            )}
            <Footer
              state={state}
              hideNpLabel={!!(state.coop || state.versus)}
              dimmed={spectating}
              seatColor={(() => {
                const tg = state.coop ?? state.versus;
                if (!tg) return undefined;
                const seat = brokerDuel ? duelPlayerSeatOf(state) : tg.turn;
                return seat === 0 ? COOP_GREEN : COOP_PURPLE;
              })()}
              hideNext={anim.playing}
              hideActiveGem={anim.zenithArrival}
              handRef={handRef}
              onRestart={() => {
                if (brokerDuel) { if (duelRestartBet !== null) startBrokerDuel(duelRestartBet); return; }
                startGame();
              }}
              restartDisabled={!!brokerDuel && duelRestartBet === null}
              onInfo={() => setSheet("combos")}
              onLog={() => setLogOpen((v) => !v)}
              onSwap={swapHand}
              onRotate={rotateHand}
              handRevealed={state.deathMatch || (spectating ? (state.versus?.partnerHandRevealed ?? false) : handRevealed)}
            />
          </div>
        </div>

        {/* ---- right: legends + log (desktop side rail) ---- */}
        <aside className="gl-siderail">
          <TileLegend />
          <ComboLegend />
          <LogPanel state={state} />
        </aside>
      </div>

          {/* end-of-game modal — when the next level is unlocked, Continue leads
              the way (Play again drops to secondary); a fresh unlock plays the
              level-menu celebration */}
          {state.phase !== "playing" && !anim.playing && !settling && !revealOpen && !abilityRevealOpen && !puzzleReveal && !puzzleRevealPending && !tutorialCompleteOpen && !academyCompleteOpen && !dailyResult && (
            <EndCard
              state={state}
              champsBySeat={brokerDuel
                // duel: ONLY the Broker fronts her column — the player never picked
                // a champion for this match, so their column stays bare (Thys ruling)
                ? (brokerSeatOf(state) === 1 ? [null, "broker"] : ["broker", null])
                : null}
              localSeat={brokerDuel ? duelPlayerSeatOf(state) : state.versus?.turn ?? 0}
              onExit={brokerDuel ? () => { setCelebrate(null); forceTabRef.current = "challenges"; setScreen("levels"); } : undefined}
              onPlayAgain={
                brokerDuel ? () => {
                    const bet = brokerDuel.bet;
                    if (loadWallet() >= bet) startBrokerDuel(bet);
                    else { setBrokerDuel(null); forceTabRef.current = "challenges"; setScreen("levels"); }
                  }
                : !currentLevel && endDaily
                  ? () => startDaily(endDaily.day, endDaily.seed, endDaily.metric)
                  : startGame
              }
              onFreshBoard={!currentLevel && endDaily ? startFresh : undefined}
              onContinue={
                // Continue exists when there's a NEXT STEP, chained in order:
                // DAILY CLEARED (priority) → ability unlock → reward reveal → next level.
                dailyCleared
                  ? () => { sfx.click(); dailyClearedSourceRef.current = "endcard"; setDailyClearedOpen(true); }
                  : abilityUnlocks.length > 0
                  ? () => { sfx.click(); abilityRevealSourceRef.current = "endcard"; setAbilityRevealOpen(true); }
                  : rewards.length > 0
                  ? () => { sfx.click(); setRevealOpen(true); }
                  : endNav && currentLevel
                  ? () => {
                      sfx.click();
                      setCelebrate({ played: currentLevel.num, next: endNav.fresh ? endNav.nextNum : null });
                      setScreen("levels");
                    }
                  : undefined
              }
            />
          )}

          {/* THE CELEBRATION LAYER — same mapper/anchors as the flights */}
          <GameFxLayer
            mapper={mapperRef.current}
            scoreAnchor={() => anchorOf(scoreRef)() ?? null}
            handAnchor={() => anchorOf(handRef)() ?? null}
            boardCenter={() => boardCenter() ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }}
            unit={() => {
              const el = boardTiltRef.current;
              return el ? Math.min(1.6, Math.max(0.85, el.getBoundingClientRect().width / 400)) : 1;
            }}
          />
          <FlyingOverlay
            flying={anim.flying}
            mapper={mapperRef.current}
            multiplierLabel={anim.multiplierLabel}
            scoreAnchor={anchorOf(scoreRef)}
            bustAnchor={anchorOf(bustRef)}
            handAnchor={anchorOf(handRef)}
            walletAnchor={anchorOf(nebRef)}
            gapResolver={gapResolver}
          />
          {/* the opening bonus-gem swirl, on its own channel so it overlaps the
              board rain / special drops without clashing */}
          <FlyingOverlay
            flying={anim.seedFlying ?? []}
            mapper={mapperRef.current}
            scoreAnchor={anchorOf(scoreRef)}
            bustAnchor={anchorOf(bustRef)}
            handAnchor={anchorOf(handRef)}
            walletAnchor={anchorOf(nebRef)}
            gapResolver={gapResolver}
          />

          {/* COMBO CHOICE — the draining auto-confirm ring beside the staged tile */}
          {/* the countdown chip only renders when the timer is on — with it off
              (Settings › Game) the picker waits, so there is nothing to count */}
          {anim.choice && (settings.choiceTimer || settings.difficulty === "hard") && <ChoiceTimerChip key={anim.choice.tick} at={mapperRef.current?.(anim.choice.key) ?? null} windowMs={settings.difficulty === "easy" ? 3000 : 2000} />}

          {/* COMBO LINEUP — the banked tiles form their combos (named rows, ghost
              copies for shared tiles) under the score, linger, then dive in */}
          {anim.comboLineup && (
            <ComboLineupOverlay lineup={anim.comboLineup} mapper={mapperRef.current} scoreAnchor={anchorOf(scoreRef)} />
          )}

          {/* CASH OUT ceremony — the counted resources gather under a dark veil;
              CONFIRM banks them into the score and ends the run, Cancel poofs it */}
          {cashCeremony && state.phase === "playing" && (
            <CashOutCeremony
              state={state}
              anchors={{ score: anchorOf(scoreRef), busts: anchorOf(bustRef), banks: anchorOf(banksRef), hand: anchorOf(handRef) }}
              onConfirm={() => {
                setCashCeremony(false);
                cashOutNow();
              }}
              onCancel={() => {
                sfx.poof();
                setCashCeremony(false);
              }}
            />
          )}

          {/* THE ACADEMY briefing — the paged tips card; play resumes on close */}
          {academyTips.open && (
            <AcademyTips
              content={CONTENT.academyTips}
              pages={academyPages}
              page={Math.min(academyTips.page, academyPages.length - 1)}
              onPage={(p) => setAcademyTips({ open: true, page: p })}
              onClose={() => { sfx.click(); setAcademyTips({ open: false, page: 0 }); }}
            />
          )}
          {/* QUICK PLAY tips — the same card, its own content + per-page extras */}
          {quickTips.open && (quickTipsEligible || onAcademyBoard) && (() => {
            const QP = CONTENT.quickPlayTips ?? DEFAULT_CONTENT.quickPlayTips;
            return (
              <AcademyTips
                content={QP}
                pages={quickPages}
                page={Math.min(quickTips.page, quickPages.length - 1)}
                onPage={(p) => setQuickTips({ open: true, page: p })}
                onClose={() => { sfx.click(); setQuickTips({ open: false, page: 0 }); }}
                pageExtras={{ ropes: [
                  { label: QP.combosButton, onClick: () => setSheet("combos") },
                  { label: QP.howToButton, onClick: () => setTutorial("game") },
                ] }}
              />
            );
          })()}

          {/* full log — a collapsing drawer that slides up from the bottom */}
          <LogDrawer open={logOpen} onClose={() => setLogOpen(false)} state={state} />
        </div>
      )}

      {/* shared overlays (reachable from start screen and game) */}
      {tutorial && (
        <Tutorial
          boardState={state}
          onSkip={() => setTutorial(null)}
          onPlay={() => {
            // "Got it — Play" closes the pop-up. In-game the game just continues;
            // from the start screen or the levels page it brings you (back) to the
            // levels page to pick a level.
            sfx.click();
            if (tutorial === "start") setScreen("levels");
            setTutorial(null);
          }}
          onTutorialLevel={() => {
            // "Skip to tutorial" (first slide): jump straight into the scripted
            // Tutorial level (Level 0).
            setTutorial(null);
            startLevel(LEVELS[0]);
          }}
          onCombos={() => {
            // "Combos & Values" (first slide): close How To Play, open the sheet.
            sfx.click();
            setTutorial(null);
            setSheet("combos");
          }}
        />
      )}
      {sheet === "combos" && <InfoSheet onClose={() => setSheet(null)} />}
      {communityPopup && (
        <CommunityDailyPopup
          daily={communityPopup}
          onPlay={(day, seed, metric) => { setCommunityPopup(null); startDaily(day, seed, metric); }}
          onClose={() => setCommunityPopup(null)}
        />
      )}
      {dailyPopup && (
        <DailyChallengePopup
          kind={dailyPopup}
          entries={pickDailyChallenges(todayKey())}
          daily={loadDaily()}
          onQuickPlay={startQuick}
          onPlayVersus={() => {
            // a versus daily's Quick Play deals into the house, not a solo run
            setDailyPopup(null);
            if (loadWallet() >= DUEL_MIN_BET && storedFrontier() >= 2) startBrokerDuel(DUEL_MIN_BET);
          }}
          onClose={() => setDailyPopup(null)}
          onOpenReward={openReward}
        />
      )}
      {/* DAILY CLEARED — the run-end celebration for completed dailies (one slide
          per daily; the CHALLENGE COMPLETED card joins as the finale when the run
          closed the set). Backdrop dismissal keeps the queue pending — it
          resurfaces on the next Ascent visit of THIS session only. */}
      {dailyCleared && dailyClearedOpen && (
        <DailyClearedPopup
          slides={dailyCleared.slides}
          showSetDone={dailyCleared.withSetDone && loadDailyPopupSeen().doneDate !== todayKey()}
          entries={pickDailyChallenges(todayKey())}
          daily={loadDaily()}
          doneCount={loadDaily().done.length}
          onOpenReward={openReward}
          onDismiss={() => setDailyClearedOpen(false)}
          onDone={() => {
            if (dailyCleared.withSetDone) markDailyPopupSeen("done"); // the finale WAS the daily-done pop-up
            setDailyCleared(null);
            setDailyClearedOpen(false);
            if (dailyClearedSourceRef.current !== "endcard") return; // ambient showing — just close
            // continue the end-card chain: ability unlock → reward reveal → onward
            if (abilityUnlocks.length > 0) { abilityRevealSourceRef.current = "endcard"; setAbilityRevealOpen(true); }
            else if (rewards.length > 0) setRevealOpen(true);
            else {
              if (endNav && currentLevel) setCelebrate({ played: currentLevel.num, next: endNav.fresh ? endNav.nextNum : null });
              setScreen("levels");
            }
          }}
        />
      )}
      {exitConfirm && (
        <ConfirmDialog
          title={CONTENT.exitDialog.title}
          message={brokerDuel ? fmt(CONTENT.exitDialog.duelBody, { bet: brokerDuel.bet }) : CONTENT.exitDialog.body}
          cancelLabel={CONTENT.exitDialog.cancel}
          confirmLabel={CONTENT.exitDialog.confirm}
          onCancel={() => setExitConfirm(null)}
          onConfirm={() => {
            const target = exitConfirm;
            setExitConfirm(null);
            setCelebrate(null);
            // duel EXIT before your first move refunds the stake in full (web 7300027);
            // after it, the escrowed stake stays with the house
            if (brokerDuel && !duelPlayerMovedRef.current) addNebulite(brokerDuel.bet);
            if (target === "shop") forceTabRef.current = "shop";
            setScreen("levels");
          }}
        />
      )}
      {/* VICTORY — the winner's champion takes the stage for a beat before the
          summary (only the Broker can splash here; the player has no champion) */}
      {victorySplash && (() => {
        const names = (CONTENT.challenges.characterNames ?? {}) as Record<string, string>;
        const lines = (CONTENT.characters.catchphrases as Record<string, Record<string, string>>)[victorySplash.champion];
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 97, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, background: "rgba(4,5,12,0.82)", backdropFilter: "blur(4px)", cursor: "pointer" }}
            onClick={() => { if (victoryTimer.current) window.clearTimeout(victoryTimer.current); setVictorySplash(null); }}
          >
            <img src={`/avatars/${victorySplash.champion}-lg.webp`} alt="" className="gl-float-y" style={{ width: 150, height: "auto", filter: "drop-shadow(0 16px 40px rgba(0,0,0,0.7)) drop-shadow(0 0 30px rgba(157,123,255,0.45))" }} />
            <div className="gl-rise" style={{ fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 34, letterSpacing: "0.06em", color: theme.color.gold, textShadow: "0 0 30px rgba(232,181,63,0.5)", marginTop: 14 }}>
              {CONTENT.characters.victoryTitle}
            </div>
            <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 18, color: theme.color.text }}>{victorySplash.name}</div>
            {lines?.victory && (
              <p style={{ fontFamily: theme.fonts.sans, fontStyle: "italic", fontSize: 13, color: "#cdb9ff", margin: "8px 24px 0", textAlign: "center" }}>
                “{lines.victory}”
              </p>
            )}
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.2em", color: names[victorySplash.champion] ? theme.color.faint : "transparent", marginTop: 2 }}>
              {names[victorySplash.champion] ?? "."}
            </div>
          </div>
        );
      })()}
      {/* THE BROKER'S PITCH — the duel promo card (start-up, gated above) */}
      {brokerPromo && (
        <BrokerPromoPopup
          onPlay={() => { setBrokerPromo(false); setHouseSlideFirst(true); forceTabRef.current = "challenges"; setHomeTab("challenges"); }}
          onClose={() => setBrokerPromo(false)}
        />
      )}
      {/* PUZZLE IMAGE reveal — shown first on a puzzle-board clear, before the end card */}
      {puzzleReveal && <PuzzleReveal image={puzzleReveal} onContinue={() => setPuzzleReveal(null)} />}
      {puzzleIntroOpen && <PuzzleIntro onClose={() => { sfx.click(); setPuzzleIntroOpen(false); }} />}
      {/* ABILITY UNLOCK pop-up — shown first, before the collection reveal */}
      {abilityUnlocks.length > 0 && abilityRevealOpen && (
        <AbilityReward
          unlocks={abilityUnlocks}
          onContinue={() => {
            markAbilitiesCelebrated(abilityUnlocks.map((u) => u.key)); // seen — never re-offered
            setAbilityUnlocks([]);
            setAbilityRevealOpen(false);
            if (abilityRevealSourceRef.current !== "endcard") return; // ambient: close in place
            // chain onward: collection reveal if any, else the unlocked next level
            if (rewards.length > 0) setRevealOpen(true);
            else {
              if (endNav && currentLevel) setCelebrate({ played: currentLevel.num, next: endNav.fresh ? endNav.nextNum : null });
              setScreen("levels");
            }
          }}
        />
      )}
      {rewards.length > 0 && revealOpen && (
        <RewardReveal
          rewards={rewards}
          onView={(r) => {
            forceTabRef.current = "collection";
            setCollectionSub(r.kind === "sticker" ? "book" : "customise");
            setScreen("levels");
            setRewards([]);
            setRevealOpen(false);
          }}
          onContinue={() => {
            // the flow's next stop: the unlocked next level, else the Ascent map
            if (endNav && currentLevel) setCelebrate({ played: currentLevel.num, next: endNav.fresh ? endNav.nextNum : null });
            setScreen("levels");
            setRewards([]);
            setRevealOpen(false);
          }}
        />
      )}
      {/* YOUR SCORE — the daily board's result, ahead of the end card */}
      {dailyResult && !anim.playing && !settling && (
        <DailyResultPopup result={dailyResult} onDone={() => setDailyResult(null)} />
      )}
      {tutorialCompleteOpen && !anim.playing && !settling && (() => {
        const m = musicTracks().find((x) => x.key === "interstellar");
        const copy = CONTENT.tutorialLevel.completion;
        return (
          <TutorialComplete
            copy={copy}
            reward={m ? { name: m.name, image: m.image, emblem: 0, label: copy.rewardLabel } : undefined}
            onContinue={() => {
              setTutorialCompleteOpen(false);
              // Play the SAME menu celebration every other level plays: tick the
              // completed Tutorial (level 0), then scroll down and reveal the
              // freshly-unlocked Academy with its target struck through — instead of
              // dropping straight into the Ascent with the Academy already ticked.
              setCelebrate({ played: LEVELS[0].num, next: LEVELS[1]?.num ?? null });
              setScreen("levels");
            }}
          />
        );
      })()}
      {/* the ASCENT CHEER — once, right after the Academy's unlock celebration
          has played out on the level map (copy: tutorialLevel.academyCelebration) */}
      {academyCheer && screen === "levels" && (() => {
        const ac = CONTENT.tutorialLevel.academyCelebration ?? DEFAULT_CONTENT.tutorialLevel.academyCelebration;
        return (
          <PracticePopup
            copy={{ title: ac.title, body: ac.body, continueButton: ac.button }}
            icon={<TutorAvatar size={76} />}
            onContinue={() => setAcademyCheer(false)}
          />
        );
      })()}
      {academyCompleteOpen && !anim.playing && !settling && (() => {
        const all = stickers();
        const idx = all.findIndex((s) => s.id === "bluegiant");
        const copy = CONTENT.tutorialLevel.academyCompletion ?? DEFAULT_CONTENT.tutorialLevel.academyCompletion;
        return (
          <TutorialComplete
            copy={copy}
            reward={idx >= 0 ? { name: all[idx].name, image: all[idx].image, emblem: idx, label: copy.rewardLabel } : undefined}
            onContinue={() => {
              const fresh = academyCompleteOpen.fresh;
              setAcademyCompleteOpen(null);
              // the same menu celebration every other level plays: tick the
              // completed Academy (level 1), then reveal the freshly-unlocked
              // Sector 01 Outpost below it.
              setCelebrate({ played: 1, next: fresh ? 2 : null });
              setScreen("levels");
            }}
          />
        );
      })()}
      <DebugTracePanel moves={state.moves} />
      {showSettings && (
        <SettingsScreen
          settings={settings}
          onChange={updateSettings}
          initialSection={settingsSection}
          onClose={() => setShowSettings(false)}
          onCombos={() => { sfx.click(); setSheet("combos"); }}
          onHowToPlay={() => {
            setShowSettings(false);
            setTutorial(screen === "game" ? "game" : "start");
          }}
        />
      )}
    </>
  );
}

/* ============================== big moments ============================== */




function CollapseOverlay({ phase, final, from, to }: { phase: number; final?: boolean; from: number; to: number }) {
  return (
    <div style={{ ...collapseVignette, flexDirection: "column", gap: 10 }}>
      {/* danger vignette pulsing at the frame edges */}
      <div className="gl-vig-pulse" style={dangerVignette} />
      {/* shockwave hex ring escaping outward as the word slams in */}
      <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} preserveAspectRatio="xMidYMid meet">
        <polygon
          className="gl-shockwave"
          points="100,58 136,79 136,121 100,142 64,121 64,79"
          fill="none"
          stroke="#ffd0d8"
          strokeWidth="2.4"
          opacity="0.5"
        />
      </svg>
      <div style={{ fontFamily: theme.fonts.mono, fontSize: 11, letterSpacing: "0.4em", color: "#ff8a9c", textShadow: "0 1px 8px rgba(0,0,0,0.9)", opacity: phase >= 4 ? 0 : 0.9, position: "relative" }}>
        THE ABYSS COLLAPSES
      </div>
      {/* the word slams in (2.7× + blur → 1×) on mount, then shrinks with the grid */}
      <div className="gl-word-slam" style={{ position: "relative" }}>
        <div
          style={{
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: [128, 110, 82, 56, 36][phase] ?? 48,
            letterSpacing: phase < 2 ? "0.04em" : "0.02em",
            whiteSpace: "nowrap",
            transition: "font-size 0.5s cubic-bezier(0.5,0,0.2,1), letter-spacing 0.5s ease, opacity 0.4s",
            opacity: phase >= 4 ? 0 : 1,
            background: "linear-gradient(100deg, #ffd0d8, #9d7bff 48%, #7fe9f5 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 6px 26px rgba(10,8,20,0.9)) drop-shadow(0 0 30px rgba(157,123,255,0.55))",
          }}
        >
          COLLAPSE
        </div>
      </div>
      <div style={{ position: "relative", fontFamily: theme.fonts.mono, fontSize: 12, letterSpacing: "0.18em", color: theme.color.dim, textShadow: "0 1px 8px rgba(0,0,0,0.9)", opacity: phase >= 4 ? 0 : 0.9 }}>
        {from}&nbsp;→&nbsp;<span style={{ color: "#7fe9f5" }}>{to}</span>&nbsp;CELLS
      </div>
    </div>
  );
}

/** THE THIRD BUST — the final heart tears out of the BUSTS box, flies to the
 *  centre of the screen under a dark veil, and BURSTS (ring + shatter) right
 *  before the end card appears. */
function FinalHeartOverlay({ phase, from }: { phase: "fly" | "break"; from: { x: number; y: number } | null }) {
  const [pos, setPos] = useState(from ?? { x: window.innerWidth / 2, y: 90 });
  useEffect(() => {
    const t = window.setTimeout(() => setPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 }), 40);
    return () => window.clearTimeout(t);
  }, []);
  const breaking = phase === "break";
  // a clean full heart on a SQUARE viewBox — the old 14×13 box clipped the lobe
  // tops flat (its arc radius was < half its chord, so SVG bulged the humps above
  // y=0). This path sits entirely inside 0 0 24 24 with headroom on every side.
  // glow OFF for the split halves: each half is clipped with overflow:hidden, and a
  // drop-shadow inside that clip gets cut to a hard RECTANGLE (the "square" behind
  // the half). The break's glow is applied to the non-clipped outer wrapper instead.
  const heartSvg = (glow: boolean) => (
    <svg width="72" height="72" viewBox="0 0 24 24" style={{ display: "block", filter: glow ? "drop-shadow(0 0 20px rgba(255,90,118,0.85))" : undefined }}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff5a76" />
    </svg>
  );
  // PORTALED to <body>: the game screen's transformed wrappers turn
  // position:fixed into ancestor-relative and were CROPPING the heart's top.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 80, pointerEvents: "none", background: "rgba(2,3,8,0.5)" }} className="gl-fade">
      <div
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          transform: "translate(-50%, -50%)",
          transition: "left 720ms cubic-bezier(0.4, 0, 0.2, 1), top 720ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {!breaking ? (
          <div className="gl-heart-final">{heartSvg(true)}</div>
        ) : (
          // THE BREAK: the flown heart splits down the middle — each half is the
          // full heart clipped to its side; they rotate outwards from the tip
          // and fall away one after the other. The glow lives on THIS wrapper (not
          // inside the clipped halves), so it hugs the heart shape, not a square.
          <div style={{ position: "relative", width: 72, height: 72, filter: "drop-shadow(0 0 18px rgba(255,90,118,0.8))" }}>
            <div className="gl-heart-half-l" style={{ position: "absolute", left: 0, top: 0, width: 36, height: 72, overflow: "hidden", transformOrigin: "100% 89%" }}>
              {heartSvg(false)}
            </div>
            <div className="gl-heart-half-r" style={{ position: "absolute", left: 36, top: 0, width: 36, height: 72, overflow: "hidden", transformOrigin: "0% 89%" }}>
              <div style={{ marginLeft: -36 }}>{heartSvg(false)}</div>
            </div>
            <span
              className="gl-burst"
              style={{ position: "absolute", left: "50%", top: "50%", width: 72, height: 72, margin: "-36px 0 0 -36px", borderRadius: "50%", border: "3px solid rgba(255,90,118,0.9)", pointerEvents: "none" }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// the singularity's particle field: % from the left, start delay, size px
const ABYSS_PARTS = [
  { l: 5, d: 0, s: 4 }, { l: 12, d: 260, s: 3 }, { l: 20, d: 90, s: 5 }, { l: 28, d: 420, s: 3 },
  { l: 35, d: 180, s: 4 }, { l: 44, d: 540, s: 3 }, { l: 52, d: 60, s: 5 }, { l: 60, d: 330, s: 3 },
  { l: 68, d: 150, s: 4 }, { l: 76, d: 480, s: 3 }, { l: 84, d: 240, s: 5 }, { l: 92, d: 30, s: 3 },
  { l: 16, d: 700, s: 3 }, { l: 48, d: 820, s: 4 }, { l: 72, d: 640, s: 3 }, { l: 88, d: 760, s: 4 },
];

/** SINGULARITY — the announcement over the board while the shape's wedge rim is
 *  pulled into the abyss: a violet-red plate slams in, and a field of particles
 *  is sucked DOWN off the screen with the falling cells. */
function SingularityOverlay({ falling }: { falling: boolean }) {
  return (
    <div style={{ ...overlayScrim, overflow: "hidden" }}>
      {ABYSS_PARTS.map((g, i) => (
        <span
          key={i}
          className="gl-abyss-part"
          style={{
            left: `${g.l}%`,
            top: `${(i * 37) % 60}%`,
            width: g.s,
            height: g.s,
            background: i % 3 === 0 ? "#ffd980" : "#b08cff",
            boxShadow: `0 0 ${g.s * 2}px ${i % 3 === 0 ? "rgba(232,181,63,0.8)" : "rgba(157,123,255,0.8)"}`,
            animationDuration: `${1200 + (i % 5) * 220}ms`,
            animationDelay: `${g.d + (falling ? 0 : 350)}ms`,
          }}
        />
      ))}
      <div
        className="gl-plate gl-plate-in-c"
        style={{ padding: "14px 30px", border: "1px solid rgba(255,90,143,0.45)", textAlign: "center" }}
      >
        <div
          style={{
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: "clamp(26px, 9vw, 44px)",
            lineHeight: 1,
            letterSpacing: "0.1em",
            whiteSpace: "nowrap",
            background: "linear-gradient(100deg,#ff8fb0,#9d7bff,#7fe9f5)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 2px 22px rgba(255,90,143,0.5))",
          }}
        >
          SINGULARITY
        </div>
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 10, letterSpacing: "0.3em", color: "#a89ad0", marginTop: 8 }}>
          THE OUTER RIM FALLS INTO THE ABYSS
        </div>
      </div>
    </div>
  );
}

function MotherLodeOverlay({ ml }: { ml: { phase: "gather" | "fuse"; sourceValue: number; count: number; nebulites: number; bonus: number } }) {
  const fusing = ml.phase === "fuse";
  return (
    <div style={{ ...overlayScrim, flexDirection: "column", gap: 18, overflow: "hidden" }}>
      <div
        className="gl-lode-banner gl-plate"
        style={{
          fontFamily: theme.fonts.disp,
          fontWeight: 700,
          fontSize: 34,
          letterSpacing: "0.14em",
          color: theme.color.gold,
          border: "1px solid rgba(232,181,63,0.45)",
          padding: "10px 30px",
          textShadow: "0 2px 18px rgba(232,181,63,0.5)",
        }}
      >
        MOTHER LODE
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, height: 128 }}>
        {!fusing ? (
          <>
            <div className="gl-lode-gem">
              <TileGem value={ml.sourceValue as TileVal} size={96} />
            </div>
            <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 46, color: theme.color.gold }}>×{ml.count}</div>
          </>
        ) : (
          <div className="gl-lode-pop" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <TileGem value={CORE as TileVal} size={116} />
            {ml.nebulites > 1 && <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 46, color: theme.color.gold }}>×{ml.nebulites}</div>}
          </div>
        )}
      </div>
      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 16, color: theme.color.gold }}>
        {fusing ? (ml.nebulites === 1 ? "refined into a Nebulite" : `refined into ${ml.nebulites} Nebulites`) : `+${ml.bonus}`}
      </div>
    </div>
  );
}




/* ============================== end card ============================== */

// Label + colour for each end-of-run tally step, shown as it lands on the summary.

// seat colours (one source of truth in theme.ts — SEAT_GREEN opens)
const COOP_GREEN = SEAT_GREEN;
const COOP_PURPLE = SEAT_PURPLE; // player 1
const primaryEndBtn: React.CSSProperties = { ...bevelPrimary, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "13px 16px", borderRadius: 12, fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 15, cursor: "pointer" };

const TALLY_META: Record<EndTallyKind, { label: string; color: string }> = {
  boardTiles: { label: "Board tiles banked", color: theme.color.gold },
  busts: { label: "Busts remaining", color: theme.color.bad },
  banks: { label: "Free banks remaining", color: theme.color.gold },
  hand: { label: "Gems in hand", color: theme.color.accent },
  zenith: { label: "Zenith bonus", color: theme.color.accent },
  clear: { label: "Board cleared", color: theme.color.good },
  unbanked: { label: "Unbanked combos", color: theme.color.bad },
  tiles: { label: "Tiles on board", color: theme.color.bad },
};

function EndCard({ state, onPlayAgain, onContinue, onExit, challenge, onShare, shareLabel, onFreshBoard = null, challengePrimary = false, localSeat = 0, hud, champsBySeat = null, gemsBySeat = null }: { state: GameState; /** champion avatars for the face-off columns, by SEAT (online only) */ champsBySeat?: [string | null, string | null] | null; /** account GEM avatars for champion-less columns (the duel's player side) */ gemsBySeat?: [Avatar | null, Avatar | null] | null; onPlayAgain: () => void; onContinue?: () => void; onExit?: () => void; challenge?: { name: string; target: number } | null; onShare?: (() => void) | null; shareLabel?: string; /** daily runs: Play again re-deals the SAME board, so this offers the quick-play escape */ onFreshBoard?: (() => void) | null; /** the run just RANKED on today's board: Challenge a friend leads, replays follow */ challengePrimary?: boolean; localSeat?: number; /** pre-blurred HUD stand-in — the game shell is hidden while this card is up */ hud?: React.ReactNode }) {
  // TWO slides in versus AND co-op: first the score summary (single-player style,
  // live-calculated), a Continue, then the face-to-face / contribution comparison.
  const vres = state.versus?.result ?? null;
  const twoSlide = !!vres || !!state.coop;
  const [vPage, setVPage] = useState(0);
  // PER-SEAT SUMMARY: versus computes each seat's own tally; this device shows its
  // own (localSeat). Co-op / single-player use the shared state.* tally unchanged.
  const vsum = state.versus?.summary?.[localSeat] ?? null;
  const scoreBase = vsum ? vsum.scoreBase : state.scoreBase;
  const endTally = vsum ? vsum.tally : state.endTally;
  const finalScore = vsum ? vsum.finalScore : state.finalScore;
  const activeSeat = state.versus?.turn ?? 0;
  const myBanks = state.versus ? (localSeat === activeSeat ? state.banks : state.versus.partnerBanks) : state.banks;
  const myBusts = state.versus ? (localSeat === activeSeat ? state.busts : state.versus.partnerBusts) : state.busts;
  const won = state.phase === "won";
  const outOfLives = state.livesLeft <= 0;
  // VERSUS: the headline reflects how the MATCH ended, not how the seat that
  // happened to be active finished — she ran dry rounds before your cash-out
  // concluded the duel, and the card still said OUT OF GEMS. Priority: cleared,
  // knockout, then ANY cash-out; OUT OF GEMS only when both seats ran dry.
  const anyCashOut = state.cashedOut > 0 || (state.versus?.partnerCashedOut ?? 0) > 0;
  const outcome = state.versus
    ? (won ? "cleared" : outOfLives ? "gameover" : anyCashOut ? "cashedout" : "outoftiles")
    : (state.cashedOut > 0 ? "cashedout" : won ? "cleared" : outOfLives ? "gameover" : "outoftiles");
  // the banked amount on the CASHED OUT pill: the seat that actually cashed
  const cashedShown = state.cashedOut > 0 ? state.cashedOut : (state.versus?.partnerCashedOut ?? 0);

  // a LOST run forfeits its in-run Nebulite: the summary counter drains back to
  // zero (with the forfeit sting) so the player watches the claim slip away.
  // A CLEARED board DOUBLES the banked Nebulite — a ×2 pops and the counter ticks
  // up from the base to double, with a boost sting. This is the SECOND beat: it
  // waits until the score has fully tallied and settled, then lands on its own.
  // a true LOST run forfeits its in-run Nebulite; a CASH-OUT (lost + cashedOut) banks it
  const forfeits = state.phase === "lost" && state.cashedOut === 0 && state.coresCollected > 0;
  const doubles = won && state.coresCollected > 0;
  // read ONCE on mount — this component re-renders ~30+ times while the score
  // tallies, and matchMedia/DOM reads per frame are wasted work; a motion-setting
  // change mid-card (a few seconds) isn't worth tracking
  const [reducedMotion] = useState(
    () => document.documentElement.getAttribute("data-motion") === "reduced" || osPrefersReducedMotion()
  );
  const [nebShown, setNebShown] = useState(state.coresCollected);
  const [showX2, setShowX2] = useState(false);

  // THE SCORE REVEAL: the header carried the board-collected score (scoreBase) into the
  // pop-up; here each end-of-run adjustment is applied FOR REAL — board-clear bonus,
  // unspent busts/banks/hand, tiles-left penalty — stepping the number up or down and
  // lighting the matching summary row as its delta lands, ending on the floored final.
  const [scoreShown, setScoreShown] = useState(scoreBase);
  const [revealed, setRevealed] = useState(0); // how many endTally steps have landed
  const tallyDur = 380 + endTally.length * 720; // total reveal time (for the Nebulite beat)
  useEffect(() => {
    const steps = endTally;
    if (reducedMotion || steps.length === 0) { setScoreShown(finalScore); setRevealed(steps.length); return; }
    let cancelled = false, raf = 0, cur = scoreBase;
    const timers: number[] = [];
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const animateTo = (target: number, tick: () => void, done: () => void) => {
      let start: number | null = null, lastTick = 0;
      const from = cur;
      const frame = (now: number) => {
        if (cancelled) return;
        if (start === null) start = now;
        const p = Math.min(1, (now - start) / 480);
        setScoreShown(Math.max(0, Math.round(from + (target - from) * ease(p)))); // clamp display ≥ 0
        if (p < 1 && now - lastTick > 55) { tick(); lastTick = now; }
        if (p < 1) raf = requestAnimationFrame(frame); else { cur = target; done(); }
      };
      raf = requestAnimationFrame(frame);
    };
    const doStep = (i: number) => {
      if (cancelled || i >= steps.length) return;
      const d = steps[i].delta;
      animateTo(cur + d, d >= 0 ? sfx.scoreTick : sfx.scoreTickDown, () => {
        setRevealed(i + 1);
        timers.push(window.setTimeout(() => doStep(i + 1), 240));
      });
    };
    setScoreShown(Math.max(0, cur));
    timers.push(window.setTimeout(() => doStep(0), 380));
    return () => { cancelled = true; timers.forEach((t) => window.clearTimeout(t)); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // reduced motion: settle the Nebulite row to its final value at once, no counter
    if (reducedMotion) { if (forfeits) setNebShown(0); else if (doubles) { setShowX2(true); setNebShown(state.coresCollected * 2); } return; }
    let iv: number | undefined;
    const t = window.setTimeout(() => {
      if (forfeits) {
        sfx.nebForfeit();
        iv = window.setInterval(() => setNebShown((v) => { if (v <= 1 && iv) window.clearInterval(iv); return Math.max(0, v - 1); }), 140);
      } else if (doubles) {
        setShowX2(true);
        sfx.nebDouble();
        const target = state.coresCollected * 2;
        iv = window.setInterval(() => setNebShown((v) => { const n = v + 1; if (n >= target && iv) window.clearInterval(iv); return Math.min(target, n); }), 90);
      }
      // the Nebulite beat lands AFTER the full score tally has stepped through
    }, tallyDur + 350);
    return () => { window.clearTimeout(t); if (iv) window.clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the board-clear reward, read straight from the tally step the summary reveals — the
  // pill is a NOTIFICATION of it; the points are added for real when the score ticks past
  // the "Board cleared" row below (nothing is awarded before the pop-up).
  const clearBonusAmt = endTally.find((t) => t.kind === "clear")?.delta ?? 0;
  const cfg = {
    // pills are flavour notifications of the reward — the actual numbers tally in below, live
    cleared: { color: theme.color.good, rgb: "52,217,139", title: CONTENT.endCard.clearedTitle, sub: "", pill: fmt(CONTENT.endCard.clearedPill, { n: clearBonusAmt.toLocaleString() }), icon: "check" as const },
    cashedout: { color: theme.color.gold, rgb: "232,181,63", title: CONTENT.endCard.cashedTitle, sub: CONTENT.endCard.cashedSub, pill: fmt(CONTENT.endCard.cashedPill, { n: cashedShown.toLocaleString() }), icon: "check" as const },
    gameover: { color: theme.color.bad, rgb: "255,90,118", title: CONTENT.endCard.overTitle, sub: CONTENT.endCard.overSub, pill: CONTENT.endCard.overPill, icon: "x" as const },
    outoftiles: { color: theme.color.pink, rgb: "255,111,165", title: CONTENT.endCard.tilesTitle, sub: CONTENT.endCard.tilesSub, pill: CONTENT.endCard.tilesPill, icon: "stack" as const },
  }[outcome];

  return (
    <PopupCard
      onClose={onExit ?? (() => {})}
      onBackdrop={onPlayAgain}
      hud={hud}
      // EXIT ✕ — only END OF THE LINE (no Continue leading to rewards / next level /
      // the versus comparison). Tapping outside always = Play again.
      showClose={!!(onExit && !onContinue && !(twoSlide && vPage === 0))}
      closeLabel="Exit to menu"
      width={380}
      zIndex={60}
      cardStyle={{
        borderRadius: 22,
        background: `radial-gradient(420px 240px at 50% -10%, rgba(${cfg.rgb},0.14), transparent 60%), ${theme.color.panel}`,
        border: `1px solid rgba(${cfg.rgb},0.4)`,
      }}
      bodyStyle={{ padding: "32px 40px 28px", textAlign: "center" }}
    >
        {/* gloss sweep across the card surface */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 22, overflow: "hidden", pointerEvents: "none" }}>
          <div className="gl-gloss" style={{ position: "absolute", top: 0, left: 0, width: "36%", height: "100%", background: "linear-gradient(100deg, transparent, rgba(210,230,255,0.07), transparent)" }} />
        </div>
        <StatusBadge color={cfg.color} icon={cfg.icon} />
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 27, color: cfg.color, marginTop: 14, letterSpacing: "0.01em" }}>
          {cfg.title}
        </div>
        {cfg.sub && (
          <div style={{ fontFamily: theme.fonts.mono, fontSize: 10.5, letterSpacing: "0.22em", color: theme.color.dim, marginTop: 4 }}>
            {cfg.sub}
          </div>
        )}
        {state.coop && (
          <div style={{ fontFamily: theme.fonts.mono, fontSize: 10.5, letterSpacing: "0.18em", marginTop: 6 }}>
            <span style={{ color: COOP_GREEN }}>{state.coop.names[0]}</span>
            <span style={{ color: theme.color.dim }}> &amp; </span>
            <span style={{ color: COOP_PURPLE }}>{state.coop.names[1]}</span>
          </div>
        )}
        {vres && vPage === 1 && (
          <div
            style={{
              fontFamily: theme.fonts.disp,
              fontWeight: 700,
              fontSize: 24,
              marginTop: 10,
              color: vres.winner === -1 ? theme.color.gold : vres.winner === 0 ? COOP_GREEN : COOP_PURPLE,
            }}
          >
            {vres.winner === -1
              ? CONTENT.friends.versusTieTitle
              : CONTENT.friends.versusWinnerTitle.replace("{name}", state.versus!.names[vres.winner])}
          </div>
        )}
        {state.coop && vPage === 1 && (
          <div style={{ fontFamily: theme.fonts.mono, fontSize: 10.5, letterSpacing: "0.22em", color: theme.color.dim, marginTop: 8 }}>
            {CONTENT.friends.coopContribTitle}
          </div>
        )}

        <div
          style={{
            fontFamily: theme.fonts.disp,
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.05,
            color: theme.color.gold,
            textShadow: "0 0 26px rgba(232,181,63,0.3)",
            margin: "8px 0 6px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {scoreShown.toLocaleString()}
        </div>

        <span style={{ display: "inline-block", fontFamily: theme.fonts.sans, fontWeight: 600, fontSize: 12.5, color: cfg.color, background: `rgba(${cfg.rgb},0.12)`, border: `1px solid rgba(${cfg.rgb},0.3)`, padding: "6px 14px", borderRadius: 999 }}>
          {cfg.pill}
        </span>

        <div style={{ height: 1, background: theme.color.border, margin: "14px 0 2px" }} />

        {twoSlide && vPage === 1 ? (
          vres ? <VersusCompare state={state} champs={champsBySeat} gems={gemsBySeat} /> : <CoopCompare state={state} champs={champsBySeat} gems={gemsBySeat} />
        ) : (
        <SummaryRow label={CONTENT.endCard.rowTimesBanked} value={`${myBanks}`} color={theme.color.gold} delay={140} info />
        )}
        {!(twoSlide && vPage === 1) && (
        <SummaryRow label={CONTENT.endCard.rowTimesBusted} value={`${myBusts}`} color={theme.color.bad} delay={220} info />
        )}
        {/* each end-of-run adjustment lights up as the big score ticks onto it */}
        {(!twoSlide || vPage === 0) && endTally.map((t, i) => {
          const meta = TALLY_META[t.kind];
          const label = t.kind === "tiles" && state.gemsLeftPenalty ? fmt(CONTENT.endCard.rowTilesOnBoard, { count: state.gemsLeftPenalty.count }) : meta.label;
          return (
            <SummaryRow key={i} label={label} value={`${t.delta >= 0 ? "+" : "−"}${Math.abs(t.delta).toLocaleString()}`} color={meta.color} show={revealed > i} />
          );
        })}
        {!(twoSlide && vPage === 1) && (
        <SummaryRow label={CONTENT.endCard.rowNebuliteBanked} value={`${nebShown}`} color={forfeits && nebShown === 0 ? theme.color.dim : "#c99cff"} badge={showX2 ? <span className="gl-drop-in" style={x2Badge}>×2</span> : undefined} show={revealed >= endTally.length} />
        )}

        {/* BEAT MY BOARD — the verdict against the challenger's score */}
        {challenge && (
          <div
            style={{
              marginTop: 12,
              fontFamily: theme.fonts.sans,
              fontWeight: 600,
              fontSize: 13.5,
              color: state.finalScore > challenge.target ? theme.color.good : theme.color.gold,
            }}
          >
            {(state.finalScore > challenge.target ? CONTENT.friends.endCardBeat : CONTENT.friends.endCardShort)
              .replace("{name}", challenge.name)
              .replace("{score}", challenge.target.toLocaleString())}
          </div>
        )}
        {twoSlide && vPage === 0 ? (
          <button style={{ ...primaryEndBtn, marginTop: 22 }} onClick={() => { sfx.click(); setVPage(1); }}>
            {CONTENT.endCard.continueBtn}
          </button>
        ) : onContinue ? (
          <>
            {/* next level unlocked → Continue is the preferred path */}
            <button style={{ ...primaryEndBtn, marginTop: 22 }} onClick={onContinue}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
              </svg>
              {CONTENT.endCard.continueBtn}
            </button>
            <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onPlayAgain}>
              {CONTENT.endCard.playAgain} <RefreshIcon />
            </button>
            {/* three buttons, never four: Continue takes Fresh board's seat —
                the quick-play escape can wait a screen */}
            {onShare && shareLabel && (
              <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onShare}>{shareLabel}</button>
            )}
          </>
        ) : challengePrimary && onShare && shareLabel ? (
          <>
            {/* the run RANKED — telling a friend leads; both replays follow */}
            <button style={{ ...primaryEndBtn, marginTop: 22 }} onClick={onShare}>{shareLabel}</button>
            <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onPlayAgain}>
              {CONTENT.endCard.playAgain} <RefreshIcon />
            </button>
            {onFreshBoard && (
              <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onFreshBoard}>
                {CONTENT.endCard.freshBoard}
              </button>
            )}
          </>
        ) : (
          <>
            <button style={{ ...primaryEndBtn, marginTop: 22 }} onClick={onPlayAgain}>
              {CONTENT.endCard.playAgain} <RefreshIcon />
            </button>
            {onShare && shareLabel && (
              <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onShare}>{shareLabel}</button>
            )}
            {/* YOU vs THE WORLD: Play again re-deals TODAY'S board — this is the
                way OUT to an ordinary quick deal instead */}
            {onFreshBoard && (
              <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onFreshBoard}>
                {CONTENT.endCard.freshBoard}
              </button>
            )}
          </>
        )}
    </PopupCard>
  );
}

function CoopFooterHud({ state, spectate, connectivity, champs, say, mySeat, duelFace }: {
  state: GameState;
  spectate: boolean;
  connectivity?: "live" | "async" | null;
  /** champion avatars floating above each side (online only; null = hidden) */
  champs?: { mine: string | null; theirs: string | null } | null;
  /** the transient catchphrase bubble (anchored to the speaking side) */
  say?: { seat: number; champion: string; text: string; id: number } | null;
  mySeat?: number | null;
  /** YOU vs THE HOUSE: the Broker's current expression — swaps the small
   *  floating avatar for her tall FIXED portrait behind the opponent box */
  duelFace?: string | null;
}) {
  const coop = (state.coop ?? state.versus)!;
  const active = coop.turn;
  const col = (idx: number) => (idx === 0 ? COOP_GREEN : COOP_PURPLE);
  // the viewer: hot-seat renders the ACTIVE seat; spectate preview renders the waiting seat
  const boxIdx = spectate ? active : active === 0 ? 1 : 0; // the right box = the OTHER seat
  const boxCol = col(boxIdx);
  const boxTiles = spectate ? state.hand.length : coop.partnerHand.length;
  // the box's NEXT is the tile the shown player will COME OUT WITH — the one
  // under their own NOW PLACING. Never hand[1]: that's the tile hidden in
  // their stack, which even they haven't been shown yet (info-leak, fixed
  // 2026-08-20 — the spectator could read the active player's upcoming gem).
  const boxNext = spectate ? state.hand[0] ?? null : coop.partnerHand[0] ?? null;
  const boxScore = state.versus ? (spectate ? state.score : state.versus.partnerScore) : null;
  const turnCol = col(active);
  const champNames = (CONTENT.challenges.characterNames ?? {}) as Record<string, string>;
  const sayMine = say && say.seat === mySeat;
  const hexPts = (cx: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, k) => {
      const a = Math.PI / 2 + (k * Math.PI) / 3;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy - r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  return (
    <>
      {!spectate && (
        <div key={`np-${active}`} className="gl-late-fade" style={{ position: "absolute", left: 0, right: 0, top: 2, zIndex: 8, textAlign: "center", pointerEvents: "none" }}>
          {/* the TIGHT cut (solo's former style, bug051 swap): every duo mode,
              every viewport — it must sit clear of the opponent's box */}
          <span style={{ fontFamily: theme.fonts.mono, fontWeight: 700, fontSize: 8.5, letterSpacing: "0.2em", color: theme.color.accent, opacity: 0.9 }}>
            {CONTENT.hud.nowPlacing}
          </span>
        </div>
      )}
      {/* the CHAMPION CATCHPHRASE — transient (5s), rising from the speaking
          side, briefly overlapping the board's bottom edge (by design) */}
      {say && (
        <div key={say.id} className="gl-fade" style={{ position: "absolute", left: 12, right: 12, bottom: "100%", marginBottom: !sayMine && duelFace ? 152 : 56, paddingRight: !sayMine && duelFace ? 28 : 0, zIndex: 9, pointerEvents: "none", display: "flex", justifyContent: sayMine ? "flex-start" : "flex-end" }}>
          <div style={{ position: "relative", maxWidth: 250, padding: "10px 13px", borderRadius: 14, ...(sayMine ? { borderBottomLeftRadius: 4 } : { borderBottomRightRadius: 4 }), background: "rgba(16,18,29,0.96)", border: "1px solid rgba(157,123,255,0.45)", boxShadow: "0 14px 30px rgba(0,0,0,0.55)", fontFamily: theme.fonts.sans, fontSize: 12.5, lineHeight: 1.45, color: "#e6ddff", textAlign: "left" }}>
            <span style={{ fontStyle: "italic" }}>“{say.text}”</span>
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.16em", color: theme.color.faint, marginTop: 6 }}>
              {champNames[say.champion] ?? say.champion}{sayMine ? ` · ${CONTENT.characters.championLabel}` : ""}
            </div>
            <div style={{ position: "absolute", bottom: -6, ...(sayMine ? { left: 20 } : { right: 20 }), width: 10, height: 10, transform: "rotate(45deg)", background: "rgba(16,18,29,0.96)", borderRight: "1px solid rgba(157,123,255,0.45)", borderBottom: "1px solid rgba(157,123,255,0.45)" }} />
          </div>
        </div>
      )}
      {/* champions FLOAT slightly above each player's side of the footer — the
          footer itself is untouched (design settled through 4 mockup rounds):
          mine far left above the turn line, theirs smaller above their box.
          In a HOUSE duel the Broker herself stands FIXED behind her box
          instead (expression-driven portrait, lower body tucked behind it). */}
      {champs?.mine && <img src={`/avatars/${champs.mine}.webp`} alt="" className="gl-float-y" style={{ position: "absolute", left: 12, top: -34, width: 30, height: "auto", zIndex: 7, pointerEvents: "none", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.55))" }} />}
      {duelFace ? (
        <img
          key={duelFace}
          src={`/avatars/broker-face-${duelFace}.webp`}
          alt=""
          className="gl-fade"
          style={{ position: "absolute", right: 10, top: -140, width: 120, height: "auto", zIndex: 7, pointerEvents: "none", filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6))" }}
        />
      ) : champs?.theirs ? (
        <img src={`/avatars/${champs.theirs}.webp`} alt="" className="gl-float-y" style={{ position: "absolute", right: 12, top: -26, width: 26, height: "auto", zIndex: 7, pointerEvents: "none", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.55))" }} />
      ) : null}
      <div key={`turn-${active}`} className="gl-turn-pop" style={{ position: "absolute", left: 16, top: 6, zIndex: 8, pointerEvents: "none" }}>
        {/* LIVE / ASYNC connectivity — a subtle indicator in the COMBO/LOG grey;
            the LIVE dot flickers + pulses ("I'm alive"), above the turn line */}
        {connectivity && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 1 }}>
            <span style={{ fontFamily: theme.fonts.mono, fontSize: 8, letterSpacing: "0.22em", color: theme.color.faint }}>
              {connectivity === "live" ? CONTENT.friends.connLive : CONTENT.friends.connAsync}
            </span>
            {connectivity === "live" && <span className="gl-live-flicker" style={{ width: 5, height: 5, borderRadius: 5, background: theme.color.faint }} />}
          </div>
        )}
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 8.5, letterSpacing: "0.24em", color: turnCol, opacity: 0.85 }}>
          {spectate ? CONTENT.friends.coopTurnLabel : CONTENT.friends.coopYourTurn}
        </div>
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 18, lineHeight: 1.25, color: turnCol, textShadow: `0 0 14px ${turnCol}66`, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {coop.names[active]}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 0, // flush with the footer card's right edge (bug031)
          top: 2,
          zIndex: 8,
          pointerEvents: "none",
          display: "flex",
          // the box reads inward: NEXT gem left, hex count centre, the player's
          // name/status/score RIGHT-aligned under their floating champion
          // (flipped 2026-08-20 with the champions feature)
          flexDirection: "row-reverse",
          alignItems: "center",
          gap: 9,
          // one height in BOTH modes: versus fills it with the score line,
          // co-op simply breathes — and both get the same footer overlap
          minHeight: 62,
          boxSizing: "border-box",
          padding: "6px 10px",
          borderRadius: 12,
          border: `1.5px solid ${boxCol}77`,
          background: duelFace
            ? `linear-gradient(180deg, ${boxCol}33, rgba(5,6,13,0.94))` // darker over her portrait, still translucent
            : `linear-gradient(180deg, ${boxCol}14, rgba(5,6,13,0.82))`,
          boxShadow: `0 4px 14px rgba(0,0,0,0.35)`,
        }}
      >
        <div style={{ minWidth: 0, textAlign: "right" }}>
          <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 14.5, color: boxCol, maxWidth: 78, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {coop.names[boxIdx]}
          </div>
          <div style={{ fontFamily: theme.fonts.mono, fontSize: 7.5, letterSpacing: "0.2em", color: connectivity === "async" ? theme.color.gold : theme.color.dim }}>
            {connectivity === "async" ? CONTENT.friends.connAway : spectate ? CONTENT.friends.coopPlaying : CONTENT.friends.coopWaiting}
          </div>
          {boxScore !== null && (
            <div style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.08em", color: boxCol, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
              {boxScore.toLocaleString()}
            </div>
          )}
        </div>
        <svg width="27" height="27" viewBox="0 0 27 27">
          <polygon points={hexPts(13.5, 13.5, 11.5)} fill="rgba(0,0,0,0.4)" stroke={boxCol} strokeWidth="1.4" />
          <text x="13.5" y="17" textAnchor="middle" fontFamily={theme.fonts.mono} fontSize="10.5" fill={boxCol}>
            {boxTiles}
          </text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <span style={{ fontFamily: theme.fonts.mono, fontSize: 7, letterSpacing: "0.2em", color: theme.color.dim }}>
            {CONTENT.friends.coopTheirNext}
          </span>
          {boxNext !== null ? <MiniGem value={boxNext} /> : <span style={{ color: theme.color.faint, fontSize: 11 }}>—</span>}
        </div>
      </div>
    </>
  );
}

function MiniGem({ value }: { value: number }) {
  const size = 20;
  const m = (theme.minerals as Record<number, { shape: string; hue: string }>)[value];
  const hue = value === 0 ? "#e8b53f" : value === 7 ? theme.color.accent : m?.hue ?? "#aeb6c2";
  const shape = m?.shape ?? "circle";
  const h = size / 2;
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {shape === "circle" || value === 0 || value === 7 ? (
        <circle cx={h} cy={h} r={h - 3} fill={hue} />
      ) : shape === "triangle" ? (
        <polygon points={poly([[h, 3], [size - 3, size - 4], [3, size - 4]])} fill={hue} />
      ) : shape === "diamond" ? (
        <polygon points={poly([[h, 2], [size - 3, h], [h, size - 2], [3, h]])} fill={hue} />
      ) : shape === "almond" ? (
        <ellipse cx={h} cy={h} rx={h - 6} ry={h - 3} transform={`rotate(28 ${h} ${h})`} fill={hue} />
      ) : shape === "pentagon" ? (
        <polygon points={poly([[h, 2], [size - 2.5, h - 1.5], [size - 5.5, size - 2.5], [5.5, size - 2.5], [2.5, h - 1.5]])} fill={hue} />
      ) : (
        <polygon points={poly([[h, 2], [size - 3, h - 3.5], [size - 3, h + 3.5], [h, size - 2], [3, h + 3.5], [3, h - 3.5]])} fill={hue} />
      )}
    </svg>
  );
}

/** The face-off column header: a fixed-height avatar slot (champion, else the
 *  player's account GEM, else empty) so both names always sit on the same line —
 *  a bare column must not let its name float up to avatar height (bug050). */
function CompareColHead({ champ, gem, name, color }: { champ?: string | null; gem?: Avatar | null; name: string; color: string }) {
  return (
    <span style={{ width: 76, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
      <span style={{ height: 28, display: "flex", alignItems: "flex-end" }}>
        {champ
          ? <img src={`/avatars/${champ}.webp`} alt="" style={{ width: 24, height: "auto", filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }} />
          : gem ? <AvatarGem avatar={gem} size={22} /> : null}
      </span>
      <span style={{ maxWidth: 76, textAlign: "right", fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 12, color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    </span>
  );
}

/** VERSUS end card: the face-to-face table — every stat the engine tracks per
 *  seat, two colour-coded columns, seat 0 (green) left. */
function VersusCompare({ state, champs, gems }: { state: GameState; champs?: [string | null, string | null] | null; gems?: [Avatar | null, Avatar | null] | null }) {
  const v = state.versus!;
  const act = v.turn; // the state's own fields are the ACTIVE seat's
  const seat = <T,>(mine: T, theirs: T): [T, T] => (act === 0 ? [mine, theirs] : [theirs, mine]);
  const F = CONTENT.friends;
  const rows: { label: string; vals: [string, string] }[] = [
    { label: F.versusRowScore, vals: seat(state.finalScore, v.partnerScore).map((n) => n.toLocaleString()) as [string, string] },
    { label: F.versusRowMaxBank, vals: seat(state.maxBankScore, v.partnerMaxBank).map((n) => n.toLocaleString()) as [string, string] },
    { label: F.versusRowBanks, vals: seat(state.banks, v.partnerBanks).map(String) as [string, string] },
    { label: F.versusRowFreeBanks, vals: seat(state.freeBanksLeft, v.partnerFreeBanks).map(String) as [string, string] },
    { label: F.versusRowLives, vals: seat(state.livesLeft, v.partnerLives).map(String) as [string, string] },
    { label: F.versusRowNebulite, vals: seat(state.coresCollected, v.partnerCores).map(String) as [string, string] },
  ];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 0, marginBottom: 4 }}>
        {([0, 1] as const).map((i) => (
          <CompareColHead key={i} champ={champs?.[i]} gem={gems?.[i]} name={v.names[i]} color={i === 0 ? COOP_GREEN : COOP_PURPLE} />
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${theme.color.border}` }}>
          <span style={{ flex: 1, textAlign: "left", fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.color.dim }}>{r.label}</span>
          <span style={{ width: 76, textAlign: "right", fontFamily: theme.fonts.mono, fontSize: 13, color: COOP_GREEN, fontVariantNumeric: "tabular-nums" }}>{r.vals[0]}</span>
          <span style={{ width: 76, textAlign: "right", fontFamily: theme.fonts.mono, fontSize: 13, color: COOP_PURPLE, fontVariantNumeric: "tabular-nums" }}>{r.vals[1]}</span>
        </div>
      ))}
    </div>
  );
}

/** CO-OP end card second slide: how much each player contributed to the shared
 *  score during play (banked points), plus their share of the total. */
function CoopCompare({ state, champs, gems }: { state: GameState; champs?: [string | null, string | null] | null; gems?: [Avatar | null, Avatar | null] | null }) {
  const c = state.coop!;
  const F = CONTENT.friends;
  const total = c.contrib[0] + c.contrib[1];
  const pct = (n: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : "—");
  // shared totals (banks/lives) are identical for both, so we skip those; the rest
  // are the per-player breakdown tracked at each turn boundary
  const rows: { label: string; vals: [string, string] }[] = [
    { label: F.coopRowBanked, vals: [c.contrib[0].toLocaleString(), c.contrib[1].toLocaleString()] },
    { label: F.coopRowShare, vals: [pct(c.contrib[0]), pct(c.contrib[1])] },
    { label: F.versusRowMaxBank, vals: [c.contribMaxBank[0].toLocaleString(), c.contribMaxBank[1].toLocaleString()] },
    { label: F.coopRowTimesBanked, vals: [String(c.contribBanks[0]), String(c.contribBanks[1])] },
    { label: F.versusRowNebulite, vals: [String(c.contribCores[0]), String(c.contribCores[1])] },
  ];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 0, marginBottom: 4 }}>
        {([0, 1] as const).map((i) => (
          <CompareColHead key={i} champ={champs?.[i]} gem={gems?.[i]} name={c.names[i]} color={i === 0 ? COOP_GREEN : COOP_PURPLE} />
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", alignItems: "baseline", padding: "4px 0", borderTop: `1px solid ${theme.color.border}` }}>
          <span style={{ flex: 1, textAlign: "left", fontFamily: theme.fonts.sans, fontSize: 12.5, color: theme.color.dim }}>{r.label}</span>
          <span style={{ width: 76, textAlign: "right", fontFamily: theme.fonts.mono, fontSize: 13, color: COOP_GREEN, fontVariantNumeric: "tabular-nums" }}>{r.vals[0]}</span>
          <span style={{ width: 76, textAlign: "right", fontFamily: theme.fonts.mono, fontSize: 13, color: COOP_PURPLE, fontVariantNumeric: "tabular-nums" }}>{r.vals[1]}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ color, icon }: { color: string; icon: "check" | "x" | "stack" }) {
  const hex = (() => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 3;
      pts.push(`${(24 + 22 * Math.cos(a)).toFixed(1)},${(24 + 22 * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  })();
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ filter: `drop-shadow(0 0 10px ${color}66)` }}>
      <polygon points={hex} fill="none" stroke={color} strokeWidth="2" opacity="0.9" />
      <g stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {icon === "check" && <path d="M17 24.5 L22 29.5 L31 19" />}
        {icon === "x" && (
          <>
            <line x1="18" y1="18" x2="30" y2="30" />
            <line x1="30" y1="18" x2="18" y2="30" />
          </>
        )}
        {icon === "stack" && (
          <>
            <line x1="17" y1="20" x2="31" y2="20" />
            <line x1="17" y1="24" x2="31" y2="24" />
            <line x1="17" y1="28" x2="31" y2="28" />
          </>
        )}
      </g>
    </svg>
  );
}

function SummaryRow({ label, value, color, badge, delay, show, info }: { label: string; value: string; color: string; badge?: React.ReactNode; delay?: number; show?: boolean; info?: boolean }) {
  // `show` (controlled) = the row pops in when its tally step lands; otherwise it rises in on a fixed delay
  const controlled = show !== undefined;
  const style: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0",
    ...(controlled
      ? { opacity: show ? 1 : 0, transform: show ? "none" : "translateY(8px)", transition: "opacity .3s ease, transform .3s ease" }
      : { animationDelay: delay ? `${delay}ms` : undefined }),
  };
  // `info` rows (Times banked / busted) are STATS, not score deltas — muted so they read
  // as separate from the score-affecting items below.
  return (
    <div className={controlled ? undefined : "gl-rise-in"} style={style}>
      <span style={{ color: info ? theme.color.faint : theme.color.dim, fontSize: 14 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {badge}
        <span style={{ color: info ? theme.color.faint : color, fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 20 }}>{value}</span>
      </span>
    </div>
  );
}

const x2Badge: React.CSSProperties = { fontFamily: theme.fonts.disp, fontWeight: 800, fontSize: 13, color: "#1a0b2e", background: "linear-gradient(180deg,#e2c8ff,#b06bf5)", borderRadius: 8, padding: "2px 8px", boxShadow: "0 0 14px rgba(176,107,245,0.6)" };

// THE ACADEMY's TIP pill — top-left of the board (Cash Out owns top-right)
const tipPill: React.CSSProperties = {
  position: "absolute",
  top: 2,
  left: 2,
  zIndex: 12,
  display: "flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 11px",
  borderRadius: 999,
  border: "1px solid rgba(157,123,255,0.45)",
  background: "rgba(14,10,24,0.72)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  color: theme.color.accent,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.08em",
  cursor: "pointer",
  boxShadow: "0 10px 24px -8px rgba(0,0,0,0.7)",
};

/* ============================== combo choice chip ============================== */

/** The opening count: each numeral remounts (keyed) and plays its own scale-down
 *  fade; GO slams in with a bounce. Half-transparent so the board reads through. */
function CountdownOverlay({ value, anchor }: { value: "3" | "2" | "1" | "go"; anchor?: { x: number; y: number } | null }) {
  const go = value === "go";
  // centre on the board (anchor) when we have it, else fall back to the viewport
  // A zero-size flex box AT the anchor centres the content on it exactly — more robust
  // than shrink-to-fit + translate(-50%), which iOS could size to the containing block
  // (leaving start-aligned content sitting left of centre — the "GO! is off" report).
  const wrap: React.CSSProperties = anchor
    ? { position: "fixed", left: anchor.x, top: anchor.y, width: 0, height: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 30 }
    : { position: "fixed", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 30 };
  return (
    <div style={wrap} aria-hidden>
      <div
        key={value}
        className={go ? "gl-count-go" : "gl-count-num"}
        style={{
          fontFamily: theme.fonts.disp,
          fontWeight: 800,
          fontSize: go ? 96 : 168,
          lineHeight: 1,
          whiteSpace: "nowrap",
          letterSpacing: go ? "0.06em" : undefined,
          color: "rgba(255,255,255,0.5)",
          WebkitTextStroke: "2px rgba(255,255,255,0.75)",
          textShadow: "0 0 46px rgba(157,123,255,0.55), 0 6px 34px rgba(0,0,0,0.55)",
        }}
      >
        {go ? "GO!" : value}
      </div>
    </div>
  );
}

/** The hand-reveal EYE: same slam-in as GO!, with one blink mid-entrance. */
function EyeOverlay({ anchor }: { anchor?: { x: number; y: number } | null }) {
  // A zero-size flex box AT the anchor centres the content on it exactly — more robust
  // than shrink-to-fit + translate(-50%), which iOS could size to the containing block
  // (leaving start-aligned content sitting left of centre — the "GO! is off" report).
  const wrap: React.CSSProperties = anchor
    ? { position: "fixed", left: anchor.x, top: anchor.y, width: 0, height: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 30 }
    : { position: "fixed", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex: 30 };
  return (
    <div style={wrap} aria-hidden>
      <div className="gl-count-go" style={{ filter: "drop-shadow(0 0 40px rgba(157,123,255,0.5))" }}>
        <svg width="150" height="110" viewBox="0 0 150 110">
          {/* the open eye */}
          <g stroke="rgba(255,255,255,0.75)" strokeWidth="5" fill="none" strokeLinecap="round">
            <path d="M 14 55 Q 75 8 136 55 Q 75 102 14 55 Z" fill="rgba(255,255,255,0.08)" />
          </g>
          <circle cx="75" cy="55" r="19" fill="rgba(157,123,255,0.55)" stroke="rgba(255,255,255,0.75)" strokeWidth="4" />
          <circle cx="75" cy="55" r="8" fill="rgba(255,255,255,0.8)" />
          <circle cx="81" cy="48" r="3.4" fill="#fff" />
          {/* the blinking lid: a filled shape sweeping down and back up */}
          <g className="gl-eye-lid">
            <path d="M 14 55 Q 75 8 136 55 Q 75 102 14 55 Z" fill="#0b0d16" stroke="rgba(255,255,255,0.75)" strokeWidth="5" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/** The combo picker's countdown: a small blue ring beside the staged tile that
 *  drains over the auto-confirm window. Re-keyed on every switch so it restarts. */
function ChoiceTimerChip({ at, windowMs }: { at: { x: number; y: number } | null; windowMs: number }) {
  if (!at) return null;
  const R = 9;
  const C = 2 * Math.PI * R;
  return (
    <div style={{ position: "fixed", left: at.x + 26, top: at.y - 40, zIndex: 40, pointerEvents: "none" }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(10,14,24,0.85)", border: "1px solid rgba(77,163,255,0.5)", display: "grid", placeItems: "center", boxShadow: "0 0 12px rgba(77,163,255,0.35)" }}>
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="11" cy="11" r={R} fill="none" stroke="rgba(77,163,255,0.25)" strokeWidth="2.6" />
          <circle cx="11" cy="11" r={R} fill="none" stroke="#4da3ff" strokeWidth="2.6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={0}>
            <animate attributeName="stroke-dashoffset" from="0" to={C} dur={`${windowMs}ms`} fill="freeze" />
          </circle>
        </svg>
      </div>
    </div>
  );
}

/* ============================== the Academy briefing ============================== */

/** A single-message board pop-up — the Academy's ASCENT CHEER uses it. */
function PracticePopup({ copy, icon, onCombos, onContinue }: {
  copy: { title: string; body: string; combosButton?: string; continueButton: string };
  /** the emblem above the title — every board-start pop-up carries one, in the
   *  same visual language as the tips cards' per-page emblems */
  icon?: React.ReactNode;
  onCombos?: () => void;
  onContinue: () => void;
}) {
  return (
    <MiniPopup onClose={onContinue} closeOnBackdrop={false} width={360} zIndex={90} cardStyle={practiceCardSkin}>
      {icon && <div style={{ display: "flex", justifyContent: "center", margin: "2px 0 14px" }}>{icon}</div>}
      <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 24, color: theme.color.text, letterSpacing: "0.02em", textAlign: "center" }}>{copy.title}</div>
      <div style={{ fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.6, color: theme.color.dim, margin: "14px 0 6px", textAlign: "left" }}>{renderRich(copy.body)}</div>
      {copy.combosButton && onCombos && (
        <button style={{ ...secondaryEndBtn, width: "100%", justifyContent: "center", marginTop: 12 }} onClick={() => { sfx.click(); onCombos(); }}>{copy.combosButton}</button>
      )}
      <button style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => { sfx.click(); onContinue(); }}>{copy.continueButton}</button>
    </MiniPopup>
  );
}
const practiceCardSkin: React.CSSProperties = { padding: "26px 26px 22px", borderRadius: 22, background: "linear-gradient(180deg, rgba(60,36,90,0.35), rgba(13,11,20,0.6)), #0c0e18", border: "1px solid rgba(157,123,255,0.4)" };

/** THE ACADEMY's tips — a paged briefing card. Page 1 stars the Nebulite; the
 *  GLINT RUSH page joins the cycle once the rush has been reached; page 3 is
 *  board-clearing strategy. All copy is CMS content (content.academyTips). */
function AcademyTips({ content, pages, page, onPage, onClose, pageExtras }: {
  content: { button: string };
  pages: { key: string; kicker: string; title: string; lines: string[] }[];
  page: number;
  onPage: (p: number) => void;
  onClose: () => void;
  /** per-page secondary buttons (quick play's Combos & Values / How to Play) */
  pageExtras?: Record<string, { label: string; onClick: () => void }[]>;
}) {
  const pg = pages[Math.min(page, pages.length - 1)];
  return (
    <div style={{ ...modalScrim, zIndex: 70 }}>
      <div className="gl-fade" style={academyCard}>
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.3em", color: theme.color.accent }}>{pg.kicker}</div>
        {/* THE TUTOR fronts every tips page — the Broker's portrait replaces the
            per-page emblems, with her greeting under the title (idea #3; all CMS) */}
        <div style={{ display: "flex", justifyContent: "center", margin: "14px auto 4px" }}><TutorAvatar size={84} /></div>
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 26, letterSpacing: "0.02em", ...gradientText }}>{pg.title}</div>
        <p style={{ fontFamily: theme.fonts.sans, fontStyle: "italic", fontSize: 12.5, lineHeight: 1.5, color: "#cdb9ff", margin: "8px 10px 0", textAlign: "center" }}>
          “{CONTENT.characters.tutorLine}”
        </p>
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 9, letterSpacing: "0.2em", color: theme.color.faint, marginTop: 4 }}>
          — {(CONTENT.challenges.characterNames as Record<string, string>).broker} · {CONTENT.characters.tutorLabel}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14, textAlign: "left", minHeight: 128 }}>
          {pg.lines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={academyBullet}>{i + 1}</span>
              <span style={{ fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.dim }}>{renderRich(line)}</span>
            </div>
          ))}
        </div>
        {/* page cycle: arrows + dots (hidden when there's a single page) */}
        {pages.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 16 }}>
            <button style={academyArrow} aria-label="Previous tip" onClick={() => { sfx.click(); onPage((page - 1 + pages.length) % pages.length); }}>‹</button>
            {pages.map((_, i) => (
              <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === page ? theme.color.accent : "rgba(157,123,255,0.25)", transition: "background 0.2s" }} />
            ))}
            <button style={academyArrow} aria-label="Next tip" onClick={() => { sfx.click(); onPage((page + 1) % pages.length); }}>›</button>
          </div>
        )}
        {/* per-page side doors (Quick Play sends new starters to the combos
            sheet or the full how-to before they carry on) */}
        {(pageExtras?.[pg.key] ?? []).map((b) => (
          <button key={b.label} style={{ ...secondaryEndBtn, width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => { sfx.click(); b.onClick(); }}>
            {b.label}
          </button>
        ))}
        <button style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 10 }} onClick={onClose}>
          {content.button}
        </button>
      </div>
    </div>
  );
}

const academyArrow: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: `1px solid ${theme.color.border}`,
  background: "rgba(255,255,255,0.04)",
  color: theme.color.dim,
  fontSize: 20,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};
const academyCard: React.CSSProperties = {
  width: 380,
  maxWidth: "94vw",
  textAlign: "center",
  padding: "24px 22px 22px",
  borderRadius: 22,
  background: "linear-gradient(180deg, rgba(60,36,90,0.35), rgba(13,11,20,0.6)), #0c0e18",
  border: "1px solid rgba(157,123,255,0.4)",
  boxShadow: "0 40px 90px -24px rgba(0,0,0,0.8)",
};
const academyBullet: React.CSSProperties = {
  flex: "none",
  width: 22,
  height: 22,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  background: "rgba(157,123,255,0.14)",
  border: "1px solid rgba(157,123,255,0.4)",
  color: theme.color.accent,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 11,
};

/* ============================== info sheet ============================== */

function InfoSheet({ onClose }: { onClose: () => void }) {
  // opens on Minerals — the left tab first, so it reads left to right
  const [tab, setTab] = useState<"minerals" | "combos">("minerals");
  return (
    <div style={{ ...modalScrim, zIndex: 95 }} onClick={onClose}>
      <div className="gl-fade" style={infoCard} onClick={(e) => e.stopPropagation()}>
        {/* top bar: title + Close (mirrors the tutorial pop-up) */}
        <div style={infoTopBar}>
          <span style={infoTitle}>Combos &amp; values</span>
          <button onClick={onClose} style={closeBtn}>
            Close
          </button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 8, padding: "0 18px 12px" }}>
          {(["minerals", "combos"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 12,
                border: `1px solid ${tab === t ? theme.color.accent : theme.color.border}`,
                background: tab === t ? "rgba(192,132,252,0.12)" : theme.color.panelHi,
                color: tab === t ? theme.color.text : theme.color.dim,
                fontFamily: theme.fonts.disp,
                fontWeight: 600,
                fontSize: 13,
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* scrollable content */}
        <div style={{ overflowY: "auto", padding: "0 18px 18px" }}>
          {tab === "minerals" ? <TileLegend /> : <ComboLegend />}
        </div>
      </div>
    </div>
  );
}


/* ============================== bits ============================== */

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/* ============================== styles ============================== */

const gradientText: React.CSSProperties = {
  background: theme.color.gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};
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
// secondary (non-solid) end-card action — used for Play again once Continue leads
const secondaryEndBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  width: "100%",
  padding: "11px 30px",
  borderRadius: 14,
  background: "none",
  border: `1px solid ${theme.color.border}`,
  color: theme.color.dim,
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 13.5,
};
// Elliptical cast shadow on the "ground" beneath the tilted board (depth spec §2).
// COLLAPSE keeps a raw dark radial vignette (no blur) so the contracting board stays
// visible behind the word.
const collapseVignette: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: 30,
  background: "radial-gradient(62% 46% at 50% 50%, rgba(7,6,14,0.72), transparent 72%)",
};
// Red danger vignette pulsing at the frame edges during a collapse.
const dangerVignette: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  background: "radial-gradient(closest-side, transparent 55%, rgba(255,90,118,0.26) 100%)",
};
// The slim band between the board and NOW PLACING where the floating log toast lives.
// Roughly a 2-line toast tall, so the footer sits close to the board.
// BANK NOW overlays the whole HUD (SCORE/BANKS/BUSTS) with an opaque backing.
// Shared dark vignette behind the big animation moments (COLLAPSE / GLINT RUSH /
// MOTHER LODE) so their text always reads against the board. Consistent across all.

const modalScrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(4,4,10,0.74)",
  backdropFilter: "blur(3px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
  padding: 20,
};
const endCard: React.CSSProperties = {
  position: "relative",
  borderRadius: 22,
  padding: "32px 40px 28px",
  textAlign: "center",
  boxShadow: theme.color.shadow,
  width: 380,
  maxWidth: "92vw",
  // never let a long summary run off-screen — cap the height and scroll inside the card
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
};
// info pop-up — matches the tutorial card (same width + framing)
const infoCard: React.CSSProperties = {
  width: "min(94vw, 344px)",
  maxHeight: "min(88vh, 660px)",
  borderRadius: 30,
  background: "linear-gradient(180deg,#101320,#0b0d16)",
  border: "1px solid #262344",
  boxShadow: "0 40px 80px -20px rgba(0,0,0,0.7)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};
const infoTopBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 18px 12px",
};
const infoTitle: React.CSSProperties = {
  fontFamily: theme.fonts.disp,
  fontWeight: 700,
  fontSize: 16,
  color: theme.color.text,
};
const closeBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#857fab",
  fontFamily: theme.fonts.sans,
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
  padding: "4px 6px",
};

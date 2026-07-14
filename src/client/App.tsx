import { useCallback, useEffect, useRef, useState } from "react";
import { theme, bevelPrimary } from "./theme/theme";
import { REGIONS, regionVars } from "./theme/regions";
import { Backdrop } from "./ui/Backdrop";
import { RegionBackdrop } from "./ui/RegionBackdrop";
import { GameState, CORE, GLINT, RESURRECT, QUADRIANT, ZENITH, TileVal, EndTallyKind, cashOutValue, bestPlacementHint } from "./game/engine";
import { CONTENT } from "./content/content";
import { Board } from "./ui/Board";
import { TileGem } from "./ui/TileGem";
import { HUD, Footer, ComboLegend, TileLegend, LogPanel } from "./ui/Panels";
import { createPortal } from "react-dom";
import { useNebuliteGame, Mapper } from "./ui/useNebuliteGame";
import { FlyingOverlay } from "./ui/FlyingOverlay";
import { ComboLineupOverlay } from "./ui/ComboLineupOverlay";
import { CashOutButton, CashOutCeremony } from "./ui/CashOut";
import { RushOverlay, RushWind } from "./ui/RushOverlay";
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
import { AchievementsPage } from "./ui/AchievementsPage";
import { CollectionPage } from "./ui/CollectionPage";
import { recordRun, todayKey, loadStats, loadDaily, loadDailyPopupSeen, markDailyPopupSeen } from "./game/stats";
import { evalDailyForRun, pickDailyChallenges, crossedMilestoneTiers, abilityUnlocked, computeAchievements } from "./game/challenges";
import { communityPopupSeenDay, dailyRun, fetchDaily, markCommunityPopupSeen, submitAllTimeScore, submitDailyScore } from "./game/redditDaily";
import { CommunityDailyPopup } from "./ui/CommunityDailyPopup";
import type { DailyResponse } from "../shared/api";
import type { DailyMetric } from "../shared/api";
import { reconcileGrants, earnItem, grant, ownedMusic, stickers, rewardTarget } from "./game/collection";
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
import { academyFlags, markIntroSeen, markRushSeen, markBankTipSeen } from "./game/academy";
import { GameHeader } from "./ui/GameHeader";
import { ShopPage } from "./ui/ShopPage";
import { loadWallet, saveWallet } from "./game/wallet";
import { Tutorial } from "./ui/Tutorial";
import { TutorialLevel } from "./ui/TutorialLevel";
import { Level, LEVELS, LEVEL_DEFS, RunResult } from "./levels/levels";
import { recordScore, completeLevel, recordLevelResult, storedFrontier, levelStatus, tutorialDone, markTutorialDone } from "./levels/progress";
import { sfx } from "./audio/sfx";
import { music, MusicTheme } from "./audio/music";
import { Settings, DEFAULT_SETTINGS, loadSettings, saveSettings, applySettings } from "./ui/settings";
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
export default function App() {
  const { state, anim, settling, onPlace, start, setMapper, earlyBankOffer, bankNow, swapHand, rotateHand, cashOutNow, handRevealed, setBoardHeld } = useNebuliteGame(6);
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
  // the end-of-Tutorial celebration (grants the first sticker, then hands off)
  const [tutorialCompleteOpen, setTutorialCompleteOpen] = useState(false);
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

  // player settings (theme / motion / audio), persisted + applied globally
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"visual" | "audio" | "game" | "data" | "decor" | "about">("visual");
  const [showLB, setShowLB] = useState(false); // high-scores popup, opened from the shell header
  // Nebulite currency (earned from dailies + in-run Nebulites, spent in the Shop)
  const [nebulite, setNebulite] = useState(loadWallet);
  const addNebulite = useCallback((n: number) => setNebulite((v) => { const nv = Math.max(0, v + n); saveWallet(nv); return nv; }), []);
  const openSettings = useCallback((section: "visual" | "audio" | "game" | "data" | "decor" | "about" = "visual") => { sfx.click(); setSettingsSection(section); setShowSettings(true); }, []);
  // Shop purchase: spend Nebulite and grant the item (theme / track / decor)
  const buyItem = useCallback(
    (kind: "themes" | "music" | "decor", key: string, price: number) => {
      if (nebulite < price) return;
      sfx.click();
      addNebulite(-price);
      grant(kind, key);
    },
    [nebulite, addNebulite]
  );
  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
  }, [settings]);
  const updateSettings = (patch: Partial<Settings>) => {
    sfx.unlock();
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
  // THE ACADEMY (Level 1): the paged tips briefing. Auto-opens on the very
  // first Academy launch (Nebulite page) and on the first GLINT RUSH there
  // (rush page); the TIP pill re-opens it any time in the Academy.
  const [academyTips, setAcademyTips] = useState<{ open: boolean; page: number; solo?: boolean }>({ open: false, page: 0 });
  // the one-time PUZZLE BOARD briefing, opened over the board the first time the
  // first puzzle level is launched
  const [puzzleIntroOpen, setPuzzleIntroOpen] = useState(false);
  // pages UNLOCKED so far — each tip becomes accessible (in the cycle AND on the pill)
  // only once its moment has happened, so the briefing grows one slide at a time:
  // Nebulite from the start, Clearing after the first bank, GLINT RUSH once rush hits.
  const academyPageUnlocked = (key: string) =>
    key === "clearing" ? academyFlags().seenBankTip
    : key === "rush" ? academyFlags().rushReached || (currentLevel?.num === 1 && state.deathMatch)
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
    if (!anim.focused) {
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
  const startQuick = useCallback(() => {
    sfx.unlock(); sfx.click();
    setCelebrate(null);
    setCurrentLevel(null);
    dailyRun.day = null;
    dailyGameRef.current = null;
    const seedParam = new URLSearchParams(window.location.search).get("seed");
    start(seedParam ? { seed: Number(seedParam) } : {});
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
    start({ seed });
    setScreen("game");
  }, [start]);
  // Launch a campaign level's ENGINE game with its generator parameters. The NEXT
  // level's unlock requirement opens the log ("Bank 3 times to unlock Level 2") —
  // the goal to play for — as long as it hasn't been unlocked yet.
  const launchLevel = useCallback((level: Level, extra?: { obstacleSeed?: number }) => {
    sfx.unlock(); sfx.click();
    dailyRun.day = null; // a campaign level is never a daily attempt
    dailyGameRef.current = null;
    setCelebrate(null);
    setCurrentLevel(level);
    const { side, nebulites, dross, collapseAt1, collapseAt2, gaps, obstacles, boardShape, singularityAt, extraTiles } = level.params;
    const next = LEVELS[level.num + 1];
    const openingLog = next && next.num > storedFrontier() ? `${next.unlock} Level ${next.num}` : undefined;
    // RIG the board when clearing THIS level must let the player refine Nebulite(s)
    // — i.e. the NEXT level unlocks via "Acquire N Nebulite". Guarantees a 12-tile
    // Duneglass + Vigilite setup so the refine is achievable.
    const nebuliteRig = LEVEL_DEFS[level.num + 1]?.unlockRule?.type === "nebuliteAcquired";
    // THE ACADEMY (level 1) opens with the Nebulite tip, not the 3-2-1-GO count-in —
    // the briefing IS the intro there, so the count-in would just talk over it.
    const countdown = level.num === 1 ? false : level.countdown;
    start({ side, nebulites, dross, collapseAt1, collapseAt2, gaps, obstacles, shape: boardShape, singularityAt, handSize: 9 + (extraTiles ?? 0), openingLog, countdown, nebuliteRig, ...extra });
    setScreen("game");
    // THE ACADEMY (Level 1) introduces the Nebulite — its explainer pops over the
    // fresh board before play begins (only on a fresh launch, not on Restart).
    // the Nebulite briefing auto-opens on the FIRST Academy launch only
    if (level.num === 1 && !extra && !academyFlags().seenIntro) {
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
  useEffect(() => {
    if (state.phase === "playing") { recordedRef.current = false; setEndNav(null); setRewards([]); setRevealOpen(false); setAbilityUnlocks([]); setAbilityRevealOpen(false); setPuzzleReveal(null); setPuzzleRevealPending(null); return; }
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
    // advances (progression), and the FIRST completion hands over Blue Giant via
    // the celebration pop-up.
    if (currentLevel?.num === 0) {
      const fresh = completeLevel(currentLevel.num, run);
      const next = LEVELS[currentLevel.num + 1];
      const nav = next && (fresh || levelStatus(next.num) !== "locked") ? { nextNum: next.num, fresh } : null;
      const r = earnItem("sticker", "bluegiant"); // non-null only on the FIRST completion
      if (r) {
        markTutorialDone();
        setTutDone(true);
        haptic("unlock");
        markUnseen([r]);
        setCollectionAlert(true);
        setTutorialCompleteOpen(true); // suppresses the normal end card (see its guard)
      } else if (nav) {
        setEndNav(nav); // a revisit shows the normal end card purely to navigate onward
      }
      return;
    }
    recordScore(state.finalScore, currentLevel ? currentLevel.title : "Quick Start");
    // COMMUNITY LEADERBOARD: every run reports its score (the server keeps each
    // redditor's best); fire-and-forget, silently a no-op outside Reddit
    void submitAllTimeScore(state.finalScore, currentLevel ? currentLevel.title : "Quick Start");
    // DAILY CHALLENGE run -> submit today's METRIC to the subreddit board.
    // Resource metrics (Nebulite refined/banked, banks) follow the game's own
    // forfeit rule: a true game-over (busted out, no cash-out) banks nothing.
    // Skill feats (score, biggest single bank, chains banked) always count,
    // same as the personal leaderboard.
    if (dailyRun.day && !currentLevel) {
      const chainsBanked = (state.chainCounts.Convergence ?? 0) + (state.chainCounts.Harmony ?? 0) + (state.chainCounts.Accord ?? 0) + (state.chainCounts.Sweep ?? 0);
      const metricValue =
        dailyRun.metric === "bankscore" ? state.maxBankScore
        : dailyRun.metric === "refined" ? (gameOver ? 0 : Math.max(0, state.nebulitesRefined))
        : dailyRun.metric === "nebulite" ? (gameOver ? 0 : Math.max(0, state.coresCollected))
        : dailyRun.metric === "banks" ? (gameOver ? 0 : state.banks)
        : dailyRun.metric === "chains" ? chainsBanked
        : state.finalScore;
      // zeros never go up (a forfeited game-over would read as a broken "0" row)
      if (metricValue > 0) void submitDailyScore(metricValue, dailyRun.day);
      dailyRun.day = null;
    }
    // fold this run into the lifetime stats + today's daily-challenge progress
    const finished = {
      score: state.finalScore,
      won: state.phase === "won",
      busts: state.busts,
      // a game over forfeits every resource gain — they don't feed stats, dailies, grants,
      // milestones or achievements (matching the wallet Nebulite forfeit)
      drossCleared: gameOver ? 0 : state.drossCleared,
      nebulitesAcquired: gameOver ? 0 : state.nebulitesRefined,
      banks: gameOver ? 0 : state.banks,
      reachedRush: state.deathMatch,
      cashedOut: state.cashedOut > 0,
      fullDrift: (state.comboCounts.FullDrift ?? 0) > 0,
      levelNum: currentLevel?.num ?? -1,
      // Shape Shifter counts any non-hexagon EXCEPT the square — the square has
      // its own achievement (Four Corners)
      shaped: currentLevel ? currentLevel.params.boardShape !== "hexagon" && currentLevel.params.boardShape !== "square" : false,
      square: currentLevel?.params.boardShape === "square",
      harmony: (state.chainCounts.Harmony ?? 0) > 0,
      boss: currentLevel?.boss === true,
      maxBankScore: state.maxBankScore,
      chains: {
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
    // BONUS-GEM ABILITIES first unlocked by this run get their own pop-up (before
    // the collection reveal). Compare pre-run vs post-run earned state.
    const postStats = loadStats();
    const abilityTile: Record<string, number> = { invincible: RESURRECT, crimsonEndurance: QUADRIANT, superluminal: ZENITH };
    const newAbilities: AbilityUnlock[] = (CONTENT.achievements.abilityUnlock?.gems ?? [])
      .filter((g) => !abilityUnlocked(g.key, prevStats) && abilityUnlocked(g.key, postStats))
      .map((g) => ({ key: g.key, gemName: g.gemName, tileValue: abilityTile[g.key], blurb: g.blurb }));
    // record the campaign result + advance the frontier FIRST, so a "level"-trigger
    // Collection item (e.g. a puzzle sticker) sees the just-unlocked level below.
    let endNavNext: { nextNum: number; fresh: boolean } | null = null;
    if (currentLevel) {
      recordLevelResult(currentLevel.num, run);
      // A level's target only counts on a LEGITIMATE finish — cleared the board, cashed
      // out, or ran out of tiles. A game over never advances the campaign, even if the
      // target's number was hit mid-run (see `gameOver` above). Exit doesn't reach here.
      const fresh = completeLevel(currentLevel.num, run, !gameOver);
      const next = LEVELS[currentLevel.num + 1];
      if (next && (fresh || levelStatus(next.num) !== "locked")) endNavNext = { nextNum: next.num, fresh };
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
        const per = CONTENT.challenges.nebulitePerDaily ?? 5;
        for (const id of newDailies) {
          const entry = todays.find((e) => e.id === id);
          if (!entry) continue;
          if (entry.rewardKind === "nebulite") neb += per;
          else {
            const r = earnItem(entry.rewardKind, entry.rewardId);
            if (r) earned.push(r);
            else neb += per; // the item was already owned — the daily still pays
          }
        }
        // SET BONUS: closing out ALL THREE of today's dailies pays a one-off +10
        // (the CHALLENGE COMPLETED pop-up celebrates it). Fires on the run that
        // completes the last one — a fully-done set completes 0 new dailies.
        const doneNow = loadDaily().done;
        if (todays.length > 0 && todays.every((c) => doneNow.includes(c.id))) neb += 10;
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

  // THE ACADEMY, beat two: after the FIRST bank fully resolves, the briefing
  // returns (the cycle — now leading with Clearing) exactly once per player.
  useEffect(() => {
    if (screen !== "game" || currentLevel?.num !== 1) return;
    if (state.banks < 1 || anim.playing || state.phase !== "playing") return;
    if (academyTips.open || academyFlags().seenBankTip || !academyFlags().seenIntro) return;
    markBankTipSeen(); // unlocks the Clearing slide
    const cycle = CONTENT.academyTips.pages.filter((pg) => academyPageUnlocked(pg.key));
    const clearingIdx = cycle.findIndex((pg) => pg.key === "clearing");
    setAcademyTips({ open: true, page: Math.max(0, clearingIdx) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.banks, anim.playing, screen, currentLevel, state.phase]);

  // First GLINT RUSH in the Academy: auto-open the rush tips page (once the
  // rush announcement animation has finished).
  useEffect(() => {
    if (screen !== "game" || currentLevel?.num !== 1) return;
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
  const toast = state.log[0];

  // REGION THEME: a campaign level with a region carries its in-game treatment —
  // the atmosphere backdrop plus CSS-variable overrides that re-tint the chrome.
  // Generic ("blank") levels and Quick Start keep the standard violet nebula.
  const levelRegion =
    currentLevel && currentLevel.params.theme === "regions" && currentLevel.region
      ? REGIONS[currentLevel.region] ?? null
      : null;
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
        ? (currentLevel.region as MusicTheme)
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

  // THE TEACHING HINT — on the Tutorial level's real run (first two turns,
  // after 1s) and in The Academy (first turn and the turn after each bust,
  // after 3s), the best available placement glows tutorial-blue. Runs favour
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
    const tutorialTurn = lvl === 0 && state.moves < 2;
    const academyTurn = lvl === 1 && (state.moves === 0 || bustHintArmedRef.current);
    if (!tutorialTurn && !academyTurn) return;
    const delay = lvl === 0 ? 2000 : 3000;
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

  // The most-recent log line floats up as a transient toast. Re-key it whenever a new
  // entry lands so the float-in/hold/float-out animation replays each time.
  const [toastId, setToastId] = useState(0);
  const lastLogRef = useRef<typeof toast | null>(null);
  useEffect(() => {
    if (toast && toast !== lastLogRef.current) {
      lastLogRef.current = toast;
      setToastId((n) => n + 1);
    }
  }, [toast]);

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
            {homeTab === "ascent" ? (
              // same keyed fade as the other tabs, so every tab switch feels alike
              <div key={homeTab} className="gl-rise-in" style={{ position: "absolute", inset: 0 }}>
                <LevelSelect
                  inShell
                  onQuickStart={startQuick}
                  onPlayLevel={startLevel}
                  celebrate={celebrate}
                  onCelebrated={() => setCelebrate(null)}
                  equippedTheme={settings.boardTheme && REGIONS[settings.boardTheme] ? settings.boardTheme : undefined}
                />
              </div>
            ) : (
              <div key={homeTab} className="gl-rise-in" style={{ position: "absolute", inset: 0 }}>
                {homeTab === "challenges" ? (
                  <ChallengesPage onQuickPlay={startQuick} onPlayLevel={startLevel} onOpenReward={openReward} onPlayDaily={startDaily} />
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
          className="gl-shell gl-screen-in"
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
        <HUD state={state} scoreRef={scoreRef} bustRef={bustRef} banksRef={banksRef} />
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
          <div className="gl-sheen-area">
          <div style={boardPanel}>
            <div style={boardGlow} />
            <div ref={boardBoxRef} style={{ position: "relative" }} className={anim.shake && settings.screenShake ? "gl-shake" : undefined}>
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
                      focusFromPointer(e);
                      setBoardPressed(true);
                    }}
                    onPointerUp={() => { setBoardHeld(false); setBoardPressed(false); }}
                    onPointerLeave={() => { setBoardHeld(false); setBoardPressed(false); }}
                    onPointerCancel={() => { setBoardHeld(false); setBoardPressed(false); }}
                    style={{
                      // press-zoom only on a precise (mouse) pointer; touch stays still on tap
                      // and only zooms once the placement animation runs (anim.focused).
                      transform: `scale(${anim.focused || (boardPressed && !COARSE_POINTER) ? fitScale ?? ZOOM_IN : ZOOM_BASE})`,
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

              {/* THE ACADEMY's TIP pill — reopen the briefing any time (Level 1 only) */}
              {currentLevel?.num === 1 && state.phase === "playing" && !academyTips.open && (
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
            {anim.motherLode && <MotherLodeOverlay ml={anim.motherLode} />}
          </div>

          {/* Slim band between the board and NOW PLACING. The most-recent log line
              FLOATS up from behind the footer into this band, holds ~3s, then floats
              up and fades. (BANK NOW no longer lives here — it overlays the HUD.) */}
          <div style={toastBand}>
            {toastId > 0 && <FloatingToast key={toastId} kind={toast.kind} text={toast.text} stay={toast.sticky} />}
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
          <div style={{ paddingTop: FOOTER_POKE, position: "relative", zIndex: 6 }}>
            <Footer
              state={state}
              hideNext={anim.playing}
              handRef={handRef}
              onRestart={startGame}
              onInfo={() => setSheet("combos")}
              onLog={() => setLogOpen((v) => !v)}
              onSwap={swapHand}
              onRotate={rotateHand}
              handRevealed={handRevealed}
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
          {state.phase !== "playing" && !anim.playing && !settling && !revealOpen && !abilityRevealOpen && !puzzleReveal && !puzzleRevealPending && !tutorialCompleteOpen && (
            <EndCard
              state={state}
              onPlayAgain={startGame}
              onContinue={
                // Continue exists when there's a NEXT STEP, chained in order:
                // ability unlock pop-up → collection reward reveal → next level.
                abilityUnlocks.length > 0
                  ? () => { sfx.click(); setAbilityRevealOpen(true); }
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
              pages={academyPages}
              page={Math.min(academyTips.page, academyPages.length - 1)}
              onPage={(p) => setAcademyTips({ open: true, page: p })}
              onClose={() => { sfx.click(); setAcademyTips({ open: false, page: 0 }); }}
            />
          )}

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
          onClose={() => setDailyPopup(null)}
          onOpenReward={openReward}
        />
      )}
      {exitConfirm && (
        <ConfirmDialog
          title={CONTENT.exitDialog.title}
          message={CONTENT.exitDialog.body}
          cancelLabel={CONTENT.exitDialog.cancel}
          confirmLabel={CONTENT.exitDialog.confirm}
          onCancel={() => setExitConfirm(null)}
          onConfirm={() => {
            const target = exitConfirm;
            setExitConfirm(null);
            setCelebrate(null);
            if (target === "shop") forceTabRef.current = "shop";
            setScreen("levels");
          }}
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
            setAbilityUnlocks([]);
            setAbilityRevealOpen(false);
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
      {tutorialCompleteOpen && (() => {
        const all = stickers();
        const idx = all.findIndex((s) => s.id === "bluegiant");
        return (
          <TutorialComplete
            copy={CONTENT.tutorialLevel.completion}
            sticker={idx >= 0 ? all[idx] : undefined}
            emblem={idx < 0 ? 0 : idx}
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

function EndCard({ state, onPlayAgain, onContinue }: { state: GameState; onPlayAgain: () => void; onContinue?: () => void }) {
  const won = state.phase === "won";
  const outOfLives = state.livesLeft <= 0;
  const outcome = state.cashedOut > 0 ? "cashedout" : won ? "cleared" : outOfLives ? "gameover" : "outoftiles";

  // a LOST run forfeits its in-run Nebulite: the summary counter drains back to
  // zero (with the forfeit sting) so the player watches the claim slip away.
  // A CLEARED board DOUBLES the banked Nebulite — a ×2 pops and the counter ticks
  // up from the base to double, with a boost sting. This is the SECOND beat: it
  // waits until the score has fully tallied and settled, then lands on its own.
  // a true LOST run forfeits its in-run Nebulite; a CASH-OUT (lost + cashedOut) banks it
  const forfeits = state.phase === "lost" && state.cashedOut === 0 && state.coresCollected > 0;
  const doubles = won && state.coresCollected > 0;
  const reducedMotion = document.documentElement.getAttribute("data-motion") === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [nebShown, setNebShown] = useState(state.coresCollected);
  const [showX2, setShowX2] = useState(false);

  // THE SCORE REVEAL: the header carried the board-collected score (scoreBase) into the
  // pop-up; here each end-of-run adjustment is applied FOR REAL — board-clear bonus,
  // unspent busts/banks/hand, tiles-left penalty — stepping the number up or down and
  // lighting the matching summary row as its delta lands, ending on the floored final.
  const [scoreShown, setScoreShown] = useState(state.scoreBase);
  const [revealed, setRevealed] = useState(0); // how many endTally steps have landed
  const tallyDur = 380 + state.endTally.length * 720; // total reveal time (for the Nebulite beat)
  useEffect(() => {
    const steps = state.endTally;
    if (reducedMotion || steps.length === 0) { setScoreShown(state.finalScore); setRevealed(steps.length); return; }
    let cancelled = false, raf = 0, cur = state.scoreBase;
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
  const clearBonusAmt = state.endTally.find((t) => t.kind === "clear")?.delta ?? 0;
  const cfg = {
    // pills are flavour notifications of the reward — the actual numbers tally in below, live
    cleared: { color: theme.color.good, rgb: "52,217,139", title: "BOARD CLEARED", sub: "", pill: `+${clearBonusAmt.toLocaleString()} board-clear bonus`, icon: "check" as const },
    cashedout: { color: theme.color.gold, rgb: "232,181,63", title: "CASHED OUT", sub: "RUN BANKED", pill: `+${state.cashedOut.toLocaleString()} banked from the abyss`, icon: "check" as const },
    gameover: { color: theme.color.bad, rgb: "255,90,118", title: "GAME OVER", sub: "OUT OF LIVES", pill: "Three busts — abyss claims the board", icon: "x" as const },
    outoftiles: { color: theme.color.pink, rgb: "255,111,165", title: "OUT OF TILES", sub: "STACK EMPTY", pill: "No tiles left to place", icon: "stack" as const },
  }[outcome];

  return (
    <div style={modalScrim} onClick={onPlayAgain}>
      <div
        className="gl-fade"
        style={{
          ...endCard,
          background: `radial-gradient(420px 240px at 50% -10%, rgba(${cfg.rgb},0.14), transparent 60%), ${theme.color.panel}`,
          border: `1px solid rgba(${cfg.rgb},0.4)`,
        }}
        onClick={(e) => e.stopPropagation()}
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

        <SummaryRow label="Times banked" value={`${state.banks}`} color={theme.color.gold} delay={140} info />
        <SummaryRow label="Times busted" value={`${state.busts}`} color={theme.color.bad} delay={220} info />
        {/* each end-of-run adjustment lights up as the big score ticks onto it */}
        {state.endTally.map((t, i) => {
          const meta = TALLY_META[t.kind];
          const label = t.kind === "tiles" && state.gemsLeftPenalty ? `Tiles on board (${state.gemsLeftPenalty.count})` : meta.label;
          return (
            <SummaryRow key={i} label={label} value={`${t.delta >= 0 ? "+" : "−"}${Math.abs(t.delta).toLocaleString()}`} color={meta.color} show={revealed > i} />
          );
        })}
        <SummaryRow label="Nebulite banked" value={`${nebShown}`} color={forfeits && nebShown === 0 ? theme.color.dim : "#c99cff"} badge={showX2 ? <span className="gl-drop-in" style={x2Badge}>×2</span> : undefined} show={revealed >= state.endTally.length} />

        {onContinue ? (
          <>
            {/* next level unlocked → Continue is the preferred path */}
            <button style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 22 }} onClick={onContinue}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" />
              </svg>
              Continue
            </button>
            <button style={{ ...secondaryEndBtn, marginTop: 10 }} onClick={onPlayAgain}>
              Play again <RefreshIcon />
            </button>
          </>
        ) : (
          <button style={{ ...primaryBtn, marginTop: 22 }} onClick={onPlayAgain}>
            Play again <RefreshIcon />
          </button>
        )}
      </div>
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

/** THE ACADEMY's tips — a paged briefing card. Page 1 stars the Nebulite; the
 *  GLINT RUSH page joins the cycle once the rush has been reached; page 3 is
 *  board-clearing strategy. All copy is CMS content (content.academyTips). */
function AcademyTips({ pages, page, onPage, onClose }: { pages: (typeof CONTENT.academyTips.pages)[number][]; page: number; onPage: (p: number) => void; onClose: () => void }) {
  const A = CONTENT.academyTips;
  const pg = pages[Math.min(page, pages.length - 1)];
  return (
    <div style={{ ...modalScrim, zIndex: 70 }}>
      <div className="gl-fade" style={academyCard}>
        <div style={{ fontFamily: theme.fonts.mono, fontSize: 9.5, letterSpacing: "0.3em", color: theme.color.accent }}>{pg.kicker}</div>
        {/* per-page emblem: the Nebulite tile / the rush bolt / the clear check */}
        {pg.key === "nebulite" ? (
          <div className="gl-island-float" style={{ margin: "14px auto 4px", width: 64, filter: "drop-shadow(0 0 22px rgba(179,107,245,0.55))" }}>
            <TileGem value={CORE} size={64} />
          </div>
        ) : (
          <div style={{ margin: "14px auto 4px", width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: pg.key === "rush" ? "rgba(232,181,63,0.12)" : "rgba(52,217,139,0.12)", border: `1px solid ${pg.key === "rush" ? "rgba(232,181,63,0.45)" : "rgba(52,217,139,0.45)"}`, color: pg.key === "rush" ? theme.color.gold : theme.color.good, filter: `drop-shadow(0 0 18px ${pg.key === "rush" ? "rgba(232,181,63,0.4)" : "rgba(52,217,139,0.4)"})` }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {pg.key === "rush" ? <path d="M13 3 4 14h6l-1 7 9-11h-6z" fill="currentColor" stroke="none" /> : <path d="M20 6 9 17l-5-5" />}
            </svg>
          </div>
        )}
        <div style={{ fontFamily: theme.fonts.disp, fontWeight: 700, fontSize: 26, letterSpacing: "0.02em", ...gradientText }}>{pg.title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14, textAlign: "left", minHeight: 128 }}>
          {pg.lines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={academyBullet}>{i + 1}</span>
              <span style={{ fontFamily: theme.fonts.sans, fontSize: 13, lineHeight: 1.5, color: theme.color.dim }}>{line}</span>
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
        <button style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 14 }} onClick={onClose}>
          {A.button}
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

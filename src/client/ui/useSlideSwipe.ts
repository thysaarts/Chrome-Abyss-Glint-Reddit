import { useRef, useState } from "react";
import { sfx } from "../audio/sfx";

/**
 * SLIDE SWIPE — the shared gesture for dot-paged pop-up slides (daily detail,
 * daily cleared): the content follows the finger with a soft fade, releasing
 * past ±50px commits to the neighbouring slide, an 8px dead zone lets taps
 * click through, and touch-action pan-y leaves vertical scrolling alone.
 * Spread `bind` onto the slide wrapper and merge `style` into its style.
 */
export function useSlideSwipe(count: number, idx: number, setIdx: (i: number) => void): {
  bind: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
  style: React.CSSProperties;
} {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0), pid = useRef(-1), started = useRef(false);

  const go = (dir: 1 | -1) => {
    const n = idx + dir;
    if (n < 0 || n >= count) return;
    sfx.click();
    setIdx(n);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (count <= 1) return;
    startX.current = e.clientX; pid.current = e.pointerId; started.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pid.current) return;
    const dx = e.clientX - startX.current;
    if (!started.current) {
      if (Math.abs(dx) < 8) return; // a small move isn't a swipe — let taps click through
      started.current = true; setDragging(true);
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    setDragX(dx);
  };
  const onPointerUp = () => {
    if (!started.current) return;
    started.current = false; setDragging(false);
    if (dragX <= -50) go(1);
    else if (dragX >= 50) go(-1);
    setDragX(0);
  };

  return {
    bind: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    style: {
      touchAction: "pan-y",
      transform: `translateX(${dragX * 0.55}px)`,
      opacity: dragging ? Math.max(0.55, 1 - Math.abs(dragX) / 260) : 1,
      transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.25,0.8,0.3,1), opacity 0.25s",
    },
  };
}

import React from "react";
import { Avatar, SHAPE_PATH } from "../game/avatars";

/**
 * A player's gem avatar — the chosen shape filled with the chosen colour, with a
 * soft top gloss so it reads as a gem. Sized by `size`. Used in the Friends list,
 * the profile card, and the avatar picker.
 */
export function AvatarGem({ avatar, size = 34 }: { avatar: Avatar; size?: number }) {
  const id = `g-${avatar.shape}-${avatar.color.replace("#", "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.4" stopColor={avatar.color} />
          <stop offset="1" stopColor={avatar.color} />
        </linearGradient>
      </defs>
      <path d={SHAPE_PATH[avatar.shape]} fill={`url(#${id})`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.6" strokeLinejoin="round" />
      {/* a small specular highlight */}
      <ellipse cx="9.5" cy="8" rx="3" ry="1.6" fill="#ffffff" opacity="0.45" transform="rotate(-20 9.5 8)" />
    </svg>
  );
}

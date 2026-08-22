/**
 * ONLINE MATCH TRANSPORT — NOT PORTED to the Reddit build (Devvit's fetch
 * sandbox has no WebSockets, so the web build's Supabase Realtime lockstep
 * cannot run here). The Broker duel plays the same versus engine locally.
 * Only the shared MODE type lives on, because useNebuliteGame (ported
 * verbatim) types its together-game config with it.
 */
export type MatchMode = "versus" | "coop";

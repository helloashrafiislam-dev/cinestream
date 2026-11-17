import { AdSettings, AdSlot } from '../types.ts';

/**
 * Card-click navigation hijacking stays disabled (AdSense invalid-traffic risk).
 * Player pre-roll may open the owner's sponsor URL once before the embed is unlocked.
 */

export function tryCardClickAd(
  _itemKey: string,
  _settings?: AdSettings | null,
  _slots: AdSlot[] = []
): boolean {
  return false;
}

export function resolveOwnerAdTarget(
  settings?: AdSettings | null,
  slots: AdSlot[] = []
): { slot: AdSlot | null; url: string | null } {
  const slot =
    slots.find(s => s.position === 'popup_under' && s.enabled && Boolean(s.targetUrl?.trim())) ||
    null;
  const url = (slot?.targetUrl || settings?.popupTargetUrl || '').trim();
  return { slot, url: url || null };
}

/** True when master ads are on and a player/popup sponsor URL exists. */
export function canShowPlayerOwnerAd(
  settings?: AdSettings | null,
  slots: AdSlot[] = []
): boolean {
  if (!settings?.masterEnabled) return false;
  if (!settings.playerAdsEnabled && !settings.popupEnabled) return false;
  return Boolean(resolveOwnerAdTarget(settings, slots).url);
}

/**
 * Opens the owner's ad once per itemKey (session). Returns the slot used, if any.
 * Caller records the click / impression.
 */
export function openOwnerAdOnce(
  itemKey: string,
  settings?: AdSettings | null,
  slots: AdSlot[] = []
): { opened: boolean; slot: AdSlot | null; url: string | null } {
  if (!itemKey || !canShowPlayerOwnerAd(settings, slots)) {
    return { opened: false, slot: null, url: null };
  }

  const storageKey = `cinestream_owner_ad_${itemKey}`;
  try {
    if (sessionStorage.getItem(storageKey) === '1') {
      return { opened: false, slot: null, url: null };
    }
  } catch {
    // sessionStorage unavailable — still allow one open this call
  }

  const { slot, url } = resolveOwnerAdTarget(settings, slots);
  if (!url) return { opened: false, slot: null, url: null };

  try {
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // ignore
  }

  window.open(url, '_blank', 'noopener,noreferrer');
  return { opened: true, slot, url };
}

export function hasDirectStreamUrl(movie: { streamingUrl?: string | null } | null | undefined): boolean {
  return Boolean(movie?.streamingUrl && String(movie.streamingUrl).trim());
}

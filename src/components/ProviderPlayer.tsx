import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { AdSlot, AdSettings } from '../types.ts';
import { api } from '../services/api.ts';
import { canShowPlayerOwnerAd, openOwnerAdOnce } from '../utils/cardClickAdGate.ts';

interface ProviderPlayerProps {
  tmdbId: number;
  title: string;
  playerPath: string;
  providerName?: string | null;
  className?: string;
  adSlots?: AdSlot[];
  adSettings?: AdSettings;
}

/**
 * Provider embed player (NexStream or Vidsrc) — only mounted when the API returns a playerPath.
 * Server gates embeds behind Content Compliance (Verified providers / not disputed).
 * Loads a same-origin backend shell so provider secrets never ship in the React bundle.
 * Note: providers detect & block iframe sandbox — do not set sandbox on this frame.
 *
 * First click (hidden layer): owner ad → then unlock so provider ads/play receive later clicks.
 */
export const ProviderPlayer: React.FC<ProviderPlayerProps> = ({
  tmdbId,
  title,
  playerPath,
  providerName,
  className = '',
  adSlots = [],
  adSettings
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const ownerGateNeeded = canShowPlayerOwnerAd(adSettings, adSlots);
  const [ownerAdDone, setOwnerAdDone] = useState(!ownerGateNeeded);

  const src = `${playerPath}${playerPath.includes('?') ? '&' : '?'}v=${reloadKey}`;
  const label = providerName || 'Provider';
  const itemKey = `provider-player-${tmdbId}`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const needsGate = canShowPlayerOwnerAd(adSettings, adSlots);
    setOwnerAdDone(!needsGate);
  }, [tmdbId, playerPath, reloadKey, adSettings, adSlots]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(
        document.fullscreenElement ||
          // @ts-expect-error vendor-prefixed fullscreen element
          document.webkitFullscreenElement ||
          // @ts-expect-error vendor-prefixed fullscreen element
          document.msFullscreenElement
      );
      setIsFullscreen(active);
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('MSFullscreenChange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      document.removeEventListener('MSFullscreenChange', onFullscreenChange);
    };
  }, []);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey(k => k + 1);
  };

  const handleOwnerPreRoll = () => {
    const device = window.innerWidth < 768 ? 'mobile' : 'desktop';
    const result = openOwnerAdOnce(itemKey, adSettings, adSlots);
    if (result.opened && result.slot) {
      void api.recordAdClick(result.slot.id, device);
      void api.recordAdImpression(result.slot.id, device);
    }
    // Unlock provider embed whether or not a tab opened (no URL / already used → still play)
    setOwnerAdDone(true);
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      const active =
        document.fullscreenElement ||
        // @ts-expect-error vendor-prefixed fullscreen element
        document.webkitFullscreenElement ||
        // @ts-expect-error vendor-prefixed fullscreen element
        document.msFullscreenElement;

      if (!active) {
        const req =
          el.requestFullscreen?.bind(el) ||
          // @ts-expect-error vendor-prefixed requestFullscreen
          el.webkitRequestFullscreen?.bind(el) ||
          // @ts-expect-error vendor-prefixed requestFullscreen
          el.msRequestFullscreen?.bind(el);
        if (req) {
          await req();
          setIsFullscreen(true);
        }
      } else {
        const exit =
          document.exitFullscreen?.bind(document) ||
          // @ts-expect-error vendor-prefixed exitFullscreen
          document.webkitExitFullscreen?.bind(document) ||
          // @ts-expect-error vendor-prefixed exitFullscreen
          document.msExitFullscreen?.bind(document);
        if (exit) {
          await exit();
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.error('Fullscreen failed:', err);
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section
      ref={containerRef}
      className={`rounded-2xl overflow-hidden border border-neutral-800 bg-black ${
        isFullscreen ? 'rounded-none border-0' : ''
      } ${className}`}
      aria-label={`${title} video player`}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-neutral-950 border-b border-neutral-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white truncate">Watch · {title}</p>
          <p className="text-[10px] text-neutral-500">
            External player · {label}
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[9px] font-bold uppercase tracking-wide text-neutral-300">
              {label}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRetry}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
            title="Reload stream"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              void toggleFullscreen();
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className={`relative w-full bg-black ${isFullscreen ? 'h-[calc(100vh-44px)]' : 'aspect-video'}`}>
        {loading && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950/90 text-neutral-300">
            <Loader2 className="w-7 h-7 animate-spin text-red-500" />
            <p className="text-xs">Loading stream…</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center bg-neutral-950">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-neutral-300">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-white cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}

        <iframe
          key={reloadKey}
          title={`${title} — ${label}`}
          src={src}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen *"
          allowFullScreen
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError('Network error while loading the stream player.');
          }}
        />

        {/* Hidden owner pre-roll: first click → your ad, then provider embed/ads */}
        {!loading && !error && !ownerAdDone && (
          <button
            type="button"
            onClick={handleOwnerPreRoll}
            className="absolute inset-0 z-30 cursor-pointer border-0 bg-transparent"
            aria-label={`Continue to watch ${title}`}
            title=""
          />
        )}
      </div>
    </section>
  );
};

/** @deprecated Prefer ProviderPlayer — kept for existing imports */
export const NexStreamPlayer = ProviderPlayer;

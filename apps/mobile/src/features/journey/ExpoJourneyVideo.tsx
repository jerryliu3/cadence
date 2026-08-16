import { useEffect } from "react";
import { StyleSheet } from "react-native";
import type { AssetSource } from "@cadence/shared/journey";
import { VideoView, useVideoPlayer } from "expo-video";

interface ExpoJourneyVideoProps {
  source: AssetSource | null;
  enabled: boolean;
  paused: boolean;
  onReady: () => void;
}

export function ExpoJourneyVideo({
  source,
  enabled,
  paused,
  onReady,
}: ExpoJourneyVideoProps) {
  const player = useVideoPlayer(
    source ? { uri: source.url } : null,
    (videoPlayer) => {
      videoPlayer.loop = true;
      videoPlayer.muted = true;
      if (enabled && !paused) {
        videoPlayer.play();
      }
    }
  );

  useEffect(() => {
    if (!enabled || paused) {
      try {
        player.pause();
      } catch {
        // no-op; next foreground cycle re-attempts playback
      }
      return;
    }
    try {
      player.play();
    } catch {
      // Player can fail while surface initializes; poster remains visible.
    }
  }, [enabled, paused, player]);

  if (!enabled || !source) {
    return null;
  }

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      onFirstFrameRender={onReady}
    />
  );
}

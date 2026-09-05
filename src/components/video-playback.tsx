import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

type VideoPlaybackProps = {
  uri: string;
};

/** A signed-URL video with native playback controls -- used both for a
 * client's own submitted Form Check video and the coach's optional
 * follow-up. useVideoPlayer/VideoView is expo-video's current API
 * (expo-av is deprecated); nativeControls gives play/pause/scrub for
 * free rather than building a custom player for a one-off clip. */
export function VideoPlayback({ uri }: VideoPlaybackProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });

  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  video: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: Spacing.two,
    backgroundColor: Colors.background,
  },
});

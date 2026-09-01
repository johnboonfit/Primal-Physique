import { Colors } from '@/constants/theme';

/**
 * Primal Physique has one fixed brand theme — it doesn't follow the
 * device's light/dark setting. This hook just hands back that palette;
 * kept as a hook (rather than importing Colors directly) so screens don't
 * need to change if that ever becomes theme-able again.
 */
export function useTheme() {
  return Colors;
}

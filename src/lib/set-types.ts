/**
 * The four set types a coach can tag an individual set with. Fixed,
 * built into the app -- not something a coach ever writes -- so a
 * client sees the exact same accurate explanation every time, no matter
 * which coach or which exercise. See workout-set-types.sql for why this
 * lives in code instead of a database table.
 */
export type SetType = 'normal' | 'drop_set' | 'rest_pause' | 'fst7';

export const SET_TYPES: { key: SetType; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'drop_set', label: 'Drop Set' },
  { key: 'rest_pause', label: 'Rest-Pause' },
  { key: 'fst7', label: 'FST-7' },
];

/**
 * Shown to the client on the set itself. Null for a normal set -- there's
 * nothing special to explain, it's just a straight working set.
 */
export const SET_TYPE_DESCRIPTIONS: Record<SetType, string | null> = {
  normal: null,
  drop_set:
    'Perform the set to your target reps (or near failure), then immediately reduce the weight by roughly 20-30% and keep going for as many more reps as you can, with no rest in between. If the plan calls for more than one drop, repeat the weight reduction again right after.',
  rest_pause:
    'Perform reps with a given weight to near failure, rack it and rest just 10-15 seconds, then immediately continue with the same weight for a few more reps. Repeat this brief rest-and-continue cycle 2-3 times -- the whole sequence counts as one set.',
  fst7:
    'Fascia Stretch Training: seven sets of the same exercise, done last for a muscle group, at a moderate weight for 8-12 reps with only 30-45 seconds rest between sets. Hold a deep stretch on the target muscle for 20-30 seconds after each set -- the short rest and repeated stretching are meant to pump blood into the muscle and stretch the fascia surrounding it.',
};

export function setTypeLabel(setType: SetType): string {
  return SET_TYPES.find((t) => t.key === setType)?.label ?? setType;
}

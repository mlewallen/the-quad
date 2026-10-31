/** Celebration moments the user can unlock. Order is the order shown in the treasure key. */
export type CelebrationId = 'first-initiative' | 'approve' | 'all-confirmed' | 'ten-plans';

export interface CelebrationDef {
  id: CelebrationId;
  title: string;
  /** How to unlock it, shown while locked. */
  how: string;
  /** Shown once unlocked. */
  flavor: string;
}

export const CELEBRATIONS: CelebrationDef[] = [
  {
    id: 'first-initiative',
    title: 'First stroke',
    how: 'Add the first initiative to an empty quarter.',
    flavor: 'Every quarter starts with one idea on the board.',
  },
  {
    id: 'approve',
    title: 'Stamp of approval',
    how: 'Move any initiative into the Approve phase.',
    flavor: 'Work made it to sign-off.',
  },
  {
    id: 'all-confirmed',
    title: 'Locked in',
    how: 'Confirm every assignment in a plan.',
    flavor: 'A whole plan with no loose ends.',
  },
  {
    id: 'ten-plans',
    title: 'Scenario machine',
    how: 'Create 10 plans in total, across any quarters.',
    flavor: 'Ten different futures, explored.',
  },
];

export const celebrationTitle = (id: CelebrationId) => CELEBRATIONS.find((c) => c.id === id)?.title ?? id;

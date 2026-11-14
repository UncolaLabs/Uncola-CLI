import { describe, expect, it } from 'vitest';
import { describeItem } from '../src/commands/show.ts';
import type { FeedItem } from '../src/feed.ts';

const at = Date.UTC(2026, 9, 20, 12);

describe('describeItem', () => {
  it('shows a goal with its linked activities', () => {
    const goal: FeedItem = {
      itemId: '52502618-aaaa', type: 'goal', timestamp: at, title: 'Ship CLI', description: 'v1',
      visibility: 'Private', progress: 40, status: 'in_progress', dueDate: '2026-11-30', linkedActivities: ['50f6d8af-bbbb'],
    };
    const activity: FeedItem = { itemId: '50f6d8af-bbbb', type: 'activity', timestamp: at, title: 'Wrote README' };
    const text = describeItem(goal, [goal, activity]);
    expect(text).toMatch(/^Goal · Ship CLI/);
    expect(text).toContain('Progress    40% · in progress');
    expect(text).toContain('Due         2026-11-30');
    expect(text).toContain('Activities (1)\n  50f6d8af  Wrote README');
    expect(text).toContain('Description\n  v1');
  });

  it('shows a 1:1 with action items and notes, skipping empty fields', () => {
    const text = describeItem({
      itemId: '3ff8e8b7-cccc', type: '1on1', timestamp: at, title: 'Weekly', participants: ['Nir'], discussionPoints: [],
      actionItems: [{ text: 'Send spec', completed: false, dueDate: 'Oct 25, 2026' }, { text: 'Done thing', completed: true }],
      notes: 'line one\nline two',
    });
    expect(text).toMatch(/  With +Nir/);
    expect(text).not.toContain('Discussion points');
    expect(text).not.toContain('Visibility');
    expect(text).toContain('Action items (2)\n  [ ] Send spec (due Oct 25, 2026)\n  [x] Done thing');
    expect(text).toContain('Notes\n  line one\n  line two');
  });

  it("names an activity's goal", () => {
    const text = describeItem({
      itemId: 'a', type: 'activity', timestamp: at, title: 'x', goalId: '52502618-aaaa', goalDetails: { title: 'Ship CLI' }, timeSpent: '1.5',
    });
    expect(text).toContain('Goal        Ship CLI (52502618)');
    expect(text).toContain('Time spent  1.5h');
  });
});

describe('referenceHint', () => {
  it('suggests a title word only one goal has', async () => {
    const { referenceHint } = await import('../src/commands/goal.ts');
    const goals = [
      { itemId: '6056b9d0', title: 'Earn the AI Practitioner badge', timestamp: 1 },
      { itemId: '6becb248', title: 'Earn a cloud architect certification', timestamp: 2 },
    ];
    expect(referenceHint(goals)).toContain('--goal 1 or --goal practitioner.');
  });
});

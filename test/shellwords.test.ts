import { describe, expect, it } from 'vitest';
import { shellSplit } from '../src/shellwords.ts';

describe('shellSplit', () => {
  it('splits like a shell', () => {
    expect(shellSplit(`log activity "Fixed the build" --desc 'It''s fine' --skills a,b`)).toEqual([
      'log', 'activity', 'Fixed the build', '--desc', 'Its fine', '--skills', 'a,b',
    ]);
  });
  it('handles escapes and empty quoted args', () => {
    expect(shellSplit(`a \\"b\\" "c \\"d\\"" ''`)).toEqual(['a', '"b"', 'c "d"', '']);
  });
  it('rejects unclosed quotes', () => {
    expect(() => shellSplit('log activity "oops')).toThrow(/Unclosed/);
  });
});

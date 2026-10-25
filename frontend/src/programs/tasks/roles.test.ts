import { describe, expect, it } from 'vitest';
import type { TaskPageRow, TaskPropertyOption, TaskPropertyRow } from '../../data/db';
import {
  defaultPriorityOption,
  isDoneOption,
  optionOfPage,
  priorityRank,
  statusRole,
  statusUrgency,
} from './roles';

const option = (id: string, label: string): TaskPropertyOption => ({ id, label, toneIndex: 0 });

const seeded = {
  options: [
    option('ns', 'Not started'),
    option('ip', 'In progress'),
    option('qc', 'Quality Check'),
    option('dn', 'Done'),
  ],
};

const renamed = {
  options: [
    option('a', 'Backlog'),
    option('b', 'Working'),
    option('c', 'Reviewing'),
    option('d', 'Shipped'),
  ],
};

const rolesOf = (owner: { options: TaskPropertyOption[] }) =>
  owner.options.map((o) => statusRole(owner, o));

describe('statusRole', () => {
  it('maps the seeded labels', () => {
    expect(rolesOf(seeded)).toEqual(['todo', 'doing', 'review', 'done']);
  });

  it('matches case and spacing loosely and accepts the legacy In Correction label', () => {
    const owner = { options: [option('x', ' IN correction '), option('y', 'DONE')] };
    expect(rolesOf(owner)).toEqual(['review', 'done']);
  });

  it('falls back to position for renamed labels', () => {
    expect(rolesOf(renamed)).toEqual(['todo', 'doing', 'review', 'done']);
  });

  it('treats extra middle options as review and a two-option list as todo then done', () => {
    const five = { options: ['a', 'b', 'c', 'd', 'e'].map((id) => option(id, id)) };
    expect(rolesOf(five)).toEqual(['todo', 'doing', 'review', 'review', 'done']);
    const two = { options: [option('a', 'Open'), option('b', 'Closed')] };
    expect(rolesOf(two)).toEqual(['todo', 'done']);
  });

  it('keeps a custom option added after Done open while Done stays done', () => {
    const added = { options: [...seeded.options, option('bl', 'Blocked')] };
    expect(rolesOf(added)).toEqual(['todo', 'doing', 'review', 'done', 'review']);
    expect(isDoneOption(added, added.options[4])).toBe(false);
  });

  it('returns null for a missing option or one outside the list', () => {
    expect(statusRole(seeded, undefined)).toBeNull();
    expect(statusRole(seeded, option('zz', 'Custom'))).toBeNull();
  });
});

describe('isDoneOption', () => {
  it('is true for Done and for a renamed last option only', () => {
    expect(isDoneOption(seeded, seeded.options[3])).toBe(true);
    expect(isDoneOption(seeded, seeded.options[0])).toBe(false);
    expect(isDoneOption(renamed, renamed.options[3])).toBe(true);
    expect(isDoneOption(renamed, renamed.options[2])).toBe(false);
    expect(isDoneOption(renamed, undefined)).toBe(false);
  });
});

describe('statusUrgency', () => {
  it('orders in progress, then review, then not started, with done and unknown last', () => {
    const order = (owner: { options: TaskPropertyOption[] }) =>
      [...owner.options].sort((a, b) => statusUrgency(owner, a) - statusUrgency(owner, b)).map((o) => o.id);
    expect(order(seeded)).toEqual(['ip', 'qc', 'ns', 'dn']);
  });

  it('still sorts sensibly after every status is renamed', () => {
    const order = [...renamed.options]
      .sort((a, b) => statusUrgency(renamed, a) - statusUrgency(renamed, b))
      .map((o) => o.id);
    expect(order).toEqual(['b', 'c', 'a', 'd']);
    expect(statusUrgency(renamed, undefined)).toBe(3);
  });
});

describe('priorityRank', () => {
  const priority = { options: [option('h', 'Urgent'), option('m', 'Normal'), option('l', 'Later')] };

  it('is the option index, or the option count for a missing one', () => {
    expect(priorityRank(priority, priority.options[0])).toBe(0);
    expect(priorityRank(priority, priority.options[2])).toBe(2);
    expect(priorityRank(priority, undefined)).toBe(3);
    expect(priorityRank(priority, option('gone', 'Gone'))).toBe(3);
  });
});

describe('defaultPriorityOption', () => {
  it('prefers a Medium label, else the middle option', () => {
    const labelled = { options: [option('a', 'High'), option('b', 'Low'), option('c', 'medium ')] };
    expect(defaultPriorityOption(labelled)?.id).toBe('c');
    const plain = { options: [option('a', 'Urgent'), option('b', 'Normal'), option('c', 'Later')] };
    expect(defaultPriorityOption(plain)?.id).toBe('b');
    expect(defaultPriorityOption({ options: [] })).toBeUndefined();
  });
});

describe('optionOfPage', () => {
  const property = { id: 'p', options: seeded.options } as TaskPropertyRow;
  const page = (value: unknown) => ({ values: { p: value } }) as unknown as TaskPageRow;

  it('resolves a stored id and ignores null, missing and orphaned values', () => {
    expect(optionOfPage(property, page('ip'))?.id).toBe('ip');
    expect(optionOfPage(property, page(null))).toBeUndefined();
    expect(optionOfPage(property, page('gone'))).toBeUndefined();
    expect(optionOfPage(property, page(7))).toBeUndefined();
    expect(optionOfPage(undefined, page('ip'))).toBeUndefined();
  });
});

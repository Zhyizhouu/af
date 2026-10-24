import { describe, expect, it } from 'vitest';
import type { TaskPropertyOption } from '../../data/db';
import { parseTaskCommand } from './command';

const status: TaskPropertyOption[] = [
  { id: 's-ns', label: 'Not started', toneIndex: 4 },
  { id: 's-ip', label: 'In progress', toneIndex: 0 },
  { id: 's-qc', label: 'Quality Check', toneIndex: 3 },
  { id: 's-done', label: 'Done', toneIndex: 1 },
];
const priority: TaskPropertyOption[] = [
  { id: 'p-h', label: 'High', toneIndex: 5 },
  { id: 'p-m', label: 'Medium', toneIndex: 3 },
  { id: 'p-l', label: 'Low', toneIndex: 4 },
];

const parse = (text: string) => parseTaskCommand(text, status, priority);

describe('parseTaskCommand', () => {
  it('picks priority by prefix', () => {
    expect(parse('Fix bug !h').priorityId).toBe('p-h');
    expect(parse('Fix bug !med').priorityId).toBe('p-m');
  });

  it('picks status by prefix', () => {
    expect(parse('Task >prog').statusId).toBe('s-ip');
    expect(parse('Task >qual').statusId).toBe('s-qc');
    expect(parse('Task >done').statusId).toBe('s-done');
    expect(parse('Task >not').statusId).toBe('s-ns');
  });

  it('matches initials generically', () => {
    expect(parse('Task >qc').statusId).toBe('s-qc');
    expect(parse('Task >ip').statusId).toBe('s-ip');
  });

  it('maps >start to Not started', () => {
    expect(parse('Task >start').statusId).toBe('s-ns');
  });

  it('removes matched tokens and records them', () => {
    const result = parse('Write  >qc report !h');
    expect(result.title).toBe('Write report');
    expect(result.tokens).toEqual([
      { kind: 'status', optionId: 's-qc', label: 'Quality Check' },
      { kind: 'priority', optionId: 'p-h', label: 'High' },
    ]);
  });

  it('returns the text unchanged with no tokens', () => {
    expect(parse('  Just   a title ')).toEqual({ title: 'Just a title', tokens: [] });
  });

  it('keeps an unknown token in the title', () => {
    const result = parse('Ship !zzz now');
    expect(result.title).toBe('Ship !zzz now');
    expect(result.priorityId).toBeUndefined();
    expect(result.tokens).toEqual([]);
  });

  it('lets the last priority win', () => {
    const result = parse('Task !h !low');
    expect(result.priorityId).toBe('p-l');
    expect(result.tokens).toHaveLength(2);
  });

  it('gives an empty title when the text is only tokens', () => {
    const result = parse('!h >qc');
    expect(result.title).toBe('');
    expect(result.priorityId).toBe('p-h');
    expect(result.statusId).toBe('s-qc');
  });
});

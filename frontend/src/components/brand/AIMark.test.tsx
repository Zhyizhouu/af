import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AIMark, orbitPoints } from './AIMark';

describe('AIMark', () => {
  it('renders the AF text at size 36', () => {
    render(<AIMark size={36} />);
    expect(screen.getByText('AF')).toBeInTheDocument();
  });

  it('does not render visible AF text at size 18', () => {
    render(<AIMark size={18} />);
    expect(screen.getByText('AF')).toHaveAttribute('opacity', '0');
  });

  it('places the spark at the top of the ring at t=0', () => {
    const { spark } = orbitPoints(0, false);
    expect(spark.x).toBe(50);
    expect(spark.y).toBe(6);
  });

  it('completes a revolution in 1100ms while thinking', () => {
    const start = orbitPoints(0, true);
    const after = orbitPoints(1100, true);
    expect(after.spark).toEqual(start.spark);
  });
});

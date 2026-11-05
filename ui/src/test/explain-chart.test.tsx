import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadChart } from '@/components/gridflex/Charts';

describe('explainable demand chart', () => {
  it('selects the clicked planning slot', () => {
    const select = vi.fn();
    render(<LoadChart title="Planning evidence" series={[{ label: 'Baseline', data: Array(96).fill(40), cls: 'line' }]} selectedSlot={0} onSelectSlot={select} />);
    const chart = screen.getByRole('img', { name: 'Planning evidence' });
    vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 720, top: 0, right: 720, bottom: 260, height: 260, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(chart, { clientX: 360 });
    expect(select).toHaveBeenCalledWith(48);
  });
});

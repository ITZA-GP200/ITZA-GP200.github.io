import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContactDialog } from '@/components/ContactDialog';

function fill(name: string, email: string, message: string) {
  fireEvent.change(screen.getByLabelText('NAME'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('EMAIL'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('MESSAGE'), { target: { value: message } });
}

describe('ContactDialog', () => {
  it('shows what’s missing instead of sending', () => {
    const send = vi.fn();
    render(<ContactDialog open onClose={vi.fn()} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'SEND' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your name');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends, then thanks the sender', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<ContactDialog open onClose={vi.fn()} send={send} />);
    fill('Kim', 'kim@example.com', 'Hello');
    fireEvent.click(screen.getByRole('button', { name: 'SEND' }));
    expect(send).toHaveBeenCalledWith({ name: 'Kim', email: 'kim@example.com', message: 'Hello', website: '' });
    expect(await screen.findByText('Thanks, your message is on its way.')).toBeTruthy();
  });

  it('keeps the message and shows the error when sending fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('The contact service isn’t available on this site'));
    render(<ContactDialog open onClose={vi.fn()} send={send} />);
    fill('Kim', 'kim@example.com', 'Hello');
    fireEvent.click(screen.getByRole('button', { name: 'SEND' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t available on this site');
    expect(screen.getByLabelText('MESSAGE')).toHaveValue('Hello');
  });

  it('CANCEL closes it', () => {
    const onClose = vi.fn();
    render(<ContactDialog open onClose={onClose} send={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(onClose).toHaveBeenCalled();
  });
});

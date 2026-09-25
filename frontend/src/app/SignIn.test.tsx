import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { SignIn } from './SignIn';

vi.mock('../data/firebase', () => ({
  authErrorMessage: () => 'Sign-in failed. Try again.',
  registerWithPassword: async () => {},
  resetPassword: async () => {},
  signInWithGoogle: async () => {},
  signInWithPassword: async () => {},
}));

describe('SignIn', () => {
  it('renders the sign-in heading and both inputs by id', () => {
    render(
      <MemoryRouter initialEntries={['/signin']}>
        <SignIn />
      </MemoryRouter>,
    );
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(document.getElementById('signin-email')).toBeInTheDocument();
    expect(document.getElementById('signin-password')).toBeInTheDocument();
  });

  it('switches to register mode when "Create an account" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/signin']}>
        <SignIn />
      </MemoryRouter>,
    );
    await user.click(screen.getByText('Create an account'));
    expect(screen.getByText('Create your account')).toBeInTheDocument();
  });

  it('starts in register mode when the URL carries ?mode=register', () => {
    render(
      <MemoryRouter initialEntries={['/signin?mode=register']}>
        <SignIn />
      </MemoryRouter>,
    );
    expect(screen.getByText('Create your account')).toBeInTheDocument();
  });
});

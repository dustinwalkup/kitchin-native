import { act, fireEvent, render, screen } from '@testing-library/react-native';

import SignIn from '@/app/sign-in';
import {
  type AuthApi,
  type AuthState,
  type SignInResult,
  useAuth,
} from '@/features/auth/auth-provider';
import { themes } from '@/ui/theme';

// Sign-in tests C-SIGN-01–08 (4-test-plan §4.3), with the auth provider mocked.

jest.mock('@/features/auth/auth-provider', () => ({ useAuth: jest.fn() }));

const EMAIL = 'member@example.com';
const INCORRECT = 'Email or password is incorrect';
const OFFLINE = "You're offline. Connect to sign in.";

const signIn = jest.fn<Promise<SignInResult>, [string, string]>();

function setAuth(state: AuthState = { status: 'signedOut', reason: 'none' }) {
  jest.mocked(useAuth).mockReturnValue({ state, signIn, signOut: jest.fn() } as AuthApi);
}

beforeEach(() => {
  signIn.mockReset();
  setAuth();
});

const emailField = () => screen.getByLabelText('Email');
const passwordField = () => screen.getByLabelText('Password');
const submitButton = () => screen.getByRole('button', { name: 'Sign in' });

async function fillIn(email: string, password: string) {
  await fireEvent.changeText(emailField(), email);
  await fireEvent.changeText(passwordField(), password);
}

async function submitWith(result: SignInResult) {
  signIn.mockResolvedValueOnce(result);
  await fireEvent.press(submitButton());
}

describe('sign-in screen', () => {
  it('C-SIGN-08 shows the logo tile, the Kitchin title and the tagline', async () => {
    await render(<SignIn />);

    expect(screen.getByRole('image', { name: 'Kitchin' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Kitchin' })).toHaveStyle({ fontSize: 34 });
    expect(screen.getByText('Groceries and meals, together')).toHaveStyle({
      color: themes.light.inkMuted,
    });
  });

  it('draws Sign in as a full-width primary button', async () => {
    await render(<SignIn />);

    expect(submitButton()).toHaveStyle({
      alignSelf: 'stretch',
      backgroundColor: themes.light.accent,
    });
  });

  it('C-SIGN-01 gives both fields the autofill attributes', async () => {
    await render(<SignIn />);

    expect(emailField()).toHaveProp('textContentType', 'username');
    expect(emailField()).toHaveProp('autoComplete', 'email');
    expect(emailField()).toHaveProp('keyboardType', 'email-address');
    expect(emailField()).toHaveProp('autoCapitalize', 'none');
    expect(passwordField()).toHaveProp('textContentType', 'password');
    expect(passwordField()).toHaveProp('autoComplete', 'current-password');
    expect(passwordField()).toHaveProp('secureTextEntry', true);
  });

  it.each([
    ['nothing', '', ''],
    ['an implausible email', 'member@example', 'secret'],
    ['an email with spaces', 'member @example.com', 'secret'],
    ['no password', EMAIL, ''],
  ])('C-SIGN-02 keeps Sign in disabled with %s, and sends nothing', async (_, email, password) => {
    await render(<SignIn />);

    await fillIn(email, password);
    expect(submitButton()).toBeDisabled();

    await fireEvent.press(submitButton());
    await fireEvent(passwordField(), 'submitEditing');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('C-SIGN-02 enables Sign in once both fields are valid', async () => {
    await render(<SignIn />);

    await fillIn(`  ${EMAIL} `, 'secret');

    expect(submitButton()).toBeEnabled();
  });

  it('C-SIGN-02 explains an invalid field once the member leaves it', async () => {
    await render(<SignIn />);

    await fireEvent.changeText(emailField(), 'member@');
    expect(screen.queryByText('Enter a valid email address.')).not.toBeOnTheScreen();

    await fireEvent(emailField(), 'blur');
    await fireEvent(passwordField(), 'blur');

    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
  });

  it('moves from email to password on Return, and submits from the password field', async () => {
    signIn.mockResolvedValue({ ok: true });
    await render(<SignIn />);
    await fillIn(EMAIL, 'secret');

    await fireEvent(emailField(), 'submitEditing');
    expect(signIn).not.toHaveBeenCalled();
    await fireEvent(passwordField(), 'submitEditing');

    expect(emailField()).toHaveProp('returnKeyType', 'next');
    expect(passwordField()).toHaveProp('returnKeyType', 'go');
    expect(signIn).toHaveBeenCalledWith(EMAIL, 'secret');
  });

  it('C-SIGN-03 is disabled with a spinner while the request is pending', async () => {
    let finish!: (result: SignInResult) => void;
    signIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await render(<SignIn />);
    await fillIn(EMAIL, 'secret');

    await fireEvent.press(submitButton());

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toBeBusy();

    await fireEvent.press(submitButton());
    expect(signIn).toHaveBeenCalledTimes(1);

    await act(async () => finish({ ok: false, reason: 'server' }));
    expect(submitButton()).toBeEnabled();
  });

  it('keeps the spinner after success, until the guards replace the screen', async () => {
    await render(<SignIn />);
    await fillIn(EMAIL, 'secret');

    await submitWith({ ok: true });

    expect(submitButton()).toBeBusy();
  });

  it('C-SIGN-04 shows one message for rejected credentials, whatever was wrong', async () => {
    await render(<SignIn />);

    await fillIn('unknown@example.com', 'secret');
    await submitWith({ ok: false, reason: 'invalid_credentials' });
    const first = screen.getByRole('alert');
    expect(first).toHaveTextContent(INCORRECT);

    await fillIn(EMAIL, 'wrong-password');
    await submitWith({ ok: false, reason: 'invalid_credentials' });
    expect(screen.getByRole('alert')).toHaveTextContent(INCORRECT);
  });

  it('C-SIGN-05 says when the device is offline, in its own words', async () => {
    await render(<SignIn />);
    await fillIn(EMAIL, 'secret');

    await submitWith({ ok: false, reason: 'offline' });

    expect(screen.getByRole('alert')).toHaveTextContent(OFFLINE);
    expect(OFFLINE).not.toBe(INCORRECT);
  });

  it('shows a plain message for any other failure', async () => {
    await render(<SignIn />);
    await fillIn(EMAIL, 'secret');

    await submitWith({ ok: false, reason: 'server' });

    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't sign in. Try again.");
  });

  it('C-SIGN-06 asks the member to sign in again after the session expired', async () => {
    setAuth({ status: 'signedOut', reason: 'expired' });
    await render(<SignIn />);

    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in again');
  });

  it('C-SIGN-06 says nothing on a normal sign-out', async () => {
    await render(<SignIn />);

    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('C-SIGN-07 offers no sign-up, password reset or invitation', async () => {
    await render(<SignIn />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/sign up|create|forgot|reset|invit|join/i)).not.toBeOnTheScreen();
  });
});

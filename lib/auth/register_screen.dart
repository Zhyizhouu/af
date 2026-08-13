import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../theme/af_text.dart';
import '../theme/af_tokens.dart';
import '../widgets/af_button.dart';
import '../widgets/af_field.dart';
import '../widgets/af_panel.dart';
import '../widgets/af_text_field.dart';
import 'auth_controller.dart';
import 'auth_page_scaffold.dart';
import 'sign_in_screen.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  String? _error;
  bool _busy = false;

  /// Firebase's own floor. Checked here so the failure is immediate rather
  /// than a round trip.
  static const _minPasswordLength = 6;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _validate() {
    if (_email.text.trim().isEmpty) return 'Enter an email address.';
    if (!_email.text.contains('@')) return 'That email address is not valid.';
    if (_password.text.length < _minPasswordLength) {
      return 'Use at least $_minPasswordLength characters for the password.';
    }
    if (_password.text != _confirm.text) return 'The passwords do not match.';
    return null;
  }

  Future<void> _register() async {
    final problem = _validate();
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }

    await _run(
      () => ref.read(authControllerProvider).register(
            email: _email.text,
            password: _password.text,
            displayName: _name.text,
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AuthPageScaffold(
      label: 'Create account',
      child: AFPanel(
        label: 'Create account',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // OAuth leads here too. Worth saying out loud that it doubles as
            // registration — otherwise a new user assumes the Google button
            // only works for accounts that already exist.
            AFButton(
              label: 'Continue with Google',
              expand: true,
              onPressed: _busy
                  ? null
                  : () => _run(
                        ref.read(authControllerProvider).signInWithGoogle,
                      ),
            ),
            const AFHint('Creates your account on first use — no password.'),
            const AuthDivider(),
            AFField(
              label: 'Name',
              value: 'optional',
              topSpacing: 0,
              child: AFTextField(
                controller: _name,
                mono: false,
                hint: 'What should we call you?',
                textCapitalization: TextCapitalization.words,
                enabled: !_busy,
              ),
            ),
            AFField(
              label: 'Email',
              child: AFTextField(
                controller: _email,
                hint: 'you@example.com',
                keyboardType: TextInputType.emailAddress,
                enabled: !_busy,
              ),
            ),
            AFField(
              label: 'Password',
              value: 'min $_minPasswordLength characters',
              child: PasswordField(
                controller: _password,
                enabled: !_busy,
              ),
            ),
            AFField(
              label: 'Confirm password',
              child: PasswordField(
                controller: _confirm,
                enabled: !_busy,
                onSubmitted: (_) => _register(),
              ),
            ),
            if (_error != null) AFHint(_error!),
            const SizedBox(height: 18),
            AFButton.ghost(
              label: _busy ? 'Creating…' : 'Create account with email',
              expand: true,
              onPressed: _busy ? null : _register,
            ),
            const SizedBox(height: 18),
            Center(
              child: GestureDetector(
                onTap: () => context.go('/signin'),
                child: Text.rich(
                  TextSpan(
                    style: AFText.meta(context),
                    children: [
                      const TextSpan(text: 'Already have an account?  '),
                      TextSpan(
                        text: 'Sign in',
                        style: AFText.mono(
                          size: 11.5,
                          color: t.accent,
                          weight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

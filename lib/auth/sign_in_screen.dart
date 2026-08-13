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

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();

  String? _error;
  String? _notice;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  /// Runs [action], funnelling any failure into the inline error line.
  ///
  /// The router redirects away on success, so nothing here navigates.
  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _signIn() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'Enter your email and password.');
      return;
    }
    await _run(
      () => ref.read(authControllerProvider).signInWithEmail(
            email: _email.text,
            password: _password.text,
          ),
    );
  }

  Future<void> _resetPassword() async {
    if (_email.text.trim().isEmpty) {
      setState(() => _error = 'Enter your email first, then tap reset.');
      return;
    }
    await _run(() async {
      await ref.read(authControllerProvider).sendPasswordReset(_email.text);
      if (mounted) {
        setState(() => _notice = 'Reset link sent to ${_email.text.trim()}.');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AuthPageScaffold(
      label: 'Sign in',
      child: AFPanel(
        label: 'Sign in',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // OAuth leads. It is the path that needs no password and no
            // console-side provider setup, so it gets the solid button and
            // the credential form drops to a ghost below.
            AFButton(
              label: 'Continue with Google',
              expand: true,
              onPressed: _busy
                  ? null
                  : () => _run(
                        ref.read(authControllerProvider).signInWithGoogle,
                      ),
            ),
            const AuthDivider(),
            AFField(
              label: 'Email',
              topSpacing: 0,
              child: AFTextField(
                controller: _email,
                hint: 'you@example.com',
                keyboardType: TextInputType.emailAddress,
                enabled: !_busy,
              ),
            ),
            AFField(
              label: 'Password',
              valueWidget: GestureDetector(
                onTap: _busy ? null : _resetPassword,
                child: Text(
                  'forgot?',
                  textAlign: TextAlign.right,
                  style: AFText.mono(size: 12, color: t.accent),
                ),
              ),
              child: _PasswordField(
                controller: _password,
                enabled: !_busy,
                onSubmitted: (_) => _signIn(),
              ),
            ),
            if (_error != null) AFHint(_error!),
            if (_notice != null) AFHint(_notice!, tip: true),
            const SizedBox(height: 18),
            AFButton.ghost(
              label: _busy ? 'Working…' : 'Sign in with email',
              expand: true,
              onPressed: _busy ? null : _signIn,
            ),
            const SizedBox(height: 18),
            Center(
              child: GestureDetector(
                onTap: () => context.go('/register'),
                child: Text.rich(
                  TextSpan(
                    style: AFText.meta(context),
                    children: [
                      const TextSpan(text: 'No account yet?  '),
                      TextSpan(
                        text: 'Register',
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

/// Password input with a reveal toggle, shared by both auth screens.
class _PasswordField extends StatefulWidget {
  final TextEditingController controller;
  final bool enabled;
  final ValueChanged<String>? onSubmitted;
  final String hint;

  const _PasswordField({
    required this.controller,
    required this.enabled,
    this.onSubmitted,
    this.hint = '••••••••',
  });

  @override
  State<_PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<_PasswordField> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final t = context.af;

    return AFTextField(
      controller: widget.controller,
      hint: widget.hint,
      enabled: widget.enabled,
      obscure: !_visible,
      onSubmitted: widget.onSubmitted,
      suffix: GestureDetector(
        onTap: () => setState(() => _visible = !_visible),
        child: Icon(
          _visible ? Icons.visibility_off_outlined : Icons.visibility_outlined,
          size: 17,
          color: t.muted,
        ),
      ),
    );
  }
}

/// Exposed so the register screen can reuse it.
class PasswordField extends StatelessWidget {
  final TextEditingController controller;
  final bool enabled;
  final ValueChanged<String>? onSubmitted;
  final String hint;

  const PasswordField({
    super.key,
    required this.controller,
    required this.enabled,
    this.onSubmitted,
    this.hint = '••••••••',
  });

  @override
  Widget build(BuildContext context) => _PasswordField(
        controller: controller,
        enabled: enabled,
        onSubmitted: onSubmitted,
        hint: hint,
      );
}

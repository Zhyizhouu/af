import 'dart:async';

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
import 'password_reset_throttle.dart';

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

  /// Ticks down only to show the wait. The server holds the real one, so a
  /// refresh clearing this changes nothing about when the next link can go.
  Duration? _cooldownLeft;
  Timer? _tick;

  @override
  void dispose() {
    _tick?.cancel();
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

  /// Runs [remaining] down a second at a time. A null or elapsed duration
  /// leaves the link enabled — the server will say no again if it disagrees.
  void _startCooldown(Duration? remaining) {
    _tick?.cancel();
    if (remaining == null || remaining <= Duration.zero) {
      setState(() => _cooldownLeft = null);
      return;
    }

    setState(() => _cooldownLeft = remaining);
    _tick = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      final left = (_cooldownLeft ?? Duration.zero) - const Duration(seconds: 1);
      setState(() => _cooldownLeft = left > Duration.zero ? left : null);
      if (_cooldownLeft == null) timer.cancel();
    });
  }

  /// Claiming the send burns the window even if the email then bounces, so a
  /// typo is worth catching here rather than costing somebody two minutes.
  static final _emailShape = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  Future<void> _resetPassword() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Enter your email first, then tap reset.');
      return;
    }
    if (!_emailShape.hasMatch(email)) {
      setState(() => _error = 'That email address is not valid.');
      return;
    }
    if (_busy) return;

    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });

    final auth = ref.read(authControllerProvider);
    try {
      await auth.sendPasswordReset(email);
      if (!mounted) return;
      setState(() => _notice = 'Reset link sent to $email.');
      // Seeded from the server's own policy, so the countdown matches what the
      // rules will actually enforce on the next attempt.
      _startCooldown(await auth.passwordResetCooldown());
    } on PasswordResetCooldown catch (cooldown) {
      if (!mounted) return;
      final left = cooldown.remaining;
      setState(() => _error = left == null || left <= Duration.zero
          ? 'A reset link went out recently. Try again shortly.'
          : 'A reset link went out recently. '
              'Try again in ${left.inSeconds + 1}s.');
      _startCooldown(left);
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  bool get _waiting =>
      _cooldownLeft != null && _cooldownLeft! > Duration.zero;

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
                onTap: _busy || _waiting ? null : _resetPassword,
                child: Text(
                  _waiting ? 'wait ${_cooldownLeft!.inSeconds + 1}s' : 'forgot?',
                  textAlign: TextAlign.right,
                  style: AFText.mono(
                    size: 12,
                    color: _waiting ? t.muted : t.accent,
                  ),
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

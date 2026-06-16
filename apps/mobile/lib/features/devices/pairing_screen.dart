import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../hologram/holo_state.dart';

enum _PairingStage {
  code,
  success,
  permissions,
}

class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key, required this.onPaired});

  final Widget Function(String deviceToken) onPaired;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  final _codeController = TextEditingController();
  final _apiController = TextEditingController(
    text: const String.fromEnvironment('JARVIS_API_URL', defaultValue: 'https://jarvis-api.onrender.com'),
  );
  HoloState _state = HoloState.idle;
  _PairingStage _stage = _PairingStage.code;
  bool _permissionsAccepted = false;
  bool _advancedOpen = false;
  String _deviceToken = '';
  String _message = 'Encontre seu codigo no Web Control Center.';

  @override
  void dispose() {
    _codeController.dispose();
    _apiController.dispose();
    super.dispose();
  }

  Future<void> _pair() async {
    setState(() {
      _state = HoloState.thinking;
      _message = 'Validando codigo e sincronizando dispositivos.';
    });

    try {
      final response = await http.post(
        Uri.parse('${_apiController.text.trim()}/devices/claim'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'code': _codeController.text.trim(),
          'friendlyName': 'Android Jarvis',
          'deviceType': 'mobile',
          'platform': 'Android',
          'publicKey': 'android-${DateTime.now().millisecondsSinceEpoch}',
        }),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode >= 400) {
        throw Exception(data['error'] ?? 'Codigo invalido ou expirado.');
      }
      setState(() {
        _deviceToken = data['token'] as String;
        _stage = _PairingStage.success;
        _state = HoloState.done;
        _message = 'Conta vinculada com sucesso. Sincronizacao pronta.';
      });
    } catch (error) {
      setState(() {
        _state = HoloState.error;
        _message = error.toString();
      });
    }
  }

  void _finishPermissions() {
    setState(() => _permissionsAccepted = true);
  }

  @override
  Widget build(BuildContext context) {
    if (_permissionsAccepted && _deviceToken.isNotEmpty) {
      return widget.onPaired(_deviceToken);
    }

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isTablet = constraints.maxWidth >= 720;
            final content = _JarvisPhoneSurface(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 320),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: _stageContent(),
              ),
            );

            if (!isTablet) {
              return Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 430),
                    child: content,
                  ),
                ),
              );
            }

            return Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1020),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: _TabletCommandPanel(
                          stage: _stage,
                          state: _state,
                          message: _message,
                        ),
                      ),
                      const SizedBox(width: 24),
                      SizedBox(width: 390, child: content),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _stageContent() {
    switch (_stage) {
      case _PairingStage.code:
        return _CodeStage(
          key: const ValueKey('code-stage'),
          codeController: _codeController,
          apiController: _apiController,
          advancedOpen: _advancedOpen,
          message: _message,
          state: _state,
          onToggleAdvanced: () => setState(() => _advancedOpen = !_advancedOpen),
          onPair: _pair,
        );
      case _PairingStage.success:
        return _SuccessStage(
          key: const ValueKey('success-stage'),
          onContinue: () => setState(() => _stage = _PairingStage.permissions),
        );
      case _PairingStage.permissions:
        return _PermissionsStage(
          key: const ValueKey('permissions-stage'),
          onFinish: _finishPermissions,
        );
    }
  }
}

class _JarvisPhoneSurface extends StatelessWidget {
  const _JarvisPhoneSurface({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(34),
        border: Border.all(color: Colors.white.withOpacity(0.20)),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF111923), Color(0xFF02050A)],
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x99000000), blurRadius: 48, offset: Offset(0, 24)),
          BoxShadow(color: Color(0x4425F4FF), blurRadius: 28),
        ],
      ),
      padding: const EdgeInsets.all(8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(27),
        child: Container(
          constraints: const BoxConstraints(minHeight: 700),
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -0.55),
              radius: 0.72,
              colors: [Color(0x3325F4FF), Color(0xFF061521), Color(0xFF02060C)],
            ),
          ),
          child: Stack(
            children: [
              const Positioned.fill(child: _DigitalGrid()),
              Positioned(
                top: 0,
                left: 112,
                right: 112,
                child: Container(
                  height: 24,
                  decoration: const BoxDecoration(
                    color: Color(0xFF02050A),
                    borderRadius: BorderRadius.vertical(bottom: Radius.circular(16)),
                  ),
                ),
              ),
              Positioned.fill(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

class _CodeStage extends StatelessWidget {
  const _CodeStage({
    super.key,
    required this.codeController,
    required this.apiController,
    required this.advancedOpen,
    required this.message,
    required this.state,
    required this.onToggleAdvanced,
    required this.onPair,
  });

  final TextEditingController codeController;
  final TextEditingController apiController;
  final bool advancedOpen;
  final String message;
  final HoloState state;
  final VoidCallback onToggleAdvanced;
  final VoidCallback onPair;

  @override
  Widget build(BuildContext context) {
    return _StageShell(
      step: '1',
      status: state == HoloState.error ? 'Codigo bloqueado' : 'Inserir codigo',
      orb: _HoloOrb(icon: Icons.auto_awesome, tone: _toneForState(state)),
      title: 'Digite seu codigo de vinculacao',
      subtitle: message,
      children: [
        _CodeInput(controller: codeController),
        _AdvancedApiField(
          controller: apiController,
          open: advancedOpen,
          onToggle: onToggleAdvanced,
        ),
        _JarvisButton(
          label: state == HoloState.thinking ? 'Sincronizando...' : 'Vincular',
          icon: Icons.link,
          onPressed: state == HoloState.thinking ? null : onPair,
        ),
        const _MiniLink(label: 'Como funciona?'),
      ],
    );
  }
}

class _SuccessStage extends StatelessWidget {
  const _SuccessStage({super.key, required this.onContinue});

  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return _StageShell(
      step: '2',
      status: 'Sincronizando',
      orb: const _HoloOrb(icon: Icons.check_rounded, tone: _StageTone.success),
      title: 'Conta vinculada com sucesso!',
      subtitle: 'Sincronizando dispositivos...',
      children: [
        const _SyncCard(icon: Icons.public, title: 'Web Control Center', status: 'Conectado'),
        const _SyncCard(icon: Icons.desktop_windows_outlined, title: 'Desktop Agent', status: 'Conectado'),
        const _SyncCard(icon: Icons.phone_android, title: 'Android Dispositivo', status: 'Sincronizado'),
        _JarvisButton(label: 'Continuar', icon: Icons.arrow_forward_rounded, onPressed: onContinue),
        const _SuccessLine(),
      ],
    );
  }
}

class _PermissionsStage extends StatelessWidget {
  const _PermissionsStage({super.key, required this.onFinish});

  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return _StageShell(
      step: '3',
      status: 'Permissoes',
      orb: const _HoloOrb(icon: Icons.lock_outline_rounded, tone: _StageTone.cyan, shield: true),
      title: 'Permissoes necessarias',
      subtitle: 'Para liberar todo o potencial do Jarvis, conceda os acessos abaixo.',
      children: [
        const _PermissionTile(icon: Icons.accessibility_new_rounded, title: 'Acessibilidade', copy: 'Permite automacoes inteligentes'),
        const _PermissionTile(icon: Icons.notifications_active_outlined, title: 'Notificacoes', copy: 'Receber alertas e comandos'),
        const _PermissionTile(icon: Icons.folder_open_rounded, title: 'Midia e arquivos', copy: 'Mostrar arquivos autorizados'),
        const _PermissionTile(icon: Icons.security_rounded, title: 'Uso em segundo plano', copy: 'Manter conexao segura'),
        _JarvisButton(label: 'Conceder permissoes', icon: Icons.verified_user_outlined, onPressed: onFinish),
      ],
    );
  }
}

class _StageShell extends StatelessWidget {
  const _StageShell({
    required this.step,
    required this.status,
    required this.orb,
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String step;
  final String status;
  final Widget orb;
  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 28, 18, 18),
      child: Column(
        key: ValueKey(step),
        children: [
          const _PhoneHeader(),
          const SizedBox(height: 28),
          _StepHex(step: step, status: status),
          const SizedBox(height: 20),
          orb,
          const SizedBox(height: 24),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 24, height: 1.02, fontWeight: FontWeight.w800, color: Colors.white),
          ),
          const SizedBox(height: 10),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, height: 1.25, color: Color(0xFF9DB7C9)),
          ),
          const SizedBox(height: 22),
          ...children.map((child) => Padding(padding: const EdgeInsets.only(bottom: 11), child: child)),
        ],
      ),
    );
  }
}

class _PhoneHeader extends StatelessWidget {
  const _PhoneHeader();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Spacer(),
        const Text(
          'JARVIS',
          style: TextStyle(
            color: Color(0xFFE5F6FF),
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: 2.2,
          ),
        ),
        const Spacer(),
        Icon(Icons.auto_awesome, size: 18, color: const Color(0xFF25F4FF).withOpacity(0.72)),
      ],
    );
  }
}

class _StepHex extends StatelessWidget {
  const _StepHex({required this.step, required this.status});

  final String step;
  final String status;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 46,
          height: 46,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFF25F4FF).withOpacity(0.72)),
            shape: BoxShape.circle,
            boxShadow: const [BoxShadow(color: Color(0x5525F4FF), blurRadius: 18)],
          ),
          child: Text(step, style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
        ),
        const SizedBox(width: 12),
        Text(status.toUpperCase(), style: const TextStyle(color: Color(0xFFBDEEFF), fontWeight: FontWeight.w800)),
      ],
    );
  }
}

enum _StageTone {
  cyan,
  success,
  warning,
  error,
}

_StageTone _toneForState(HoloState state) {
  switch (state) {
    case HoloState.error:
      return _StageTone.error;
    case HoloState.thinking:
    case HoloState.searching:
      return _StageTone.warning;
    case HoloState.done:
      return _StageTone.success;
    default:
      return _StageTone.cyan;
  }
}

class _HoloOrb extends StatefulWidget {
  const _HoloOrb({required this.icon, required this.tone, this.shield = false});

  final IconData icon;
  final _StageTone tone;
  final bool shield;

  @override
  State<_HoloOrb> createState() => _HoloOrbState();
}

class _HoloOrbState extends State<_HoloOrb> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 5))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(widget.tone);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return CustomPaint(
          painter: _OrbPainter(progress: _controller.value, color: color),
          child: Container(
            width: 134,
            height: 134,
            alignment: Alignment.center,
            child: Container(
              width: widget.shield ? 76 : 82,
              height: widget.shield ? 86 : 82,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: widget.shield ? BoxShape.rectangle : BoxShape.circle,
                borderRadius: widget.shield ? BorderRadius.circular(24) : null,
                border: Border.all(color: color.withOpacity(0.78)),
                color: color.withOpacity(0.08),
                boxShadow: [BoxShadow(color: color.withOpacity(0.42), blurRadius: 28)],
              ),
              child: Icon(widget.icon, color: color, size: 36),
            ),
          ),
        );
      },
    );
  }

  Color _toneColor(_StageTone tone) {
    switch (tone) {
      case _StageTone.success:
        return const Color(0xFF3DFF9C);
      case _StageTone.warning:
        return const Color(0xFFF9C857);
      case _StageTone.error:
        return const Color(0xFFFF5C72);
      case _StageTone.cyan:
        return const Color(0xFF25F4FF);
    }
  }
}

class _OrbPainter extends CustomPainter {
  const _OrbPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.3
      ..color = color.withOpacity(0.72);

    for (var index = 0; index < 3; index += 1) {
      final radius = 44 + index * 16 + (progress * 8);
      canvas.drawCircle(center, radius % 70 + 24, paint..color = color.withOpacity(0.52 - index * 0.12));
    }

    final arcPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = color.withOpacity(0.94);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: 62),
      progress * 6.28,
      1.3,
      false,
      arcPaint,
    );
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: 50),
      -progress * 6.28,
      1.8,
      false,
      arcPaint..color = color.withOpacity(0.62),
    );
  }

  @override
  bool shouldRepaint(covariant _OrbPainter oldDelegate) => true;
}

class _CodeInput extends StatelessWidget {
  const _CodeInput({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      textAlign: TextAlign.center,
      textCapitalization: TextCapitalization.characters,
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: 2.8, color: Colors.white),
      decoration: _inputDecoration('Codigo de vinculacao').copyWith(
        hintText: '7GK-298-XLB',
      ),
    );
  }
}

class _AdvancedApiField extends StatelessWidget {
  const _AdvancedApiField({
    required this.controller,
    required this.open,
    required this.onToggle,
  });

  final TextEditingController controller;
  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextButton.icon(
          onPressed: onToggle,
          icon: Icon(open ? Icons.expand_less : Icons.tune, size: 18),
          label: Text(open ? 'Ocultar API' : 'Configuracao avancada'),
        ),
        AnimatedCrossFade(
          firstChild: const SizedBox.shrink(),
          secondChild: TextField(
            controller: controller,
            decoration: _inputDecoration('URL da API'),
          ),
          crossFadeState: open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          duration: const Duration(milliseconds: 220),
        ),
      ],
    );
  }
}

InputDecoration _inputDecoration(String label) {
  return InputDecoration(
    labelText: label,
    labelStyle: const TextStyle(color: Color(0xFF9DB7C9)),
    filled: true,
    fillColor: const Color(0x66020A12),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0x5525F4FF)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFF25F4FF)),
    ),
  );
}

class _JarvisButton extends StatelessWidget {
  const _JarvisButton({required this.label, required this.icon, required this.onPressed});

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          boxShadow: const [BoxShadow(color: Color(0x5525F4FF), blurRadius: 24)],
        ),
        child: FilledButton.icon(
          onPressed: onPressed,
          icon: Icon(icon, size: 19),
          label: Text(label.toUpperCase()),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF176CFF),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0x55305868),
            textStyle: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 0.6),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ),
    );
  }
}

class _MiniLink extends StatelessWidget {
  const _MiniLink({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(label, style: const TextStyle(color: Color(0xFF88CFFF), fontSize: 13));
  }
}

class _SyncCard extends StatelessWidget {
  const _SyncCard({required this.icon, required this.title, required this.status});

  final IconData icon;
  final String title;
  final String status;

  @override
  Widget build(BuildContext context) {
    return _GlassTile(
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFFE5F6FF)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(status, style: const TextStyle(color: Color(0xFF3DFF9C), fontSize: 12)),
              ],
            ),
          ),
          const Icon(Icons.verified_rounded, color: Color(0xFF3DFF9C), size: 18),
        ],
      ),
    );
  }
}

class _PermissionTile extends StatelessWidget {
  const _PermissionTile({required this.icon, required this.title, required this.copy});

  final IconData icon;
  final String title;
  final String copy;

  @override
  Widget build(BuildContext context) {
    return _GlassTile(
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFFE5F6FF)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(copy, style: const TextStyle(color: Color(0xFF9DB7C9), fontSize: 12)),
              ],
            ),
          ),
          Switch(value: true, onChanged: (_) {}, activeColor: const Color(0xFF25F4FF)),
        ],
      ),
    );
  }
}

class _SuccessLine extends StatelessWidget {
  const _SuccessLine();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.check_circle_outline_rounded, color: Color(0xFF3DFF9C), size: 18),
        SizedBox(width: 7),
        Text('Tudo certo!', style: TextStyle(color: Color(0xFF3DFF9C), fontWeight: FontWeight.w800)),
      ],
    );
  }
}

class _GlassTile extends StatelessWidget {
  const _GlassTile({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0x66061220),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x3325F4FF)),
        boxShadow: const [BoxShadow(color: Color(0x220EA5FF), blurRadius: 18)],
      ),
      child: child,
    );
  }
}

class _TabletCommandPanel extends StatelessWidget {
  const _TabletCommandPanel({
    required this.stage,
    required this.state,
    required this.message,
  });

  final _PairingStage stage;
  final HoloState state;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 560),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0x5525F4FF)),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xAA071A2B), Color(0xCC02070D)],
        ),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 50)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF25F4FF)),
                  boxShadow: const [BoxShadow(color: Color(0x5525F4FF), blurRadius: 22)],
                ),
                child: const Icon(Icons.auto_awesome, color: Color(0xFF25F4FF)),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('JARVIS ANDROID APK', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 1.1)),
                    Text('Fluxo real responsivo para celular e tablet', style: TextStyle(color: Color(0xFF9DB7C9))),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          _TabletStep(label: '1. Inserir codigo', active: stage == _PairingStage.code, complete: stage.index > 0),
          _TabletStep(label: '2. Sincronizando', active: stage == _PairingStage.success, complete: stage.index > 1),
          _TabletStep(label: '3. Permissoes', active: stage == _PairingStage.permissions, complete: false),
          const Spacer(),
          Text(state.label.toUpperCase(), style: const TextStyle(color: Color(0xFF25F4FF), fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(message, style: const TextStyle(color: Color(0xFFCDEFFF), fontSize: 18, height: 1.25)),
        ],
      ),
    );
  }
}

class _TabletStep extends StatelessWidget {
  const _TabletStep({required this.label, required this.active, required this.complete});

  final String label;
  final bool active;
  final bool complete;

  @override
  Widget build(BuildContext context) {
    final color = complete ? const Color(0xFF3DFF9C) : active ? const Color(0xFF25F4FF) : const Color(0xFF4E6B82);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.48)),
        color: color.withOpacity(0.08),
      ),
      child: Row(
        children: [
          Icon(complete ? Icons.check_circle : Icons.hexagon_outlined, color: color),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: TextStyle(color: active || complete ? Colors.white : const Color(0xFF9DB7C9), fontWeight: FontWeight.w800))),
        ],
      ),
    );
  }
}

class _DigitalGrid extends StatelessWidget {
  const _DigitalGrid();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(painter: _DigitalGridPainter());
  }
}

class _DigitalGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final gridPaint = Paint()
      ..color = const Color(0x1125F4FF)
      ..strokeWidth = 1;
    for (var x = 0.0; x < size.width; x += 28) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (var y = 0.0; y < size.height; y += 28) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    final particlePaint = Paint()..color = const Color(0x6625F4FF);
    for (var i = 0; i < 34; i += 1) {
      final x = (i * 47) % size.width;
      final y = (i * 83) % size.height;
      canvas.drawCircle(Offset(x, y), i.isEven ? 1.4 : 2.1, particlePaint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

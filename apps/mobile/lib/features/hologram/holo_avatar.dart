import 'dart:math';
import 'package:flutter/material.dart';
import 'holo_state.dart';

class HoloAvatar extends StatefulWidget {
  const HoloAvatar({
    super.key,
    required this.state,
    required this.assistantName,
    required this.transcript,
    this.audioLevel = 0.4,
  });

  final HoloState state;
  final String assistantName;
  final String transcript;
  final double audioLevel;

  @override
  State<HoloAvatar> createState() => _HoloAvatarState();
}

class _HoloAvatarState extends State<HoloAvatar> with SingleTickerProviderStateMixin {
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
    return Container(
      height: 430,
      decoration: BoxDecoration(
        border: Border.all(color: _stateColor().withOpacity(0.45)),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF061116), Color(0xFF09201F), Color(0xFF100B15)],
        ),
      ),
      child: Stack(
        children: [
          AnimatedBuilder(
            animation: _controller,
            builder: (context, _) => CustomPaint(
              size: Size.infinite,
              painter: HoloPainter(
                progress: _controller.value,
                color: _stateColor(),
                audioLevel: widget.audioLevel,
              ),
            ),
          ),
          Positioned(
            left: 20,
            right: 20,
            bottom: 20,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.state.label.toUpperCase(), style: TextStyle(color: _stateColor(), letterSpacing: 1.2)),
                const SizedBox(height: 8),
                Text(widget.assistantName, style: const TextStyle(fontSize: 42, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(widget.transcript, style: const TextStyle(color: Color(0xFFC9FAFF), fontSize: 17, height: 1.25)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Color _stateColor() {
    switch (widget.state) {
      case HoloState.confirming:
        return const Color(0xFFF5C542);
      case HoloState.executing:
      case HoloState.done:
        return const Color(0xFF43FF9B);
      case HoloState.error:
        return const Color(0xFFFF5A6C);
      default:
        return const Color(0xFF26F4FF);
    }
  }
}

class HoloPainter extends CustomPainter {
  const HoloPainter({
    required this.progress,
    required this.color,
    required this.audioLevel,
  });

  final double progress;
  final Color color;
  final double audioLevel;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.38);
    final radius = min(size.width, size.height) * 0.28;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = color.withOpacity(0.85);

    for (var i = 0; i < 3; i += 1) {
      final scale = 1 + i * 0.17 + sin((progress + i) * pi * 2) * 0.03;
      canvas.drawCircle(center, radius * scale, paint..color = color.withOpacity(0.75 - i * 0.16));
    }

    final facePaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = color.withOpacity(0.8);
    final face = Path()
      ..moveTo(center.dx, center.dy - radius * 0.45)
      ..lineTo(center.dx + radius * 0.42, center.dy - radius * 0.18)
      ..lineTo(center.dx + radius * 0.5, center.dy + radius * 0.2)
      ..lineTo(center.dx + radius * 0.22, center.dy + radius * 0.52)
      ..lineTo(center.dx - radius * 0.22, center.dy + radius * 0.52)
      ..lineTo(center.dx - radius * 0.5, center.dy + radius * 0.2)
      ..lineTo(center.dx - radius * 0.42, center.dy - radius * 0.18)
      ..close();
    canvas.drawPath(face, facePaint);

    final eyePaint = Paint()
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawLine(Offset(center.dx - radius * 0.28, center.dy), Offset(center.dx - radius * 0.12, center.dy), eyePaint);
    canvas.drawLine(Offset(center.dx + radius * 0.12, center.dy), Offset(center.dx + radius * 0.28, center.dy), eyePaint);

    final waveWidth = radius * (0.25 + audioLevel * 0.25);
    canvas.drawLine(
      Offset(center.dx - waveWidth, center.dy + radius * 0.25),
      Offset(center.dx + waveWidth, center.dy + radius * 0.25),
      eyePaint,
    );
  }

  @override
  bool shouldRepaint(covariant HoloPainter oldDelegate) => true;
}

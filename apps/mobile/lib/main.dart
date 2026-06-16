import 'package:flutter/material.dart';
import 'features/chat/chat_screen.dart';
import 'features/devices/pairing_screen.dart';
import 'features/voice/voice_profile.dart';

void main() {
  runApp(const JarvisMobileApp());
}

class JarvisMobileApp extends StatelessWidget {
  const JarvisMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    final profile = VoiceProfile.defaults();
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Jarvis BR',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF05080B),
        fontFamily: 'Rajdhani',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF26F4FF),
          brightness: Brightness.dark,
        ),
      ),
      home: PairingScreen(
        onPaired: (deviceToken) => ChatScreen(profile: profile, deviceToken: deviceToken),
      ),
    );
  }
}

class VoiceProfile {
  const VoiceProfile({
    required this.assistantName,
    required this.wakePhrases,
    required this.voiceName,
    required this.genderStyle,
    required this.personality,
    required this.speed,
  });

  final String assistantName;
  final List<String> wakePhrases;
  final String voiceName;
  final String genderStyle;
  final String personality;
  final double speed;

  factory VoiceProfile.defaults() {
    return const VoiceProfile(
      assistantName: 'Jarvis',
      wakePhrases: ['hey jarvis', 'ola jarvis'],
      voiceName: 'female_br_01',
      genderStyle: 'feminina',
      personality: 'brasileiro_direto',
      speed: 1.05,
    );
  }
}

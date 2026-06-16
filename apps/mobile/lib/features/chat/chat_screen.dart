import 'package:flutter/material.dart';
import '../confirmations/confirmation_sheet.dart';
import '../files/file_result_card.dart';
import '../hologram/holo_avatar.dart';
import '../hologram/holo_state.dart';
import '../voice/voice_profile.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.profile, required this.deviceToken});

  final VoiceProfile profile;
  final String deviceToken;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController(
    text: 'Jarvis, no computador Casa tem uma imagem chamada logo azul. Baixe ela para mim.',
  );
  HoloState _state = HoloState.idle;
  String _transcript = 'Toque, fale ou digite. Toda acao sensivel exige confirmacao.';
  List<Map<String, Object>> _results = const [];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _runSafeMockFlow() {
    setState(() {
      _state = HoloState.searching;
      _transcript = 'Buscando imagens parecidas no computador Casa.';
      _results = [
        {
          'fileName': 'logo_azul_final.png',
          'folder': 'Desktop/Clientes',
          'score': 94,
          'size': '2.1 MB',
        },
        {
          'fileName': 'logo azul transparente.png',
          'folder': 'Downloads',
          'score': 91,
          'size': '1.7 MB',
        },
        {
          'fileName': 'logomarca azul site.jpg',
          'folder': 'Imagens/Site',
          'score': 84,
          'size': '800 KB',
        },
      ];
    });
  }

  void _selectFile(Map<String, Object> file) {
    setState(() {
      _state = HoloState.confirming;
      _transcript = 'Vou montar o plano antes de executar.';
    });
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF0B1F24),
      builder: (_) => ConfirmationSheet(
        summary: 'Vou baixar "${file['fileName']}" do computador Casa para este celular. Confirma esta acao?',
        onConfirmed: () {
          Navigator.pop(context);
          setState(() {
            _state = HoloState.executing;
            _transcript = 'Confirmacao recebida. A transferencia so roda com token valido.';
          });
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            HoloAvatar(
              state: _state,
              assistantName: widget.profile.assistantName,
              transcript: _transcript,
              audioLevel: _state == HoloState.listening ? 0.9 : 0.45,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _controller,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Comando'),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _runSafeMockFlow,
              icon: const Icon(Icons.send),
              label: const Text('Buscar arquivos'),
            ),
            const SizedBox(height: 16),
            ..._results.map((file) => FileResultCard(file: file, onTap: () => _selectFile(file))),
          ],
        ),
      ),
    );
  }
}

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../hologram/holo_avatar.dart';
import '../hologram/holo_state.dart';

class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key, required this.onPaired});

  final Widget Function(String deviceToken) onPaired;

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  final _codeController = TextEditingController();
  final _apiController = TextEditingController(text: const String.fromEnvironment('JARVIS_API_URL', defaultValue: 'https://jarvis-api.onrender.com'));
  HoloState _state = HoloState.idle;
  String _message = 'Digite o codigo de vinculacao gerado no painel web.';
  bool _permissionsAccepted = false;
  bool _paired = false;
  String _deviceToken = '';

  @override
  void dispose() {
    _codeController.dispose();
    _apiController.dispose();
    super.dispose();
  }

  Future<void> _pair() async {
    setState(() {
      _state = HoloState.thinking;
      _message = 'Validando codigo e vinculando este Android a sua conta.';
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
        _paired = true;
        _state = HoloState.confirming;
        _message = 'Aparelho vinculado. Revise as permissoes antes de liberar o chat.';
      });
    } catch (error) {
      setState(() {
        _state = HoloState.error;
        _message = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_paired && _permissionsAccepted) {
      return widget.onPaired(_deviceToken);
    }

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            HoloAvatar(state: _state, assistantName: 'Jarvis', transcript: _message),
            const SizedBox(height: 16),
            TextField(
              controller: _apiController,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'URL da API'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Codigo de vinculacao'),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(onPressed: _pair, icon: const Icon(Icons.link), label: const Text('Vincular aparelho')),
            if (_paired) ...[
              const SizedBox(height: 18),
              SwitchListTile(
                value: _permissionsAccepted,
                onChanged: (value) => setState(() => _permissionsAccepted = value),
                title: const Text('Permitir voz, arquivos recebidos e notificacoes'),
                subtitle: const Text('O Android ainda pedira as permissoes reais do sistema quando cada recurso for ativado.'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

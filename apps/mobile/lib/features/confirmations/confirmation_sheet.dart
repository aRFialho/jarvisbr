import 'package:flutter/material.dart';

class ConfirmationSheet extends StatefulWidget {
  const ConfirmationSheet({super.key, required this.summary, required this.onConfirmed});

  final String summary;
  final VoidCallback onConfirmed;

  @override
  State<ConfirmationSheet> createState() => _ConfirmationSheetState();
}

class _ConfirmationSheetState extends State<ConfirmationSheet> {
  final _phraseController = TextEditingController();

  @override
  void dispose() {
    _phraseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canConfirm = _phraseController.text.trim().toLowerCase() == 'confirmo';
    return Padding(
      padding: EdgeInsets.only(
        left: 18,
        right: 18,
        top: 18,
        bottom: MediaQuery.of(context).viewInsets.bottom + 18,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.shield, color: Color(0xFFF5C542), size: 34),
          const SizedBox(height: 10),
          const Text('Confirmacao obrigatoria', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Text(widget.summary, style: const TextStyle(color: Color(0xFFFFF5CA), fontSize: 16)),
          const SizedBox(height: 14),
          TextField(
            controller: _phraseController,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              labelText: 'Digite Confirmo',
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar'))),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: canConfirm ? widget.onConfirmed : null,
                  child: const Text('Confirmar'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

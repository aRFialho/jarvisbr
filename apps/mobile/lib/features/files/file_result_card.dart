import 'package:flutter/material.dart';

class FileResultCard extends StatelessWidget {
  const FileResultCard({super.key, required this.file, required this.onTap});

  final Map<String, Object> file;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0x5526F4FF)),
            color: const Color(0xAA071318),
          ),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(border: Border.all(color: const Color(0xFF26F4FF))),
                child: const Text('IMG'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${file['fileName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('${file['folder']} - ${file['size']} - ${file['score']}%'),
                  ],
                ),
              ),
              const Icon(Icons.download),
            ],
          ),
        ),
      ),
    );
  }
}

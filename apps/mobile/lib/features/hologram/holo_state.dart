enum HoloState {
  idle,
  listening,
  thinking,
  searching,
  confirming,
  executing,
  done,
  error,
}

extension HoloStateLabel on HoloState {
  String get label {
    switch (this) {
      case HoloState.idle:
        return 'Pronto';
      case HoloState.listening:
        return 'Ouvindo';
      case HoloState.thinking:
        return 'Pensando';
      case HoloState.searching:
        return 'Buscando';
      case HoloState.confirming:
        return 'Confirmando';
      case HoloState.executing:
        return 'Executando';
      case HoloState.done:
        return 'Concluido';
      case HoloState.error:
        return 'Erro';
    }
  }
}

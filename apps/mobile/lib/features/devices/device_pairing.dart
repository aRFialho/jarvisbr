class DevicePairingRequest {
  const DevicePairingRequest({
    required this.code,
    required this.friendlyName,
    required this.platform,
  });

  final String code;
  final String friendlyName;
  final String platform;
}

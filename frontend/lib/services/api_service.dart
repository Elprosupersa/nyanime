import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _defaultHost = 'http://192.168.1.72:8000';
  static const String _prefKey = 'anime_server_host';

  static const List<String> candidateHosts = [
    'http://192.168.1.72:8000', // Wi-Fi LAN PC
    'http://127.0.0.1:8000',   // ADB reverse / Localhost
    'http://10.0.2.2:8000',    // Emulador Android Studio
  ];

  static Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefKey);
    if (saved != null && saved.isNotEmpty) {
      return saved;
    }
    return _defaultHost;
  }

  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    String cleaned = url.trim();
    if (cleaned.endsWith('/')) {
      cleaned = cleaned.substring(0, cleaned.length - 1);
    }
    await prefs.setString(_prefKey, cleaned);
  }

  static Future<String?> autoDetectHost() async {
    for (final host in candidateHosts) {
      try {
        final stopwatch = Stopwatch()..start();
        final uri = Uri.parse('$host/api/status');
        final res = await http.get(uri).timeout(const Duration(milliseconds: 1500));
        stopwatch.stop();
        if (res.statusCode == 200) {
          await setBaseUrl(host);
          return host;
        }
      } catch (_) {
        // Continuar buscando en el siguiente host
      }
    }
    return null;
  }

  static Future<int?> pingHost(String host) async {
    try {
      final cleaned = host.trim().endsWith('/') ? host.trim().substring(0, host.trim().length - 1) : host.trim();
      final stopwatch = Stopwatch()..start();
      final uri = Uri.parse('$cleaned/api/status');
      final res = await http.get(uri).timeout(const Duration(milliseconds: 2000));
      stopwatch.stop();
      if (res.statusCode == 200) {
        return stopwatch.elapsedMilliseconds;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>> checkHealth() async {
    try {
      final base = await getBaseUrl();
      final uri = Uri.parse('$base/api/status');
      final res = await http.get(uri).timeout(const Duration(seconds: 3));
      if (res.statusCode == 200) {
        return {'online': true, 'data': json.decode(res.body), 'host': base};
      }
      // Si el host actual no responde, intentar auto-detección
      final foundHost = await autoDetectHost();
      if (foundHost != null) {
        return {'online': true, 'auto_switched': true, 'host': foundHost};
      }
      return {'online': false, 'error': 'Status ${res.statusCode}'};
    } catch (e) {
      // Auto-detección ante error de red
      final foundHost = await autoDetectHost();
      if (foundHost != null) {
        return {'online': true, 'auto_switched': true, 'host': foundHost};
      }
      return {'online': false, 'error': e.toString()};
    }
  }

  static Future<Map<String, dynamic>> getCollection() async {
    final base = await getBaseUrl();
    final uri = Uri.parse('$base/api/local/collection');
    final res = await http.get(uri).timeout(const Duration(seconds: 10));
    if (res.statusCode == 200) {
      return json.decode(utf8.decode(res.bodyBytes));
    }
    throw Exception('Error al cargar la colección: ${res.statusCode}');
  }

  static Future<Map<String, dynamic>> getAnimeDetails(String path) async {
    final base = await getBaseUrl();
    final uri = Uri.parse('$base/api/local/anime/details?path=${Uri.encodeComponent(path)}');
    final res = await http.get(uri).timeout(const Duration(seconds: 8));
    if (res.statusCode == 200) {
      return json.decode(utf8.decode(res.bodyBytes));
    }
    throw Exception('Error al cargar detalles de la serie: ${res.statusCode}');
  }

  // ==================== PROTOCOLO DE HANDOFF LOCAL & SERVICE DISCOVERY ====================

  static Future<Map<String, dynamic>?> getDiscoveryInfo([String? customHost]) async {
    try {
      final base = customHost ?? await getBaseUrl();
      final uri = Uri.parse('$base/api/discovery');
      final res = await http.get(uri).timeout(const Duration(seconds: 2));
      if (res.statusCode == 200) {
        return json.decode(utf8.decode(res.bodyBytes));
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, dynamic>?> getPendingHandoff({bool consume = true}) async {
    try {
      final base = await getBaseUrl();
      final uri = Uri.parse('$base/api/handoff/pending?consume=$consume');
      final res = await http.get(uri).timeout(const Duration(seconds: 3));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        if (data['has_pending'] == true && data['handoff'] != null) {
          return data['handoff'];
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> clearPendingHandoff() async {
    try {
      final base = await getBaseUrl();
      final uri = Uri.parse('$base/api/handoff/clear');
      final res = await http.post(uri).timeout(const Duration(seconds: 2));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> sendHandoff({
    required String tvHost,
    required String animeId,
    String episodeId = '1',
    int season = 1,
    double currentTime = 0.0,
    String title = '',
    String cover = '',
    String sourceUrl = '',
  }) async {
    try {
      final cleanHost = tvHost.endsWith('/') ? tvHost.substring(0, tvHost.length - 1) : tvHost;
      final uri = Uri.parse('$cleanHost/api/handoff');
      final payload = {
        'animeId': animeId,
        'episodeId': episodeId,
        'season': season,
        'currentTime': currentTime,
        'title': title,
        'cover': cover,
        'sourceUrl': sourceUrl,
        'action': 'play',
      };
      final res = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: json.encode(payload),
      ).timeout(const Duration(seconds: 4));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  static String resolveUrl(String base, String? relativeUrl) {
    if (relativeUrl == null || relativeUrl.isEmpty) return '';
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }
    if (!relativeUrl.startsWith('/')) {
      return '$base/$relativeUrl';
    }
    return '$base$relativeUrl';
  }
}

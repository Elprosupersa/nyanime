import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String _defaultHost = 'http://10.0.2.2:8000';
  static const String _prefKey = 'anime_server_host';

  static Future<String> getBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefKey) ?? _defaultHost;
  }

  static Future<void> setBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    String cleaned = url.trim();
    if (cleaned.endsWith('/')) {
      cleaned = cleaned.substring(0, cleaned.length - 1);
    }
    await prefs.setString(_prefKey, cleaned);
  }

  static Future<Map<String, dynamic>> checkHealth() async {
    try {
      final base = await getBaseUrl();
      final uri = Uri.parse('$base/api/status');
      final res = await http.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        return {'online': true, 'data': json.decode(res.body)};
      }
      return {'online': false, 'error': 'Status ${res.statusCode}'};
    } catch (e) {
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

import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'web_streaming_screen.dart';

class SeriesDetailScreen extends StatefulWidget {
  final String path;
  final String name;
  final String? posterUrl;
  final String? backdropUrl;

  const SeriesDetailScreen({
    super.key,
    required this.path,
    required this.name,
    this.posterUrl,
    this.backdropUrl,
  });

  @override
  State<SeriesDetailScreen> createState() => _SeriesDetailScreenState();
}

class _SeriesDetailScreenState extends State<SeriesDetailScreen> {
  bool _isLoading = true;
  String _baseUrl = '';
  Map<String, dynamic>? _details;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDetails();
  }

  Future<void> _loadDetails() async {
    try {
      final base = await ApiService.getBaseUrl();
      final data = await ApiService.getAnimeDetails(widget.path);
      setState(() {
        _baseUrl = base;
        _details = data;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final posterFull = ApiService.resolveUrl(_baseUrl, widget.posterUrl);

    return Scaffold(
      backgroundColor: const Color(0xFF0A0D14),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          widget.name,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE50914)),
              ),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Text('Error: $_error', style: const TextStyle(color: Colors.redAccent)),
                  ),
                )
              : _buildContent(posterFull),
    );
  }

  Widget _buildContent(String posterFull) {
    final seasons = (_details?['seasons'] as List<dynamic>?) ?? [];
    final plot = _details?['plot'] ?? 'Sin sinopsis disponible.';
    final rating = _details?['rating'] ?? '';
    final year = _details?['year'] ?? '';
    final studio = _details?['studio'] ?? '';

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: posterFull.isNotEmpty
                  ? Image.network(
                      posterFull,
                      width: 120,
                      height: 170,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 120,
                        height: 170,
                        color: const Color(0xFF1E2638),
                        child: const Icon(Icons.movie, color: Colors.white24, size: 40),
                      ),
                    )
                  : Container(
                      width: 120,
                      height: 170,
                      color: const Color(0xFF1E2638),
                      child: const Icon(Icons.movie, color: Colors.white24, size: 40),
                    ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (rating.toString().isNotEmpty)
                    Row(
                      children: [
                        const Icon(Icons.star, color: Colors.amber, size: 18),
                        const SizedBox(width: 4),
                        Text(
                          '$rating / 10',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  const SizedBox(height: 6),
                  if (year.toString().isNotEmpty)
                    Text('Año: $year', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                  if (studio.toString().isNotEmpty)
                    Text('Estudio: $studio', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                  const SizedBox(height: 12),
                  ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFE50914),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    icon: const Icon(Icons.play_circle_fill, color: Colors.white),
                    label: const Text('Ver en Modo Cinema', style: TextStyle(color: Colors.white)),
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => WebStreamingScreen(
                            initialUrl: '$_baseUrl/static/index.html',
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        const Text(
          'Sinopsis',
          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Text(
          plot,
          style: const TextStyle(color: Colors.white70, fontSize: 14, height: 1.4),
        ),
        const SizedBox(height: 24),
        Text(
          'Temporadas y Capítulos (${seasons.length})',
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        ...seasons.map((s) {
          final sName = s['season_name'] ?? 'Temporada';
          final eps = (s['episodes'] as List<dynamic>?) ?? [];
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF141923),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: ExpansionTile(
              initiallyExpanded: true,
              iconColor: const Color(0xFF00F2FE),
              collapsedIconColor: Colors.white54,
              title: Text(
                '$sName (${eps.length} episodios)',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
              children: eps.map((ep) {
                final epTitle = ep['display_title'] ?? ep['title'] ?? 'Capítulo';
                final quality = ep['quality'] ?? '';
                final sizeMb = ep['size_mb'] ?? '';

                return ListTile(
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFF1E2638),
                    child: Icon(Icons.play_arrow, color: Color(0xFFE50914), size: 20),
                  ),
                  title: Text(
                    epTitle,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                  ),
                  subtitle: Text(
                    '$quality • ${sizeMb} MB',
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                  trailing: const Icon(Icons.arrow_forward_ios, color: Colors.white24, size: 14),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => WebStreamingScreen(
                          initialUrl: '$_baseUrl/static/index.html',
                        ),
                      ),
                    );
                  },
                );
              }).toList(),
            ),
          );
        }),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/text_utils.dart';
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
    final backdropFull = ApiService.resolveUrl(
      _baseUrl,
      widget.backdropUrl ?? widget.posterUrl,
    );

    return Scaffold(
      backgroundColor: const Color(0xFF0A0D14),
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
              : _buildCustomScroll(backdropFull),
    );
  }

  Widget _buildCustomScroll(String backdropFull) {
    final seasons = (_details?['seasons'] as List<dynamic>?) ?? [];
    final rawPlot = _details?['plot'] ?? 'Sin sinopsis disponible.';
    final cleanPlot = TextUtils.cleanHtml(rawPlot);
    final rating = _details?['rating'] ?? '';
    final year = _details?['year'] ?? '';
    final studio = _details?['studio'] ?? '';
    final genres = (_details?['genres'] as List<dynamic>?) ?? [];

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 260.0,
          pinned: true,
          backgroundColor: const Color(0xFF0F1420),
          leading: IconButton(
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                color: Colors.black54,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
            ),
            onPressed: () => Navigator.pop(context),
          ),
          flexibleSpace: FlexibleSpaceBar(
            background: Stack(
              fit: StackFit.expand,
              children: [
                if (backdropFull.isNotEmpty)
                  Image.network(
                    backdropFull,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(color: const Color(0xFF151A26)),
                  )
                else
                  Container(color: const Color(0xFF151A26)),
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.3),
                        Colors.transparent,
                        const Color(0xFF0A0D14).withValues(alpha: 0.8),
                        const Color(0xFF0A0D14),
                      ],
                      stops: const [0.0, 0.4, 0.8, 1.0],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        // Main Metadata
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    if (rating.toString().isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.amber.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.amber, width: 1),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star, color: Colors.amber, size: 14),
                            const SizedBox(width: 4),
                            Text(
                              '$rating',
                              style: const TextStyle(
                                color: Colors.amber,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (year.toString().isNotEmpty) ...[
                      Text(
                        '$year',
                        style: const TextStyle(color: Colors.white54, fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(width: 8),
                    ],
                    if (studio.toString().isNotEmpty) ...[
                      Text(
                        '•  $studio',
                        style: const TextStyle(color: Color(0xFF00F2FE), fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 12),
                if (genres.isNotEmpty)
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: genres.map((g) {
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E2638),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          g.toString(),
                          style: const TextStyle(color: Colors.white70, fontSize: 11),
                        ),
                      );
                    }).toList(),
                  ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFE50914),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 4,
                    ),
                    icon: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 26),
                    label: const Text(
                      'VER SERIE EN MODO CINEMA',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        fontSize: 14,
                      ),
                    ),
                    onPressed: () {
                      final target = '$_baseUrl/static/index.html#series/${Uri.encodeComponent(widget.path)}';
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => WebStreamingScreen(
                            initialUrl: target,
                          ),
                        ),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Sinopsis',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  cleanPlot,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 13.5,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Temporadas y Capítulos (${seasons.length})',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),

        // Seasons & Episodes
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (ctx, idx) {
                final s = seasons[idx];
                final sName = s['season_name'] ?? 'Temporada';
                final eps = (s['episodes'] as List<dynamic>?) ?? [];

                return Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF141923),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
                  ),
                  child: ExpansionTile(
                    initiallyExpanded: idx == 0,
                    iconColor: const Color(0xFF00F2FE),
                    collapsedIconColor: Colors.white38,
                    tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    title: Text(
                      '$sName (${eps.length} episodios)',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                    children: eps.asMap().entries.map((entry) {
                      final epIdx = entry.key;
                      final ep = entry.value;
                      final epTitle = ep['display_title'] ?? ep['title'] ?? 'Capítulo ${epIdx + 1}';
                      final quality = ep['quality'] ?? '1080p BD Master';
                      final sizeMb = ep['size_mb'] ?? '';
                      final epNum = ep['episode_number'] ?? (epIdx + 1);
                      final sNum = s['season_number'] ?? (idx + 1);

                      return Container(
                        decoration: BoxDecoration(
                          border: Border(
                            top: BorderSide(color: Colors.white.withValues(alpha: 0.04)),
                          ),
                        ),
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                          leading: Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: const Color(0xFF1E2638),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(
                              Icons.play_arrow_rounded,
                              color: Color(0xFFE50914),
                              size: 24,
                            ),
                          ),
                          title: Text(
                            epTitle,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: Text(
                            '$quality • ${sizeMb} MB',
                            style: const TextStyle(color: Colors.white38, fontSize: 11.5),
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFFE50914).withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: const Color(0xFFE50914).withValues(alpha: 0.4), width: 0.8),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.play_circle_fill, color: Color(0xFFE50914), size: 14),
                                SizedBox(width: 4),
                                Text(
                                  'Play',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          onTap: () {
                            final epUrl = '$_baseUrl/static/index.html#watch/${Uri.encodeComponent(widget.path)}?s=$sNum&ep=$epNum';
                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => WebStreamingScreen(
                                  initialUrl: epUrl,
                                ),
                              ),
                            );
                          },
                        ),
                      );
                    }).toList(),
                  ),
                );
              },
              childCount: seasons.length,
            ),
          ),
        ),
        const SliverToBoxAdapter(
          child: SizedBox(height: 40),
        ),
      ],
    );
  }
}

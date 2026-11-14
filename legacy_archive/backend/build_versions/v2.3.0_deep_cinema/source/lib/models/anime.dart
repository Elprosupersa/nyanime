class AnimeSeries {
  final String name;
  final String category;
  final int episodeCount;
  final double rating;
  final String? posterUrl;
  final String? backdropUrl;
  final String? plot;
  final List<String> genres;
  final String? status;

  AnimeSeries({
    required this.name,
    required this.category,
    required this.episodeCount,
    this.rating = 0.0,
    this.posterUrl,
    this.backdropUrl,
    this.plot,
    this.genres = const [],
    this.status,
  });

  factory AnimeSeries.fromJson(Map<String, dynamic> json) {
    return AnimeSeries(
      name: json['name'] ?? json['title'] ?? 'Sin Título',
      category: json['category'] ?? 'general',
      episodeCount: json['episodes_count'] ?? json['episodes'] ?? 0,
      rating: (json['rating'] != null) ? (json['rating'] as num).toDouble() : 0.0,
      posterUrl: json['poster_url'] ?? json['cover_image'],
      backdropUrl: json['backdrop_url'] ?? json['banner_image'],
      plot: json['plot'] ?? json['synopsis'] ?? 'Sin sinopsis disponible.',
      genres: (json['genres'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? [],
      status: json['status'],
    );
  }
}

class ServerConfig {
  static const String defaultEmulatorHost = 'http://10.0.2.2:8000';
  static const String defaultLocalHost = 'http://127.0.0.1:8000';
}

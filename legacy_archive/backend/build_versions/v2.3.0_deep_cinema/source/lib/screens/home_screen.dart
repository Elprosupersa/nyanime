import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/text_utils.dart';
import 'series_detail_screen.dart';
import 'web_streaming_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isLoading = true;
  String _baseUrl = '';
  bool _isServerOnline = false;

  List<dynamic> _allSeries = [];
  List<dynamic> _filteredSeries = [];
  String _selectedCategory = 'all';
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  int _currentNavIndex = 0;

  final List<Map<String, String>> _categories = [
    {'id': 'all', 'label': 'Todos'},
    {'id': 'romance', 'label': 'Romance'},
    {'id': 'ecchi', 'label': 'Ecchi'},
    {'id': 'comedy', 'label': 'Comedia'},
    {'id': 'fantasy', 'label': 'Fantasía'},
    {'id': 'action', 'label': 'Acción'},
    {'id': 'drama', 'label': 'Drama'},
    {'id': 'slice of life', 'label': 'Slice of Life'},
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final base = await ApiService.getBaseUrl();
    setState(() => _baseUrl = base);

    final health = await ApiService.checkHealth();
    if (health['online'] == true) {
      _isServerOnline = true;
    } else {
      _isServerOnline = false;
    }

    try {
      final collection = await ApiService.getCollection();
      final seriesList = (collection['series'] as List<dynamic>?) ?? [];
      setState(() {
        _allSeries = seriesList;
        _isLoading = false;
      });
      _applyFilters();
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _applyFilters() {
    List<dynamic> list = List.from(_allSeries);

    if (_selectedCategory != 'all') {
      final selected = _selectedCategory.toLowerCase();
      list = list.where((s) {
        final cat = (s['category_id'] ?? '').toString().toLowerCase();
        final rawGenres = s['genres'];
        List<String> genresList = [];
        if (rawGenres is List) {
          genresList = rawGenres.map((g) => g.toString().toLowerCase()).toList();
        } else if (rawGenres is String) {
          genresList = rawGenres.toLowerCase().split(',').map((g) => g.trim()).toList();
        }

        if (cat == selected) return true;
        for (final g in genresList) {
          if (g.contains(selected) || selected.contains(g)) return true;
          if (selected == 'comedy' && (g.contains('comedy') || g.contains('comedia'))) return true;
          if (selected == 'fantasy' && (g.contains('fantasy') || g.contains('fantasia') || g.contains('fantasía'))) return true;
          if (selected == 'action' && (g.contains('action') || g.contains('accion') || g.contains('acción'))) return true;
        }
        return false;
      }).toList();
    }

    if (_searchQuery.trim().isNotEmpty) {
      final q = _searchQuery.toLowerCase().trim();
      list = list.where((s) {
        final name = (s['name'] ?? '').toString().toLowerCase();
        final genres = (s['genres'] ?? '').toString().toLowerCase();
        final plot = (s['plot'] ?? '').toString().toLowerCase();
        return name.contains(q) || genres.contains(q) || plot.contains(q);
      }).toList();
    }

    setState(() {
      _filteredSeries = list;
    });
  }

  void _showHostDialog() {
    final textCtrl = TextEditingController(text: _baseUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF161B26),
        title: const Text('Configuración de Servidor', style: TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Configura la IP del backend Anime Hub:',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: textCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                filled: true,
                fillColor: const Color(0xFF0A0D14),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                ActionChip(
                  label: const Text('Emulador (10.0.2.2)'),
                  onPressed: () => textCtrl.text = 'http://10.0.2.2:8000',
                ),
                ActionChip(
                  label: const Text('Localhost (127.0.0.1)'),
                  onPressed: () => textCtrl.text = 'http://127.0.0.1:8000',
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar', style: TextStyle(color: Colors.white54)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFE50914)),
            onPressed: () async {
              final newHost = textCtrl.text.trim();
              if (newHost.isNotEmpty) {
                await ApiService.setBaseUrl(newHost);
                Navigator.pop(ctx);
                _loadData();
              }
            },
            child: const Text('Guardar y Reconectar', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _currentNavIndex == 0 && _searchQuery.isEmpty,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        if (_searchQuery.isNotEmpty) {
          _searchController.clear();
          setState(() {
            _searchQuery = '';
          });
          _applyFilters();
          return;
        }
        if (_currentNavIndex != 0) {
          setState(() {
            _currentNavIndex = 0;
          });
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF0A0D14),
        appBar: AppBar(
          backgroundColor: const Color(0xFF0F1420),
          elevation: 0,
          title: _currentNavIndex == 0
              ? Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE50914),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.movie_filter, color: Colors.white, size: 20),
                    ),
                    const SizedBox(width: 10),
                    const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'ANIME HUB',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 16,
                            letterSpacing: 1.0,
                          ),
                        ),
                        Text(
                          'CINEMA STREAMING',
                          style: TextStyle(color: Color(0xFF00F2FE), fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ],
                )
              : const Row(
                  children: [
                    Icon(Icons.play_circle_fill, color: Color(0xFFE50914), size: 22),
                    SizedBox(width: 8),
                    Text(
                      'Cinema Web Player',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 17,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ],
                ),
          actions: [
            GestureDetector(
              onTap: _showHostDialog,
              child: Container(
                margin: const EdgeInsets.only(right: 12),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _isServerOnline
                      ? Colors.green.withValues(alpha: 0.15)
                      : Colors.red.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: _isServerOnline ? Colors.greenAccent : Colors.redAccent,
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 4,
                      backgroundColor: _isServerOnline ? Colors.greenAccent : Colors.redAccent,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _isServerOnline ? 'En Línea' : 'Offline',
                      style: TextStyle(
                        color: _isServerOnline ? Colors.greenAccent : Colors.redAccent,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.refresh, color: Colors.white70),
              tooltip: 'Actualizar',
              onPressed: () {
                if (_currentNavIndex == 0) {
                  _loadData();
                }
              },
            ),
          ],
        ),
        body: IndexedStack(
          index: _currentNavIndex,
          children: [
            _buildLibraryBody(),
            const WebStreamingScreen(isTab: true),
          ],
        ),
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: _currentNavIndex,
          backgroundColor: const Color(0xFF0F1420),
          selectedItemColor: const Color(0xFFE50914),
          unselectedItemColor: Colors.white38,
          onTap: (idx) {
            if (idx == 2) {
              _showHostDialog();
            } else {
              setState(() => _currentNavIndex = idx);
            }
          },
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.grid_view_rounded),
              label: 'Biblioteca',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.play_circle_fill),
              label: 'Cinema Web',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.dns),
              label: 'Servidor',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLibraryBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE50914)),
        ),
      );
    }

    return RefreshIndicator(
      color: const Color(0xFFE50914),
      backgroundColor: const Color(0xFF161B26),
      onRefresh: _loadData,
      child: CustomScrollView(
        slivers: [
          // Hero Banner
          if (_allSeries.isNotEmpty)
            SliverToBoxAdapter(
              child: _buildHeroCard(_allSeries.first),
            ),

          // Search Bar
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF151A26),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white),
                  onChanged: (val) {
                    _searchQuery = val;
                    _applyFilters();
                  },
                  decoration: InputDecoration(
                    hintText: 'Buscar anime, sinopsis, géneros...',
                    hintStyle: const TextStyle(color: Colors.white38, fontSize: 14),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF00F2FE)),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, color: Colors.white38),
                            onPressed: () {
                              _searchController.clear();
                              _searchQuery = '';
                              _applyFilters();
                            },
                          )
                        : null,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  ),
                ),
              ),
            ),
          ),

          // Category Filter Pills
          SliverToBoxAdapter(
            child: SizedBox(
              height: 48,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                itemCount: _categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (ctx, i) {
                  final cat = _categories[i];
                  final isSelected = _selectedCategory == cat['id'];
                  return ChoiceChip(
                    label: Text(cat['label']!),
                    selected: isSelected,
                    selectedColor: const Color(0xFFE50914),
                    backgroundColor: const Color(0xFF151A26),
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : Colors.white70,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      fontSize: 12,
                    ),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    side: BorderSide(
                      color: isSelected ? const Color(0xFFE50914) : Colors.white10,
                    ),
                    onSelected: (val) {
                      if (val) {
                        setState(() => _selectedCategory = cat['id']!);
                        _applyFilters();
                      }
                    },
                  );
                },
              ),
            ),
          ),

          // Series Count Title
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Colección (${_filteredSeries.length} series)',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '${_allSeries.length} en Disco E:\\',
                    style: const TextStyle(color: Color(0xFF00F2FE), fontSize: 12),
                  ),
                ],
              ),
            ),
          ),

          // Bento Grid
          _filteredSeries.isEmpty
              ? const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Padding(
                      padding: EdgeInsets.all(32.0),
                      child: Text(
                        'No se encontraron series que coincidan con los filtros.',
                        style: TextStyle(color: Colors.white38, fontSize: 14),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                )
              : SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      childAspectRatio: 0.62,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 14,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (ctx, i) => _buildAnimeCard(_filteredSeries[i]),
                      childCount: _filteredSeries.length,
                    ),
                  ),
                ),
        ],
      ),
    );
  }

  Widget _buildHeroCard(dynamic anime) {
    final name = anime['name'] ?? 'Destacado';
    final plot = TextUtils.cleanHtml(anime['plot'] ?? '');
    final rating = anime['rating'] ?? '';
    final relPath = anime['rel_path'] ?? '';
    final posterUrl = anime['poster_url'];
    final backdropUrl = anime['backdrop_url'];
    final backdropFull = ApiService.resolveUrl(_baseUrl, backdropUrl ?? posterUrl);

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      height: 190,
      decoration: BoxDecoration(
        color: const Color(0xFF141923),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          backdropFull.isNotEmpty
              ? Image.network(
                  backdropFull,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(color: const Color(0xFF1A2233)),
                )
              : Container(color: const Color(0xFF1A2233)),
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [
                  const Color(0xFF0A0D14).withValues(alpha: 0.95),
                  const Color(0xFF0A0D14).withValues(alpha: 0.7),
                  Colors.transparent,
                ],
                stops: const [0.0, 0.65, 1.0],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE50914),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'DESTACADO HOY',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: 220,
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                SizedBox(
                  width: 220,
                  child: Text(
                    plot,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 11,
                      height: 1.3,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (rating.isNotEmpty) ...[
                      const Icon(Icons.star, color: Colors.amber, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        rating,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 12),
                    ],
                    ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00F2FE),
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      icon: const Icon(Icons.play_arrow, size: 18),
                      label: const Text(
                        'Ver Serie',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                      ),
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => SeriesDetailScreen(
                              path: relPath,
                              name: name,
                              posterUrl: posterUrl,
                              backdropUrl: backdropUrl,
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAnimeCard(dynamic anime) {
    final name = anime['name'] ?? 'Sin Título';
    final eps = anime['total_episodes'] ?? 0;
    final rating = anime['rating'] ?? '';
    final relPath = anime['rel_path'] ?? '';
    final posterUrl = anime['poster_url'];
    final backdropUrl = anime['backdrop_url'];
    final posterFull = ApiService.resolveUrl(_baseUrl, posterUrl);

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => SeriesDetailScreen(
              path: relPath,
              name: name,
              posterUrl: posterUrl,
              backdropUrl: backdropUrl,
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF141923),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.3),
              blurRadius: 6,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  posterFull.isNotEmpty
                      ? Image.network(
                          posterFull,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: const Color(0xFF1E2638),
                            child: const Icon(Icons.movie, color: Colors.white24, size: 40),
                          ),
                        )
                      : Container(
                          color: const Color(0xFF1E2638),
                          child: const Icon(Icons.movie, color: Colors.white24, size: 40),
                        ),
                  if (rating.isNotEmpty)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.75),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star, color: Colors.amber, size: 12),
                            const SizedBox(width: 3),
                            Text(
                              rating,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Positioned(
                    bottom: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE50914).withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '$eps Caps',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(10.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    anime['category_label'] ?? 'General',
                    style: const TextStyle(
                      color: Colors.white38,
                      fontSize: 11,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

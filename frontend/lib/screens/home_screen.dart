import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  Timer? _handoffTimer;

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
    _startHandoffListener();
  }

  @override
  void dispose() {
    _handoffTimer?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _startHandoffListener() {
    _handoffTimer?.cancel();
    _handoffTimer = Timer.periodic(const Duration(seconds: 3), (timer) async {
      if (!mounted) return;
      try {
        final handoff = await ApiService.getPendingHandoff(consume: true);
        if (handoff != null && mounted) {
          _showIncomingHandoffBanner(handoff);
        }
      } catch (_) {}
    });
  }

  void _showIncomingHandoffBanner(Map<String, dynamic> handoff) {
    final title = handoff['title'] ?? 'Anime transferido';
    final epId = handoff['episodeId'] ?? '1';
    final sNum = handoff['season'] ?? 1;
    final timeSec = (handoff['currentTime'] as num?)?.toDouble() ?? 0.0;
    final animeId = handoff['animeId'] ?? '';

    ScaffoldMessenger.of(context).showMaterialBanner(
      MaterialBanner(
        backgroundColor: const Color(0xFF161B26),
        elevation: 6,
        leading: const Icon(Icons.tv_rounded, color: Color(0xFF00F2FE), size: 30),
        content: Text(
          '📺 Recibido desde Móvil: $title (Ep $epId • ${timeSec.toInt()}s)',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () {
              ScaffoldMessenger.of(context).hideCurrentMaterialBanner();
            },
            child: const Text('IGNORAR', style: TextStyle(color: Colors.white54, fontSize: 12)),
          ),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00F2FE),
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            icon: const Icon(Icons.play_arrow_rounded, size: 18),
            label: const Text('REANUDAR EN TV', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            onPressed: () {
              ScaffoldMessenger.of(context).hideCurrentMaterialBanner();
              final targetUrl = '$_baseUrl/static/index.html#watch/${Uri.encodeComponent(animeId)}?s=$sNum&ep=$epId&t=$timeSec';
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => WebStreamingScreen(initialUrl: targetUrl),
                ),
              );
            },
          ),
        ],
      ),
    );
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
    bool isDetecting = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF161B26),
          title: const Row(
            children: [
              Icon(Icons.dns, color: Color(0xFF00F2FE), size: 22),
              SizedBox(width: 8),
              Text('Servidor NyAnime TV', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Ingresa la IP o selecciona tu modo de conexión:',
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: textCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF0A0D14),
                  hintText: 'http://192.168.1.72:8000',
                  hintStyle: const TextStyle(color: Colors.white30),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                ),
              ),
              const SizedBox(height: 12),
              const Text('Accesos rápidos:', style: TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: [
                  ActionChip(
                    avatar: const Icon(Icons.wifi, size: 16, color: Color(0xFF00F2FE)),
                    label: const Text('Wi-Fi PC (192.168.1.72)'),
                    backgroundColor: const Color(0xFF1F2636),
                    labelStyle: const TextStyle(color: Colors.white, fontSize: 11),
                    onPressed: () => setDialogState(() => textCtrl.text = 'http://192.168.1.72:8000'),
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.usb, size: 16, color: Colors.amberAccent),
                    label: const Text('Cable USB (127.0.0.1)'),
                    backgroundColor: const Color(0xFF1F2636),
                    labelStyle: const TextStyle(color: Colors.white, fontSize: 11),
                    onPressed: () => setDialogState(() => textCtrl.text = 'http://127.0.0.1:8000'),
                  ),
                  ActionChip(
                    avatar: const Icon(Icons.developer_mode, size: 16, color: Colors.white70),
                    label: const Text('Emulador (10.0.2.2)'),
                    backgroundColor: const Color(0xFF1F2636),
                    labelStyle: const TextStyle(color: Colors.white, fontSize: 11),
                    onPressed: () => setDialogState(() => textCtrl.text = 'http://10.0.2.2:8000'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF00F2FE),
                    side: const BorderSide(color: Color(0xFF00F2FE)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  icon: isDetecting
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00F2FE)))
                      : const Icon(Icons.radar, size: 18),
                  label: Text(isDetecting ? 'Escaneando red...' : 'Auto-Detectar Servidor'),
                  onPressed: isDetecting
                      ? null
                      : () async {
                          setDialogState(() => isDetecting = true);
                          final detected = await ApiService.autoDetectHost();
                          setDialogState(() {
                            isDetecting = false;
                            if (detected != null) {
                              textCtrl.text = detected;
                            }
                          });
                          if (detected != null && ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(
                                content: Text('¡Servidor encontrado en $detected!'),
                                backgroundColor: Colors.green[800],
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          }
                        },
                ),
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
                  if (ctx.mounted) {
                    Navigator.pop(ctx);
                    _loadData();
                  }
                }
              },
              child: const Text('Guardar y Reconectar', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
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
                          'NYANIME TV',
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
                separatorBuilder: (context, index) => const SizedBox(width: 8),
                itemBuilder: (ctx, i) {
                  final cat = _categories[i];
                  final isSelected = _selectedCategory == cat['id'];
                  return TvFocusableChip(
                    label: cat['label']!,
                    isSelected: isSelected,
                    onTap: () {
                      setState(() => _selectedCategory = cat['id']!);
                      _applyFilters();
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
                  cacheWidth: 800,
                  cacheHeight: 500,
                  filterQuality: FilterQuality.medium,
                  errorBuilder: (ctx, err, stack) => Container(color: const Color(0xFF1A2233)),
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
    return TvFocusableAnimeCard(
      anime: anime,
      baseUrl: _baseUrl,
      onTap: () {
        final name = anime['name'] ?? 'Sin Título';
        final relPath = anime['rel_path'] ?? '';
        final posterUrl = anime['poster_url'];
        final backdropUrl = anime['backdrop_url'];
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
    );
  }
}

// ==================== WIDGETS LEANBACK 10-FOOT CON D-PAD FOCUS ====================

class TvFocusableAnimeCard extends StatefulWidget {
  final dynamic anime;
  final String baseUrl;
  final VoidCallback onTap;

  const TvFocusableAnimeCard({
    super.key,
    required this.anime,
    required this.baseUrl,
    required this.onTap,
  });

  @override
  State<TvFocusableAnimeCard> createState() => _TvFocusableAnimeCardState();
}

class _TvFocusableAnimeCardState extends State<TvFocusableAnimeCard> {
  bool _isFocused = false;
  final FocusNode _focusNode = FocusNode();

  @override
  void dispose() {
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final anime = widget.anime;
    final name = anime['name'] ?? 'Sin Título';
    final eps = anime['total_episodes'] ?? 0;
    final rating = anime['rating'] ?? '';
    final posterUrl = anime['poster_url'];
    final posterFull = ApiService.resolveUrl(widget.baseUrl, posterUrl);

    return Focus(
      focusNode: _focusNode,
      onFocusChange: (focused) {
        setState(() => _isFocused = focused);
        if (focused) {
          Scrollable.ensureVisible(
            context,
            alignment: 0.5,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
          );
        }
      },
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent &&
            (event.logicalKey == LogicalKeyboardKey.select ||
             event.logicalKey == LogicalKeyboardKey.enter ||
             event.logicalKey == LogicalKeyboardKey.numpadEnter ||
             event.logicalKey == LogicalKeyboardKey.space)) {
          widget.onTap();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _isFocused ? 1.07 : 1.0,
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeOutCubic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            decoration: BoxDecoration(
              color: const Color(0xFF141923),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: _isFocused ? const Color(0xFF00F2FE) : Colors.white.withValues(alpha: 0.06),
                width: _isFocused ? 2.5 : 1.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: _isFocused
                      ? const Color(0xFF00F2FE).withValues(alpha: 0.45)
                      : Colors.black.withValues(alpha: 0.3),
                  blurRadius: _isFocused ? 16 : 6,
                  spreadRadius: _isFocused ? 2 : 0,
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
                              cacheWidth: 350,
                              cacheHeight: 500,
                              filterQuality: FilterQuality.medium,
                              errorBuilder: (ctx, err, stack) => Container(
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
                        style: TextStyle(
                          color: _isFocused ? const Color(0xFF00F2FE) : Colors.white,
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
        ),
      ),
    );
  }
}

class TvFocusableChip extends StatefulWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const TvFocusableChip({
    super.key,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  State<TvFocusableChip> createState() => _TvFocusableChipState();
}

class _TvFocusableChipState extends State<TvFocusableChip> {
  bool _isFocused = false;

  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: (f) {
        setState(() => _isFocused = f);
        if (f) {
          Scrollable.ensureVisible(
            context,
            alignment: 0.5,
            duration: const Duration(milliseconds: 200),
          );
        }
      },
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent &&
            (event.logicalKey == LogicalKeyboardKey.select ||
             event.logicalKey == LogicalKeyboardKey.enter ||
             event.logicalKey == LogicalKeyboardKey.space)) {
          widget.onTap();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      },
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: _isFocused ? 1.08 : 1.0,
          duration: const Duration(milliseconds: 140),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: widget.isSelected
                  ? const Color(0xFFE50914)
                  : (_isFocused ? const Color(0xFF1E283A) : const Color(0xFF151A26)),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _isFocused
                    ? const Color(0xFF00F2FE)
                    : (widget.isSelected ? const Color(0xFFE50914) : Colors.white10),
                width: _isFocused ? 2.0 : 1.0,
              ),
              boxShadow: _isFocused
                  ? [
                      BoxShadow(
                        color: const Color(0xFF00F2FE).withValues(alpha: 0.5),
                        blurRadius: 10,
                        spreadRadius: 1,
                      )
                    ]
                  : null,
            ),
            child: Text(
              widget.label,
              style: TextStyle(
                color: _isFocused || widget.isSelected ? Colors.white : Colors.white70,
                fontSize: 12,
                fontWeight: widget.isSelected || _isFocused ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../services/api_service.dart';

class WebStreamingScreen extends StatefulWidget {
  final String? initialUrl;

  const WebStreamingScreen({super.key, this.initialUrl});

  @override
  State<WebStreamingScreen> createState() => _WebStreamingScreenState();
}

class _WebStreamingScreenState extends State<WebStreamingScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;
  String _currentHost = '';

  @override
  void initState() {
    super.initState();
    _initWebView();
  }

  Future<void> _initWebView() async {
    final host = await ApiService.getBaseUrl();
    setState(() {
      _currentHost = host;
    });

    final targetUrl = widget.initialUrl ?? '$host/static/index.html';

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0D14))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() => _isLoading = true);
          },
          onPageFinished: (String url) {
            setState(() => _isLoading = false);
          },
          onWebResourceError: (WebResourceError error) {
            setState(() => _isLoading = false);
          },
        ),
      )
      ..loadRequest(Uri.parse(targetUrl));
  }

  void _showHostConfigDialog() {
    final textController = TextEditingController(text: _currentHost);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF161B26),
        title: const Row(
          children: [
            Icon(Icons.dns, color: Color(0xFF00F2FE)),
            SizedBox(width: 8),
            Text('Configurar Servidor', style: TextStyle(color: Colors.white, fontSize: 18)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Ingresa la URL o IP de tu servidor Anime Hub:',
              style: TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: textController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                filled: true,
                fillColor: const Color(0xFF0A0D14),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                hintText: 'http://10.0.2.2:8000',
                hintStyle: const TextStyle(color: Colors.white30),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                ActionChip(
                  label: const Text('Emulador (10.0.2.2)'),
                  onPressed: () => textController.text = 'http://10.0.2.2:8000',
                ),
                ActionChip(
                  label: const Text('Localhost (127.0.0.1)'),
                  onPressed: () => textController.text = 'http://127.0.0.1:8000',
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
              final newHost = textController.text.trim();
              if (newHost.isNotEmpty) {
                await ApiService.setBaseUrl(newHost);
                setState(() => _currentHost = newHost);
                _controller.loadRequest(Uri.parse('$newHost/static/index.html'));
                if (mounted) Navigator.pop(ctx);
              }
            },
            child: const Text('Guardar y Recargar', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0D14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F1420),
        elevation: 0,
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFFE50914),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.play_arrow, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            const Text(
              'Anime Hub Cinema',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white70),
            tooltip: 'Recargar página',
            onPressed: () => _controller.reload(),
          ),
          IconButton(
            icon: const Icon(Icons.settings, color: Colors.white70),
            tooltip: 'Configurar servidor',
            onPressed: _showHostConfigDialog,
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE50914)),
              ),
            ),
        ],
      ),
    );
  }
}

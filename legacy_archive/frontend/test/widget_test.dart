import 'package:flutter_test/flutter_test.dart';
import 'package:anime_organizer_mobile/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const AnimeHubApp());
    expect(find.text('NYANIME TV'), findsOneWidget);
  });
}

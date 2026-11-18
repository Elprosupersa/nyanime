export interface ProfileWipeStepMeta {
  step: 1 | 2 | 3;
  badge: string;
  title: string;
  warning: string;
  bullets: string[];
  confirmLabel: string;
}

export const PROFILE_WIPE_STEPS: readonly ProfileWipeStepMeta[] = [
  {
    step: 1,
    badge: 'Confirmación 1 de 3 · Advertencia inicial',
    title: '¿Limpiar todo tu perfil?',
    warning:
      'Esta acción eliminará por completo todo tu progreso personal acumulado en NyAnime TV.',
    bullets: [
      'Todos los animes guardados (Viendo, Por Ver, Completados, En Pausa y Abandonados)',
      'Todos tus mangas en biblioteca y listas o colecciones personalizadas',
      'Tus calificaciones (1–10), reseñas, notas privadas y recordatorios de emisión',
      'Todo tu historial de reproducción/lectura, episodios vistos y estadísticas de tiempo'
    ],
    confirmLabel: 'Entiendo, continuar (1/3)'
  },
  {
    step: 2,
    badge: 'Confirmación 2 de 3 · Datos locales y nube',
    title: 'También se borrará tu identidad y caché',
    warning:
      'No solo se vacía tu lista: el perfil volverá a estado de fábrica tanto en este dispositivo como en tu cuenta conectada.',
    bullets: [
      'Se restablecerá tu nombre de usuario a "Invitado" y se quitará tu foto de galería',
      'Se borrarán capítulos y videos guardados en el almacenamiento offline y caché local',
      'Si iniciaste sesión, se vaciarán tus colecciones sincronizadas en Cloud Firestore',
      'Se desactivará la suscripción Push asociada al dispositivo'
    ],
    confirmLabel: 'Sí, borrar nube y dispositivo (2/3)'
  },
  {
    step: 3,
    badge: 'Confirmación 3 de 3 · Acción irreversible',
    title: 'Última confirmación definitiva',
    warning:
      'No existe deshacer. Tu perfil quedará 100% vacío, exactamente igual que si acabaras de crear una cuenta nueva.',
    bullets: [
      '0 animes y 0 mangas guardados',
      '0 episodios vistos, 0 capítulos leídos y 0 minutos acumulados',
      'Sin historial, sin reseñas, sin listas personalizadas ni configuraciones previas'
    ],
    confirmLabel: 'Confirmar y Borrar Todo Definitivamente (3/3)'
  }
];

export function getProfileWipeStep(step: number): ProfileWipeStepMeta {
  if (step === 2) return PROFILE_WIPE_STEPS[1];
  if (step === 3) return PROFILE_WIPE_STEPS[2];
  return PROFILE_WIPE_STEPS[0];
}

export function collectNyAnimeStorageKeys(allKeys: readonly string[]): string[] {
  const matched = new Set<string>();
  const legacyExactKeys = new Set([
    'favorites',
    'history',
    'manga_favorites',
    'manga_history',
    'user_profile'
  ]);

  for (const rawKey of allKeys) {
    const k = String(rawKey || '');
    if (!k) continue;
    if (k.startsWith('nyanime_') || legacyExactKeys.has(k)) {
      matched.add(k);
    }
  }
  return Array.from(matched);
}

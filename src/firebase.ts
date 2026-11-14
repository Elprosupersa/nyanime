import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  filterZombieHistoryEntries,
  resolveFavoritesMerge,
  resolveMangaReadChapters
} from './utils/syncLogic.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export function sanitizeDocId(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  return cleaned || 'item';
}

function translateAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const msg = (error as { message?: string })?.message || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Este correo electrónico ya está registrado. Intenta iniciar sesión.';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico no es válido.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos antes de reintentar.';
    case 'auth/popup-closed-by-user':
      return 'Se cerró la ventana de Google antes de completar el acceso.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana emergente. Permite ventanas emergentes e intenta de nuevo.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'El proveedor Correo/Contraseña está deshabilitado en Firebase Console. Usa "Continuar con Google" arriba para entrar en 1 clic.';
    case 'auth/network-request-failed':
      return 'Error de red al conectar con Firebase. Verifica tu conexión a internet.';
    default:
      return msg || 'Error de autenticación con Firebase.';
  }
}

const TOMBSTONE_KEYS = {
  deletedAnimeFavs: 'nyanime_deleted_anime_favs_v1',
  deletedMangaFavs: 'nyanime_deleted_manga_favs_v1',
  clearedHistoryAt: 'nyanime_cleared_anime_history_at_v1',
  clearedMangaHistoryAt: 'nyanime_cleared_manga_history_at_v1',
  mangaReadTsPrefix: 'nyanime_read_ts_'
} as const;

function readIdSet(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function addIdTombstone(key: string, docId: string): void {
  const set = new Set(readIdSet(key));
  set.add(docId);
  localStorage.setItem(key, JSON.stringify(Array.from(set).slice(-300)));
}

function removeIdTombstone(key: string, docId: string): void {
  const set = new Set(readIdSet(key));
  if (set.delete(docId)) {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  }
}

export interface ReaderSettingsShape {
  bg?: string;
  width?: string;
  mode?: string;
}

interface NyAnimeWindow extends Window {
  UserManager?: {
    getUser: () => {
      username?: string;
      avatar?: string;
      role?: string;
      stats?: { episodesWatched?: number; totalMinutes?: number; completedAnimes?: number };
    };
    saveUser: (user: Record<string, unknown>, skipSync?: boolean) => void;
    renderProfile: () => void;
  };
  FavoritesManager?: {
    KEY: string;
    getAll: () => Array<Record<string, unknown>>;
  };
  MangaFavoritesManager?: {
    KEY: string;
    getAll: () => Array<Record<string, unknown>>;
  };
  HistoryManager?: {
    KEY: string;
    getAll: () => Array<Record<string, unknown>>;
  };
  MangaHistoryManager?: {
    KEY: string;
    getAll: () => Array<Record<string, unknown>>;
  };
  MangaReadStateManager?: {
    getKey: (mangaId: string | number) => string;
    getReadChapters: (mangaId: string | number) => Set<string>;
  };
  ScheduleReminderManager?: {
    KEY: string;
    getAll: () => Array<number>;
  };
  getReaderSettings?: () => ReaderSettingsShape;
  applyReaderSettingsFromCloud?: (settings: ReaderSettingsShape) => void;
  renderContinuarViendo?: () => void;
  renderContinuarLeyendoManga?: () => void;
  renderFavoritos?: () => void;
  renderEmisionDiasChips?: () => void;
  showToast?: (msg: string) => void;
  FirebaseAuth?: unknown;
  firebaseSync?: unknown;
  NyAnime?: {
    Core?: Record<string, unknown>;
  };
}

const win = window as unknown as NyAnimeWindow;

let currentAuthUser: User | null = auth.currentUser;
let lastSyncTimestamp = Number(localStorage.getItem('nyanime_last_cloud_sync') || '0') || 0;
let syncInProgress = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function buildPublicUserShape(user: User | null) {
  if (!user) return null;
  const localProfile = win.UserManager?.getUser ? win.UserManager.getUser() : {};
  const providerId = user.providerData?.[0]?.providerId || 'password';
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || localProfile.username || user.email?.split('@')[0] || 'Usuario',
    username: user.displayName || localProfile.username || user.email?.split('@')[0] || 'Usuario',
    photoURL: user.photoURL || localProfile.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo',
    avatar: user.photoURL || localProfile.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo',
    providerId,
    emailVerified: user.emailVerified,
    isAnonymous: user.isAnonymous,
    role: localProfile.role || 'FREE'
  };
}

async function ensureUserProfileInFirestore(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const localUser = win.UserManager?.getUser ? win.UserManager.getUser() : {};
  const providerId = (user.providerData?.[0]?.providerId || 'password').slice(0, 40);
  const displayName =
    (user.displayName || localUser.username || user.email?.split('@')[0] || 'Usuario')
      .trim()
      .slice(0, 80) || 'Usuario';
  const avatar = (
    user.photoURL ||
    localUser.avatar ||
    'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo'
  ).slice(0, 500);
  const email = (user.email || '').slice(0, 200);
  const episodesWatched = Math.max(0, Math.min(1000000, Math.floor(Number(localUser.stats?.episodesWatched || 0))));
  const totalMinutes = Math.max(0, Math.min(100000000, Math.floor(Number(localUser.stats?.totalMinutes || 0))));

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName,
        avatar,
        providerId,
        episodesWatched,
        totalMinutes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const cloudData = snap.data() as {
        displayName?: string;
        avatar?: string;
        episodesWatched?: number;
        totalMinutes?: number;
        email?: string;
      };
      const mergedName = cloudData.displayName || displayName;
      const mergedAvatar = cloudData.avatar || avatar;
      const mergedEp = Math.max(episodesWatched, Number(cloudData.episodesWatched || 0));
      const mergedMin = Math.max(totalMinutes, Number(cloudData.totalMinutes || 0));

      if (win.UserManager?.saveUser) {
        win.UserManager.saveUser(
          {
            ...localUser,
            username: mergedName,
            avatar: mergedAvatar,
            stats: {
              ...(localUser.stats || {}),
              episodesWatched: mergedEp,
              totalMinutes: mergedMin
            }
          },
          true
        );
      }

      if (
        mergedEp !== cloudData.episodesWatched ||
        mergedMin !== cloudData.totalMinutes ||
        email !== cloudData.email
      ) {
        await updateDoc(userRef, {
          displayName: mergedName.slice(0, 80),
          avatar: mergedAvatar.slice(0, 500),
          email,
          providerId,
          episodesWatched: mergedEp,
          totalMinutes: mergedMin,
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

async function syncFavoritesBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/favorites`;
  try {
    const colRef = collection(db, 'users', uid, 'favorites');
    const snap = await getDocs(colRef);
    const cloudMap = new Map<string, Record<string, unknown>>();
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.animeId === 'number') {
        cloudMap.set(sanitizeDocId(data.animeId), data);
      }
    });

    const localList = win.FavoritesManager?.getAll ? win.FavoritesManager.getAll() : [];
    const localMap = new Map<string, Record<string, unknown>>();
    for (const item of localList) {
      const animeId = Number(item.id);
      if (animeId) localMap.set(sanitizeDocId(animeId), item);
    }

    const mergePlan = resolveFavoritesMerge({
      localIds: Array.from(localMap.keys()),
      cloudIds: Array.from(cloudMap.keys()),
      deletedIds: readIdSet(TOMBSTONE_KEYS.deletedAnimeFavs)
    });

    for (const docId of mergePlan.toDeleteCloud) {
      await deleteDoc(doc(db, 'users', uid, 'favorites', docId));
      removeIdTombstone(TOMBSTONE_KEYS.deletedAnimeFavs, docId);
    }

    for (const docId of mergePlan.toUpload) {
      const item = localMap.get(docId);
      if (!item) continue;
      const animeId = Number(item.id);
      const payload: Record<string, unknown> = {
        uid,
        animeId: Math.floor(animeId),
        title: typeof item.title === 'object' && item.title ? item.title : { romaji: String(item.title || 'Anime') },
        coverImage: typeof item.coverImage === 'object' && item.coverImage ? item.coverImage : { large: '' },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (typeof item.format === 'string' && item.format) payload.format = item.format.slice(0, 40);
      if (typeof item.status === 'string' && item.status) payload.status = item.status.slice(0, 40);
      if (typeof item.episodes === 'number' && item.episodes >= 0) payload.episodes = Math.floor(item.episodes);
      if (Array.isArray(item.genres)) payload.genres = item.genres.slice(0, 20);
      await setDoc(doc(db, 'users', uid, 'favorites', docId), payload);
    }

    let changedLocal = false;
    for (const docId of mergePlan.toKeepLocal) {
      if (!localMap.has(docId)) {
        const cloudItem = cloudMap.get(docId);
        if (!cloudItem) continue;
        localList.push({
          id: Number(cloudItem.animeId),
          title: cloudItem.title,
          coverImage: cloudItem.coverImage,
          format: cloudItem.format || 'TV',
          status: cloudItem.status || 'FINISHED',
          episodes: cloudItem.episodes || null,
          genres: cloudItem.genres || []
        });
        changedLocal = true;
      }
    }

    if (changedLocal && win.FavoritesManager?.KEY) {
      localStorage.setItem(win.FavoritesManager.KEY, JSON.stringify(localList));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function syncMangaFavoritesBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/manga_favorites`;
  try {
    const colRef = collection(db, 'users', uid, 'manga_favorites');
    const snap = await getDocs(colRef);
    const cloudMap = new Map<string, Record<string, unknown>>();
    snap.forEach((d) => {
      const data = d.data();
      if (data.mangaId) {
        cloudMap.set(String(data.mangaId), data);
      }
    });

    const localList = win.MangaFavoritesManager?.getAll ? win.MangaFavoritesManager.getAll() : [];
    const localMap = new Map<string, Record<string, unknown>>();
    for (const item of localList) {
      const rawId = String(item.id || '');
      if (rawId) localMap.set(sanitizeDocId(rawId), item);
    }

    const mergePlan = resolveFavoritesMerge({
      localIds: Array.from(localMap.keys()),
      cloudIds: Array.from(cloudMap.keys()),
      deletedIds: readIdSet(TOMBSTONE_KEYS.deletedMangaFavs)
    });

    for (const docId of mergePlan.toDeleteCloud) {
      await deleteDoc(doc(db, 'users', uid, 'manga_favorites', docId));
      removeIdTombstone(TOMBSTONE_KEYS.deletedMangaFavs, docId);
    }

    for (const docId of mergePlan.toUpload) {
      const item = localMap.get(docId);
      if (!item) continue;
      const payload: Record<string, unknown> = {
        uid,
        mangaId: docId,
        title: String(item.title || 'Manga').slice(0, 240),
        cover: String(item.cover || '').slice(0, 600),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (item.flag) payload.flag = String(item.flag).slice(0, 40);
      if (item.origLang) payload.origLang = String(item.origLang).slice(0, 16);
      if (item.score) payload.score = String(item.score).slice(0, 16);
      if (item.status) payload.status = String(item.status).slice(0, 40);
      if (item.year) payload.year = String(item.year).slice(0, 16);
      await setDoc(doc(db, 'users', uid, 'manga_favorites', docId), payload);
    }

    let changedLocal = false;
    for (const docId of mergePlan.toKeepLocal) {
      if (!localMap.has(docId)) {
        const cloudItem = cloudMap.get(docId);
        if (!cloudItem) continue;
        localList.push({
          id: Number(docId) || docId,
          title: cloudItem.title,
          cover: cloudItem.cover,
          banner: cloudItem.cover,
          flag: cloudItem.flag || '🇯🇵 Manga',
          origLang: cloudItem.origLang || 'jp',
          score: cloudItem.score || '8.6',
          status: cloudItem.status || 'En Emisión',
          year: cloudItem.year || '2024'
        });
        changedLocal = true;
      }
    }

    if (changedLocal && win.MangaFavoritesManager?.KEY) {
      localStorage.setItem(win.MangaFavoritesManager.KEY, JSON.stringify(localList));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function syncHistoryBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/history`;
  try {
    const colRef = collection(db, 'users', uid, 'history');
    const snap = await getDocs(colRef);
    const rawCloudEntries: Array<{ id: number; timestamp: number; data: Record<string, unknown> }> = [];
    snap.forEach((d) => {
      const data = d.data();
      if (typeof data.animeId === 'number') {
        rawCloudEntries.push({
          id: data.animeId,
          timestamp: Number(data.timestamp || 0),
          data
        });
      }
    });

    const clearedAt = Number(localStorage.getItem(TOMBSTONE_KEYS.clearedHistoryAt) || '0') || 0;
    const { validCloudEntries, zombieCloudIds } = filterZombieHistoryEntries({
      cloudEntries: rawCloudEntries,
      clearedAtTimestamp: clearedAt
    });

    for (const zombieId of zombieCloudIds) {
      await deleteDoc(doc(db, 'users', uid, 'history', sanitizeDocId(zombieId)));
    }

    const cloudMap = new Map<number, Record<string, unknown>>();
    for (const entry of validCloudEntries) {
      cloudMap.set(entry.id, entry.data);
    }

    const localList = win.HistoryManager?.getAll ? win.HistoryManager.getAll() : [];
    const localMap = new Map<number, Record<string, unknown>>();

    for (const entry of localList) {
      const anime = (entry.anime || {}) as Record<string, unknown>;
      const animeId = Number(anime.id);
      if (!animeId) continue;
      localMap.set(animeId, entry);
      const ts = Number(entry.timestamp || Date.now());
      const cloudEntry = cloudMap.get(animeId);
      if (!cloudEntry || ts > Number(cloudEntry.timestamp || 0)) {
        const docId = sanitizeDocId(animeId);
        const titleObj = (anime.title || {}) as Record<string, string>;
        const coverObj = (anime.coverImage || {}) as Record<string, string>;
        const payload: Record<string, unknown> = {
          uid,
          animeId: Math.floor(animeId),
          animeTitle: String(titleObj.english || titleObj.romaji || 'Anime').slice(0, 240),
          coverImage: String(coverObj.extraLarge || coverObj.large || '').slice(0, 600),
          seasonNum: Math.max(1, Math.floor(Number(entry.seasonNum || 1))),
          episodeNum: Math.max(0, Math.floor(Number(entry.episodeNum || 1))),
          timestamp: Math.max(0, Math.floor(ts)),
          updatedAt: serverTimestamp()
        };
        if (typeof entry.currentTime === 'number' && Number.isFinite(entry.currentTime)) {
          payload.currentTime = Math.max(0, Math.min(86400, Number(entry.currentTime)));
        }
        if (typeof entry.duration === 'number' && Number.isFinite(entry.duration)) {
          payload.duration = Math.max(0, Math.min(86400, Number(entry.duration)));
        }
        if (typeof entry.completed === 'boolean') {
          payload.completed = entry.completed;
        }
        const ref = doc(db, 'users', uid, 'history', docId);
        if (!cloudEntry) {
          payload.createdAt = serverTimestamp();
          await setDoc(ref, payload);
        } else {
          delete payload.uid;
          delete payload.animeId;
          await updateDoc(ref, payload);
        }
      }
    }

    let changedLocal = false;
    for (const [animeId, cloudItem] of cloudMap.entries()) {
      const existing = localMap.get(animeId);
      const cloudTs = Number(cloudItem.timestamp || 0);
      if (!existing) {
        localList.push({
          anime: {
            id: animeId,
            title: { english: cloudItem.animeTitle, romaji: cloudItem.animeTitle },
            coverImage: { large: cloudItem.coverImage, extraLarge: cloudItem.coverImage }
          },
          seasonNum: cloudItem.seasonNum || 1,
          episodeNum: cloudItem.episodeNum || 1,
          currentTime: typeof cloudItem.currentTime === 'number' ? cloudItem.currentTime : 0,
          duration: typeof cloudItem.duration === 'number' ? cloudItem.duration : 0,
          completed: Boolean(cloudItem.completed),
          timestamp: cloudTs
        });
        changedLocal = true;
      } else if (cloudTs > Number(existing.timestamp || 0)) {
        existing.seasonNum = cloudItem.seasonNum || 1;
        existing.episodeNum = cloudItem.episodeNum || 1;
        if (typeof cloudItem.currentTime === 'number') existing.currentTime = cloudItem.currentTime;
        if (typeof cloudItem.duration === 'number') existing.duration = cloudItem.duration;
        if (typeof cloudItem.completed === 'boolean') existing.completed = cloudItem.completed;
        existing.timestamp = cloudTs;
        changedLocal = true;
      }
    }

    if (changedLocal && win.HistoryManager?.KEY) {
      localList.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      localStorage.setItem(win.HistoryManager.KEY, JSON.stringify(localList.slice(0, 20)));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function syncMangaProgressBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/manga_progress`;
  try {
    const colRef = collection(db, 'users', uid, 'manga_progress');
    const snap = await getDocs(colRef);
    const rawCloudEntries: Array<{ id: string; timestamp: number; data: Record<string, unknown> }> = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.mangaId) {
        rawCloudEntries.push({
          id: String(data.mangaId),
          timestamp: Number(data.timestamp || 0),
          data
        });
      }
    });

    const clearedMangaAt = Number(localStorage.getItem(TOMBSTONE_KEYS.clearedMangaHistoryAt) || '0') || 0;
    const { validCloudEntries, zombieCloudIds } = filterZombieHistoryEntries({
      cloudEntries: rawCloudEntries,
      clearedAtTimestamp: clearedMangaAt
    });

    for (const zombieId of zombieCloudIds) {
      await deleteDoc(doc(db, 'users', uid, 'manga_progress', sanitizeDocId(zombieId)));
    }

    const cloudMap = new Map<string, Record<string, unknown>>();
    for (const entry of validCloudEntries) {
      cloudMap.set(entry.id, entry.data);
    }

    const localHistory = win.MangaHistoryManager?.getAll ? win.MangaHistoryManager.getAll() : [];
    const seenDocIds = new Set<string>();

    for (const entry of localHistory) {
      const manga = (entry.manga || {}) as Record<string, unknown>;
      const rawId = manga.id;
      if (!rawId) continue;
      const docId = sanitizeDocId(rawId);
      seenDocIds.add(docId);

      const localSet = win.MangaReadStateManager?.getReadChapters
        ? Array.from(win.MangaReadStateManager.getReadChapters(rawId as string | number))
        : [];
      const cloudItem = cloudMap.get(docId);
      const cloudRead = Array.isArray(cloudItem?.readChapters) ? (cloudItem.readChapters as string[]) : [];
      const localReadTs =
        Number(localStorage.getItem(`${TOMBSTONE_KEYS.mangaReadTsPrefix}${docId}`) || '0') ||
        Number(entry.timestamp || 0);
      const cloudTs = Number(cloudItem?.timestamp || 0);
      const localTs = Math.max(Number(entry.timestamp || Date.now()), localReadTs);

      const resolvedRead = resolveMangaReadChapters({
        localChapters: localSet,
        cloudChapters: cloudRead,
        localUpdatedAt: localReadTs,
        cloudUpdatedAt: cloudTs,
        explicitLocalWrite: localReadTs > 0
      });

      if (
        win.MangaReadStateManager?.getKey &&
        JSON.stringify(resolvedRead) !== JSON.stringify(localSet)
      ) {
        localStorage.setItem(
          win.MangaReadStateManager.getKey(rawId as string | number),
          JSON.stringify(resolvedRead)
        );
      }

      const ref = doc(db, 'users', uid, 'manga_progress', docId);
      if (!cloudItem) {
        await setDoc(ref, {
          uid,
          mangaId: docId,
          mangaTitle: String(manga.title || 'Manga').slice(0, 240),
          cover: String(manga.cover || '').slice(0, 600),
          flag: String(manga.flag || '🇯🇵 Manga').slice(0, 40),
          origLang: String(manga.origLang || 'jp').slice(0, 16),
          lastChapterNum: Number(entry.chapterNum || 1),
          lastChapterLabel: String(entry.chapterLabel || '1').slice(0, 32),
          readChapters: resolvedRead,
          timestamp: Math.max(0, Math.floor(localTs)),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else if (
        JSON.stringify(resolvedRead) !== JSON.stringify(cloudRead) ||
        localTs > cloudTs
      ) {
        await updateDoc(ref, {
          mangaTitle: String(manga.title || cloudItem.mangaTitle || 'Manga').slice(0, 240),
          cover: String(manga.cover || cloudItem.cover || '').slice(0, 600),
          flag: String(manga.flag || cloudItem.flag || '🇯🇵 Manga').slice(0, 40),
          origLang: String(manga.origLang || cloudItem.origLang || 'jp').slice(0, 16),
          lastChapterNum: localTs >= cloudTs ? Number(entry.chapterNum || 1) : Number(cloudItem.lastChapterNum || 1),
          lastChapterLabel:
            localTs >= cloudTs
              ? String(entry.chapterLabel || '1').slice(0, 32)
              : String(cloudItem.lastChapterLabel || '1').slice(0, 32),
          readChapters: resolvedRead,
          timestamp: Math.max(localTs, cloudTs),
          updatedAt: serverTimestamp()
        });
      }
    }

    let historyChanged = false;
    for (const [docId, cloudItem] of cloudMap.entries()) {
      if (!seenDocIds.has(docId)) {
        const cloudRead = Array.isArray(cloudItem.readChapters) ? (cloudItem.readChapters as string[]) : [];
        const rawId = Number(docId) || docId;
        const localReadTs = Number(localStorage.getItem(`${TOMBSTONE_KEYS.mangaReadTsPrefix}${docId}`) || '0');
        const cloudTs = Number(cloudItem.timestamp || 0);
        if (win.MangaReadStateManager?.getKey) {
          const existingSet = Array.from(win.MangaReadStateManager.getReadChapters(rawId));
          const resolved = resolveMangaReadChapters({
            localChapters: existingSet,
            cloudChapters: cloudRead,
            localUpdatedAt: localReadTs,
            cloudUpdatedAt: cloudTs,
            explicitLocalWrite: localReadTs > 0
          });
          localStorage.setItem(win.MangaReadStateManager.getKey(rawId), JSON.stringify(resolved));
        }
        localHistory.push({
          manga: {
            id: rawId,
            title: cloudItem.mangaTitle,
            cover: cloudItem.cover,
            banner: cloudItem.cover,
            flag: cloudItem.flag || '🇯🇵 Manga',
            origLang: cloudItem.origLang || 'jp'
          },
          chapterNum: cloudItem.lastChapterNum || 1,
          chapterLabel: cloudItem.lastChapterLabel || '1',
          timestamp: Number(cloudItem.timestamp || Date.now())
        });
        historyChanged = true;
      }
    }

    if (historyChanged && win.MangaHistoryManager?.KEY) {
      localHistory.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      localStorage.setItem(win.MangaHistoryManager.KEY, JSON.stringify(localHistory.slice(0, 20)));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function syncSettingsBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/settings/preferences`;
  try {
    const ref = doc(db, 'users', uid, 'settings', 'preferences');
    const snap = await getDoc(ref);
    const localReminders = win.ScheduleReminderManager?.getAll ? win.ScheduleReminderManager.getAll() : [];
    const localReader = win.getReaderSettings ? win.getReaderSettings() : {};
    const readerBg = String(localReader.bg || '#000000').slice(0, 32);
    const readerWidth = String(localReader.width || '100%').slice(0, 32);
    const readerMode = String(localReader.mode || 'webtoon').slice(0, 32);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        scheduleReminders: localReminders.slice(0, 500),
        readerBg,
        readerWidth,
        readerMode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const cloudData = snap.data() as {
        scheduleReminders?: number[];
        readerBg?: string;
        readerWidth?: string;
        readerMode?: string;
      };
      const cloudReminders = Array.isArray(cloudData.scheduleReminders) ? cloudData.scheduleReminders : [];
      const mergedReminders = Array.from(new Set([...localReminders, ...cloudReminders])).slice(0, 500);
      if (mergedReminders.length > localReminders.length && win.ScheduleReminderManager?.KEY) {
        localStorage.setItem(win.ScheduleReminderManager.KEY, JSON.stringify(mergedReminders));
      }

      const cloudReader: ReaderSettingsShape = {
        bg: cloudData.readerBg || readerBg,
        width: cloudData.readerWidth || readerWidth,
        mode: cloudData.readerMode || readerMode
      };
      if (
        (cloudData.readerBg || cloudData.readerWidth || cloudData.readerMode) &&
        win.applyReaderSettingsFromCloud
      ) {
        win.applyReaderSettingsFromCloud(cloudReader);
      }

      const needsCloudUpdate =
        mergedReminders.length > cloudReminders.length ||
        cloudData.readerBg !== readerBg ||
        cloudData.readerWidth !== readerWidth ||
        cloudData.readerMode !== readerMode;

      if (needsCloudUpdate) {
        await updateDoc(ref, {
          scheduleReminders: mergedReminders,
          readerBg,
          readerWidth,
          readerMode,
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function runFullCloudSync(): Promise<void> {
  const user = auth.currentUser;
  if (!user || syncInProgress) return;
  syncInProgress = true;

  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  if (badge) badge.className = 'sync-pill syncing';
  if (text) text.textContent = 'Sincronizando...';

  try {
    await ensureUserProfileInFirestore(user);
    await Promise.all([
      syncFavoritesBidirectional(user.uid),
      syncMangaFavoritesBidirectional(user.uid),
      syncHistoryBidirectional(user.uid),
      syncMangaProgressBidirectional(user.uid),
      syncSettingsBidirectional(user.uid)
    ]);

    lastSyncTimestamp = Date.now();
    localStorage.setItem('nyanime_last_cloud_sync', String(lastSyncTimestamp));

    win.renderContinuarViendo?.();
    win.renderContinuarLeyendoManga?.();
    win.renderFavoritos?.();
    win.renderEmisionDiasChips?.();
    win.UserManager?.renderProfile();
  } catch (err) {
    console.warn('Cloud sync warning:', err);
  } finally {
    syncInProgress = false;
    win.UserManager?.renderProfile();
  }
}

export interface EpisodeCommentRecord {
  id: string;
  uid: string;
  episodeKey: string;
  displayName: string;
  avatar: string;
  text: string;
  isSpoiler?: boolean;
  createdAt: Timestamp | number | null;
}

export interface EpisodeCommentsPage {
  items: EpisodeCommentRecord[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const FirebaseCommentsBridge = {
  async listCommentsPage(
    episodeKey: string,
    cursor: QueryDocumentSnapshot<DocumentData> | null = null,
    pageSize = 50
  ): Promise<EpisodeCommentsPage> {
    const cleanEpKey = sanitizeDocId(episodeKey);
    const path = `episodes/${cleanEpKey}/comments`;
    try {
      const colRef = collection(db, 'episodes', cleanEpKey, 'comments');
      const q = cursor
        ? query(colRef, orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize))
        : query(colRef, orderBy('createdAt', 'desc'), limit(pageSize));
      const snap = await getDocs(q);
      const rows: EpisodeCommentRecord[] = [];
      snap.forEach((d) => {
        const data = d.data();
        rows.push({
          id: d.id,
          uid: String(data.uid || ''),
          episodeKey: String(data.episodeKey || cleanEpKey),
          displayName: String(data.displayName || 'Usuario'),
          avatar: String(data.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo'),
          text: String(data.text || ''),
          isSpoiler: Boolean(data.isSpoiler),
          createdAt: (data.createdAt as Timestamp) || null
        });
      });
      const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items: rows,
        lastDoc,
        hasMore: snap.docs.length >= pageSize
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  },

  async listComments(episodeKey: string): Promise<EpisodeCommentRecord[]> {
    const page = await this.listCommentsPage(episodeKey, null, 50);
    return page.items;
  },

  async addComment(episodeKey: string, text: string, isSpoiler = false): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error('Inicia sesión para comentar.');
    const cleanEpKey = sanitizeDocId(episodeKey);
    const commentId = sanitizeDocId(`c_${user.uid.slice(0, 12)}_${Date.now()}`);
    const localProfile = win.UserManager?.getUser ? win.UserManager.getUser() : {};
    const displayName =
      (user.displayName || localProfile.username || user.email?.split('@')[0] || 'Usuario')
        .trim()
        .slice(0, 80) || 'Usuario';
    const avatar = (
      user.photoURL ||
      localProfile.avatar ||
      'https://api.dicebear.com/7.x/bottts/svg?seed=Gojo'
    ).slice(0, 500);
    const cleanText = text.trim().slice(0, 500);
    if (cleanText.length < 2) {
      throw new Error('El comentario debe tener al menos 2 caracteres.');
    }
    const path = `episodes/${cleanEpKey}/comments/${commentId}`;

    try {
      await setDoc(doc(db, 'episodes', cleanEpKey, 'comments', commentId), {
        uid: user.uid,
        episodeKey: cleanEpKey,
        displayName,
        avatar,
        text: cleanText,
        isSpoiler: Boolean(isSpoiler),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async deleteComment(episodeKey: string, commentId: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    const cleanEpKey = sanitizeDocId(episodeKey);
    const cleanCommentId = sanitizeDocId(commentId);
    const path = `episodes/${cleanEpKey}/comments/${cleanCommentId}`;
    try {
      await deleteDoc(doc(db, 'episodes', cleanEpKey, 'comments', cleanCommentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
};

export const FirebaseAuthBridge = {
  getCurrentUser() {
    return buildPublicUserShape(currentAuthUser || auth.currentUser);
  },

  async signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      currentAuthUser = cred.user;
      await runFullCloudSync();
      return buildPublicUserShape(cred.user);
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  },

  async signUpWithEmail(email: string, password: string, displayName = 'Usuario') {
    const cleanEmail = email.trim();
    const cleanName = (displayName || cleanEmail.split('@')[0] || 'Usuario').trim().slice(0, 80);
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`;
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      currentAuthUser = cred.user;
      await updateProfile(cred.user, {
        displayName: cleanName,
        photoURL: defaultAvatar
      });
      await sendEmailVerification(cred.user).catch(() => {});
      await ensureUserProfileInFirestore(cred.user);
      await runFullCloudSync();
      return buildPublicUserShape(cred.user);
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  },

  async signInWithEmail(email: string, password: string) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      currentAuthUser = cred.user;
      await runFullCloudSync();
      return buildPublicUserShape(cred.user);
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  },

  async sendPasswordReset(email: string) {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  },

  async resendVerification() {
    const user = auth.currentUser;
    if (!user) throw new Error('Inicia sesión primero.');
    try {
      await sendEmailVerification(user);
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  },

  async updateAuthProfile(displayName: string, photoURL: string) {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await updateProfile(user, {
        displayName: displayName.slice(0, 80),
        photoURL: photoURL.slice(0, 500)
      });
      await ensureUserProfileInFirestore(user);
    } catch (err) {
      console.warn('Error updating Firebase user profile:', err);
    }
  },

  async signOutUser() {
    try {
      await signOut(auth);
      currentAuthUser = null;
      win.UserManager?.renderProfile();
    } catch (error) {
      throw new Error(translateAuthError(error));
    }
  }
};

export const FirebaseSyncBridge = {
  isAuthenticated() {
    return Boolean(auth.currentUser);
  },

  isSyncing() {
    return syncInProgress;
  },

  getHumanTimeSinceLastSync(): string {
    if (!auth.currentUser) return 'Solo almacenamiento local';
    if (!lastSyncTimestamp) return 'Pendiente';
    const diffSec = Math.max(0, Math.floor((Date.now() - lastSyncTimestamp) / 1000));
    if (diffSec < 15) return 'Hace un momento';
    if (diffSec < 60) return `Hace ${diffSec}s`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `Hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `Hace ${hrs} h`;
  },

  scheduleSync(_reason = 'update') {
    if (!auth.currentUser) return;
    if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      void runFullCloudSync();
    }, 650);
  },

  async syncAll() {
    if (!auth.currentUser) {
      throw new Error('Inicia sesión para sincronizar con la nube');
    }
    await runFullCloudSync();
  },

  async saveReaderSettings(settings: ReaderSettingsShape) {
    const user = auth.currentUser;
    if (!user) return;
    const path = `users/${user.uid}/settings/preferences`;
    try {
      const ref = doc(db, 'users', user.uid, 'settings', 'preferences');
      const snap = await getDoc(ref);
      const localReminders = win.ScheduleReminderManager?.getAll ? win.ScheduleReminderManager.getAll() : [];
      const payload = {
        readerBg: String(settings.bg || '#000000').slice(0, 32),
        readerWidth: String(settings.width || '100%').slice(0, 32),
        readerMode: String(settings.mode || 'webtoon').slice(0, 32),
        updatedAt: serverTimestamp()
      };
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          scheduleReminders: localReminders.slice(0, 500),
          ...payload,
          createdAt: serverTimestamp()
        });
      } else {
        await updateDoc(ref, payload);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async removeCloudFavorite(id: number | string, type: 'anime' | 'manga') {
    const docId = sanitizeDocId(id);
    if (type === 'anime') {
      addIdTombstone(TOMBSTONE_KEYS.deletedAnimeFavs, docId);
      await this.deleteFavoriteAnime(id);
    } else {
      addIdTombstone(TOMBSTONE_KEYS.deletedMangaFavs, docId);
      await this.deleteFavoriteManga(id);
    }
  },

  async deleteFavoriteAnime(animeId: number | string) {
    const docId = sanitizeDocId(animeId);
    addIdTombstone(TOMBSTONE_KEYS.deletedAnimeFavs, docId);
    const user = auth.currentUser;
    if (!user) return;
    const path = `users/${user.uid}/favorites/${docId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'favorites', docId));
      removeIdTombstone(TOMBSTONE_KEYS.deletedAnimeFavs, docId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async deleteFavoriteManga(mangaId: number | string) {
    const docId = sanitizeDocId(mangaId);
    addIdTombstone(TOMBSTONE_KEYS.deletedMangaFavs, docId);
    const user = auth.currentUser;
    if (!user) return;
    const path = `users/${user.uid}/manga_favorites/${docId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'manga_favorites', docId));
      removeIdTombstone(TOMBSTONE_KEYS.deletedMangaFavs, docId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  },

  async deleteCloudHistory(kind: 'all' | 'anime' | 'manga' = 'all') {
    const now = Date.now();
    if (kind === 'all' || kind === 'anime') {
      localStorage.setItem(TOMBSTONE_KEYS.clearedHistoryAt, String(now));
    }
    if (kind === 'all' || kind === 'manga') {
      localStorage.setItem(TOMBSTONE_KEYS.clearedMangaHistoryAt, String(now));
    }
    const user = auth.currentUser;
    if (!user) return;

    if (kind === 'all' || kind === 'anime') {
      const path = `users/${user.uid}/history`;
      try {
        const snap = await getDocs(collection(db, 'users', user.uid, 'history'));
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }

    if (kind === 'all' || kind === 'manga') {
      const path = `users/${user.uid}/manga_progress`;
      try {
        const snap = await getDocs(collection(db, 'users', user.uid, 'manga_progress'));
        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  },

  async updateCloudMangaProgressOverwrite(
    mangaId: number | string,
    readChapters: string[],
    mangaMeta?: { title?: string; cover?: string; flag?: string; origLang?: string }
  ) {
    const docId = sanitizeDocId(mangaId);
    const now = Date.now();
    const cleanRead = Array.from(new Set((readChapters || []).map(String))).slice(0, 3000);
    localStorage.setItem(`${TOMBSTONE_KEYS.mangaReadTsPrefix}${docId}`, String(now));

    const user = auth.currentUser;
    if (!user) return;
    const path = `users/${user.uid}/manga_progress/${docId}`;
    try {
      const ref = doc(db, 'users', user.uid, 'manga_progress', docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          readChapters: cleanRead,
          timestamp: now,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(ref, {
          uid: user.uid,
          mangaId: docId,
          mangaTitle: String(mangaMeta?.title || 'Manga').slice(0, 240),
          cover: String(mangaMeta?.cover || '').slice(0, 600),
          flag: String(mangaMeta?.flag || '🇯🇵 Manga').slice(0, 40),
          origLang: String(mangaMeta?.origLang || 'jp').slice(0, 16),
          lastChapterNum: 1,
          lastChapterLabel: '1',
          readChapters: cleanRead,
          timestamp: now,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async saveSuggestion(tipo: string, texto: string) {
    const user = auth.currentUser;
    if (!user) return;
    const docId = sanitizeDocId(`sug_${Date.now()}`);
    const path = `users/${user.uid}/suggestions/${docId}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'suggestions', docId), {
        uid: user.uid,
        tipo: String(tipo || 'Sugerencia').slice(0, 64),
        texto: String(texto || '').slice(0, 1000),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async exportBackupJSON() {
    const favorites = win.FavoritesManager?.getAll ? win.FavoritesManager.getAll() : [];
    const mangaFavorites = win.MangaFavoritesManager?.getAll ? win.MangaFavoritesManager.getAll() : [];
    const history = win.HistoryManager?.getAll ? win.HistoryManager.getAll() : [];
    const mangaHistory = win.MangaHistoryManager?.getAll ? win.MangaHistoryManager.getAll() : [];
    const scheduleReminders = win.ScheduleReminderManager?.getAll ? win.ScheduleReminderManager.getAll() : [];
    return {
      schemaVersion: '2.3.0',
      exportedAt: new Date().toISOString(),
      app: 'NyAnime TV',
      firebaseUid: auth.currentUser?.uid || null,
      data: {
        favorites,
        mangaFavorites,
        history,
        mangaHistory,
        scheduleReminders,
        readerSettings: win.getReaderSettings ? win.getReaderSettings() : {},
        userProfile: win.UserManager?.getUser ? win.UserManager.getUser() : {}
      }
    };
  },

  async importBackupJSON(json: Record<string, unknown>) {
    const data = (json.data || json) as Record<string, unknown>;
    if (Array.isArray(data.favorites) && win.FavoritesManager?.KEY) {
      localStorage.setItem(win.FavoritesManager.KEY, JSON.stringify(data.favorites));
    }
    if (Array.isArray(data.mangaFavorites) && win.MangaFavoritesManager?.KEY) {
      localStorage.setItem(win.MangaFavoritesManager.KEY, JSON.stringify(data.mangaFavorites));
    }
    if (Array.isArray(data.history) && win.HistoryManager?.KEY) {
      localStorage.setItem(win.HistoryManager.KEY, JSON.stringify(data.history));
    }
    if (Array.isArray(data.mangaHistory) && win.MangaHistoryManager?.KEY) {
      localStorage.setItem(win.MangaHistoryManager.KEY, JSON.stringify(data.mangaHistory));
    }
    if (Array.isArray(data.scheduleReminders) && win.ScheduleReminderManager?.KEY) {
      localStorage.setItem(win.ScheduleReminderManager.KEY, JSON.stringify(data.scheduleReminders));
    }
    if (data.readerSettings && win.applyReaderSettingsFromCloud) {
      win.applyReaderSettingsFromCloud(data.readerSettings as ReaderSettingsShape);
    }
    if (data.userProfile && win.UserManager?.saveUser) {
      win.UserManager.saveUser(data.userProfile as Record<string, unknown>);
    }
    if (auth.currentUser) {
      await runFullCloudSync();
    }
  }
};

// Expose bridges globally for /index.html UI handlers
win.FirebaseAuth = FirebaseAuthBridge;
win.firebaseSync = FirebaseSyncBridge;
win.NyAnime = win.NyAnime || {};
win.NyAnime.Core = {
  ...(win.NyAnime.Core || {}),
  firebaseAuthManager: FirebaseAuthBridge,
  commentsBridge: FirebaseCommentsBridge,
  syncAll: () => FirebaseSyncBridge.syncAll(),
  exportBackupJSON: () => FirebaseSyncBridge.exportBackupJSON(),
  importBackupJSON: (json: Record<string, unknown>) => FirebaseSyncBridge.importBackupJSON(json)
};

// Keep UI and Cloud Firestore synchronized whenever auth state changes
onAuthStateChanged(auth, (user) => {
  currentAuthUser = user;
  win.UserManager?.renderProfile();
  if (user) {
    void runFullCloudSync();
  }
});

export type { Timestamp };

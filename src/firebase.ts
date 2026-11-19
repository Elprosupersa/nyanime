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
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Timestamp,
  type Unsubscribe
} from 'firebase/firestore';
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported as isMessagingSupported,
  type Messaging
} from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';
import {
  filterZombieHistoryEntries,
  resolveAnimeWatchedMerge,
  resolveFavoriteStatusSync,
  resolveFavoritesMerge,
  resolveMangaReadChapters,
  resolveUserProfileSync
} from './utils/syncLogic.ts';
import { normalizeAnimeListStatus } from './utils/profileStats.ts';
import {
  sanitizeCustomListIds,
  sanitizeShortText,
  sanitizeUserScore
} from './utils/libraryEnhancements.ts';
import {
  generateInviteToken,
  generateRoomCode,
  generateRoomPasscode,
  getOrCreateWatchClientIdentity,
  hashRoomSecret,
  normalizeRoomCode,
  normalizeRoomSecret,
  sanitizeWatchChatText,
  verifyRoomAccess,
  type WatchRoomState
} from './utils/watchTogether.ts';
import { normalizeFcmAiringPayload } from './utils/pushNotifications.ts';
import {
  DEFAULT_AVATAR_URL,
  sanitizeAvatarForAuthPhotoUrl,
  sanitizeAvatarForCloud
} from './utils/avatarHelpers.ts';
import {
  compactFavoritesArray,
  compactHistoryArray,
  compactMangaEntry,
  safeStorageSetItem
} from './utils/storageQuota.ts';

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
  deletedCustomLists: 'nyanime_deleted_custom_lists_v1',
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
  brightness?: number;
  contrast?: number;
  sepia?: number;
  continuousChapter?: boolean;
}

interface NyAnimeWindow extends Window {
  UserManager?: {
    getUser: () => {
      username?: string;
      avatar?: string;
      profileUpdatedAt?: number;
      role?: string;
      stats?: {
        episodesWatched?: number;
        totalMinutes?: number;
        totalSecondsWatched?: number;
        completedAnimes?: number;
      };
    };
    saveUser: (user: Record<string, unknown>, skipSync?: boolean) => void;
    syncWatchedStatsFromLedger?: (skipSync?: boolean) => void;
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
  CustomListsManager?: {
    KEY: string;
    getAll: () => Array<Record<string, unknown>>;
  };
  AppPreferencesManager?: {
    KEY: string;
    get: () => Record<string, unknown>;
    save: (next: Record<string, unknown>, skipSync?: boolean) => void;
  };
  AnimeWatchedManager?: {
    KEY: string;
    TS_KEY?: string;
    getAll: () => Record<string, number[]>;
    getTimestamps?: () => Record<string, number>;
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
  updateFavoriteButton?: (id?: number | string) => void;
  renderEmisionDiasChips?: () => void;
  showToast?: (msg: string) => void;
  FirebaseAuth?: unknown;
  firebaseSync?: unknown;
  FirebaseMessaging?: unknown;
  NyAnime?: {
    Core?: Record<string, unknown>;
  };
}

const win = window as unknown as NyAnimeWindow;

let currentAuthUser: User | null = auth.currentUser;
let lastSyncTimestamp = Number(localStorage.getItem('nyanime_last_cloud_sync') || '0') || 0;
let syncInProgress = false;
let pendingCloudSync = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function buildPublicUserShape(user: User | null) {
  if (!user) return null;
  const localProfile = win.UserManager?.getUser ? win.UserManager.getUser() : {};
  const providerId = user.providerData?.[0]?.providerId || 'password';
  const resolvedAvatar = sanitizeAvatarForCloud(
    (localProfile.profileUpdatedAt || 0) > 0
      ? localProfile.avatar || user.photoURL
      : user.photoURL || localProfile.avatar,
    DEFAULT_AVATAR_URL
  );
  const resolvedName =
    (localProfile.profileUpdatedAt || 0) > 0 && localProfile.username && localProfile.username !== 'Invitado'
      ? localProfile.username
      : user.displayName || localProfile.username || user.email?.split('@')[0] || 'Usuario';
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: resolvedName,
    username: resolvedName,
    photoURL: resolvedAvatar,
    avatar: resolvedAvatar,
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
  const localUpdatedAt = Math.max(0, Math.floor(Number(localUser.profileUpdatedAt || 0)));
  const fallbackName =
    (user.displayName || user.email?.split('@')[0] || 'Usuario').trim().slice(0, 80) || 'Usuario';
  const localName =
    localUser.username && localUser.username !== 'Invitado'
      ? String(localUser.username).trim().slice(0, 80)
      : fallbackName;
  const fallbackAvatar = sanitizeAvatarForCloud(user.photoURL, DEFAULT_AVATAR_URL);
  const localAvatar = sanitizeAvatarForCloud(localUser.avatar || user.photoURL, DEFAULT_AVATAR_URL);
  const email = (user.email || '').slice(0, 200);
  const episodesWatched = Math.max(0, Math.min(1000000, Math.floor(Number(localUser.stats?.episodesWatched || 0))));
  const rawLocalSeconds =
    typeof localUser.stats?.totalSecondsWatched === 'number'
      ? localUser.stats.totalSecondsWatched
      : Number(localUser.stats?.totalMinutes || 0) * 60;
  const totalSecondsWatched = Math.max(0, Math.min(6000000000, Math.floor(Number(rawLocalSeconds || 0))));
  const totalMinutes = Math.max(0, Math.min(100000000, Math.floor(totalSecondsWatched / 60)));

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName: localName,
        avatar: localAvatar,
        profileUpdatedAt: localUpdatedAt,
        providerId,
        episodesWatched,
        totalMinutes,
        totalSecondsWatched,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const cloudData = snap.data() as {
        displayName?: string;
        avatar?: string;
        profileUpdatedAt?: number;
        episodesWatched?: number;
        totalMinutes?: number;
        totalSecondsWatched?: number;
        email?: string;
      };
      const resolved = resolveUserProfileSync({
        localName,
        localAvatar,
        localProfileUpdatedAt: localUpdatedAt,
        cloudName: cloudData.displayName,
        cloudAvatar: cloudData.avatar,
        cloudProfileUpdatedAt: cloudData.profileUpdatedAt,
        fallbackName,
        fallbackAvatar
      });
      const mergedName = resolved.displayName.slice(0, 80) || fallbackName;
      const mergedAvatar = sanitizeAvatarForCloud(resolved.avatar, fallbackAvatar);
      const mergedProfileUpdatedAt = resolved.profileUpdatedAt;

      const mergedEp = Math.max(episodesWatched, Number(cloudData.episodesWatched || 0));
      const cloudSeconds =
        typeof cloudData.totalSecondsWatched === 'number'
          ? Math.max(0, Math.floor(cloudData.totalSecondsWatched))
          : Math.max(0, Math.floor(Number(cloudData.totalMinutes || 0) * 60));
      const mergedSeconds = Math.max(totalSecondsWatched, cloudSeconds);
      const mergedMin = Math.floor(mergedSeconds / 60);

      if (win.UserManager?.saveUser) {
        win.UserManager.saveUser(
          {
            ...localUser,
            username: mergedName,
            avatar: mergedAvatar,
            profileUpdatedAt: mergedProfileUpdatedAt,
            stats: {
              ...(localUser.stats || {}),
              episodesWatched: mergedEp,
              totalMinutes: mergedMin,
              totalSecondsWatched: mergedSeconds
            }
          },
          true
        );
      }

      if (
        mergedName !== cloudData.displayName ||
        mergedAvatar !== cloudData.avatar ||
        mergedProfileUpdatedAt !== Number(cloudData.profileUpdatedAt || 0) ||
        mergedEp !== cloudData.episodesWatched ||
        mergedMin !== cloudData.totalMinutes ||
        mergedSeconds !== cloudData.totalSecondsWatched ||
        email !== cloudData.email
      ) {
        await updateDoc(userRef, {
          displayName: mergedName,
          avatar: mergedAvatar,
          profileUpdatedAt: mergedProfileUpdatedAt,
          email,
          providerId,
          episodesWatched: mergedEp,
          totalMinutes: mergedMin,
          totalSecondsWatched: mergedSeconds,
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

function buildSanitizedFavoritePayload(uid: string, animeId: number, item: Record<string, unknown>) {
  const listStatus = normalizeAnimeListStatus(item.listStatus, 'plan_to_watch');
  const listUpdatedAt = Math.max(0, Math.floor(Number(item.listUpdatedAt || Date.now())));
  const rawTitle = typeof item.title === 'object' && item.title ? (item.title as Record<string, unknown>) : {};
  const rawCover = typeof item.coverImage === 'object' && item.coverImage ? (item.coverImage as Record<string, unknown>) : {};
  const payload: Record<string, unknown> = {
    uid,
    animeId: Math.floor(animeId),
    title: {
      romaji: String(rawTitle.romaji || rawTitle.english || (typeof item.title === 'string' ? item.title : 'Anime')).slice(0, 240),
      english: String(rawTitle.english || rawTitle.romaji || (typeof item.title === 'string' ? item.title : 'Anime')).slice(0, 240)
    },
    coverImage: {
      extraLarge: String(rawCover.extraLarge || rawCover.large || '').slice(0, 600),
      large: String(rawCover.large || rawCover.extraLarge || '').slice(0, 600)
    },
    listStatus,
    listUpdatedAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (typeof item.format === 'string' && item.format) payload.format = item.format.slice(0, 40);
  if (typeof item.status === 'string' && item.status) payload.status = item.status.slice(0, 40);
  if (typeof item.episodes === 'number' && Number.isFinite(item.episodes) && item.episodes >= 0) {
    payload.episodes = Math.floor(item.episodes);
  }
  if (typeof item.idMal === 'number' && Number.isFinite(item.idMal) && item.idMal > 0) {
    payload.idMal = Math.floor(item.idMal);
  }
  if (typeof item.averageScore === 'number' && Number.isFinite(item.averageScore) && item.averageScore > 0) {
    payload.averageScore = Math.min(100, Math.max(0, Math.round(item.averageScore)));
  }
  if (Array.isArray(item.genres)) {
    payload.genres = item.genres.filter((g) => typeof g === 'string' && g.trim()).slice(0, 20);
  }
  const userScore = sanitizeUserScore(item.userScore);
  if (userScore !== null) payload.userScore = userScore;
  const userReview = sanitizeShortText(item.userReview, 280);
  if (userReview) payload.userReview = userReview;
  const userNotes = sanitizeShortText(item.userNotes, 500);
  if (userNotes) payload.userNotes = userNotes;
  if (Number.isFinite(Number(item.scoreUpdatedAt)) && Number(item.scoreUpdatedAt) > 0) {
    payload.scoreUpdatedAt = Math.floor(Number(item.scoreUpdatedAt));
  }
  const customListIds = sanitizeCustomListIds(item.customListIds);
  if (customListIds.length > 0) payload.customListIds = customListIds;
  return payload;
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

    const initialLocalList = win.FavoritesManager?.getAll ? win.FavoritesManager.getAll() : [];
    const localMap = new Map<string, Record<string, unknown>>();
    for (const item of initialLocalList) {
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
      const payload = buildSanitizedFavoritePayload(uid, animeId, item);
      await setDoc(doc(db, 'users', uid, 'favorites', docId), payload);
    }

    const pullToLocal: Array<Record<string, unknown>> = [];
    for (const docId of mergePlan.toKeepLocal) {
      const localItem = localMap.get(docId);
      const cloudItem = cloudMap.get(docId);
      if (!localItem && cloudItem) {
        pullToLocal.push({
          id: Number(cloudItem.animeId),
          title: cloudItem.title,
          coverImage: cloudItem.coverImage,
          format: cloudItem.format || 'TV',
          status: cloudItem.status || 'FINISHED',
          episodes: cloudItem.episodes || null,
          genres: cloudItem.genres || [],
          idMal: cloudItem.idMal || undefined,
          averageScore: cloudItem.averageScore || undefined,
          listStatus: normalizeAnimeListStatus(cloudItem.listStatus, 'plan_to_watch'),
          listUpdatedAt: Math.max(0, Math.floor(Number(cloudItem.listUpdatedAt || 0))),
          userScore: sanitizeUserScore(cloudItem.userScore) ?? undefined,
          userReview: cloudItem.userReview || undefined,
          userNotes: cloudItem.userNotes || undefined,
          scoreUpdatedAt: Number(cloudItem.scoreUpdatedAt || 0) || undefined,
          customListIds: sanitizeCustomListIds(cloudItem.customListIds)
        });
      } else if (localItem && cloudItem) {
        const synced = resolveFavoriteStatusSync({
          localStatus: localItem.listStatus,
          localUpdatedAt: localItem.listUpdatedAt,
          cloudStatus: cloudItem.listStatus,
          cloudUpdatedAt: cloudItem.listUpdatedAt
        });
        const localScoreTs = Math.max(0, Math.floor(Number(localItem.scoreUpdatedAt || 0)));
        const cloudScoreTs = Math.max(0, Math.floor(Number(cloudItem.scoreUpdatedAt || 0)));
        const localLists = sanitizeCustomListIds(localItem.customListIds);
        const cloudLists = sanitizeCustomListIds(cloudItem.customListIds);
        const listsChanged = JSON.stringify(localLists) !== JSON.stringify(cloudLists);

        if (synced.winner === 'local' || cloudScoreTs > localScoreTs) {
          pullToLocal.push({
            ...localItem,
            listStatus: synced.listStatus,
            listUpdatedAt: synced.listUpdatedAt,
            userScore: cloudScoreTs > localScoreTs ? (sanitizeUserScore(cloudItem.userScore) ?? undefined) : localItem.userScore,
            userReview: cloudScoreTs > localScoreTs ? (cloudItem.userReview || undefined) : localItem.userReview,
            userNotes: cloudScoreTs > localScoreTs ? (cloudItem.userNotes || undefined) : localItem.userNotes,
            scoreUpdatedAt: Math.max(localScoreTs, cloudScoreTs) || undefined,
            customListIds: cloudScoreTs > localScoreTs ? cloudLists : localLists
          });
        } else if (synced.winner === 'cloud' || localScoreTs > cloudScoreTs || listsChanged) {
          const favRef = doc(db, 'users', uid, 'favorites', docId);
          const updateFields: Record<string, unknown> = {
            listStatus: synced.listStatus,
            listUpdatedAt: synced.listUpdatedAt,
            customListIds: localLists,
            updatedAt: serverTimestamp()
          };
          if (localScoreTs >= cloudScoreTs) {
            const s = sanitizeUserScore(localItem.userScore);
            if (s !== null) updateFields.userScore = s;
            const r = sanitizeShortText(localItem.userReview, 280);
            if (r) updateFields.userReview = r;
            const n = sanitizeShortText(localItem.userNotes, 500);
            if (n) updateFields.userNotes = n;
            if (localScoreTs > 0) updateFields.scoreUpdatedAt = localScoreTs;
          }
          try {
            await updateDoc(favRef, updateFields);
          } catch {
            const cleanPayload = buildSanitizedFavoritePayload(uid, Number(localItem.id), {
              ...localItem,
              listStatus: synced.listStatus,
              listUpdatedAt: synced.listUpdatedAt
            });
            await setDoc(favRef, cleanPayload);
          }
        }
      }
    }

    if (pullToLocal.length > 0 && win.FavoritesManager?.KEY) {
      const latestLocal = win.FavoritesManager?.getAll ? win.FavoritesManager.getAll() : [];
      const deletedSet = new Set(readIdSet(TOMBSTONE_KEYS.deletedAnimeFavs));
      let changedLocal = false;

      for (const incomingItem of pullToLocal) {
        const docId = sanitizeDocId(incomingItem.id);
        if (deletedSet.has(docId)) continue;
        const existingIdx = latestLocal.findIndex((x) => sanitizeDocId(x.id) === docId);
        if (existingIdx < 0) {
          latestLocal.push(incomingItem);
          changedLocal = true;
        } else {
          const curTs = Math.max(0, Math.floor(Number(latestLocal[existingIdx].listUpdatedAt || 0)));
          const incTs = Math.max(0, Math.floor(Number(incomingItem.listUpdatedAt || 0)));
          const curScoreTs = Math.max(0, Math.floor(Number(latestLocal[existingIdx].scoreUpdatedAt || 0)));
          const incScoreTs = Math.max(0, Math.floor(Number(incomingItem.scoreUpdatedAt || 0)));
          if (incTs > curTs || incScoreTs > curScoreTs) {
            latestLocal[existingIdx] = {
              ...latestLocal[existingIdx],
              listStatus: incTs >= curTs ? incomingItem.listStatus : latestLocal[existingIdx].listStatus,
              listUpdatedAt: Math.max(curTs, incTs),
              userScore: incScoreTs >= curScoreTs ? incomingItem.userScore : latestLocal[existingIdx].userScore,
              userReview: incScoreTs >= curScoreTs ? incomingItem.userReview : latestLocal[existingIdx].userReview,
              userNotes: incScoreTs >= curScoreTs ? incomingItem.userNotes : latestLocal[existingIdx].userNotes,
              scoreUpdatedAt: Math.max(curScoreTs, incScoreTs) || undefined,
              customListIds: incScoreTs >= curScoreTs ? incomingItem.customListIds : latestLocal[existingIdx].customListIds
            };
            changedLocal = true;
          }
        }
      }

      if (changedLocal) {
        safeStorageSetItem(
          win.FavoritesManager.KEY,
          JSON.stringify(compactFavoritesArray(latestLocal))
        );
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function syncAnimeWatchedBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/anime_watched`;
  try {
    const colRef = collection(db, 'users', uid, 'anime_watched');
    const snap = await getDocs(colRef);
    const cloudMap = new Map<string, Record<string, unknown>>();
    snap.forEach((d) => {
      const data = d.data();
      if (data.seasonId) {
        cloudMap.set(String(data.seasonId), data);
      }
    });

    const localMap = win.AnimeWatchedManager?.getAll ? { ...win.AnimeWatchedManager.getAll() } : {};
    const localTsMap = win.AnimeWatchedManager?.getTimestamps ? { ...win.AnimeWatchedManager.getTimestamps() } : {};
    const allSeasonKeys = new Set<string>([
      ...Object.keys(localMap).map((k) => sanitizeDocId(k)),
      ...Array.from(cloudMap.keys())
    ]);

    let localChanged = false;
    for (const seasonKey of allSeasonKeys) {
      if (!seasonKey) continue;
      const localRaw = localMap[seasonKey] || [];
      const cloudItem = cloudMap.get(seasonKey);
      const cloudRaw = Array.isArray(cloudItem?.watchedEpisodes)
        ? (cloudItem!.watchedEpisodes as number[])
        : [];
      const localTs = Math.max(0, Math.floor(Number(localTsMap[seasonKey] || 0)));
      const cloudTs = Math.max(0, Math.floor(Number(cloudItem?.updatedAtMs || 0)));

      const resolved = resolveAnimeWatchedMerge({
        localEpisodes: localRaw,
        cloudEpisodes: cloudRaw,
        localUpdatedAt: localTs,
        cloudUpdatedAt: cloudTs,
        explicitLocalWrite: localTs > 0
      });

      const localNorm = Array.from(new Set(localRaw.map(Number).filter((n) => Number.isFinite(n) && n >= 1))).sort((a, b) => a - b);
      const cloudNorm = Array.from(new Set(cloudRaw.map(Number).filter((n) => Number.isFinite(n) && n >= 1))).sort((a, b) => a - b);

      if (JSON.stringify(resolved) !== JSON.stringify(localNorm)) {
        localMap[seasonKey] = resolved;
        localTsMap[seasonKey] = Math.max(localTs, cloudTs, Date.now());
        localChanged = true;
      }

      const targetMs = Math.max(localTs, cloudTs, resolved.length > 0 ? Date.now() : 0);
      if (!cloudItem && resolved.length > 0) {
        await setDoc(doc(db, 'users', uid, 'anime_watched', seasonKey), {
          uid,
          seasonId: seasonKey,
          watchedEpisodes: resolved,
          updatedAtMs: targetMs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else if (cloudItem && (JSON.stringify(resolved) !== JSON.stringify(cloudNorm) || localTs > cloudTs)) {
        await updateDoc(doc(db, 'users', uid, 'anime_watched', seasonKey), {
          watchedEpisodes: resolved,
          updatedAtMs: targetMs,
          updatedAt: serverTimestamp()
        });
      }
    }

    if (localChanged && win.AnimeWatchedManager?.KEY) {
      localStorage.setItem(win.AnimeWatchedManager.KEY, JSON.stringify(localMap));
      if (win.AnimeWatchedManager.TS_KEY) {
        localStorage.setItem(win.AnimeWatchedManager.TS_KEY, JSON.stringify(localTsMap));
      }
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
      const userScore = sanitizeUserScore(item.userScore);
      if (userScore !== null) payload.userScore = userScore;
      const userReview = sanitizeShortText(item.userReview, 280);
      if (userReview) payload.userReview = userReview;
      const userNotes = sanitizeShortText(item.userNotes, 500);
      if (userNotes) payload.userNotes = userNotes;
      if (Number.isFinite(Number(item.scoreUpdatedAt)) && Number(item.scoreUpdatedAt) > 0) {
        payload.scoreUpdatedAt = Math.floor(Number(item.scoreUpdatedAt));
      }
      const customListIds = sanitizeCustomListIds(item.customListIds);
      if (customListIds.length > 0) payload.customListIds = customListIds;
      await setDoc(doc(db, 'users', uid, 'manga_favorites', docId), payload);
    }

    let changedLocal = false;
    for (const docId of mergePlan.toKeepLocal) {
      const localItem = localMap.get(docId);
      const cloudItem = cloudMap.get(docId);
      if (!localItem && cloudItem) {
        localList.push({
          id: Number(docId) || docId,
          title: cloudItem.title,
          cover: cloudItem.cover,
          banner: cloudItem.cover,
          flag: cloudItem.flag || '🇯🇵 Manga',
          origLang: cloudItem.origLang || 'jp',
          score: cloudItem.score || '8.6',
          status: cloudItem.status || 'En Emisión',
          year: cloudItem.year || '2024',
          userScore: sanitizeUserScore(cloudItem.userScore) ?? undefined,
          userReview: cloudItem.userReview || undefined,
          userNotes: cloudItem.userNotes || undefined,
          scoreUpdatedAt: Number(cloudItem.scoreUpdatedAt || 0) || undefined,
          customListIds: sanitizeCustomListIds(cloudItem.customListIds)
        });
        changedLocal = true;
      } else if (localItem && cloudItem) {
        const localScoreTs = Math.max(0, Math.floor(Number(localItem.scoreUpdatedAt || 0)));
        const cloudScoreTs = Math.max(0, Math.floor(Number(cloudItem.scoreUpdatedAt || 0)));
        if (cloudScoreTs > localScoreTs) {
          localItem.userScore = sanitizeUserScore(cloudItem.userScore) ?? undefined;
          localItem.userReview = cloudItem.userReview || undefined;
          localItem.userNotes = cloudItem.userNotes || undefined;
          localItem.scoreUpdatedAt = cloudScoreTs;
          localItem.customListIds = sanitizeCustomListIds(cloudItem.customListIds);
          changedLocal = true;
        } else if (localScoreTs > cloudScoreTs) {
          const updateFields: Record<string, unknown> = {
            scoreUpdatedAt: localScoreTs,
            customListIds: sanitizeCustomListIds(localItem.customListIds),
            updatedAt: serverTimestamp()
          };
          const s = sanitizeUserScore(localItem.userScore);
          if (s !== null) updateFields.userScore = s;
          const r = sanitizeShortText(localItem.userReview, 280);
          if (r) updateFields.userReview = r;
          const n = sanitizeShortText(localItem.userNotes, 500);
          if (n) updateFields.userNotes = n;
          await updateDoc(doc(db, 'users', uid, 'manga_favorites', docId), updateFields).catch(() => {});
        }
      }
    }

    if (changedLocal && win.MangaFavoritesManager?.KEY) {
      safeStorageSetItem(
        win.MangaFavoritesManager.KEY,
        JSON.stringify(localList.map((m) => compactMangaEntry(m) || m))
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function syncCustomListsBidirectional(uid: string): Promise<void> {
  const path = `users/${uid}/custom_lists`;
  try {
    const colRef = collection(db, 'users', uid, 'custom_lists');
    const snap = await getDocs(colRef);
    const cloudMap = new Map<string, Record<string, unknown>>();
    snap.forEach((d) => {
      const data = d.data();
      if (data.listId) cloudMap.set(sanitizeDocId(data.listId), data);
    });

    const localLists = win.CustomListsManager?.getAll ? win.CustomListsManager.getAll() : [];
    const localMap = new Map<string, Record<string, unknown>>();
    for (const l of localLists) {
      if (l?.id) localMap.set(sanitizeDocId(l.id), l);
    }

    const mergePlan = resolveFavoritesMerge({
      localIds: Array.from(localMap.keys()),
      cloudIds: Array.from(cloudMap.keys()),
      deletedIds: readIdSet(TOMBSTONE_KEYS.deletedCustomLists)
    });

    for (const listId of mergePlan.toDeleteCloud) {
      await deleteDoc(doc(db, 'users', uid, 'custom_lists', listId));
      removeIdTombstone(TOMBSTONE_KEYS.deletedCustomLists, listId);
    }

    for (const listId of mergePlan.toUpload) {
      const l = localMap.get(listId);
      if (!l) continue;
      await setDoc(doc(db, 'users', uid, 'custom_lists', listId), {
        uid,
        listId,
        name: sanitizeShortText(l.name, 48) || 'Lista',
        color: String(l.color || '#ff1a40').slice(0, 24),
        icon: String(l.icon || '📁').slice(0, 16),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    let changedLocal = false;
    for (const listId of mergePlan.toKeepLocal) {
      if (!localMap.has(listId)) {
        const cloud = cloudMap.get(listId);
        if (!cloud) continue;
        localLists.push({
          id: listId,
          name: String(cloud.name || 'Lista'),
          color: String(cloud.color || '#ff1a40'),
          icon: String(cloud.icon || '📁'),
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        changedLocal = true;
      }
    }

    if (changedLocal && win.CustomListsManager?.KEY) {
      safeStorageSetItem(win.CustomListsManager.KEY, JSON.stringify(localLists.slice(0, 40)));
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
      safeStorageSetItem(
        win.HistoryManager.KEY,
        JSON.stringify(compactHistoryArray(localList.slice(0, 20)))
      );
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
    const localPrefs = win.AppPreferencesManager?.get ? win.AppPreferencesManager.get() : {};

    const readerBg = String(localReader.bg || '#000000').slice(0, 32);
    const readerWidth = String(localReader.width || '100%').slice(0, 32);
    const readerMode = String(localReader.mode || 'webtoon').slice(0, 32);
    const readerBrightness = Math.min(130, Math.max(45, Math.round(Number(localReader.brightness ?? 100))));
    const readerContrast = Math.min(140, Math.max(60, Math.round(Number(localReader.contrast ?? 100))));
    const readerSepia = Math.min(70, Math.max(0, Math.round(Number(localReader.sepia ?? 0))));
    const readerContinuous = Boolean(localReader.continuousChapter);
    const autoSkipIntro = Boolean(localPrefs.autoSkipIntro);
    const autoSkipOutro = Boolean(localPrefs.autoSkipOutro);
    const autoScrobble = localPrefs.autoScrobble !== false;
    const pushEnabled = Boolean(localPrefs.pushEnabled);
    const weeklySummaryPush = localPrefs.weeklySummaryPush !== false;
    const showAdultContent = Boolean(localPrefs.showAdultContent);

    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        scheduleReminders: localReminders.slice(0, 500),
        readerBg,
        readerWidth,
        readerMode,
        readerBrightness,
        readerContrast,
        readerSepia,
        readerContinuous,
        autoSkipIntro,
        autoSkipOutro,
        autoScrobble,
        pushEnabled,
        weeklySummaryPush,
        showAdultContent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const cloudData = snap.data() as Record<string, any>;
      const cloudReminders = Array.isArray(cloudData.scheduleReminders) ? cloudData.scheduleReminders : [];
      const mergedReminders = Array.from(new Set([...localReminders, ...cloudReminders])).slice(0, 500);
      if (mergedReminders.length > localReminders.length && win.ScheduleReminderManager?.KEY) {
        localStorage.setItem(win.ScheduleReminderManager.KEY, JSON.stringify(mergedReminders));
      }

      const cloudReader: ReaderSettingsShape = {
        bg: cloudData.readerBg || readerBg,
        width: cloudData.readerWidth || readerWidth,
        mode: cloudData.readerMode || readerMode,
        brightness: typeof cloudData.readerBrightness === 'number' ? cloudData.readerBrightness : readerBrightness,
        contrast: typeof cloudData.readerContrast === 'number' ? cloudData.readerContrast : readerContrast,
        sepia: typeof cloudData.readerSepia === 'number' ? cloudData.readerSepia : readerSepia,
        continuousChapter: typeof cloudData.readerContinuous === 'boolean' ? cloudData.readerContinuous : readerContinuous
      };
      if (win.applyReaderSettingsFromCloud) {
        win.applyReaderSettingsFromCloud(cloudReader);
      }

      if (win.AppPreferencesManager?.save) {
        win.AppPreferencesManager.save(
          {
            autoSkipIntro: typeof cloudData.autoSkipIntro === 'boolean' ? cloudData.autoSkipIntro : autoSkipIntro,
            autoSkipOutro: typeof cloudData.autoSkipOutro === 'boolean' ? cloudData.autoSkipOutro : autoSkipOutro,
            autoScrobble: typeof cloudData.autoScrobble === 'boolean' ? cloudData.autoScrobble : autoScrobble,
            pushEnabled: typeof cloudData.pushEnabled === 'boolean' ? cloudData.pushEnabled : pushEnabled,
            weeklySummaryPush: typeof cloudData.weeklySummaryPush === 'boolean' ? cloudData.weeklySummaryPush : weeklySummaryPush,
            showAdultContent: typeof cloudData.showAdultContent === 'boolean' ? cloudData.showAdultContent : showAdultContent
          },
          true
        );
      }

      const needsCloudUpdate =
        mergedReminders.length > cloudReminders.length ||
        cloudData.readerBg !== readerBg ||
        cloudData.readerWidth !== readerWidth ||
        cloudData.readerMode !== readerMode ||
        cloudData.readerBrightness !== readerBrightness ||
        cloudData.readerContrast !== readerContrast ||
        cloudData.readerSepia !== readerSepia ||
        cloudData.readerContinuous !== readerContinuous ||
        cloudData.autoSkipIntro !== autoSkipIntro ||
        cloudData.autoSkipOutro !== autoSkipOutro ||
        cloudData.autoScrobble !== autoScrobble ||
        cloudData.pushEnabled !== pushEnabled ||
        cloudData.weeklySummaryPush !== weeklySummaryPush ||
        Boolean(cloudData.showAdultContent) !== showAdultContent;

      if (needsCloudUpdate) {
        await updateDoc(ref, {
          scheduleReminders: mergedReminders,
          readerBg,
          readerWidth,
          readerMode,
          readerBrightness,
          readerContrast,
          readerSepia,
          readerContinuous,
          autoSkipIntro,
          autoSkipOutro,
          autoScrobble,
          pushEnabled,
          weeklySummaryPush,
          showAdultContent,
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
  if (!user) return;
  if (syncInProgress) {
    pendingCloudSync = true;
    return;
  }
  syncInProgress = true;
  pendingCloudSync = false;

  const badge = document.getElementById('sync-status-badge');
  const text = document.getElementById('sync-status-text');
  if (badge) badge.className = 'sync-pill syncing';
  if (text) text.textContent = 'Sincronizando...';

  try {
    await ensureUserProfileInFirestore(user);
    await Promise.all([
      syncFavoritesBidirectional(user.uid),
      syncAnimeWatchedBidirectional(user.uid),
      syncMangaFavoritesBidirectional(user.uid),
      syncCustomListsBidirectional(user.uid),
      syncHistoryBidirectional(user.uid),
      syncMangaProgressBidirectional(user.uid),
      syncSettingsBidirectional(user.uid)
    ]);
    win.UserManager?.syncWatchedStatsFromLedger?.(true);

    lastSyncTimestamp = Date.now();
    localStorage.setItem('nyanime_last_cloud_sync', String(lastSyncTimestamp));

    win.renderContinuarViendo?.();
    win.renderContinuarLeyendoManga?.();
    win.renderFavoritos?.();
    win.updateFavoriteButton?.();
    win.renderEmisionDiasChips?.();
    win.UserManager?.renderProfile();
  } catch (err) {
    console.warn('Cloud sync warning:', err);
  } finally {
    syncInProgress = false;
    win.UserManager?.renderProfile();
    if (pendingCloudSync) {
      pendingCloudSync = false;
      void runFullCloudSync();
    }
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
    const avatar = sanitizeAvatarForCloud(
      localProfile.avatar || user.photoURL,
      DEFAULT_AVATAR_URL
    );
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

  async updateAuthProfile(displayName: string, photoURL: string, profileUpdatedAt?: number) {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const authPhoto = sanitizeAvatarForAuthPhotoUrl(photoURL);
      await updateProfile(user, {
        displayName: displayName.slice(0, 80),
        ...(authPhoto ? { photoURL: authPhoto } : {})
      });
      if (win.UserManager?.getUser && win.UserManager?.saveUser) {
        const cur = win.UserManager.getUser();
        win.UserManager.saveUser(
          {
            ...cur,
            username: displayName.slice(0, 80),
            avatar: sanitizeAvatarForCloud(photoURL, DEFAULT_AVATAR_URL),
            profileUpdatedAt: Math.max(Number(profileUpdatedAt || 0), Number(cur.profileUpdatedAt || 0), Date.now())
          },
          true
        );
      }
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
        readerBrightness: Math.min(130, Math.max(45, Math.round(Number(settings.brightness ?? 100)))),
        readerContrast: Math.min(140, Math.max(60, Math.round(Number(settings.contrast ?? 100)))),
        readerSepia: Math.min(70, Math.max(0, Math.round(Number(settings.sepia ?? 0)))),
        readerContinuous: Boolean(settings.continuousChapter),
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

  async saveCustomList(listObj: { id: string; name: string; color: string; icon: string }) {
    const user = auth.currentUser;
    if (!user) return;
    const listId = sanitizeDocId(listObj.id).slice(0, 64);
    removeIdTombstone(TOMBSTONE_KEYS.deletedCustomLists, listId);
    const path = `users/${user.uid}/custom_lists/${listId}`;
    try {
      const ref = doc(db, 'users', user.uid, 'custom_lists', listId);
      const snap = await getDoc(ref);
      const name = sanitizeShortText(listObj.name, 48) || 'Lista';
      const color = String(listObj.color || '#ff1a40').slice(0, 24);
      const icon = String(listObj.icon || '📁').slice(0, 16);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          listId,
          name,
          color,
          icon,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(ref, { name, color, icon, updatedAt: serverTimestamp() });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async deleteCustomList(listIdRaw: string) {
    const listId = sanitizeDocId(listIdRaw).slice(0, 64);
    addIdTombstone(TOMBSTONE_KEYS.deletedCustomLists, listId);
    const user = auth.currentUser;
    if (!user) return;
    const path = `users/${user.uid}/custom_lists/${listId}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'custom_lists', listId));
      removeIdTombstone(TOMBSTONE_KEYS.deletedCustomLists, listId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
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

  async updateCloudAnimeWatchedOverwrite(
    seasonId: number | string,
    watchedEpisodes: number[]
  ) {
    const docId = sanitizeDocId(seasonId);
    const now = Date.now();
    const cleanEps = Array.from(
      new Set((watchedEpisodes || []).map(Number).filter((n) => Number.isFinite(n) && n >= 1).map(Math.floor))
    )
      .sort((a, b) => a - b)
      .slice(0, 5000);

    const user = auth.currentUser;
    if (!user) return;
    const path = `users/${user.uid}/anime_watched/${docId}`;
    try {
      const ref = doc(db, 'users', user.uid, 'anime_watched', docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          watchedEpisodes: cleanEps,
          updatedAtMs: now,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(ref, {
          uid: user.uid,
          seasonId: docId,
          watchedEpisodes: cleanEps,
          updatedAtMs: now,
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
    const customLists = win.CustomListsManager?.getAll ? win.CustomListsManager.getAll() : [];
    const history = win.HistoryManager?.getAll ? win.HistoryManager.getAll() : [];
    const mangaHistory = win.MangaHistoryManager?.getAll ? win.MangaHistoryManager.getAll() : [];
    const animeWatched = win.AnimeWatchedManager?.getAll ? win.AnimeWatchedManager.getAll() : {};
    const scheduleReminders = win.ScheduleReminderManager?.getAll ? win.ScheduleReminderManager.getAll() : [];
    return {
      schemaVersion: '2.5.0',
      exportedAt: new Date().toISOString(),
      app: 'NyAnime TV',
      firebaseUid: auth.currentUser?.uid || null,
      data: {
        favorites,
        mangaFavorites,
        customLists,
        history,
        mangaHistory,
        animeWatched,
        scheduleReminders,
        readerSettings: win.getReaderSettings ? win.getReaderSettings() : {},
        appPreferences: win.AppPreferencesManager?.get ? win.AppPreferencesManager.get() : {},
        userProfile: win.UserManager?.getUser ? win.UserManager.getUser() : {}
      }
    };
  },

  async importBackupJSON(json: Record<string, unknown>) {
    const data = (json.data || json) as Record<string, unknown>;
    if (Array.isArray(data.favorites) && win.FavoritesManager?.KEY) {
      safeStorageSetItem(
        win.FavoritesManager.KEY,
        JSON.stringify(compactFavoritesArray(data.favorites))
      );
    }
    if (Array.isArray(data.mangaFavorites) && win.MangaFavoritesManager?.KEY) {
      safeStorageSetItem(win.MangaFavoritesManager.KEY, JSON.stringify(data.mangaFavorites));
    }
    if (Array.isArray(data.customLists) && win.CustomListsManager?.KEY) {
      safeStorageSetItem(win.CustomListsManager.KEY, JSON.stringify(data.customLists));
    }
    if (Array.isArray(data.history) && win.HistoryManager?.KEY) {
      safeStorageSetItem(
        win.HistoryManager.KEY,
        JSON.stringify(compactHistoryArray(data.history))
      );
    }
    if (Array.isArray(data.mangaHistory) && win.MangaHistoryManager?.KEY) {
      safeStorageSetItem(win.MangaHistoryManager.KEY, JSON.stringify(data.mangaHistory));
    }
    if (data.animeWatched && typeof data.animeWatched === 'object' && win.AnimeWatchedManager?.KEY) {
      safeStorageSetItem(win.AnimeWatchedManager.KEY, JSON.stringify(data.animeWatched));
    }
    if (Array.isArray(data.scheduleReminders) && win.ScheduleReminderManager?.KEY) {
      safeStorageSetItem(win.ScheduleReminderManager.KEY, JSON.stringify(data.scheduleReminders));
    }
    if (data.readerSettings && win.applyReaderSettingsFromCloud) {
      win.applyReaderSettingsFromCloud(data.readerSettings as ReaderSettingsShape);
    }
    if (data.appPreferences && win.AppPreferencesManager?.save) {
      win.AppPreferencesManager.save(data.appPreferences as Record<string, unknown>, true);
    }
    if (data.userProfile && win.UserManager?.saveUser) {
      win.UserManager.saveUser(data.userProfile as Record<string, unknown>);
    }
    win.UserManager?.syncWatchedStatsFromLedger?.(true);
    if (auth.currentUser) {
      await runFullCloudSync();
    }
  },

  async wipeAllUserData(): Promise<{ wipedCloud: boolean; deletedDocs: number }> {
    const user = auth.currentUser;
    if (!user) {
      return { wipedCloud: false, deletedDocs: 0 };
    }
    const subcollections = [
      'favorites',
      'anime_watched',
      'manga_favorites',
      'history',
      'manga_progress',
      'settings',
      'custom_lists',
      'push_subscriptions',
      'suggestions'
    ];
    let deletedDocs = 0;
    for (const subName of subcollections) {
      try {
        const snap = await getDocs(collection(db, 'users', user.uid, subName));
        if (!snap.empty) {
          await Promise.all(
            snap.docs.map(async (d) => {
              await deleteDoc(d.ref);
              deletedDocs += 1;
            })
          );
        }
      } catch (error) {
        console.warn(`Error wiping cloud subcollection ${subName}:`, error);
      }
    }
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      deletedDocs += 1;
    } catch (error) {
      console.warn('Error deleting root user document during wipe:', error);
    }
    lastSyncTimestamp = 0;
    try {
      localStorage.removeItem('nyanime_last_cloud_sync');
    } catch {
      // ignore
    }
    return { wipedCloud: true, deletedDocs };
  }
};

export interface WatchRoomParticipantRecord {
  uid: string;
  displayName: string;
  avatar: string;
  lastSeenMs: number;
}

export interface WatchRoomMessageRecord {
  id: string;
  uid: string;
  displayName: string;
  avatar: string;
  text: string;
  createdAt: Timestamp | null;
}

export interface WatchRoomJoinCredentials {
  passcode?: string;
  inviteKey?: string;
  rememberedPasscode?: string;
  rememberedInviteToken?: string;
}

const WT_GUEST_UID_KEY = 'nyanime_wt_guest_uid';

function resolveActiveWatchIdentity() {
  let storedGuestUid: string | null = null;
  try {
    storedGuestUid = localStorage.getItem(WT_GUEST_UID_KEY);
  } catch {
    storedGuestUid = null;
  }
  const localProfile = win.UserManager?.getUser ? win.UserManager.getUser() : null;
  const identity = getOrCreateWatchClientIdentity(auth.currentUser, localProfile, storedGuestUid);
  if (identity.isGuest) {
    try {
      localStorage.setItem(WT_GUEST_UID_KEY, identity.uid);
    } catch {
      // ignore storage quota
    }
  }
  return {
    ...identity,
    avatar: sanitizeAvatarForCloud(identity.avatar, DEFAULT_AVATAR_URL)
  };
}

export const FirebaseWatchTogetherBridge = {
  isAuthenticated() {
    return Boolean(auth.currentUser);
  },

  getCurrentUid(): string {
    return resolveActiveWatchIdentity().uid;
  },

  async createRoom(input: {
    animeId: number;
    seasonId?: number;
    animeTitle: string;
    seasonNum: number;
    episodeNum: number;
    playbackTime: number;
    playbackState: 'playing' | 'paused';
    passcode?: string;
  }): Promise<{ roomId: string; passcode: string; inviteToken: string }> {
    const identity = resolveActiveWatchIdentity();
    const roomId = generateRoomCode();
    const hostName = (identity.displayName || 'Anfitrión').trim().slice(0, 80) || 'Anfitrión';
    const now = Date.now();
    const roomPath = `watch_rooms/${roomId}`;

    const customPass = normalizeRoomSecret(input.passcode || '');
    const effectivePasscode = customPass.length >= 3 ? customPass : generateRoomPasscode();
    const inviteToken = generateInviteToken();
    const passcodeHash = hashRoomSecret(roomId, effectivePasscode);
    const inviteTokenHash = hashRoomSecret(roomId, inviteToken);

    try {
      const isPlaying = input.playbackState === 'playing';
      const anchorTime = Math.max(0, Number(input.playbackTime || 0));
      const payload: Record<string, unknown> = {
        roomId,
        hostUid: identity.uid,
        hostName,
        animeId: Math.max(0, Math.floor(Number(input.animeId || 0))),
        animeTitle: String(input.animeTitle || 'Anime').slice(0, 240),
        seasonNum: Math.max(1, Math.floor(Number(input.seasonNum || 1))),
        episodeNum: Math.max(1, Math.floor(Number(input.episodeNum || 1))),
        playbackState: isPlaying ? 'playing' : 'paused',
        playbackTime: anchorTime,
        isPlaying,
        anchorTime,
        updatedAtMs: now,
        updatedByUid: identity.uid,
        updatedByName: hostName,
        status: 'active',
        hasPasscode: true,
        passcodeHash,
        inviteTokenHash,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (typeof input.seasonId === 'number' && Number.isFinite(input.seasonId) && input.seasonId >= 0) {
        payload.seasonId = Math.floor(input.seasonId);
      }
      await setDoc(doc(db, 'watch_rooms', roomId), payload);

      await setDoc(doc(db, 'watch_rooms', roomId, 'participants', identity.uid), {
        uid: identity.uid,
        roomId,
        displayName: hostName,
        avatar: identity.avatar,
        lastSeenMs: now,
        accessHash: inviteTokenHash,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { roomId, passcode: effectivePasscode, inviteToken };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, roomPath);
    }
  },

  async previewRoom(
    roomIdRaw: string,
    credentials?: WatchRoomJoinCredentials
  ): Promise<{
    room: WatchRoomState;
    access: ReturnType<typeof verifyRoomAccess>;
  }> {
    const identity = resolveActiveWatchIdentity();
    const roomId = normalizeRoomCode(roomIdRaw);
    const roomPath = `watch_rooms/${roomId}`;
    try {
      const snap = await getDoc(doc(db, 'watch_rooms', roomId));
      if (!snap.exists()) {
        throw new Error(`La sala ${roomId} no existe o ya fue eliminada.`);
      }
      const data = snap.data() as WatchRoomState;
      if (data.status !== 'active') {
        throw new Error(`La sala ${roomId} ya terminó.`);
      }
      const access = verifyRoomAccess({
        room: data,
        currentUid: identity.uid,
        providedPasscode: credentials?.passcode,
        providedInviteKey: credentials?.inviteKey,
        rememberedPasscode: credentials?.rememberedPasscode,
        rememberedInviteToken: credentials?.rememberedInviteToken
      });
      return { room: data, access };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('no existe') || error.message.includes('terminó'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, roomPath);
    }
  },

  async joinRoom(roomIdRaw: string, credentials?: WatchRoomJoinCredentials): Promise<WatchRoomState> {
    const identity = resolveActiveWatchIdentity();
    const roomId = normalizeRoomCode(roomIdRaw);
    const roomPath = `watch_rooms/${roomId}`;
    try {
      const snap = await getDoc(doc(db, 'watch_rooms', roomId));
      if (!snap.exists()) {
        throw new Error(`La sala ${roomId} no existe o ya fue eliminada.`);
      }
      const data = snap.data() as WatchRoomState;
      if (data.status !== 'active') {
        throw new Error(`La sala ${roomId} ya terminó.`);
      }

      const access = verifyRoomAccess({
        room: data,
        currentUid: identity.uid,
        providedPasscode: credentials?.passcode,
        providedInviteKey: credentials?.inviteKey,
        rememberedPasscode: credentials?.rememberedPasscode,
        rememberedInviteToken: credentials?.rememberedInviteToken
      });

      if (!access.allowed) {
        const err = new Error(
          access.reason === 'wrong_credentials'
            ? 'Contraseña o enlace de invitación incorrecto.'
            : 'Esta sala requiere contraseña o enlace de invitación.'
        ) as Error & { code?: string };
        err.code = access.reason === 'wrong_credentials' ? 'WRONG_CREDENTIALS' : 'AUTH_REQUIRED';
        throw err;
      }

      const displayName = (identity.displayName || 'Invitado').trim().slice(0, 80) || 'Invitado';
      const verifiedAccessHash = access.matchedHash || data.inviteTokenHash || data.passcodeHash || '';
      await setDoc(doc(db, 'watch_rooms', roomId, 'participants', identity.uid), {
        uid: identity.uid,
        roomId,
        displayName,
        avatar: identity.avatar,
        lastSeenMs: Date.now(),
        accessHash: verifiedAccessHash,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return data;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('no existe') ||
          error.message.includes('terminó') ||
          error.message.includes('contraseña') ||
          error.message.includes('Contraseña'))
      ) {
        throw error;
      }
      handleFirestoreError(error, OperationType.GET, roomPath);
    }
  },

  async updatePlayback(
    roomIdRaw: string,
    patch: {
      animeId?: number;
      seasonId?: number;
      animeTitle?: string;
      seasonNum?: number;
      episodeNum?: number;
      playbackState: 'playing' | 'paused';
      playbackTime: number;
    }
  ): Promise<void> {
    const identity = resolveActiveWatchIdentity();
    const roomId = normalizeRoomCode(roomIdRaw);
    if (!roomId) return;
    const path = `watch_rooms/${roomId}`;
    const actorName = (identity.displayName || 'Usuario').trim().slice(0, 80) || 'Usuario';
    try {
      const isPlaying = patch.playbackState === 'playing';
      const anchorTime = Math.max(0, Math.min(86400, Number(patch.playbackTime || 0)));
      const fields: Record<string, unknown> = {
        playbackState: isPlaying ? 'playing' : 'paused',
        playbackTime: anchorTime,
        isPlaying,
        anchorTime,
        updatedAtMs: Date.now(),
        updatedByUid: identity.uid,
        updatedByName: actorName,
        updatedAt: serverTimestamp()
      };
      if (typeof patch.animeId === 'number' && Number.isFinite(patch.animeId) && patch.animeId >= 0) {
        fields.animeId = Math.floor(patch.animeId);
      }
      if (typeof patch.seasonId === 'number' && Number.isFinite(patch.seasonId) && patch.seasonId >= 0) {
        fields.seasonId = Math.floor(patch.seasonId);
      }
      if (typeof patch.animeTitle === 'string' && patch.animeTitle) {
        fields.animeTitle = patch.animeTitle.slice(0, 240);
      }
      if (typeof patch.seasonNum === 'number' && Number.isFinite(patch.seasonNum)) {
        fields.seasonNum = Math.max(1, Math.floor(patch.seasonNum));
      }
      if (typeof patch.episodeNum === 'number' && Number.isFinite(patch.episodeNum)) {
        fields.episodeNum = Math.max(1, Math.floor(patch.episodeNum));
      }
      await updateDoc(doc(db, 'watch_rooms', roomId), fields);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  },

  async sendChatMessage(roomIdRaw: string, rawText: string): Promise<void> {
    const identity = resolveActiveWatchIdentity();
    const roomId = normalizeRoomCode(roomIdRaw);
    const cleanText = sanitizeWatchChatText(rawText);
    if (!cleanText || !roomId) return;
    const displayName = (identity.displayName || 'Usuario').trim().slice(0, 80) || 'Usuario';
    const msgId = sanitizeDocId(`m_${identity.uid.slice(0, 14)}_${Date.now()}`);
    const path = `watch_rooms/${roomId}/messages/${msgId}`;
    try {
      await setDoc(doc(db, 'watch_rooms', roomId, 'messages', msgId), {
        uid: identity.uid,
        roomId,
        displayName,
        avatar: identity.avatar,
        text: cleanText,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  },

  async leaveRoom(roomIdRaw: string, closeIfHost = false): Promise<void> {
    if (!roomIdRaw) return;
    const identity = resolveActiveWatchIdentity();
    const roomId = normalizeRoomCode(roomIdRaw);
    try {
      await deleteDoc(doc(db, 'watch_rooms', roomId, 'participants', identity.uid)).catch(() => {});
      if (closeIfHost) {
        const snap = await getDoc(doc(db, 'watch_rooms', roomId)).catch(() => null);
        if (snap?.exists() && snap.data()?.hostUid === identity.uid) {
          await updateDoc(doc(db, 'watch_rooms', roomId), {
            status: 'closed',
            updatedByUid: identity.uid,
            updatedAt: serverTimestamp()
          }).catch(() => {});
        }
      }
    } catch {
      // Best-effort cleanup
    }
  },

  async deleteRoom(roomIdRaw: string): Promise<void> {
    const roomId = normalizeRoomCode(roomIdRaw);
    if (!roomId) return;
    const identity = resolveActiveWatchIdentity();
    const roomRef = doc(db, 'watch_rooms', roomId);
    const snap = await getDoc(roomRef).catch(() => null);
    if (snap?.exists()) {
      const data = snap.data() as WatchRoomState;
      if (data.hostUid && data.hostUid !== identity.uid && auth.currentUser?.uid !== data.hostUid) {
        throw new Error('Solo el anfitrión que creó la sala puede eliminarla.');
      }
    }

    // Delete subcollection documents first while parent room still exists for rules `get()` check
    try {
      const partsSnap = await getDocs(query(collection(db, 'watch_rooms', roomId, 'participants'), limit(50)));
      await Promise.all(partsSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    } catch {
      // ignore partial cleanup
    }
    try {
      const msgsSnap = await getDocs(query(collection(db, 'watch_rooms', roomId, 'messages'), limit(100)));
      await Promise.all(msgsSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    } catch {
      // ignore partial cleanup
    }

    try {
      await deleteDoc(roomRef);
    } catch {
      // Fallback: mark closed if delete is rejected (e.g. guest-created room)
      await updateDoc(roomRef, {
        status: 'closed',
        updatedByUid: identity.uid,
        updatedAt: serverTimestamp()
      }).catch(() => {});
    }
  },

  subscribeActiveRooms(onRooms: (rooms: WatchRoomState[]) => void): () => void {
    let snapUnsub: Unsubscribe | null = null;
    const bindForUser = (uid: string | null) => {
      if (snapUnsub) {
        try { snapUnsub(); } catch { /* ignore */ }
        snapUnsub = null;
      }
      if (!uid) {
        onRooms([]);
        return;
      }
      const q = query(
        collection(db, 'watch_rooms'),
        where('hostUid', '==', uid),
        limit(12)
      );
      snapUnsub = onSnapshot(
        q,
        (snap) => {
          const now = Date.now();
          const active: WatchRoomState[] = [];
          snap.forEach((d) => {
            const data = d.data() as WatchRoomState;
            if (
              data &&
              data.status === 'active' &&
              data.roomId &&
              now - Number(data.updatedAtMs || 0) < 3 * 3600 * 1000
            ) {
              active.push(data);
            }
          });
          active.sort((a, b) => Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
          onRooms(active.slice(0, 8));
        },
        () => {
          onRooms([]);
        }
      );
    };

    bindForUser(auth.currentUser?.uid || null);
    const authUnsub = onAuthStateChanged(auth, (user) => {
      bindForUser(user?.uid || null);
    });

    return () => {
      try { authUnsub(); } catch { /* ignore */ }
      if (snapUnsub) {
        try { snapUnsub(); } catch { /* ignore */ }
        snapUnsub = null;
      }
    };
  },

  subscribeRoom(
    roomIdRaw: string,
    handlers: {
      onRoom: (room: WatchRoomState | null) => void;
      onParticipants: (items: WatchRoomParticipantRecord[]) => void;
      onMessages: (items: WatchRoomMessageRecord[]) => void;
      onError?: (err: Error) => void;
    }
  ): () => void {
    const roomId = normalizeRoomCode(roomIdRaw);
    const unsubs: Unsubscribe[] = [];

    const roomPath = `watch_rooms/${roomId}`;
    unsubs.push(
      onSnapshot(
        doc(db, 'watch_rooms', roomId),
        (snap) => {
          handlers.onRoom(snap.exists() ? (snap.data() as WatchRoomState) : null);
        },
        (error) => {
          if (handlers.onError) handlers.onError(error);
          else handleFirestoreError(error, OperationType.GET, roomPath);
        }
      )
    );

    const partPath = `watch_rooms/${roomId}/participants`;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'watch_rooms', roomId, 'participants'), limit(50)),
        (snap) => {
          const list: WatchRoomParticipantRecord[] = [];
          snap.forEach((d) => {
            const p = d.data();
            list.push({
              uid: String(p.uid || d.id),
              displayName: String(p.displayName || 'Usuario'),
              avatar: String(p.avatar || DEFAULT_AVATAR_URL),
              lastSeenMs: Number(p.lastSeenMs || 0)
            });
          });
          handlers.onParticipants(list);
        },
        (error) => {
          if (handlers.onError) handlers.onError(error);
          else handleFirestoreError(error, OperationType.LIST, partPath);
        }
      )
    );

    const msgPath = `watch_rooms/${roomId}/messages`;
    unsubs.push(
      onSnapshot(
        query(collection(db, 'watch_rooms', roomId, 'messages'), orderBy('createdAt', 'asc'), limit(60)),
        (snap) => {
          const msgs: WatchRoomMessageRecord[] = [];
          snap.forEach((d) => {
            const m = d.data();
            msgs.push({
              id: d.id,
              uid: String(m.uid || ''),
              displayName: String(m.displayName || 'Usuario'),
              avatar: String(m.avatar || DEFAULT_AVATAR_URL),
              text: String(m.text || ''),
              createdAt: (m.createdAt as Timestamp) || null
            });
          });
          handlers.onMessages(msgs);
        },
        (error) => {
          if (handlers.onError) handlers.onError(error);
          else handleFirestoreError(error, OperationType.LIST, msgPath);
        }
      )
    );

    return () => {
      unsubs.forEach((u) => {
        try { u(); } catch { /* ignore */ }
      });
    };
  }
};

const FCM_TOKEN_KEY = 'nyanime_fcm_token_v1';
let messagingInstance: Messaging | null = null;
let foregroundUnsub: (() => void) | null = null;

async function getMessagingSafe(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  try {
    const supported = await isMessagingSupported();
    if (!supported) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch {
    return null;
  }
}

async function getFcmServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope'
    });
  } catch {
    return null;
  }
}

export const FirebaseMessagingBridge = {
  async isSupported(): Promise<boolean> {
    try {
      return await isMessagingSupported();
    } catch {
      return false;
    }
  },

  getCachedToken(): string | null {
    try {
      return localStorage.getItem(FCM_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async syncSubscriptionToCloud(input: {
    endpoint?: string;
    fcmToken?: string;
    provider: 'fcm' | 'webpush';
  }): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    const rawKey = input.fcmToken || input.endpoint || '';
    if (!rawKey) return;
    const subId = sanitizeDocId(`${input.provider}_${rawKey.slice(-36)}`);
    const path = `users/${user.uid}/push_subscriptions/${subId}`;
    const endpoint = String(
      input.endpoint || (input.fcmToken ? `https://fcm.googleapis.com/fcm/send/${input.fcmToken.slice(0, 64)}` : '')
    ).slice(0, 600);
    if (endpoint.length < 8) return;

    const deviceLabel =
      typeof navigator !== 'undefined' ? String(navigator.platform || 'Web').slice(0, 80) : 'Web';

    try {
      const ref = doc(db, 'users', user.uid, 'push_subscriptions', subId);
      const existing = await getDoc(ref).catch(() => null);
      const payload: Record<string, unknown> = {
        uid: user.uid,
        subId,
        endpoint,
        provider: input.provider,
        deviceLabel,
        enabled: true,
        updatedAt: serverTimestamp()
      };
      if (input.fcmToken) {
        payload.fcmToken = String(input.fcmToken).slice(0, 512);
      }
      if (existing?.exists()) {
        await updateDoc(ref, {
          endpoint: payload.endpoint,
          provider: payload.provider,
          deviceLabel: payload.deviceLabel,
          enabled: true,
          ...(input.fcmToken ? { fcmToken: payload.fcmToken } : {}),
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.warn(`No se pudo sincronizar suscripción Push en ${path}:`, error);
    }
  },

  async removeCloudSubscriptions(): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'push_subscriptions'));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    } catch {
      // Ignore partial error
    }
  },

  async requestToken(): Promise<{ ok: boolean; token?: string; reason?: string }> {
    const messaging = await getMessagingSafe();
    if (!messaging) {
      return { ok: false, reason: 'Firebase Cloud Messaging no soportado en este navegador.' };
    }
    const swReg = await getFcmServiceWorkerRegistration();
    if (!swReg) {
      return { ok: false, reason: 'Service Worker de FCM no disponible.' };
    }

    const vapidKey = String((import.meta as any)?.env?.VITE_FIREBASE_VAPID_KEY || '').trim();
    try {
      const token = await getToken(
        messaging,
        vapidKey
          ? { vapidKey, serviceWorkerRegistration: swReg }
          : { serviceWorkerRegistration: swReg }
      );
      if (!token) {
        return { ok: false, reason: 'No se recibió token FCM del navegador.' };
      }
      try {
        localStorage.setItem(FCM_TOKEN_KEY, token);
      } catch {
        // ignore quota
      }
      await FirebaseMessagingBridge.syncSubscriptionToCloud({
        fcmToken: token,
        provider: 'fcm'
      });
      return { ok: true, token };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'No se pudo obtener token FCM.'
      };
    }
  },

  async revokeToken(): Promise<boolean> {
    try {
      localStorage.removeItem(FCM_TOKEN_KEY);
    } catch {
      // ignore
    }
    await FirebaseMessagingBridge.removeCloudSubscriptions();
    try {
      const messaging = await getMessagingSafe();
      if (messaging) {
        await deleteToken(messaging);
      }
      return true;
    } catch {
      return false;
    }
  },

  async listenForeground(
    onNotify: (data: ReturnType<typeof normalizeFcmAiringPayload>) => void
  ): Promise<() => void> {
    if (foregroundUnsub) return foregroundUnsub;
    const messaging = await getMessagingSafe();
    if (!messaging) return () => {};
    foregroundUnsub = onMessage(messaging, (payload) => {
      const normalized = normalizeFcmAiringPayload(payload);
      onNotify(normalized);
    });
    return foregroundUnsub;
  }
};

// Keep foreground FCM listener active for in-app airing episode alerts
void FirebaseMessagingBridge.listenForeground((notif) => {
  win.showToast?.(`🔔 ${notif.title}: ${notif.body}`);
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(notif.title, {
        body: notif.body,
        icon: '/pwa-192x192.png',
        tag: notif.tag
      });
    } catch {
      // Ignore browser Notification restrictions
    }
  }
});

// Expose bridges globally for /index.html UI handlers
win.FirebaseAuth = FirebaseAuthBridge;
win.firebaseSync = FirebaseSyncBridge;
win.FirebaseMessaging = FirebaseMessagingBridge;
win.NyAnime = win.NyAnime || {};
win.NyAnime.Core = {
  ...(win.NyAnime.Core || {}),
  firebaseAuthManager: FirebaseAuthBridge,
  commentsBridge: FirebaseCommentsBridge,
  watchTogetherBridge: FirebaseWatchTogetherBridge,
  fcmBridge: FirebaseMessagingBridge,
  syncAll: () => FirebaseSyncBridge.syncAll(),
  wipeAllUserData: () => FirebaseSyncBridge.wipeAllUserData(),
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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type http from 'node:http';
import type webpushTypes from 'web-push';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof webpushTypes;
import {
  buildAniListScrobblePayload,
  buildMalScrobbleFormBody
} from '../utils/scrobble.ts';
import type { AnimeListStatus } from '../utils/profileStats.ts';
import { validateIncomingRequestOrigin } from '../utils/proxySecurity.ts';

interface PendingOAuthState {
  provider: 'anilist' | 'mal';
  codeVerifier?: string;
  createdAt: number;
}

interface StoredPushSub {
  id: string;
  uid: string;
  provider?: 'fcm' | 'webpush';
  fcmToken?: string;
  subscription?: webpushTypes.PushSubscription;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_FALLBACK_APP_URL = 'https://ais-dev-usvjjbywgs5hnzhdpdfuqw-282466238391.us-west2.run.app';
const pendingOAuthStates = new Map<string, PendingOAuthState>();
const VAPID_FILE = path.resolve(process.cwd(), '.nyanime-vapid.json');
const SUBS_FILE = path.resolve(process.cwd(), '.nyanime-push-subs.json');

let cachedVapid: { publicKey: string; privateKey: string; subject: string } | null = null;
let cachedSubs: Map<string, StoredPushSub> | null = null;

function getAppBaseUrl(): string {
  const raw = String(process.env.APP_URL || DEFAULT_FALLBACK_APP_URL).trim();
  return raw.replace(/\/+$/, '');
}

function getOAuthRedirectUri(provider: 'anilist' | 'mal'): string {
  return `${getAppBaseUrl()}/api/auth/${provider}/callback`;
}

function pruneExpiredOAuthStates(): void {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, val] of pendingOAuthStates.entries()) {
    if (val.createdAt < cutoff) pendingOAuthStates.delete(key);
  }
}

function getVapidKeys(): { publicKey: string; privateKey: string; subject: string } {
  if (cachedVapid) return cachedVapid;

  const envPub = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const envPriv = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:soporte@nyanime.app').trim();

  if (envPub && envPriv) {
    cachedVapid = { publicKey: envPub, privateKey: envPriv, subject };
    webpush.setVapidDetails(subject, envPub, envPriv);
    return cachedVapid;
  }

  try {
    if (fs.existsSync(VAPID_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
      if (parsed?.publicKey && parsed?.privateKey) {
        cachedVapid = {
          publicKey: String(parsed.publicKey),
          privateKey: String(parsed.privateKey),
          subject
        };
        webpush.setVapidDetails(subject, cachedVapid.publicKey, cachedVapid.privateKey);
        return cachedVapid;
      }
    }
  } catch {
    // Regenerate below if unreadable
  }

  const generated = webpush.generateVAPIDKeys();
  cachedVapid = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject
  };
  try {
    fs.writeFileSync(VAPID_FILE, JSON.stringify({ publicKey: generated.publicKey, privateKey: generated.privateKey }, null, 2), 'utf8');
  } catch {
    // Ignore read-only filesystem edge cases
  }
  webpush.setVapidDetails(subject, cachedVapid.publicKey, cachedVapid.privateKey);
  return cachedVapid;
}

function loadPushSubs(): Map<string, StoredPushSub> {
  if (cachedSubs) return cachedSubs;
  cachedSubs = new Map<string, StoredPushSub>();
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const list = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.id && (item?.subscription?.endpoint || item?.fcmToken)) {
            cachedSubs.set(String(item.id), item as StoredPushSub);
          }
        }
      }
    }
  } catch {
    // Ignore parse error
  }
  return cachedSubs;
}

function persistPushSubs(): void {
  if (!cachedSubs) return;
  try {
    const arr = Array.from(cachedSubs.values()).slice(-200);
    fs.writeFileSync(SUBS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch {
    // Ignore disk write failure
  }
}

function hashEndpoint(endpoint: string): string {
  return crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function escapeJsJson(val: unknown): string {
  return JSON.stringify(val)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function sendOAuthPopupResult(
  res: http.ServerResponse,
  payload: Record<string, unknown>,
  status = 200
): void {
  const safeJson = escapeJsJson(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>NyAnime OAuth</title></head>
<body style="background:#050507;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center;">
  <div>
    <h2 style="margin:0 0 8px;">${payload.type === 'OAUTH_AUTH_SUCCESS' ? 'Conectado con éxito ✓' : 'Error de autenticación'}</h2>
    <p style="color:#94a3b8;font-size:14px;">Esta ventana se cerrará automáticamente.</p>
  </div>
  <script>
    (function() {
      var data = ${safeJson};
      try {
        if (window.opener && typeof window.opener.postMessage === 'function') {
          window.opener.postMessage(data, '*');
        }
      } catch (e) {}
      setTimeout(function() {
        try { window.close(); } catch (e) {}
      }, 250);
    })();
  </script>
</body>
</html>`);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > 512_000) {
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, any>;
}

function applyApiCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const check = validateIncomingRequestOrigin(req.headers || {});
  res.setHeader('Vary', 'Origin');
  if (!check.allowed) {
    sendJson(res, 403, { error: check.reason });
    return false;
  }
  if (check.corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', check.corsOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return true;
}

export interface PushDispatchResult {
  sent: number;
  failed: number;
  purged: number;
  purgedIds: string[];
  channel: 'webpush' | 'none';
  fcmLegacyDeprecated: boolean;
  warnings: string[];
}

export interface PushDispatchDeps {
  subsMap?: Map<string, StoredPushSub>;
  sendWebPush?: (
    subscription: webpushTypes.PushSubscription,
    payload: string,
    options: { TTL: number }
  ) => Promise<unknown>;
  persist?: () => void;
  fcmServerKey?: string;
}

const FCM_LEGACY_DEPRECATION_NOTE =
  'FIREBASE_FCM_SERVER_KEY usa la API legacy de FCM (fcm.googleapis.com/fcm/send), descontinuada por Google. Se prioriza Web Push VAPID como canal confiable; para envío nativo por FCM se requiere migrar a FCM HTTP v1 con una cuenta de servicio de Google (OAuth2).';

let loggedLegacyFcmNotice = false;

function resolvePushTargets(
  subsMap: Map<string, StoredPushSub>,
  endpoint: string,
  fcmToken: string
): StoredPushSub[] {
  if (!endpoint && !fcmToken) {
    return Array.from(subsMap.values());
  }
  const seen = new Map<string, StoredPushSub>();
  if (endpoint) {
    const byEndpoint = subsMap.get(hashEndpoint(endpoint));
    if (byEndpoint) seen.set(byEndpoint.id, byEndpoint);
  }
  if (fcmToken) {
    const byFcmId = subsMap.get(`fcm_${hashEndpoint(fcmToken)}`);
    if (byFcmId) seen.set(byFcmId.id, byFcmId);
    for (const sub of subsMap.values()) {
      if (sub.fcmToken === fcmToken) {
        seen.set(sub.id, sub);
      }
    }
  }
  return Array.from(seen.values());
}

export async function dispatchWebPush(
  targetSubs: StoredPushSub[],
  payloadObj: { title: string; body: string; tag?: string; url?: string; icon?: string },
  deps: PushDispatchDeps = {}
): Promise<PushDispatchResult> {
  if (!deps.sendWebPush) {
    getVapidKeys();
  }
  const payloadStr = JSON.stringify({
    title: payloadObj.title,
    body: payloadObj.body,
    tag: payloadObj.tag || 'nyanime-push',
    url: payloadObj.url || '/',
    icon: payloadObj.icon || '/pwa-192x192.png'
  });

  const fcmServerKey = String(deps.fcmServerKey ?? process.env.FIREBASE_FCM_SERVER_KEY ?? '').trim();
  const fcmLegacyDeprecated = Boolean(fcmServerKey);
  const subsMap = deps.subsMap ?? loadPushSubs();
  const sendNotification =
    deps.sendWebPush ??
    ((sub: webpushTypes.PushSubscription, data: string, opts: { TTL: number }) =>
      webpush.sendNotification(sub, data, opts));
  const persistFn = deps.persist ?? persistPushSubs;

  const warnings: string[] = [];
  if (fcmLegacyDeprecated) {
    warnings.push(FCM_LEGACY_DEPRECATION_NOTE);
    if (!loggedLegacyFcmNotice) {
      loggedLegacyFcmNotice = true;
      console.warn(`[NyAnime Push] ${FCM_LEGACY_DEPRECATION_NOTE}`);
    }
  }

  let sent = 0;
  let failed = 0;
  const purgedIds: string[] = [];

  await Promise.all(
    targetSubs.map(async (entry) => {
      // 1. Primary reliable channel: Web Push VAPID
      if (entry.subscription?.endpoint) {
        try {
          await sendNotification(entry.subscription, payloadStr, { TTL: 3600 });
          sent += 1;
          return;
        } catch (err: any) {
          const statusCode = Number(err?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            if (subsMap.delete(entry.id)) {
              purgedIds.push(entry.id);
            }
            console.warn(
              `[NyAnime Push] Suscripción Web Push expirada (${statusCode}) eliminada automáticamente: ${entry.id}`
            );
            failed += 1;
            return;
          }
          const reason = err instanceof Error ? err.message : String(err || 'unknown error');
          console.error(`[NyAnime Push] Error enviando Web Push (${statusCode || 'network'}) a ${entry.id}: ${reason}`);
          warnings.push(`Error Web Push (${statusCode || 'red'}): ${reason}`);
          failed += 1;
          return;
        }
      }

      // 2. Entry has only a legacy fcmToken without a Web Push VAPID subscription.
      // Never fail silently or call the shut-down legacy fcm.googleapis.com/fcm/send endpoint.
      failed += 1;
      const msg = fcmLegacyDeprecated
        ? `Suscripción ${entry.id} solo tiene token FCM y FIREBASE_FCM_SERVER_KEY apunta a la API legacy descontinuada. Re-suscribe con Web Push VAPID o configura cuenta de servicio FCM HTTP v1.`
        : `Suscripción ${entry.id} solo tiene token FCM sin suscripción Web Push VAPID ni cuenta de servicio FCM HTTP v1 configurada.`;
      console.warn(`[NyAnime Push] ${msg}`);
      warnings.push(msg);
    })
  );

  if (purgedIds.length > 0) {
    persistFn();
  }

  return {
    sent,
    failed,
    purged: purgedIds.length,
    purgedIds,
    channel: sent > 0 ? 'webpush' : 'none',
    fcmLegacyDeprecated,
    warnings
  };
}

export async function handleFeatureApiRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  urlObj: URL
): Promise<boolean> {
  const pathname = urlObj.pathname;
  if (!pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/push/')) {
    return false;
  }

  // OAuth callbacks are browser navigations from external providers, so don't apply same-origin header blocks to them.
  const isOAuthCallback =
    pathname === '/api/auth/anilist/callback' ||
    pathname === '/api/auth/anilist/callback/' ||
    pathname === '/api/auth/mal/callback' ||
    pathname === '/api/auth/mal/callback/';

  if (!isOAuthCallback) {
    if (!applyApiCors(req, res)) return true;
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return true;
    }
  }

  try {
    if (pathname === '/api/auth/providers/status' && req.method === 'GET') {
      sendJson(res, 200, {
        appUrl: getAppBaseUrl(),
        anilist: {
          configured: Boolean(process.env.ANILIST_CLIENT_ID && process.env.ANILIST_CLIENT_SECRET),
          callbackUrl: getOAuthRedirectUri('anilist')
        },
        mal: {
          configured: Boolean(process.env.MAL_CLIENT_ID && process.env.MAL_CLIENT_SECRET),
          callbackUrl: getOAuthRedirectUri('mal')
        }
      });
      return true;
    }

    if (pathname === '/api/auth/anilist/url' && req.method === 'GET') {
      const clientId = String(process.env.ANILIST_CLIENT_ID || '').trim();
      const clientSecret = String(process.env.ANILIST_CLIENT_SECRET || '').trim();
      if (!clientId || !clientSecret) {
        sendJson(res, 503, {
          error: 'ANILIST_CLIENT_ID / ANILIST_CLIENT_SECRET no configurados en el servidor.',
          callbackUrl: getOAuthRedirectUri('anilist')
        });
        return true;
      }
      pruneExpiredOAuthStates();
      const state = crypto.randomBytes(24).toString('base64url');
      pendingOAuthStates.set(state, { provider: 'anilist', createdAt: Date.now() });

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: getOAuthRedirectUri('anilist'),
        response_type: 'code'
      });
      // AniList también acepta state para validación CSRF
      params.set('state', state);
      sendJson(res, 200, {
        url: `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`,
        callbackUrl: getOAuthRedirectUri('anilist')
      });
      return true;
    }

    if ((pathname === '/api/auth/anilist/callback' || pathname === '/api/auth/anilist/callback/') && req.method === 'GET') {
      const code = urlObj.searchParams.get('code') || '';
      const errorDesc = urlObj.searchParams.get('error_description') || urlObj.searchParams.get('error');
      const state = urlObj.searchParams.get('state') || '';

      if (errorDesc) {
        sendOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'anilist', error: errorDesc }, 400);
        return true;
      }
      if (!code) {
        sendOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'anilist', error: 'Código OAuth faltante.' }, 400);
        return true;
      }
      if (state) {
        const stored = pendingOAuthStates.get(state);
        if (!stored || stored.provider !== 'anilist') {
          sendOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'anilist', error: 'Estado OAuth inválido o expirado.' }, 400);
          return true;
        }
        pendingOAuthStates.delete(state);
      }

      const clientId = String(process.env.ANILIST_CLIENT_ID || '').trim();
      const clientSecret = String(process.env.ANILIST_CLIENT_SECRET || '').trim();
      const tokenResp = await fetch('https://anilist.co/api/v2/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: getOAuthRedirectUri('anilist'),
          code
        })
      });
      const tokenData = (await tokenResp.json()) as Record<string, any>;
      if (!tokenResp.ok || !tokenData.access_token) {
        sendOAuthPopupResult(
          res,
          { type: 'OAUTH_AUTH_ERROR', provider: 'anilist', error: tokenData.message || 'No se pudo obtener token de AniList.' },
          400
        );
        return true;
      }

      let username = 'Usuario AniList';
      let userId: number | string = '';
      try {
        const viewerResp = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenData.access_token}`
          },
          body: JSON.stringify({ query: 'query { Viewer { id name } }' })
        });
        const viewerJson = (await viewerResp.json()) as any;
        if (viewerJson?.data?.Viewer) {
          username = String(viewerJson.data.Viewer.name || username);
          userId = viewerJson.data.Viewer.id ?? '';
        }
      } catch {
        // Non-fatal
      }

      const expiresIn = Number(tokenData.expires_in || 31536000);
      sendOAuthPopupResult(res, {
        type: 'OAUTH_AUTH_SUCCESS',
        provider: 'anilist',
        accessToken: tokenData.access_token,
        expiresAtMs: Date.now() + expiresIn * 1000,
        username,
        userId
      });
      return true;
    }

    if (pathname === '/api/auth/anilist/scrobble' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const authHeader = String(req.headers['authorization'] || '');
      const accessToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : String(body.accessToken || '').trim();
      const mediaId = Math.floor(Number(body.mediaId || 0));
      if (!accessToken || !mediaId) {
        sendJson(res, 400, { error: 'Faltan accessToken o mediaId.' });
        return true;
      }

      const payload = buildAniListScrobblePayload({
        mediaId,
        status: (body.status || 'watching') as AnimeListStatus,
        progress: Number(body.progress || 0),
        score: body.score
      });

      const gqlResp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });
      const gqlData = await gqlResp.json();
      sendJson(res, gqlResp.status, gqlData);
      return true;
    }

    if (pathname === '/api/auth/mal/url' && req.method === 'GET') {
      const clientId = String(process.env.MAL_CLIENT_ID || '').trim();
      const clientSecret = String(process.env.MAL_CLIENT_SECRET || '').trim();
      if (!clientId || !clientSecret) {
        sendJson(res, 503, {
          error: 'MAL_CLIENT_ID / MAL_CLIENT_SECRET no configurados en el servidor.',
          callbackUrl: getOAuthRedirectUri('mal')
        });
        return true;
      }
      pruneExpiredOAuthStates();
      const state = crypto.randomBytes(24).toString('base64url');
      // MAL API v2 requires 43..128 character plain PKCE code_verifier
      const codeVerifier = crypto.randomBytes(48).toString('base64url');
      pendingOAuthStates.set(state, {
        provider: 'mal',
        codeVerifier,
        createdAt: Date.now()
      });

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: getOAuthRedirectUri('mal'),
        state,
        code_challenge: codeVerifier,
        code_challenge_method: 'plain'
      });

      sendJson(res, 200, {
        url: `https://myanimelist.net/v1/oauth2/authorize?${params.toString()}`,
        callbackUrl: getOAuthRedirectUri('mal')
      });
      return true;
    }

    if ((pathname === '/api/auth/mal/callback' || pathname === '/api/auth/mal/callback/') && req.method === 'GET') {
      const code = urlObj.searchParams.get('code') || '';
      const state = urlObj.searchParams.get('state') || '';
      const errorDesc = urlObj.searchParams.get('error_description') || urlObj.searchParams.get('error');

      if (errorDesc) {
        sendOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'mal', error: errorDesc }, 400);
        return true;
      }
      const stored = pendingOAuthStates.get(state);
      if (!code || !stored || stored.provider !== 'mal' || !stored.codeVerifier) {
        sendOAuthPopupResult(res, { type: 'OAUTH_AUTH_ERROR', provider: 'mal', error: 'Sesión PKCE de MAL inválida o expirada.' }, 400);
        return true;
      }
      pendingOAuthStates.delete(state);

      const clientId = String(process.env.MAL_CLIENT_ID || '').trim();
      const clientSecret = String(process.env.MAL_CLIENT_SECRET || '').trim();
      const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: stored.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: getOAuthRedirectUri('mal')
      });

      const tokenResp = await fetch('https://myanimelist.net/v1/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const tokenData = (await tokenResp.json()) as Record<string, any>;
      if (!tokenResp.ok || !tokenData.access_token) {
        sendOAuthPopupResult(
          res,
          { type: 'OAUTH_AUTH_ERROR', provider: 'mal', error: tokenData.message || 'Error al intercambiar código con MAL.' },
          400
        );
        return true;
      }

      let username = 'Usuario MAL';
      let userId: number | string = '';
      try {
        const meResp = await fetch('https://api.myanimelist.net/v2/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const meJson = (await meResp.json()) as Record<string, any>;
        if (meJson?.name) {
          username = String(meJson.name);
          userId = meJson.id ?? '';
        }
      } catch {
        // Non-fatal
      }

      const expiresIn = Number(tokenData.expires_in || 2592000);
      sendOAuthPopupResult(res, {
        type: 'OAUTH_AUTH_SUCCESS',
        provider: 'mal',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || '',
        expiresAtMs: Date.now() + expiresIn * 1000,
        username,
        userId
      });
      return true;
    }

    if (pathname === '/api/auth/mal/refresh' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const refreshToken = String(body.refreshToken || '').trim();
      const clientId = String(process.env.MAL_CLIENT_ID || '').trim();
      const clientSecret = String(process.env.MAL_CLIENT_SECRET || '').trim();
      if (!refreshToken || !clientId || !clientSecret) {
        sendJson(res, 400, { error: 'Faltan refreshToken o credenciales MAL.' });
        return true;
      }

      const form = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });
      const tokenResp = await fetch('https://myanimelist.net/v1/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      const tokenData = await tokenResp.json();
      sendJson(res, tokenResp.status, tokenData);
      return true;
    }

    if (pathname === '/api/auth/mal/scrobble' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const authHeader = String(req.headers['authorization'] || '');
      const accessToken = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : String(body.accessToken || '').trim();
      const malId = Math.floor(Number(body.malId || 0));
      if (!accessToken || !malId) {
        sendJson(res, 400, { error: 'Faltan accessToken o malId.' });
        return true;
      }

      const form = buildMalScrobbleFormBody({
        status: (body.status || 'watching') as AnimeListStatus,
        progress: Number(body.progress || 0),
        score: body.score
      });

      const malResp = await fetch(`https://api.myanimelist.net/v2/anime/${malId}/my_list_status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${accessToken}`
        },
        body: form.toString()
      });
      const malData = await malResp.json();
      sendJson(res, malResp.status, malData);
      return true;
    }

    // WEB PUSH ROUTES
    if (pathname === '/api/push/vapid-public-key' && req.method === 'GET') {
      const keys = getVapidKeys();
      sendJson(res, 200, { publicKey: keys.publicKey });
      return true;
    }

    if (pathname === '/api/push/subscribe' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const sub = body.subscription as webpushTypes.PushSubscription | undefined;
      const fcmToken = String(body.fcmToken || '').trim().slice(0, 512);
      const hasValidWebPush = Boolean(sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://'));
      if (!hasValidWebPush && !fcmToken) {
        sendJson(res, 400, { error: 'Suscripción Web Push o token FCM inválido.' });
        return true;
      }
      const subsMap = loadPushSubs();
      const id = hasValidWebPush ? hashEndpoint(sub!.endpoint) : `fcm_${hashEndpoint(fcmToken)}`;
      const existing = subsMap.get(id);
      const now = Date.now();
      const primaryProvider: 'webpush' | 'fcm' = hasValidWebPush ? 'webpush' : 'fcm';
      subsMap.set(id, {
        id,
        uid: String(body.uid || 'local').slice(0, 128),
        provider: primaryProvider,
        ...(fcmToken ? { fcmToken } : {}),
        ...(hasValidWebPush ? { subscription: sub } : {}),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      });
      persistPushSubs();
      sendJson(res, 200, {
        ok: true,
        id,
        count: subsMap.size,
        provider: primaryProvider,
        fcmHttpV1RequiredForFcmOnly: !hasValidWebPush
      });
      return true;
    }

    if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const endpoint = String(body.endpoint || '').trim();
      const fcmToken = String(body.fcmToken || '').trim();
      if (!endpoint && !fcmToken) {
        sendJson(res, 400, { error: 'Endpoint o fcmToken requerido.' });
        return true;
      }
      const subsMap = loadPushSubs();
      const removedIds: string[] = [];
      if (endpoint) {
        const id = hashEndpoint(endpoint);
        if (subsMap.delete(id)) removedIds.push(id);
      }
      if (fcmToken) {
        const fcmId = `fcm_${hashEndpoint(fcmToken)}`;
        if (subsMap.delete(fcmId)) removedIds.push(fcmId);
        for (const [k, v] of subsMap.entries()) {
          if (v.fcmToken === fcmToken) {
            subsMap.delete(k);
            removedIds.push(k);
          }
        }
      }
      persistPushSubs();
      sendJson(res, 200, { ok: true, removedIds });
      return true;
    }

    if (pathname === '/api/push/test' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const endpoint = String(body.endpoint || '').trim();
      const fcmToken = String(body.fcmToken || '').trim();
      const subsMap = loadPushSubs();
      const targets = resolvePushTargets(subsMap, endpoint, fcmToken);

      if (targets.length === 0) {
        sendJson(res, 404, { error: 'No hay suscripciones Push activas en el servidor.' });
        return true;
      }
      const result = await dispatchWebPush(targets, {
        title: 'NyAnime TV · Push Activo',
        body: 'Recibirás alertas cuando salga un nuevo episodio de tus animes en Viendo.',
        tag: 'nyanime-test-push',
        url: '/?tab=schedule'
      });
      sendJson(res, result.sent > 0 ? 200 : 502, result);
      return true;
    }

    if (pathname === '/api/push/check-airing' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const endpoint = String(body.endpoint || '').trim();
      const fcmToken = String(body.fcmToken || '').trim();
      const subsMap = loadPushSubs();
      const targets = resolvePushTargets(subsMap, endpoint, fcmToken);

      if (targets.length === 0 || items.length === 0) {
        sendJson(res, 200, { sent: 0, failed: 0, purged: 0, purgedIds: [], channel: 'none', fcmLegacyDeprecated: false, warnings: [] });
        return true;
      }

      const first = items[0] as { title?: string; episode?: number; body?: string; animeId?: number };
      const title = items.length === 1
        ? `¡Nuevo Ep! ${String(first.title || 'Anime')} (${Number(first.episode || 1)})`
        : `${items.length} nuevos episodios disponibles en NyAnime`;
      const msg = items.length === 1
        ? String(first.body || `Episodio ${Number(first.episode || 1)} disponible ahora.`)
        : items.slice(0, 3).map((x: any) => `${x.title} Ep.${x.episode}`).join(' · ');

      const result = await dispatchWebPush(targets, {
        title,
        body: msg,
        tag: items.length === 1 ? `nyanime-airing-${first.animeId}-${first.episode}` : 'nyanime-airing-batch',
        url: '/?tab=schedule'
      });
      sendJson(res, 200, result);
      return true;
    }

    if (pathname === '/api/push/send-weekly-summary' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const headline = String(body.headline || 'Tu resumen semanal de anime y manga ya está disponible en NyAnime.');
      const endpoint = String(body.endpoint || '').trim();
      const fcmToken = String(body.fcmToken || '').trim();
      const subsMap = loadPushSubs();
      const targets = resolvePushTargets(subsMap, endpoint, fcmToken);

      if (targets.length === 0) {
        sendJson(res, 404, { error: 'Activa primero las notificaciones Push para enviar el resumen.' });
        return true;
      }

      const result = await dispatchWebPush(targets, {
        title: 'Tu Resumen Semanal · NyAnime TV',
        body: headline,
        tag: 'nyanime-weekly-digest',
        url: '/?tab=profile'
      });
      sendJson(res, result.sent > 0 ? 200 : 502, result);
      return true;
    }

    sendJson(res, 404, { error: 'Feature endpoint not found' });
    return true;
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
}

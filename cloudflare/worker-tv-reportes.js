const DEFAULT_ALLOWED_ORIGINS = [
  "https://mikiflores711.github.io",
  "https://novaplus.website",
  "https://www.novaplus.website"
];

const REPORT_STATUSES = new Set([
  "Pendiente",
  "En revisión",
  "Reparado",
  "Descartado"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return corsResponse(request, env, null, 204);
    }

    try {
      if (url.pathname === "/api/canela/epg" && request.method === "GET") {
        return await proxyCanelaEpg(request, env);
      }

      await ensureSchema(env.DB);

      if (url.pathname === "/" || url.pathname === "/api/health") {
        return json(request, env, {
          ok: true,
          service: "Watch TV Plus Cloudflare API",
          version: "7.0"
        });
      }

      if (url.pathname === "/api/report" && request.method === "POST") {
        return json(request, env, await createReport(request, env));
      }

      if (url.pathname === "/api/statuses" && request.method === "GET") {
        return json(request, env, await publicStatuses(env.DB));
      }

      if (url.pathname === "/api/login" && request.method === "POST") {
        return json(request, env, await login(request, env));
      }

      if (url.pathname === "/api/logout" && request.method === "POST") {
        const session = await requireSession(request, env);
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
          .bind(session.tokenHash)
          .run();
        return json(request, env, { ok: true });
      }

      if (url.pathname === "/api/dashboard" && request.method === "GET") {
        await requireSession(request, env);
        return json(request, env, await dashboard(env.DB));
      }

      if (url.pathname === "/api/channels/sync" && request.method === "POST") {
        return json(request, env, await syncMonitoredChannels(request, env));
      }

      if (url.pathname === "/api/monitor/run" && request.method === "POST") {
        const session = await requireSession(request, env);
        return json(request, env, await runAutomaticMonitor(env, session.username));
      }

      if (url.pathname === "/api/monitor/status" && request.method === "GET") {
        await requireSession(request, env);
        return json(request, env, await monitorStatus(env.DB));
      }

      const reportMatch = url.pathname.match(/^\/api\/reports\/(\d+)$/);
      if (reportMatch && request.method === "PATCH") {
        const session = await requireSession(request, env);
        return json(
          request,
          env,
          await updateReport(request, env.DB, Number(reportMatch[1]), session.username)
        );
      }

      if (reportMatch && request.method === "DELETE") {
        const session = await requireSession(request, env);
        return json(
          request,
          env,
          await deleteReport(env.DB, Number(reportMatch[1]), session.username)
        );
      }

      return json(request, env, { ok: false, error: "Ruta no encontrada." }, 404);
    } catch (error) {
      console.error(error);
      const status = error.status || 500;
      return json(
        request,
        env,
        {
          ok: false,
          error: status === 500
            ? "Error interno del servidor."
            : String(error.message || error)
        },
        status
      );
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runAutomaticMonitor(env));
  }
};


async function proxyCanelaEpg(request, env) {
  checkPublicOrigin(request, env);
  const incoming = new URL(request.url);
  const now = new Date();
  const start = validIso(incoming.searchParams.get("start")) || new Date(now.setMinutes(0, 0, 0)).toISOString();
  const end = validIso(incoming.searchParams.get("end")) || new Date(new Date(start).getTime() + 18 * 60 * 60 * 1000).toISOString();
  const upstream = new URL("https://catalog-service-cdn.cms.api.canela.tv/content/epg");
  const allowed = { start, end, reg:"mx", acl:"en", dt:"web", ipr:"true", client:"canela-canela-web", pf:"main", locale:"es-419" };
  Object.entries(allowed).forEach(([key,value]) => upstream.searchParams.set(key,value));
  const cache = caches.default;
  const cacheKey = new Request(upstream.toString(), { method:"GET" });
  let response = await cache.match(cacheKey);
  if (!response) {
    const upstreamResponse = await fetch(upstream, { headers:{ Accept:"application/json", "User-Agent":"NOVAPlus-EPG/7.0" }, cf:{ cacheTtl:300, cacheEverything:true } });
    if (!upstreamResponse.ok) return json(request, env, { ok:false, error:`Canela EPG respondió ${upstreamResponse.status}` }, 502);
    response = new Response(upstreamResponse.body, { status:200, headers:{ "Content-Type":"application/json; charset=utf-8", "Cache-Control":"public, max-age=120, s-maxage=300" } });
    await cache.put(cacheKey, response.clone());
  }
  return corsResponse(request, env, response.body, 200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=120, s-maxage=300"
  });
}
function validIso(value){ if(!value) return ""; const d=new Date(value); return Number.isNaN(d.getTime())?"":d.toISOString(); }

async function ensureSchema(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_key TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        channel_number TEXT DEFAULT '',
        section TEXT DEFAULT '',
        category TEXT DEFAULT '',
        logo TEXT DEFAULT '',
        channel_id TEXT DEFAULT '',
        stream TEXT DEFAULT '',
        reason TEXT NOT NULL,
        details TEXT DEFAULT '',
        contact TEXT DEFAULT '',
        page_url TEXT DEFAULT '',
        user_agent TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Pendiente',
        report_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_open_channel
      ON reports(channel_key)
      WHERE status IN ('Pendiente','En revisión')
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_reports_status
      ON reports(status)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER,
        channel_name TEXT DEFAULT '',
        action TEXT NOT NULL,
        detail TEXT DEFAULT '',
        actor TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS monitored_channels (
        channel_key TEXT PRIMARY KEY,
        channel_name TEXT NOT NULL,
        channel_number TEXT DEFAULT '',
        section TEXT DEFAULT '',
        category TEXT DEFAULT '',
        logo TEXT DEFAULT '',
        channel_id TEXT DEFAULT '',
        stream TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_http_status INTEGER,
        last_error TEXT DEFAULT '',
        last_checked_at TEXT,
        last_ok_at TEXT,
        auto_report_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_monitored_channels_check
      ON monitored_channels(enabled, last_checked_at)
    `)
  ]);
}

async function createReport(request, env) {
  checkPublicOrigin(request, env);

  const body = await readJson(request);
  const channelName = clean(body.canal || body.channel_name, 180);
  const stream = clean(body.stream, 2000);
  const channelId = clean(body.canalId || body.channel_id || body.id, 300);
  const reason = clean(body.motivo || body.reason, 180);

  if (!channelName || !reason) {
    throw httpError(400, "Faltan el canal o el motivo.");
  }

  const channelKey = stream || channelId || normalizeKey(channelName);
  const existing = await env.DB.prepare(`
    SELECT id, report_count
    FROM reports
    WHERE channel_key = ?
      AND status IN ('Pendiente','En revisión')
    LIMIT 1
  `).bind(channelKey).first();

  if (existing) {
    const newCount = Number(existing.report_count || 1) + 1;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE reports
        SET report_count = ?,
            reason = ?,
            details = ?,
            contact = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        newCount,
        reason,
        clean(body.detalles || body.details, 800),
        clean(body.contacto || body.contact, 160),
        existing.id
      ),
      env.DB.prepare(`
        INSERT INTO history
          (report_id, channel_name, action, detail, actor)
        VALUES (?, ?, 'Nuevo reporte agrupado', ?, 'Público')
      `).bind(existing.id, channelName, `Cantidad total: ${newCount}`)
    ]);

    return {
      ok: true,
      grouped: true,
      id: existing.id,
      cantidad: newCount
    };
  }

  const insert = await env.DB.prepare(`
    INSERT INTO reports (
      channel_key, channel_name, channel_number, section, category,
      logo, channel_id, stream, reason, details, contact,
      page_url, user_agent, status, report_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', 1)
  `).bind(
    channelKey,
    channelName,
    clean(body.numero || body.channel_number, 30),
    clean(body.seccion || body.section, 100),
    clean(body.categoria || body.category, 100),
    clean(body.logo, 2000),
    channelId,
    stream,
    reason,
    clean(body.detalles || body.details, 800),
    clean(body.contacto || body.contact, 160),
    clean(body.pagina || body.page_url, 2000),
    clean(body.userAgent || body.user_agent, 1000)
  ).run();

  const id = insert.meta.last_row_id;

  await env.DB.prepare(`
    INSERT INTO history
      (report_id, channel_name, action, detail, actor)
    VALUES (?, ?, 'Reporte creado', ?, 'Público')
  `).bind(id, channelName, reason).run();

  return { ok: true, grouped: false, id, cantidad: 1 };
}

async function publicStatuses(db) {
  const result = await db.prepare(`
    SELECT
      channel_name AS canal,
      channel_id AS canalId,
      stream,
      status AS estado,
      report_count AS cantidad
    FROM reports
    WHERE status IN ('Pendiente','En revisión','Reparado')
    ORDER BY updated_at DESC
    LIMIT 2000
  `).all();

  return { ok: true, items: result.results || [] };
}

async function login(request, env) {
  checkPublicOrigin(request, env);

  const body = await readJson(request);
  const username = clean(body.username, 80);
  const password = String(body.password || "");

  const expectedUser = env.ADMIN_USERNAME || "admin";
  const expectedPassword = env.ADMIN_PASSWORD;

  if (!expectedPassword) {
    throw httpError(500, "Falta configurar el secreto ADMIN_PASSWORD.");
  }

  if (!timingSafeEqual(username, expectedUser) ||
      !timingSafeEqual(password, expectedPassword)) {
    throw httpError(401, "Usuario o contraseña incorrectos.");
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?")
    .bind(new Date().toISOString())
    .run();

  await env.DB.prepare(`
    INSERT INTO sessions (token_hash, username, expires_at)
    VALUES (?, ?, ?)
  `).bind(tokenHash, username, expires).run();

  return {
    ok: true,
    token,
    username,
    expiresAt: expires
  };
}

async function requireSession(request, env) {
  checkPublicOrigin(request, env);

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw httpError(401, "Sesión requerida.");
  }

  const rawToken = authorization.slice(7).trim();
  const tokenHash = await sha256(rawToken);
  const now = new Date().toISOString();

  const session = await env.DB.prepare(`
    SELECT username, expires_at
    FROM sessions
    WHERE token_hash = ? AND expires_at > ?
    LIMIT 1
  `).bind(tokenHash, now).first();

  if (!session) {
    throw httpError(401, "Sesión inválida o expirada.");
  }

  return { ...session, tokenHash };
}

async function dashboard(db) {
  const [reportsResult, historyResult] = await db.batch([
    db.prepare(`
      SELECT
        id,
        channel_name AS canal,
        channel_number AS numero,
        section AS seccion,
        category AS categoria,
        logo,
        channel_id AS canalId,
        stream,
        reason AS motivo,
        details AS detalles,
        contact AS contacto,
        status AS estado,
        report_count AS cantidad,
        created_at AS fecha,
        updated_at AS actualizacion
      FROM reports
      ORDER BY updated_at DESC
      LIMIT 2000
    `),
    db.prepare(`
      SELECT
        report_id AS id,
        channel_name AS canal,
        action AS accion,
        detail AS detalle,
        actor,
        created_at AS fecha
      FROM history
      ORDER BY id DESC
      LIMIT 50
    `)
  ]);

  const reports = reportsResult.results || [];
  const history = historyResult.results || [];

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.estado === "Pendiente").length,
    reviewing: reports.filter(r => r.estado === "En revisión").length,
    fixed: reports.filter(r => r.estado === "Reparado").length,
    discarded: reports.filter(r => r.estado === "Descartado").length
  };

  const rankingMap = new Map();
  for (const item of reports) {
    const key = item.stream || item.canalId || item.canal;
    const current = rankingMap.get(key) || {
      canal: item.canal,
      seccion: item.seccion,
      cantidad: 0
    };
    current.cantidad += Number(item.cantidad || 1);
    rankingMap.set(key, current);
  }

  const ranking = [...rankingMap.values()]
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);

  const monitor = await monitorStatus(db);
  return { ok: true, reports, history, stats, ranking, monitor };
}

async function updateReport(request, db, id, actor) {
  const body = await readJson(request);
  const status = clean(body.estado || body.status, 40);

  if (!REPORT_STATUSES.has(status)) {
    throw httpError(400, "Estado no válido.");
  }

  const report = await db.prepare(`
    SELECT channel_name, status
    FROM reports
    WHERE id = ?
  `).bind(id).first();

  if (!report) {
    throw httpError(404, "Reporte no encontrado.");
  }

  await db.batch([
    db.prepare(`
      UPDATE reports
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(status, id),
    db.prepare(`
      INSERT INTO history
        (report_id, channel_name, action, detail, actor)
      VALUES (?, ?, 'Estado actualizado', ?, ?)
    `).bind(id, report.channel_name, `${report.status} → ${status}`, actor)
  ]);

  return { ok: true, id, estado: status };
}

async function deleteReport(db, id, actor) {
  const report = await db.prepare(`
    SELECT channel_name
    FROM reports
    WHERE id = ?
  `).bind(id).first();

  if (!report) {
    throw httpError(404, "Reporte no encontrado.");
  }

  await db.batch([
    db.prepare(`
      INSERT INTO history
        (report_id, channel_name, action, detail, actor)
      VALUES (?, ?, 'Reporte eliminado', 'Eliminado desde el panel', ?)
    `).bind(id, report.channel_name, actor),
    db.prepare("DELETE FROM reports WHERE id = ?").bind(id)
  ]);

  return { ok: true, id };
}


async function syncMonitoredChannels(request, env) {
  checkPublicOrigin(request, env);
  const body = await readJson(request);
  const channels = Array.isArray(body.channels) ? body.channels.slice(0, 250) : [];

  if (!channels.length) {
    return { ok: true, synced: 0 };
  }

  const statements = [];

  for (const item of channels) {
    const stream = clean(item.stream || item.url, 2000);
    if (!/^https?:\/\//i.test(stream)) continue;

    const channelName = clean(item.canal || item.name, 180) || "Canal";
    const channelId = clean(item.canalId || item.id, 300);
    const channelKey = stream || channelId || normalizeKey(channelName);

    statements.push(
      env.DB.prepare(`
        INSERT INTO monitored_channels (
          channel_key, channel_name, channel_number, section, category,
          logo, channel_id, stream, enabled, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(channel_key) DO UPDATE SET
          channel_name = excluded.channel_name,
          channel_number = excluded.channel_number,
          section = excluded.section,
          category = excluded.category,
          logo = excluded.logo,
          channel_id = excluded.channel_id,
          stream = excluded.stream,
          enabled = 1,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        channelKey,
        channelName,
        clean(item.numero || item.number, 30),
        clean(item.seccion || item.section, 100),
        clean(item.categoria || item.category, 100),
        clean(item.logo, 2000),
        channelId,
        stream
      )
    );
  }

  if (statements.length) {
    await env.DB.batch(statements);
  }

  return { ok: true, synced: statements.length };
}

async function monitorStatus(db) {
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN consecutive_failures = 0 THEN 1 ELSE 0 END) AS healthy,
      SUM(CASE WHEN consecutive_failures > 0 AND consecutive_failures < 3 THEN 1 ELSE 0 END) AS warning,
      SUM(CASE WHEN consecutive_failures >= 3 THEN 1 ELSE 0 END) AS down,
      MAX(last_checked_at) AS lastCheckedAt
    FROM monitored_channels
    WHERE enabled = 1
  `).first();

  return {
    ok: true,
    total: Number(row?.total || 0),
    healthy: Number(row?.healthy || 0),
    warning: Number(row?.warning || 0),
    down: Number(row?.down || 0),
    lastCheckedAt: row?.lastCheckedAt || null
  };
}

async function runAutomaticMonitor(env, actor = "Monitor automático") {
  await ensureSchema(env.DB);

  const limit = Math.max(5, Math.min(Number(env.MONITOR_BATCH_SIZE || 40), 100));
  const result = await env.DB.prepare(`
    SELECT *
    FROM monitored_channels
    WHERE enabled = 1
    ORDER BY
      CASE WHEN last_checked_at IS NULL THEN 0 ELSE 1 END,
      last_checked_at ASC
    LIMIT ?
  `).bind(limit).all();

  const channels = result.results || [];
  let healthy = 0;
  let failed = 0;
  let reportsCreated = 0;
  let reportsRecovered = 0;

  for (let offset = 0; offset < channels.length; offset += 5) {
    const group = channels.slice(offset, offset + 5);
    const outcomes = await Promise.all(group.map(channel => checkMonitoredChannel(channel)));

    for (let index = 0; index < group.length; index++) {
      const channel = group[index];
      const outcome = outcomes[index];

      if (outcome.ok) {
        healthy++;
        const recovered = await registerMonitorSuccess(env.DB, channel, actor);
        if (recovered) reportsRecovered++;
      } else {
        failed++;
        const created = await registerMonitorFailure(env.DB, channel, outcome, actor);
        if (created) reportsCreated++;
      }
    }
  }

  return {
    ok: true,
    checked: channels.length,
    healthy,
    failed,
    reportsCreated,
    reportsRecovered
  };
}

async function checkMonitoredChannel(channel) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Tiempo agotado"), 9000);

  try {
    const response = await fetch(channel.stream, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*",
        "Range": "bytes=0-8191",
        "User-Agent": "Watch-TV-Plus-Monitor/1.0"
      }
    });

    const status = response.status;
    if (!response.ok && status !== 206) {
      return { ok: false, status, error: `HTTP ${status}` };
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();

    if (/\.m3u8(?:$|\?)/i.test(channel.stream) ||
        contentType.includes("mpegurl") ||
        contentType.includes("application/vnd.apple")) {
      const text = (await response.text()).slice(0, 12000);
      if (!text.includes("#EXTM3U")) {
        return {
          ok: false,
          status,
          error: "La respuesta no contiene una lista HLS válida."
        };
      }
    } else {
      try {
        await response.body?.cancel();
      } catch {}
    }

    return { ok: true, status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.name === "AbortError"
        ? "Tiempo de espera agotado."
        : String(error?.message || error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function registerMonitorSuccess(db, channel, actor) {
  const hadAutomaticReport = Number(channel.auto_report_id || 0) > 0;

  await db.prepare(`
    UPDATE monitored_channels
    SET consecutive_failures = 0,
        last_http_status = 200,
        last_error = '',
        last_checked_at = CURRENT_TIMESTAMP,
        last_ok_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE channel_key = ?
  `).bind(channel.channel_key).run();

  if (!hadAutomaticReport) return false;

  const report = await db.prepare(`
    SELECT id, status, channel_name
    FROM reports
    WHERE id = ?
    LIMIT 1
  `).bind(channel.auto_report_id).first();

  if (report && ["Pendiente", "En revisión"].includes(report.status)) {
    await db.batch([
      db.prepare(`
        UPDATE reports
        SET status = 'Reparado',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(report.id),
      db.prepare(`
        INSERT INTO history
          (report_id, channel_name, action, detail, actor)
        VALUES (?, ?, 'Recuperación automática',
          'El enlace volvió a responder correctamente.', ?)
      `).bind(report.id, report.channel_name, actor),
      db.prepare(`
        UPDATE monitored_channels
        SET auto_report_id = NULL
        WHERE channel_key = ?
      `).bind(channel.channel_key)
    ]);
    return true;
  }

  await db.prepare(`
    UPDATE monitored_channels
    SET auto_report_id = NULL
    WHERE channel_key = ?
  `).bind(channel.channel_key).run();

  return false;
}

async function registerMonitorFailure(db, channel, outcome, actor) {
  const failures = Number(channel.consecutive_failures || 0) + 1;

  await db.prepare(`
    UPDATE monitored_channels
    SET consecutive_failures = ?,
        last_http_status = ?,
        last_error = ?,
        last_checked_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE channel_key = ?
  `).bind(
    failures,
    Number(outcome.status || 0),
    clean(outcome.error, 500),
    channel.channel_key
  ).run();

  if (failures < 3 || channel.auto_report_id) return false;

  const existing = await db.prepare(`
    SELECT id
    FROM reports
    WHERE channel_key = ?
      AND status IN ('Pendiente', 'En revisión')
    LIMIT 1
  `).bind(channel.channel_key).first();

  if (existing) {
    await db.prepare(`
      UPDATE monitored_channels
      SET auto_report_id = ?
      WHERE channel_key = ?
    `).bind(existing.id, channel.channel_key).run();
    return false;
  }

  const details = `Fallo automático después de ${failures} comprobaciones consecutivas. ${outcome.error || ""}`.trim();

  const insert = await db.prepare(`
    INSERT INTO reports (
      channel_key, channel_name, channel_number, section, category,
      logo, channel_id, stream, reason, details, contact,
      page_url, user_agent, status, report_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
      'Detección automática: enlace caído', ?, '', '', 'Cloudflare Monitor',
      'Pendiente', 1)
  `).bind(
    channel.channel_key,
    channel.channel_name,
    channel.channel_number || "",
    channel.section || "",
    channel.category || "",
    channel.logo || "",
    channel.channel_id || "",
    channel.stream,
    details
  ).run();

  const reportId = insert.meta.last_row_id;

  await db.batch([
    db.prepare(`
      INSERT INTO history
        (report_id, channel_name, action, detail, actor)
      VALUES (?, ?, 'Reporte automático creado', ?, ?)
    `).bind(reportId, channel.channel_name, details, actor),
    db.prepare(`
      UPDATE monitored_channels
      SET auto_report_id = ?
      WHERE channel_key = ?
    `).bind(reportId, channel.channel_key)
  ]);

  return true;
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function checkPublicOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return;

  if (!allowedOrigins(env).includes(origin)) {
    throw httpError(403, "Origen no autorizado.");
  }
}

function corsResponse(request, env, body, status = 200, extraHeaders = {}) {
  const origin = request.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];

  return new Response(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      ...extraHeaders
    }
  });
}

function json(request, env, data, status = 200) {
  return corsResponse(
    request,
    env,
    JSON.stringify(data),
    status,
    { "Content-Type": "application/json; charset=utf-8" }
  );
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    throw httpError(415, "Se requiere Content-Type application/json.");
  }

  try {
    return await request.json();
  } catch {
    throw httpError(400, "JSON no válido.");
  }
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
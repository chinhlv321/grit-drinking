// Cloudflare Worker: handles /api/*, static SPA is served by Workers Assets (see wrangler.jsonc)
const ADMIN_PASSWORD = "grit321";

const json = (data: unknown, status = 200) => Response.json(data, { status });

async function handle(req: Request, env: Env, path: string): Promise<Response> {
  const db = env.DB;
  const method = req.method;
  const body: any = method === "POST" ? await req.json().catch(() => ({})) : {};

  if (path === "/api/sessions" && method === "GET") {
    const { results } = await db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all();
    return json(results);
  }

  if (path === "/api/sessions" && method === "POST") {
    const { title, location, description, discord_webhook, proposed_dates } = body;
    if (!title?.trim() || !location?.trim()) return json({ error: "Thiếu tên kèo hoặc địa điểm" }, 400);
    const session = await db
      .prepare("INSERT INTO sessions (title, location, description, discord_webhook) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(title, location, description || null, discord_webhook || null)
      .first<{ id: number }>();
    const sessionId = session!.id;
    if (Array.isArray(proposed_dates) && proposed_dates.length > 0) {
      try {
        await db.batch(
          proposed_dates.map((pd: any) =>
            db.prepare("INSERT INTO proposed_dates (session_id, date, time) VALUES (?, ?, ?)").bind(sessionId, pd.date, pd.time)
          )
        );
      } catch (err) {
        // D1 has no interactive transactions: undo the session insert by hand
        await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
        throw err;
      }
    }
    return json({ id: sessionId });
  }

  const m = path.match(/^\/api\/sessions\/(\d+)(?:\/([a-z-]+))?$/);
  if (!m) return json({ error: `API route ${method} ${path} not found` }, 404);
  const id = Number(m[1]);
  const action = m[2];

  if (!action && method === "GET") {
    const session = await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first();
    if (!session) return json({ error: "Not found" }, 404);

    const [participants, dates, votes] = await db.batch([
      db.prepare("SELECT * FROM participants WHERE session_id = ?").bind(id),
      db
        .prepare(
          `SELECT pd.*,
                  (SELECT COUNT(*) FROM votes WHERE proposed_date_id = pd.id AND vote_type = 'free') as vote_count,
                  (SELECT COUNT(*) FROM votes WHERE proposed_date_id = pd.id AND vote_type = 'busy') as busy_count
           FROM proposed_dates pd
           WHERE pd.session_id = ?
           ORDER BY vote_count DESC, pd.id ASC`
        )
        .bind(id),
      db
        .prepare(
          "SELECT v.proposed_date_id, v.name, v.vote_type FROM votes v JOIN proposed_dates pd ON pd.id = v.proposed_date_id WHERE pd.session_id = ? ORDER BY v.id"
        )
        .bind(id),
    ]);

    const proposed_dates = (dates.results as any[]).map((pd) => {
      const mine = (votes.results as any[]).filter((v) => v.proposed_date_id === pd.id);
      return {
        ...pd,
        voters: mine.filter((v) => v.vote_type === "free").map((v) => v.name),
        busy_voters: mine.filter((v) => v.vote_type === "busy").map((v) => v.name),
      };
    });
    return json({ ...session, participants: participants.results, proposed_dates });
  }

  if (method !== "POST") return json({ error: `API route ${method} ${path} not found` }, 404);

  switch (action) {
    case "vote": {
      const { proposed_date_ids, vote_type = "free" } = body;
      const name = String(body.name ?? "").trim();
      if (!name || name.length > 50 || !Array.isArray(proposed_date_ids) || !["free", "busy"].includes(vote_type)) {
        return json({ error: "Invalid vote data" }, 400);
      }
      if (proposed_date_ids.length > 0) {
        // Only replace this user's votes on the submitted dates, so free/busy can coexist on different dates
        const placeholders = proposed_date_ids.map(() => "?").join(",");
        await db.batch([
          db
            .prepare(`DELETE FROM votes WHERE LOWER(TRIM(name)) = LOWER(?) AND proposed_date_id IN (${placeholders})`)
            .bind(name, ...proposed_date_ids),
          // INSERT ... SELECT skips date ids that don't belong to this session
          ...proposed_date_ids.map((pdId: number) =>
            db
              .prepare("INSERT INTO votes (proposed_date_id, name, vote_type) SELECT id, ?, ? FROM proposed_dates WHERE id = ? AND session_id = ?")
              .bind(name, vote_type, pdId, id)
          ),
        ]);
      }
      return json({ success: true });
    }

    case "clear-votes": {
      const { name } = body;
      if (!name) return json({ error: "Name required" }, 400);
      const result = await db
        .prepare(
          `DELETE FROM votes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND proposed_date_id IN (
            SELECT id FROM proposed_dates WHERE session_id = ?
          )`
        )
        .bind(name, id)
        .run();
      return json({ success: true, deletedCount: result.meta.changes });
    }

    case "remove-vote": {
      const { name, proposed_date_id } = body;
      if (!name || !proposed_date_id) return json({ error: "Name and date ID required" }, 400);
      await db
        .prepare("DELETE FROM votes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND proposed_date_id = ?")
        .bind(name, proposed_date_id)
        .run();
      return json({ success: true });
    }

    case "confirm": {
      const { date, time, password } = body;
      if (password !== ADMIN_PASSWORD) return json({ error: "Sai mật khẩu" }, 401);
      await db
        .prepare("UPDATE sessions SET status = 'confirmed', final_date = ?, final_time = ? WHERE id = ?")
        .bind(date, time || null, id)
        .run();
      return json({ success: true });
    }

    case "delete": {
      if (body.password !== ADMIN_PASSWORD) return json({ error: "Sai mật khẩu" }, 401);
      await db.batch([
        db.prepare("DELETE FROM votes WHERE proposed_date_id IN (SELECT id FROM proposed_dates WHERE session_id = ?)").bind(id),
        db.prepare("DELETE FROM proposed_dates WHERE session_id = ?").bind(id),
        db.prepare("DELETE FROM participants WHERE session_id = ?").bind(id),
        db.prepare("DELETE FROM sessions WHERE id = ?").bind(id),
      ]);
      return json({ success: true });
    }
  }

  return json({ error: `API route ${method} ${path} not found` }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    try {
      return await handle(req, env, path);
    } catch (err: any) {
      console.error(`Error in ${req.method} ${path}:`, err);
      return json({ error: err.message }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

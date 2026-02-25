import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database using Turso (libsql)
// If DATABASE_URL is not set, it defaults to a local file
const db = createClient({
  url: process.env.DATABASE_URL || `file:${path.join(__dirname, "nhau_v2.db")}`,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function initDB() {
  console.log("Initializing database...");
  try {
    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        discord_webhook TEXT,
        status TEXT DEFAULT 'voting',
        final_date TEXT,
        final_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS proposed_dates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposed_date_id INTEGER,
        name TEXT NOT NULL,
        vote_type TEXT DEFAULT 'free', -- 'free' or 'busy'
        FOREIGN KEY(proposed_date_id) REFERENCES proposed_dates(id)
      );

      CREATE TABLE IF NOT EXISTS participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );
    `);
    console.log("Base tables initialized.");

    // Migration: Add vote_type to votes if it doesn't exist
    try {
      await db.execute("ALTER TABLE votes ADD COLUMN vote_type TEXT DEFAULT 'free'");
      console.log("Migration: vote_type column added.");
    } catch (e) {
      console.log("Migration: vote_type column already exists or error ignored.");
    }
  } catch (err) {
    console.error("Database initialization failed:", err);
    throw err;
  }
}

async function startServer() {
  await initDB();

  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Helper to serialize rows containing BigInts
  const serializeRow = (row: any) => {
    const newRow = { ...row };
    for (const key in newRow) {
      if (typeof newRow[key] === 'bigint') {
        newRow[key] = Number(newRow[key]);
      }
    }
    return newRow;
  };

  // API Routes
  app.get("/api/sessions", async (req, res) => {
    console.log("GET /api/sessions");
    try {
      const result = await db.execute("SELECT * FROM sessions ORDER BY created_at DESC");
      res.json(result.rows.map(serializeRow));
    } catch (err: any) {
      console.error("Error in GET /api/sessions:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const { title, location, description, discord_webhook, proposed_dates } = req.body;
      
      const tx = await db.transaction("write");
      try {
        const sessionRes = await tx.execute({
          sql: "INSERT INTO sessions (title, location, description, discord_webhook) VALUES (?, ?, ?, ?)",
          args: [title, location, description || null, discord_webhook || null]
        });
        const sessionId = sessionRes.lastInsertRowid;
        
        if (proposed_dates && Array.isArray(proposed_dates)) {
          for (const pd of proposed_dates) {
            await tx.execute({
              sql: "INSERT INTO proposed_dates (session_id, date, time) VALUES (?, ?, ?)",
              args: [sessionId, pd.date, pd.time]
            });
          }
        }
        await tx.commit();
        res.json({ id: Number(sessionId) });
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    } catch (err: any) {
      console.error("Error creating session:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const sessionRes = await db.execute({
        sql: "SELECT * FROM sessions WHERE id = ?",
        args: [req.params.id]
      });
      const session = sessionRes.rows[0];
      if (!session) return res.status(404).json({ error: "Not found" });
      
      const participantsRes = await db.execute({
        sql: "SELECT * FROM participants WHERE session_id = ?",
        args: [req.params.id]
      });
      
      const proposedDatesRes = await db.execute({
        sql: `
          SELECT pd.*, 
                 (SELECT COUNT(*) FROM votes WHERE proposed_date_id = pd.id AND vote_type = 'free') as vote_count,
                 (SELECT COUNT(*) FROM votes WHERE proposed_date_id = pd.id AND vote_type = 'busy') as busy_count
          FROM proposed_dates pd 
          WHERE pd.session_id = ? 
          ORDER BY vote_count DESC, pd.id ASC
        `,
        args: [req.params.id]
      });

      const proposed_dates = proposedDatesRes.rows;

      // Get who voted for what
      for (let i = 0; i < proposed_dates.length; i++) {
        const pd = proposed_dates[i];
        const freeVotersRes = await db.execute({
          sql: "SELECT name FROM votes WHERE proposed_date_id = ? AND vote_type = 'free'",
          args: [pd.id as any]
        });
        const busyVotersRes = await db.execute({
          sql: "SELECT name FROM votes WHERE proposed_date_id = ? AND vote_type = 'busy'",
          args: [pd.id as any]
        });
        (proposed_dates[i] as any).voters = freeVotersRes.rows.map(v => v.name);
        (proposed_dates[i] as any).busy_voters = busyVotersRes.rows.map(v => v.name);
      }

      const serializedSession = serializeRow(session);
      const serializedParticipants = participantsRes.rows.map(serializeRow);
      const serializedProposedDates = proposed_dates.map(serializeRow);

      res.json({ ...serializedSession, participants: serializedParticipants, proposed_dates: serializedProposedDates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/:id/vote", async (req, res) => {
    try {
      const { name, proposed_date_ids, vote_type = 'free' } = req.body;
      if (!name || !Array.isArray(proposed_date_ids)) {
        return res.status(400).json({ error: "Invalid vote data" });
      }
      
      const tx = await db.transaction("write");
      try {
        // Only delete existing votes for the specific dates being submitted by this user
        // This allows them to have both 'free' and 'busy' votes in the same session on different dates
        if (proposed_date_ids.length > 0) {
          const placeholders = proposed_date_ids.map(() => "?").join(",");
          await tx.execute({
            sql: `DELETE FROM votes WHERE name = ? AND proposed_date_id IN (${placeholders})`,
            args: [name, ...proposed_date_ids]
          });

          for (const pdId of proposed_date_ids) {
            await tx.execute({
              sql: "INSERT INTO votes (proposed_date_id, name, vote_type) VALUES (?, ?, ?)",
              args: [pdId, name, vote_type]
            });
          }
        }
        await tx.commit();
        res.json({ success: true });
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    } catch (err: any) {
      console.error("Error voting:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/:id/clear-votes", async (req, res) => {
    console.log(`POST /api/sessions/${req.params.id}/clear-votes - Name: ${req.body.name}`);
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Name required" });

      const result = await db.execute({
        sql: `DELETE FROM votes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND proposed_date_id IN (
          SELECT id FROM proposed_dates WHERE session_id = ?
        )`,
        args: [name, req.params.id]
      });
      console.log(`Deleted ${result.rowsAffected} votes for ${name}`);
      res.json({ success: true, deletedCount: result.rowsAffected });
    } catch (err: any) {
      console.error("Error clearing votes:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/:id/remove-vote", async (req, res) => {
    try {
      const { name, proposed_date_id } = req.body;
      if (!name || !proposed_date_id) return res.status(400).json({ error: "Name and date ID required" });

      await db.execute({
        sql: "DELETE FROM votes WHERE name = ? AND proposed_date_id = ?",
        args: [name, proposed_date_id]
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/:id/confirm", async (req, res) => {
    try {
      const { date, time, password } = req.body;
      if (password !== "grit321") {
        return res.status(401).json({ error: "Sai mật khẩu" });
      }
      await db.execute({
        sql: "UPDATE sessions SET status = 'confirmed', final_date = ?, final_time = ? WHERE id = ?",
        args: [date, time || null, req.params.id]
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/:id/delete", async (req, res) => {
    try {
      const { password } = req.body;
      if (password !== "grit321") {
        return res.status(401).json({ error: "Sai mật khẩu" });
      }

      const tx = await db.transaction("write");
      try {
        await tx.execute({
          sql: "DELETE FROM votes WHERE proposed_date_id IN (SELECT id FROM proposed_dates WHERE session_id = ?)",
          args: [req.params.id]
        });
        await tx.execute({
          sql: "DELETE FROM proposed_dates WHERE session_id = ?",
          args: [req.params.id]
        });
        await tx.execute({
          sql: "DELETE FROM participants WHERE session_id = ?",
          args: [req.params.id]
        });
        await tx.execute({
          sql: "DELETE FROM sessions WHERE id = ?",
          args: [req.params.id]
        });
        await tx.commit();
        res.json({ success: true });
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    } catch (err: any) {
      console.error("Error deleting session:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Catch-all for API routes to prevent falling back to SPA HTML
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}


// Global error handler for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
});

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
}

async function startServer() {
  await initDB();

  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.get("/api/sessions", async (req, res) => {
    try {
      const result = await db.execute("SELECT * FROM sessions ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err: any) {
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
        res.json({ id: sessionId });
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
          SELECT pd.*, COUNT(v.id) as vote_count 
          FROM proposed_dates pd 
          LEFT JOIN votes v ON pd.id = v.proposed_date_id 
          WHERE pd.session_id = ? 
          GROUP BY pd.id
          ORDER BY vote_count DESC, pd.id ASC
        `,
        args: [req.params.id]
      });

      const proposed_dates = proposedDatesRes.rows;

      // Get who voted for what
      for (let i = 0; i < proposed_dates.length; i++) {
        const pd = proposed_dates[i];
        const votersRes = await db.execute({
          sql: "SELECT name FROM votes WHERE proposed_date_id = ?",
          args: [pd.id as any]
        });
        (proposed_dates[i] as any).voters = votersRes.rows.map(v => v.name);
      }

      res.json({ ...session, participants: participantsRes.rows, proposed_dates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sessions/:id/vote", async (req, res) => {
    try {
      const { name, proposed_date_ids } = req.body;
      if (!name || !Array.isArray(proposed_date_ids)) {
        return res.status(400).json({ error: "Invalid vote data" });
      }
      
      const tx = await db.transaction("write");
      try {
        await tx.execute({
          sql: `DELETE FROM votes WHERE name = ? AND proposed_date_id IN (
            SELECT id FROM proposed_dates WHERE session_id = ?
          )`,
          args: [name, req.params.id]
        });

        for (const pdId of proposed_date_ids) {
          await tx.execute({
            sql: "INSERT INTO votes (proposed_date_id, name) VALUES (?, ?)",
            args: [pdId, name]
          });
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

  app.post("/api/sessions/:id/confirm", async (req, res) => {
    try {
      const { date, time } = req.body;
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

startServer();

# Copilot Instructions for AI Coding Agents

## Project Overview
- This is a Node.js + React (Vite) project for an AI Studio app, with the entry points in `server.ts` (backend) and `src/` (frontend).
- The app integrates with Gemini API. The API key must be set in `.env.local` as `GEMINI_API_KEY`.
- The project is designed for rapid prototyping and local development, with deployment via Netlify (`netlify.toml`).

## Key Files & Structure
- `server.ts`: Main backend logic (API routes, integrations).
- `src/App.tsx`, `src/main.tsx`: React app entry and main component structure.
- `vite.config.ts`: Vite build configuration.
- `package.json`: Scripts, dependencies, and project metadata.
- `.env.local`: **Required** for API keys (not committed).
- `README.md`: Basic setup and run instructions.

## Developer Workflows
- **Install dependencies:** `npm install`
- **Run locally:** `npm run dev` (starts both frontend and backend)
- **Environment:** Requires Node.js and a valid Gemini API key in `.env.local`.
- **Deploy:** Uses Netlify; see `netlify.toml` for configuration.

## Patterns & Conventions
- **Frontend:** Uses React with functional components and hooks. Main entry is `src/main.tsx`.
- **Backend:** All backend logic is in `server.ts`. If you add new API endpoints, document them in code comments.
- **Environment Variables:** All secrets (API keys, etc.) must go in `.env.local`.
- **Styling:** Uses `src/index.css` for global styles.
- **TypeScript:** All code is TypeScript. Prefer explicit types for public functions and API interfaces.

## Integration Points
- **Gemini API:** All AI features depend on the Gemini API. Ensure `GEMINI_API_KEY` is set.
- **Netlify:** For deployment, configuration is in `netlify.toml`.

## Examples
- To add a new React page, create a component in `src/` and add a route in `App.tsx`.
- To add a backend route, edit `server.ts` and follow existing patterns for API endpoints.

## Additional Notes
- No custom test or lint scripts are defined; add them to `package.json` if needed.
- Keep all sensitive data out of version control.

---
For more details, see `README.md` and comments in key files.

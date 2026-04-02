# AGENTS.md

## Project Overview

MindSync is an AI-powered personal well-being and productivity app.

- **Frontend** (`frontend/`): React Native with Expo (v54), TypeScript, Expo Router file-based routing.
- **Backend** (`backend/`): FastAPI (Python 3.10+), MongoDB (PyMongo), Firebase Auth, Groq (Llama 3.1), Google Gemini.
- **No monorepo tooling** — frontend and backend are independent runtimes.
- **No CI/CD pipeline**, no Docker configuration, no Cursor rules, no Copilot instructions.

---

## Build / Run Commands

### Frontend

```bash
cd frontend
npm install            # install dependencies
npm start              # Expo dev server (Metro bundler)
npm run android        # build & run Android (expo run:android)
npm run ios            # build & run iOS (expo run:ios)
npm run web            # start web target
npm run lint           # ESLint via expo lint
npm run reset-project  # reset to blank Expo project (destructures app/)
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py                   # runs uvicorn on port 5000 (or PORT from .env)
```

Or directly with uvicorn:

```bash
uvicorn app:app --host 0.0.0.0 --port 5000 --reload
```

### Quick start (Windows)

```bash
./start-dev.ps1   # creates venv, installs deps, starts both backend & frontend
```

### Environment Setup

Copy `backend/.env` with these keys (values are loaded via `python-dotenv`):

```env
PORT=5000
MONGO_URI=mongodb+srv://...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.0-flash
GEMINI_FALLBACK_MODELS=gemini-2.0-flash-lite
ASSEMBLYAI_API_KEY=...
CAMB_API_KEY=...
FIREBASE_PROJECT_ID=...
DB_CONNECT_TIMEOUT_MS=8000
```

**Never commit `.env` files or API keys.**

---

## Testing

**There are no tests in this codebase.** No pytest config, no Jest setup, no test files exist.

When adding tests:
- **Backend:** Install `pytest` and `httpx`. Use `httpx.AsyncClient` with `pytest-asyncio` for FastAPI route testing. Create `backend/tests/test_*.py`.
- **Frontend:** Install `jest` + `@testing-library/react-native`. Create `frontend/__tests__/*.test.tsx`.
- Run a single backend test: `pytest tests/test_file.py::test_function_name -v`
- Run a single frontend test: `npx jest --testPathPattern="test_name"`

---

## Linting & Type Checking

- **Frontend lint:** `npm run lint` (runs `expo lint`, which uses ESLint flat config from `eslint.config.js`). Extends `eslint-config-expo/flat` with no custom rules.
- **Frontend types:** TypeScript with `strict: true` enabled in `tsconfig.json`. Run `npx tsc --noEmit` for type checking.
- **Backend:** No linter or type checker configured. Follow PEP 8 conventions manually.

Run after changes:

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

---

## Code Style

### Backend (Python)

- **Single file architecture:** The entire backend lives in `app.py` (~1900 lines). All routes, helpers, and config are in this one file.
- **Imports:** stdlib first, then third-party, then local. One import per line.
- **Naming:** `snake_case` for functions, variables, modules. PascalCase for classes.
- **Type hints:** Use modern union syntax `str | None` (Python 3.10+).
- **Async:** Use `async def` for endpoints. Use `asyncio.to_thread()` to offload blocking calls (e.g., Groq SDK, PyMongo).
- **Error handling:** Raise `HTTPException(status_code, detail)` for API errors. Use try/except with specific exception types.
- **Serialization:** Use `_serialize_doc()` helper to convert MongoDB docs (ObjectId, datetime) to JSON-safe dicts.
- **Endpoints:** Group by feature with `# ==================== SECTION NAME ====================` comment blocks.
- **Environment:** Load from `.env` via `python-dotenv`.

### Frontend (TypeScript / React Native)

- **File types:** Use `.tsx` for screens in `app/` directory. Use `.jsx` for components in `components/TaskManager/` (not compiled by TypeScript — keep them pure JS).
- **Components:** Functional components with hooks (`useState`, `useEffect`, `useRef`, `useCallback`).
- **Routing:** Expo Router file-based routing. Files in `app/` become routes. Use `useRouter()` from `expo-router`.
- **Styling:** `StyleSheet.create()` for inline styles. No CSS-in-JS libraries.
- **Icons:** `@expo/vector-icons` (Ionicons, MaterialCommunityIcons).
- **API calls:** Use `authFetch()` from `utils/api.ts` — it auto-attaches Firebase auth headers and retries on network errors.
- **Env vars:** Prefix public vars with `EXPO_PUBLIC_` (required by Expo).
- **Firebase:** Config in `firebaseConfig.ts` (re-exports from `firebase.ts`). Auth via `auth.currentUser` with ID token.
- **State persistence:** `@react-native-async-storage/async-storage` for local persistence.
- **Path aliases:** `@/*` maps to `./` in `tsconfig.json`.

### General Conventions

- Do not add comments unless explicitly asked.
- Follow existing code patterns in neighboring files.
- Never commit secrets (API keys, service account JSON, `.env` files).
- The `backend/.gitignore` excludes: `.env`, `.venv/`, `venv/`, `__pycache__/`, `*.pyc`, `serviceAccountKey.json`, `*firebase-adminsdk*.json`.
- The `frontend/.gitignore` excludes: `expo-env.d.ts`, `node_modules/`, `dist/`, `.env`.

---

## Architecture Notes

- **Auth flow:** Frontend authenticates with Firebase, then sends the Firebase ID token in `Authorization: Bearer <token>` headers. Backend verifies with `firebase_admin.auth.verify_id_token()`.
- **Fallback auth:** If Firebase Admin is not configured on the backend, it falls back to `X-User-Id` / `X-User-Email` headers.
- **MongoDB collections:** `journals`, `emotionhistories`, `tasks`, `users`, `voice_analyses`, `chat_conversations`, `documents`, `birthdays`, `events`, `avatar_conversations`.
- **CORS:** Wide open (`allow_origins=["*"]`).

### AI Models & APIs

| Key | Model / Service | Feature |
|-----|----------------|---------|
| GROQ_API_KEY | `llama-3.1-8b-instant` | Journal analysis, AI chat, avatar chat, voice analysis |
| GEMINI_API_KEY | `gemini-2.0-flash` | Facial emotion detection (selfie) |
| GEMINI_API_KEY (fallback) | `gemini-2.0-flash-lite` | Backup when primary hits rate limit |
| ASSEMBLYAI_API_KEY | Speech-to-text | Voice input transcription |
| CAMB_API_KEY | Text-to-speech | Avatar voice output |

### Key Backend Endpoints

- `POST /api/journals/analyze` — AI journal analysis
- `POST /api/chat` — AI chat agent with function calling
- `POST /api/emotion` — Gemini selfie emotion detection
- `POST /api/avatar/chat` — Avatar conversational AI (CBT framework)
- `POST /api/avatar/analyze-voice` — Voice transcription + emotion analysis
- `POST /api/avatar/tts` — Text-to-speech via Camb.ai
- `GET/POST` — Standard CRUD for tasks, documents, birthdays, events, journals

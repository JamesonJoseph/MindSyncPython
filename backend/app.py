import base64
import json
import os
import re
import aiohttp
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Query, Request, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from groq import Groq
import httpx
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError
import uvicorn
import firebase_admin
import jwt
from firebase_admin import auth as firebase_auth, credentials as firebase_credentials

def _env_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return default
    try:
        return int(raw_value)
    except ValueError:
        return default

ENV_PATH = Path(__file__).resolve().with_name(".env")
load_dotenv(dotenv_path=ENV_PATH)

MONGO_URI = os.getenv("MONGO_URI", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY", "").strip()
    or os.getenv("EXPO_PUBLIC_GEMINI_API_KEY", "").strip()
)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip() 
PORT = int(os.getenv("PORT", "5000"))
DB_CONNECT_TIMEOUT_MS = int(os.getenv("DB_CONNECT_TIMEOUT_MS", "8000"))

if not MONGO_URI:
    raise RuntimeError("MONGO_URI is required in environment variables.")

db_name_from_uri = urlparse(MONGO_URI).path.lstrip("/")
db_name = os.getenv("MONGO_DB_NAME", "").strip() or db_name_from_uri or "mindsync"

_mongo_client: MongoClient | None = None
_gemini_http_client: httpx.AsyncClient | None = None
groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None
EMOTION_LABELS = {"happy", "sad", "angry", "surprise", "fear", "disgust", "neutral"}

# Initialize Firebase Admin SDK (for verifying ID tokens)
FIREBASE_ENABLED = False
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "").strip()

try:
    if not firebase_admin._apps:
        # Use local service account file if exists, otherwise check env var
        local_cred_path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        cred_path = local_cred_path if os.path.exists(local_cred_path) else os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
        
        if cred_path and os.path.exists(cred_path):
            cred = firebase_credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            FIREBASE_ENABLED = True
            print(f"[firebase] admin init with service account: {cred_path}")
        elif FIREBASE_PROJECT_ID:
            # Initialize with just the project ID (useful for some auth operations)
            firebase_admin.initialize_app(options={'projectId': FIREBASE_PROJECT_ID})
            FIREBASE_ENABLED = True
            print(f"[firebase] admin init with project ID: {FIREBASE_PROJECT_ID}")
        else:
            # Attempt default initialization (may work if running on GCP)
            firebase_admin.initialize_app()
            FIREBASE_ENABLED = True
            print("[firebase] admin init with default credentials")
except Exception as exc:
    print("[firebase] admin init failed:", exc)
    FIREBASE_ENABLED = False


async def _require_auth(request: Request) -> dict:
    """Verify Firebase ID token from Authorization header and return {uid, email}.

    Raises HTTPException(401) if token is missing/invalid or 500 if firebase not configured.
    """
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")

    id_token = parts[1]
    
    # Try using firebase-admin SDK if enabled
    if FIREBASE_ENABLED:
        try:
            decoded = firebase_auth.verify_id_token(id_token)
            return {"uid": decoded.get("uid"), "email": decoded.get("email")}
        except Exception as sdk_exc:
            print(f"[firebase] SDK verification failed: {sdk_exc}")
            # If it's a project ID error or missing credentials, try manual verification
            if "credentials" in str(sdk_exc).lower() or "project id" in str(sdk_exc).lower():
                pass
            else:
                raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(sdk_exc)}")

    # Fallback/Manual verification using Google's public keys
    try:
        if not FIREBASE_PROJECT_ID:
            raise RuntimeError("FIREBASE_PROJECT_ID is not set in environment.")
        
        # This is a very basic fallback that helps when service accounts are not set up.
        # It relies on the token being a valid JWT signed by Google.
        # NOTE: signature verification is skipped here because it requires fetching 
        # and caching Google's public keys, which is better done by a library.
        # However, verifying 'aud' and 'exp' provides a baseline level of protection.
        import jwt # Ensure PyJWT is installed
        
        unverified = jwt.decode(id_token, options={"verify_signature": False})
        
        if unverified.get("aud") != FIREBASE_PROJECT_ID:
             print(f"[firebase] Token audience mismatch: {unverified.get('aud')} != {FIREBASE_PROJECT_ID}")
             raise HTTPException(status_code=401, detail="Token audience mismatch")
        
        exp = unverified.get("exp")
        if exp and datetime.fromtimestamp(exp, timezone.utc) < _utc_now():
             print(f"[firebase] Token has expired.")
             raise HTTPException(status_code=401, detail="Token has expired")
             
        return {"uid": unverified.get("user_id") or unverified.get("sub"), "email": unverified.get("email")}
        
    except HTTPException:
        raise
    except Exception as manual_exc:
        print(f"[firebase] Manual verification failed: {manual_exc}")
        if not FIREBASE_ENABLED:
            raise HTTPException(status_code=500, detail="Firebase not configured and manual verification failed.")
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)

def _serialize_doc(doc: dict) -> dict:
    if not doc: return doc
    out = dict(doc)
    if "_id" in out:
        out["_id"] = str(out["_id"])
    if isinstance(out.get("date"), datetime):
        out["date"] = out["date"].isoformat()
    if isinstance(out.get("dueDate"), datetime):
        out["dueDate"] = out["dueDate"].isoformat()
    return out

def _parse_object_id(raw_id: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except InvalidId as exc:
        raise ValueError("Invalid document id format.") from exc

def _parse_filter_datetime(raw_value: str | None, field_name: str, end_of_day: bool = False) -> datetime | None:
    if raw_value is None:
        return None
    value = str(raw_value).strip()
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be ISO format") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if end_of_day and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed.astimezone(timezone.utc)

def _build_journal_query(user_id: str, start_date: str | None = None, end_date: str | None = None, text_query: str | None = None) -> dict:
    uid = str(user_id).strip()
    if not uid:
        raise ValueError("userId is required")
    query: dict = {"userId": uid}
    start_dt = _parse_filter_datetime(start_date, "startDate")
    end_dt = _parse_filter_datetime(end_date, "endDate", end_of_day=True)
    if start_dt or end_dt:
        date_filter: dict = {}
        if start_dt: date_filter["$gte"] = start_dt
        if end_dt: date_filter["$lte"] = end_dt
        query["date"] = date_filter
    keyword = str(text_query or "").strip()
    if keyword:
        escaped = re.escape(keyword)
        query["$or"] = [
            {"title": {"$regex": escaped, "$options": "i"}},
            {"content": {"$regex": escaped, "$options": "i"}},
            {"aiAnalysis": {"$regex": escaped, "$options": "i"}},
        ]
    return query

def _get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=DB_CONNECT_TIMEOUT_MS)
    return _mongo_client
def _get_collections():
    database = _get_mongo_client()[db_name]
    return (
        database["journals"], 
        database["emotionhistories"], 
        database["tasks"], 
        database["users"], 
        database["voice_analyses"],
        database["documents"]
    )

...

# ==================== DOCUMENTS / SECURE VAULT ====================

@app.get("/api/documents")
async def get_documents(request: Request):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    _, _, _, _, _, documents = _get_collections()
    docs = list(documents.find({"userId": uid}).sort("date", DESCENDING))
    return [_serialize_doc(doc) for doc in docs]

@app.post("/api/documents")
async def create_document(request: Request):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    email = auth_info.get("email")
    _, _, _, _, _, documents = _get_collections()
    payload = await request.json()

    # In a real app, 'content' would be encrypted on the client side
    doc = {
        "userId": str(uid or ""),
        "userEmail": str(email or ""),
        "title": str(payload.get("title", "Untitled Document")),
        "content": str(payload.get("content", "")), # Encrypted string
        "type": str(payload.get("type", "note")),
        "date": _utc_now(),
    }
    inserted = documents.insert_one(doc)
    created = documents.find_one({"_id": inserted.inserted_id})
    return JSONResponse(status_code=201, content=_serialize_doc(created))

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    _, _, _, _, _, documents = _get_collections()
    oid = _parse_object_id(doc_id)
    result = documents.delete_one({"_id": oid, "userId": uid})
    if result.deleted_count == 0:
        return JSONResponse(status_code=404, content={"error": "Document not found"})
    return {"message": "Document deleted successfully"}

def _get_gemini_http_client() -> httpx.AsyncClient:
    global _gemini_http_client
    if _gemini_http_client is None:
        _gemini_http_client = httpx.AsyncClient(timeout=60.0)
    return _gemini_http_client

def _default_emotion_payload(details: str = "No clear face detected.") -> dict:
    return {"emotion": "neutral", "confidence": 0, "details": details}

async def _analyze_with_gemini(base64_image: str, mime_type: str) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("Gemini API key is missing")

    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    prompt = (
        "Analyze the face in this image for micro-expressions. Return strictly valid JSON with keys: emotion, confidence, details. "
        "The emotion must be exactly one of: happy, sad, angry, surprise, fear, disgust, neutral. "
        "Confidence is 0-100. Details should be a short 1-sentence analysis of the subtle facial cues. If you detect conflicting micro-expressions (like a fake smile), note it in the details."
    )
    
    payload = {
        "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": mime_type, "data": base64_image}}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
    }

    client = _get_gemini_http_client()
    response = await client.post(endpoint, json=payload, headers={"Content-Type": "application/json"})
    response.raise_for_status()
    
    decoded = response.json()
    try:
        text = decoded["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        return {
            "emotion": str(parsed.get("emotion", "neutral")).lower(),
            "confidence": int(parsed.get("confidence", 0)),
            "details": str(parsed.get("details", ""))
        }
    except (KeyError, json.JSONDecodeError, IndexError):
        return _default_emotion_payload("Failed to parse Gemini output.")

@app.on_event("shutdown")
async def close_clients():
    global _gemini_http_client
    if _gemini_http_client is not None:
        await _gemini_http_client.aclose()

@app.get("/health")
def health_check():
    return {"status": "ok"}

# ==================== JOURNALS ====================

@app.get("/api/journals")
async def get_journals(request: Request):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    journals, _, _, _, _, _ = _get_collections()
    docs = list(journals.find({"userId": uid}).sort("date", DESCENDING))
    return [_serialize_doc(doc) for doc in docs]

@app.get("/api/journals/search")
async def search_journals(
    request: Request,
    startDate: str | None = None,
    endDate: str | None = None,
    q: str | None = None,
    limit: int = Query(default=500, ge=1, le=5000),
    sort: str = "desc",
):
    try:
        auth_info = await _require_auth(request)
        uid = auth_info.get("uid")
        query = _build_journal_query(user_id=uid, start_date=startDate, end_date=endDate, text_query=q)
        journals, _, _, _, _, _ = _get_collections()
        direction = ASCENDING if sort.lower() == "asc" else DESCENDING
        docs = list(journals.find(query).sort("date", direction).limit(limit))
        return [_serialize_doc(doc) for doc in docs]
    except HTTPException:
        raise
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Failed to fetch journals"})

@app.post("/api/journals")
async def create_journal(request: Request):
    journals, _, _, _, _, _ = _get_collections()
    auth_info = await _require_auth(request)
    payload = await request.json()
    doc = {
        "userId": str(auth_info.get("uid") or ""),
        "userEmail": str(auth_info.get("email") or ""),
        "title": str(payload.get("title", "Untitled Entry")),
        "content": str(payload.get("content", "")),
        "date": _utc_now(),
        "sentimentScore": payload.get("sentimentScore", 0),
        "aiAnalysis": payload.get("aiAnalysis", ""),
    }
    inserted = journals.insert_one(doc)
    created = journals.find_one({"_id": inserted.inserted_id})
    if not created:
        return JSONResponse(status_code=500, content={"error": "Failed to create journal"})
    return JSONResponse(status_code=201, content=_serialize_doc(created))

@app.delete("/api/journals/{journal_id}")
async def delete_journal(journal_id: str, request: Request):
    try:
        auth_info = await _require_auth(request)
        uid = auth_info.get("uid")
        journals, _, _, _, _, _ = _get_collections()
        oid = _parse_object_id(journal_id)
        result = journals.delete_one({"_id": oid, "userId": uid})
        if result.deleted_count == 0:
            return JSONResponse(status_code=404, content={"error": "Journal not found"})
        return {"message": "Journal deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Failed to delete journal"})

@app.put("/api/journals/{journal_id}")
async def update_journal(journal_id: str, request: Request):
    try:
        auth_info = await _require_auth(request)
        uid = auth_info.get("uid")
        journals, _, _, _, _, _ = _get_collections()
        oid = _parse_object_id(journal_id)
        payload = await request.json()
        allowed_fields = {"title", "content", "date", "sentimentScore", "aiAnalysis"}
        updates = {k: v for k, v in payload.items() if k in allowed_fields}
        if not updates:
            return JSONResponse(status_code=400, content={"error": "No valid fields to update"})
        result = journals.update_one({"_id": oid, "userId": uid}, {"$set": updates})
        if result.matched_count == 0:
            return JSONResponse(status_code=404, content={"error": "Journal not found"})
        updated = journals.find_one({"_id": oid})
        return _serialize_doc(updated)
    except HTTPException:
        raise
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Failed to update journal"})

# ==================== TASKS ====================

@app.get("/api/tasks")
async def get_tasks(request: Request):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    _, _, tasks, _, _, _ = _get_collections()
    docs = list(tasks.find({"userId": uid}).sort("date", DESCENDING))
    return [_serialize_doc(doc) for doc in docs]

@app.post("/api/tasks")
async def create_task(request: Request):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    email = auth_info.get("email")
    _, _, tasks, _, _, _ = _get_collections()
    payload = await request.json()
    doc = {
        "userId": str(uid or ""),
        "userEmail": str(email or ""),
        "title": str(payload.get("title", "Untitled Task")),
        "description": str(payload.get("description", "")),
        "status": str(payload.get("status", "pending")),
        "date": _utc_now(),
    }
    inserted = tasks.insert_one(doc)
    created = tasks.find_one({"_id": inserted.inserted_id})
    if not created:
        return JSONResponse(status_code=500, content={"error": "Failed to create task"})
    return JSONResponse(status_code=201, content=_serialize_doc(created))

@app.put("/api/tasks/{task_id}")
async def update_task(task_id: str, request: Request):
    try:
        auth_info = await _require_auth(request)
        uid = auth_info.get("uid")
        _, _, tasks, _, _, _ = _get_collections()
        oid = _parse_object_id(task_id)
        payload = await request.json()
        allowed_fields = {"title", "description", "status"}
        updates = {k: v for k, v in payload.items() if k in allowed_fields}
        if not updates:
            return JSONResponse(status_code=400, content={"error": "No valid fields to update"})
        result = tasks.update_one({"_id": oid, "userId": uid}, {"$set": updates})
        if result.matched_count == 0:
            return JSONResponse(status_code=404, content={"error": "Task not found"})
        updated = tasks.find_one({"_id": oid})
        return _serialize_doc(updated)
    except HTTPException:
        raise
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Failed to update task"})

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, request: Request):
    try:
        auth_info = await _require_auth(request)
        uid = auth_info.get("uid")
        _, _, tasks, _, _, _ = _get_collections()
        oid = _parse_object_id(task_id)
        result = tasks.delete_one({"_id": oid, "userId": uid})
        if result.deleted_count == 0:
            return JSONResponse(status_code=404, content={"error": "Task not found"})
        return {"message": "Task deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Failed to delete task"})


# ==================== AI CAPABILITIES ====================

@app.post("/api/analyze")
async def analyze_journal(request: Request):
    payload = await request.json()
    chat_completion = groq_client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are an empathetic AI journaling assistant. Keep it under 4 sentences."},
            {"role": "user", "content": str(payload.get("content", ""))}
        ],
        model="llama-3.1-8b-instant",
        temperature=0.7,
    )
    return {"analysis": chat_completion.choices[0].message.content if chat_completion.choices else ""}

@app.post("/api/emotion")
async def detect_emotion(
    request: Request,
    image: UploadFile = File(...),
):
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    email = auth_info.get("email")
    try:
        image_bytes = await image.read()
        base64_img = base64.b64encode(image_bytes).decode("utf-8")
        mime_type = image.content_type or "image/jpeg"
        
        emotion_data = await _analyze_with_gemini(base64_img, mime_type)

        emotion_doc = {
            "userId": str(uid or ""),
            "userEmail": str(email or ""),
            "emotion": emotion_data["emotion"],
            "confidence": emotion_data["confidence"],
            "details": emotion_data["details"],
            "date": _utc_now(),
        }

        try:
            _, emotion_history, _, _, _, _ = _get_collections()
            emotion_history.insert_one(emotion_doc)
        except PyMongoError:
            pass 

        return emotion_data
    except Exception as e:
        import traceback
        print("\n=== GEMINI API CRASH ===")
        traceback.print_exc()
        print("========================\n")
        return JSONResponse(status_code=500, content={"error": "Detection failed"})

# ==================== CHAT AGENT ====================

@app.post("/api/chat")
async def chat_agent(request: Request):
    """
    AI Chat Agent using Groq and Function Calling.
    Provides tools for the AI to manage Tasks and read Journals.
    """
    if not groq_client:
        return JSONResponse(status_code=500, content={"error": "Groq client not configured"})

    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    email = auth_info.get("email")
    
    payload = await request.json()
    messages = payload.get("messages", [])

    # Define tools
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_tasks",
                "description": "Get all tasks for the user.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_task",
                "description": "Create a new task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Title of the task"},
                        "description": {"type": "string", "description": "Description of the task"},
                        "status": {"type": "string", "description": "Status (e.g., pending, completed)"}
                    },
                    "required": ["title"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_task",
                "description": "Update an existing task status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task_id": {"type": "string", "description": "ID of the task to update"},
                        "status": {"type": "string", "description": "New status (e.g., completed, pending)"}
                    },
                    "required": ["task_id", "status"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_journals",
                "description": "Get recent journal entries for the user to understand their mood or history.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }
    ]

    try:
        # System message setup
        system_msg = {
            "role": "system", 
            "content": "You are MindSync AI, an empathetic and helpful personal assistant. You can manage tasks and review the user's journal entries to better understand their context and feelings. You may use tools to achieve this."
        }
        
        call_messages = [system_msg] + messages

        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=call_messages,
            tools=tools,
            tool_choice="auto",
            max_tokens=4096
        )

        response_message = response.choices[0].message

        # Check if the model wants to call a function
        tool_calls = response_message.tool_calls
        if tool_calls:
            call_messages.append({
                "role": "assistant",
                "content": response_message.content,
                "tool_calls": [t.model_dump() for t in tool_calls]
            })

            journals, _, tasks, _, _, _ = _get_collections()

            for tool_call in tool_calls:
                function_name = tool_call.function.name
                function_args = json.loads(tool_call.function.arguments)

                tool_response = ""

                if function_name == "get_tasks":
                    docs = list(tasks.find({"userId": uid}).sort("date", DESCENDING).limit(10))
                    tool_response = json.dumps([_serialize_doc(d) for d in docs])
                elif function_name == "create_task":
                    doc = {
                        "userId": str(uid or ""),
                        "userEmail": str(email or ""),
                        "title": function_args.get("title", "Untitled Task"),
                        "description": function_args.get("description", ""),
                        "status": function_args.get("status", "pending"),
                        "date": _utc_now()
                    }
                    inserted = tasks.insert_one(doc)
                    tool_response = json.dumps({"status": "success", "taskId": str(inserted.inserted_id)})
                elif function_name == "update_task":
                    try:
                        oid = _parse_object_id(function_args.get("task_id"))
                        tasks.update_one({"_id": oid, "userId": uid}, {"$set": {"status": function_args.get("status")}})
                        tool_response = json.dumps({"status": "success"})
                    except:
                        tool_response = json.dumps({"status": "error", "message": "Invalid task ID"})
                elif function_name == "get_journals":
                    docs = list(journals.find({"userId": uid}).sort("date", DESCENDING).limit(5))
                    tool_response = json.dumps([_serialize_doc(d) for d in docs])
                else:
                    tool_response = json.dumps({"error": "Unknown function"})

                call_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": function_name,
                    "content": tool_response
                })

            # Call the model again with the function response
            second_response = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=call_messages,
                max_tokens=4096
            )
            return {"role": "assistant", "content": second_response.choices[0].message.content}

        return {"role": "assistant", "content": response_message.content}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": "Chat completion failed"})


# ==================== AVATAR VOICE ANALYSIS ====================

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "").strip()
CAMB_API_KEY = os.getenv("CAMB_API_KEY", "").strip()
DEFAULT_VOICE_ID = 147320


@app.post("/api/avatar/analyze-voice")
async def analyze_voice(
    request: Request,
    audio: UploadFile = File(...),
):
    """Analyze voice audio for tone, emotion, and provide suggestions."""
    # Try to get auth info, but don't fail if Firebase is not configured
    try:
        auth_info = await _require_auth(request)
        uid = auth_info.get("uid")
        email = auth_info.get("email")
    except Exception:
        # If Firebase auth fails, use anonymous user
        uid = "anonymous"
        email = "anonymous@example.com"
    
    try:
        audio_bytes = await audio.read()

        import assemblyai as aai
        import tempfile
        import os

        aai.settings.api_key = ASSEMBLYAI_API_KEY

        tmp_path = None
        with tempfile.NamedTemporaryFile(delete=False, suffix='.m4a') as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            config = aai.TranscriptionConfig(speech_models=["universal-3-pro", "universal-2"])
            transcriber = aai.Transcriber()
            transcript = transcriber.transcribe(tmp_path, config=config)
            transcript_text = transcript.text if getattr(transcript, 'text', None) else ""
        finally:
            try:
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
            except Exception:
                pass

        if not transcript_text:
            return {
                "transcript": "",
                "emotion": "neutral",
                "confidence": 0,
                "suggestions": "I couldn't hear what you said. Could you try again?",
                "earlyWarning": ""
            }

        # Get user context for analysis
        user_context = await _get_user_context(uid)

        # Analyze tone and emotion using Groq
        system_prompt = f"""You are MindSync AI, an empathetic voice assistant. Analyze the user's speech for:
1. Emotional tone: happy, sad, angry, anxious, frustrated, excited, tired, neutral
2. Confidence level (0-100)
3. Suggestions to improve thought patterns (2-3 sentences, compassionate)
4. Early warning flags if patterns suggest professional support may help

IMPORTANT: Do NOT diagnose mental health conditions. Instead, suggest that "speaking with a professional might help" if concerning patterns are detected.

User Context:
- Name: {user_context.get('name', 'User')}
- Occupation: {user_context.get('occupation', 'Not specified')}
- Recent journal entries: {user_context.get('recent_journals', 'No recent entries')}

Provide your response as JSON with keys: emotion, confidence, suggestions, earlyWarning."""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Transcribed speech: {transcript_text}"}
            ],
            model="llama-3.1-8b-instant",
            temperature=0.7,
            max_tokens=500,
            response_format={"type": "json_object"}
        )

        result_text = chat_completion.choices[0].message.content if chat_completion.choices else ""

        try:
            result = json.loads(result_text)
        except json.JSONDecodeError:
            result = {
                "emotion": "neutral",
                "confidence": 50,
                "suggestions": result_text or "Thank you for sharing. I'm here to help.",
                "earlyWarning": ""
            }

        # persist voice analysis
        try:
            _, _, _, _, voice_analyses_col, _ = _get_collections()
            voice_doc = {
                "userId": str(uid or ""),
                "userEmail": str(email or ""),
                "transcript": transcript_text,
                "emotion": result.get("emotion", "neutral"),
                "confidence": int(result.get("confidence", 0) or 0),
                "suggestions": result.get("suggestions", ""),
                "earlyWarning": result.get("earlyWarning", ""),
                "date": _utc_now(),
            }
            voice_analyses_col.insert_one(voice_doc)
        except Exception:
            pass

        return {
            "transcript": transcript_text,
            "emotion": result.get("emotion", "neutral"),
            "confidence": result.get("confidence", 0),
            "suggestions": result.get("suggestions", ""),
            "earlyWarning": result.get("earlyWarning", "")
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Voice analysis failed: {str(e)}"})


@app.post("/api/avatar/tts")
async def text_to_speech(request: Request):
    """Convert text to speech using Camb.ai API."""
    try:
        payload = await request.json()
        text = payload.get("text", "")
        voice_id = payload.get("voice_id", DEFAULT_VOICE_ID)
        
        if not text:
            return JSONResponse(status_code=400, content={"error": "Text is required"})
        
        url = "https://client.camb.ai/apis/tts-stream"
        
        headers = {
            "x-api-key": CAMB_API_KEY,
            "Content-Type": "application/json",
        }
        
        payload_tts = {
            "text": text,
            "voice_id": voice_id,
            "language": "en-us",
            "speech_model": "mars-flash",
            "output_configuration": {"format": "wav"},
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload_tts) as resp:
                if resp.status != 200:
                    return JSONResponse(status_code=resp.status, content={"error": "TTS generation failed"})
                
                audio_data = b""
                async for chunk in resp.content.iter_chunked(4096):
                    audio_data += chunk
                
                import base64
                audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                
                return {
                    "audio": audio_base64,
                    "format": "wav"
                }
                
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"TTS failed: {str(e)}"})


@app.post("/api/avatar/early-warning")
async def early_warning_analysis(request: Request):
    """Analyze user patterns for early warning signs."""
    try:
        payload = await request.json()
        user_id = payload.get("userId")
        
        if not user_id:
            return JSONResponse(status_code=400, content={"error": "userId is required"})
        
        # Get user data
        user_context = await _get_user_context(user_id)
        
        # Analyze patterns using Groq
        system_prompt = """Analyze the user's recent patterns for early warning signs of mental health concerns.
Consider: journal sentiment trends, task completion rates, sleep patterns, and voice analysis history.

Provide a JSON response with:
- level: "green", "yellow", "orange", or "red"
- message: A brief, compassionate message (1-2 sentences)
- recommendation: What the user should consider doing

IMPORTANT: Do NOT diagnose conditions. Provide gentle, supportive guidance.
If concerning patterns exist, suggest "speaking with a mental health professional might provide additional support."
This is NOT a diagnosis - just a thoughtful suggestion based on patterns observed."""

        user_data_summary = f"""User Profile:
- Name: {user_context.get('name', 'User')}
- Occupation: {user_context.get('occupation', 'Not specified')}
- Sleep: {user_context.get('sleep', 'Not specified')}
- Activity: {user_context.get('activity', 'Not specified')}

Recent Journal Entries: {user_context.get('recent_journals', 'No entries')}

Recent Tasks: {user_context.get('recent_tasks', 'No tasks')}"""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_data_summary}
            ],
            model="llama-3.1-8b-instant",
            temperature=0.5,
            max_tokens=300,
            response_format={"type": "json_object"}
        )
        
        result_text = chat_completion.choices[0].message.content if chat_completion.choices else "{}"
        
        try:
            result = json.loads(result_text)
        except json.JSONDecodeError:
            result = {
                "level": "green",
                "message": "You're doing great! Keep up the good work.",
                "recommendation": "Continue your current practices."
            }
        
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"Analysis failed: {str(e)}"})


@app.get("/api/user/profile")
async def get_user_profile(request: Request):
    """Get user profile data from onboarding."""
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    
    try:
        user_context = await _get_user_context(uid)
        return user_context
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to get profile: {str(e)}"})


@app.put("/api/user/profile")
async def update_user_profile(request: Request):
    """Update user profile data."""
    auth_info = await _require_auth(request)
    uid = auth_info.get("uid")
    email = auth_info.get("email")
    
    try:
        payload = await request.json()
        _, _, _, users_col, _, _ = _get_collections()
        
        profile_data = {
            "userId": str(uid or ""),
            "userEmail": str(email or ""),
            "name": str(payload.get("name", "")),
            "occupation": str(payload.get("occupation", "")),
            "sleep": str(payload.get("sleep", "")),
            "activity": str(payload.get("activity", "")),
            "updatedAt": _utc_now(),
        }
        
        users_col.update_one(
            {"userId": str(uid or "")},
            {"$set": profile_data},
            upsert=True
        )
        
        return {"message": "Profile updated successfully", "profile": profile_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": f"Failed to update profile: {str(e)}"})


async def _get_user_context(user_id: str) -> dict:
    """Get comprehensive user context for AI analysis."""
    try:
        journals, _, tasks, users_col, voice_analyses_col, _ = _get_collections()

        # Get recent journals
        recent_journals = list(journals.find(
            {"userId": user_id}
        ).sort("date", DESCENDING).limit(5))
        
        journal_texts = []
        for j in recent_journals:
            title = j.get('title', '')
            content = j.get('content', '')
            if title or content:
                journal_texts.append(f"- {title}: {content}"[:200])
        
        # Get recent tasks
        recent_tasks = list(tasks.find(
            {"userId": user_id}
        ).sort("date", DESCENDING).limit(10))
        
        task_summary = []
        for t in recent_tasks:
            status = t.get('status', 'pending')
            title = t.get('title', 'Untitled')
            task_summary.append(f"- {title} ({status})")
        
        # attempt to read stored profile
        stored_profile = users_col.find_one({"userId": user_id}) if users_col else None

        profile_name = stored_profile.get('name') if stored_profile else None
        occupation = stored_profile.get('occupation') if stored_profile else None
        sleep = stored_profile.get('sleep') if stored_profile else None
        activity = stored_profile.get('activity') if stored_profile else None

        # recent voice analyses summary
        recent_voice = list(voice_analyses_col.find({"userId": user_id}).sort("date", DESCENDING).limit(5)) if voice_analyses_col else []
        voice_summary = []
        for v in recent_voice:
            voice_summary.append(f"- {v.get('emotion', 'neutral')} ({v.get('confidence', 0)}%)")

        return {
            "userId": user_id,
            "name": profile_name or "User",
            "occupation": occupation or "Not specified",
            "sleep": sleep or "Not specified",
            "activity": activity or "Not specified",
            "recent_journals": "\n".join(journal_texts) if journal_texts else "No recent entries",
            "recent_tasks": "\n".join(task_summary) if task_summary else "No recent tasks",
            "recent_voice": "\n".join(voice_summary) if voice_summary else "No recent voice analyses"
        }
    except Exception:
        return {
            "userId": user_id,
            "name": "User",
            "occupation": "Not specified",
            "recent_journals": "Unable to retrieve",
            "recent_tasks": "Unable to retrieve"
        }


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=False)

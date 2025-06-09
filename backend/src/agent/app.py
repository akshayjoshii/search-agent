# mypy: disable - error - code = "no-untyped-def,misc"
import pathlib
from fastapi import FastAPI, Request, Response, APIRouter, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
import fastapi.exceptions
from starlette.middleware.sessions import SessionMiddleware
from uuid import UUID


from src.agent.configuration import Configuration
from src.agent.auth import router as auth_router
from src.agent import database # Import the new database module
from src.agent import schemas # Import the new schemas module

# Define the FastAPI app
app = FastAPI()

# Load configuration to get session secret key
# TODO: Replace with a proper dependency injection mechanism if available
config = Configuration.from_runnable_config()

# Add SessionMiddleware
# Note: https_only should ideally be True in production
app.add_middleware(SessionMiddleware, secret_key=config.session_secret_key, https_only=False)

# Mount the auth router
app.include_router(auth_router, prefix="/auth", tags=["Authentication"])

# Call apply_migrations at startup
# This is a simple way for this example; in production, you'd run migrations separately.
database.apply_migrations()


chat_router = APIRouter()

# Dependency to get current user (simplified)
async def get_current_user(request: Request):
    user_info = request.session.get('user')
    if not user_info:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Assuming user_info is a dict with an 'email' or 'sub' field as user_id
    # Adjust this based on how your user_id is stored in the session
    user_id = user_info.get('sub') # 'sub' is a common field for user ID in OIDC
    if not user_id:
        # Fallback or error if user_id isn't found as expected
         user_id = user_info.get('email') # Or try 'email'
    if not user_id:
        raise HTTPException(status_code=500, detail="User ID not found in session")
    return user_id

@chat_router.post("/", response_model=schemas.ChatHistory, status_code=201)
async def create_new_chat(
    chat_create: schemas.ChatHistoryCreate, # We'll actually just use user_id from session
    current_user_id: str = Depends(get_current_user)
):
    # chat_create.user_id can be ignored if we are using current_user_id from session
    chat = database.create_chat(user_id=current_user_id, chat_name=chat_create.chat_name or "New Chat")
    if not chat:
        raise HTTPException(status_code=500, detail="Could not create chat")
    return chat

@chat_router.get("/", response_model=schemas.ChatHistoryList)
async def list_user_chats(current_user_id: str = Depends(get_current_user)):
    chats = database.get_chats_by_user(user_id=current_user_id)
    return {"chats": chats}

@chat_router.put("/{chat_id}", response_model=schemas.ChatHistory)
async def update_existing_chat(
    chat_id: UUID,
    chat_update: schemas.ChatHistoryUpdate,
    current_user_id: str = Depends(get_current_user)
):
    if chat_update.chat_name is None:
         raise HTTPException(status_code=400, detail="Chat name must be provided for update")
    updated_chat = database.update_chat_name(chat_id=chat_id, user_id=current_user_id, new_name=chat_update.chat_name)
    if not updated_chat:
        raise HTTPException(status_code=404, detail="Chat not found or user does not have permission")
    return updated_chat

@chat_router.delete("/{chat_id}", status_code=204)
async def delete_existing_chat(
    chat_id: UUID,
    current_user_id: str = Depends(get_current_user)
):
    success = database.delete_chat(chat_id=chat_id, user_id=current_user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Chat not found or user does not have permission")
    return None # FastAPI handles 204 No Content response

@chat_router.get("/{chat_id}/messages", response_model=schemas.MessageList)
async def list_chat_messages(
    chat_id: UUID, # Ensure UUID is imported from uuid module
    current_user_id: str = Depends(get_current_user)
):
    messages_data = database.get_messages_by_chat_id(chat_id=chat_id, user_id=current_user_id)
    # The messages_data should already be a list of schemas.Message objects
    return schemas.MessageList(messages=messages_data)

app.include_router(chat_router, prefix="/api/chats", tags=["Chat History"])


def create_frontend_router(build_dir="../frontend/dist"):
    """Creates a router to serve the React frontend.

    Args:
        build_dir: Path to the React build directory relative to this file.

    Returns:
        A Starlette application serving the frontend.
    """
    build_path = pathlib.Path(__file__).parent.parent.parent / build_dir
    static_files_path = build_path / "assets"  # Vite uses 'assets' subdir

    if not build_path.is_dir() or not (build_path / "index.html").is_file():
        print(
            f"WARN: Frontend build directory not found or incomplete at {build_path}. Serving frontend will likely fail."
        )
        # Return a dummy router if build isn't ready
        from starlette.routing import Route

        async def dummy_frontend(request):
            return Response(
                "Frontend not built. Run 'npm run build' in the frontend directory.",
                media_type="text/plain",
                status_code=503,
            )

        return Route("/{path:path}", endpoint=dummy_frontend)

    build_dir = pathlib.Path(build_dir)

    react = FastAPI(openapi_url="")
    react.mount(
        "/assets", StaticFiles(directory=static_files_path), name="static_assets"
    )

    @react.get("/{path:path}")
    async def handle_catch_all(request: Request, path: str):
        fp = build_path / path
        if not fp.exists() or not fp.is_file():
            fp = build_path / "index.html"
        return fastapi.responses.FileResponse(fp)

    return react


# Mount the frontend under /app to not conflict with the LangGraph API routes
app.mount(
    "/app",
    create_frontend_router(),
    name="frontend",
)

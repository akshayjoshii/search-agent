from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
from starlette.requests import Request
from starlette.responses import RedirectResponse, JSONResponse
from fastapi import APIRouter, Depends

from src.agent.configuration import Configuration

# Load configuration (assuming it handles environment variables)
# TODO: Replace with a proper dependency injection mechanism if available
config = Configuration.from_runnable_config()

# Create APIRouter instance for auth routes
router = APIRouter()

# Instantiate OAuth from Authlib
oauth = OAuth()

# Register Google OAuth client
oauth.register(
    name='google',
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'},
    client_id=config.google_client_id,
    client_secret=config.google_client_secret,
)

# Define the /login/google route
@router.get('/login/google')
async def login_google(request: Request):
    redirect_uri = request.url_for('auth_callback')
    return await oauth.google.authorize_redirect(request, redirect_uri)

# Define the /auth/google/callback route
@router.get('/google/callback', name='auth_callback')
async def auth_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get('userinfo')
    if userinfo:
        request.session['user'] = dict(userinfo)
    return RedirectResponse(url='/app/') # Or your desired frontend path

# Define a /logout route
@router.get('/logout')
async def logout(request: Request):
    request.session.pop('user', None)
    return RedirectResponse(url='/app/login') # Or your desired frontend path

# Define a /user/me route
@router.get('/user/me')
async def user_me(request: Request):
    user = request.session.get('user')
    if user:
        return user
    return JSONResponse({'error': 'Not authenticated'}, status_code=401)

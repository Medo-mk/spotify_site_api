from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import spotipy
from spotipy.oauth2 import SpotifyOAuth
from urllib.parse import quote
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Spotify Music Dashboard API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Spotify configuration
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI")

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope="user-read-playback-state user-modify-playback-state user-read-private streaming playlist-read-private user-library-read user-read-recently-played user-top-read"
    )

# Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class UserProfile(BaseModel):
    id: str
    display_name: str
    email: Optional[str]
    product: str
    is_premium: bool
    followers: int
    country: str
    images: List[Dict[str, Any]]

class Track(BaseModel):
    id: str
    name: str
    artists: List[Dict[str, Any]]
    album: Dict[str, Any]
    duration_ms: int
    popularity: int
    preview_url: Optional[str]
    external_urls: Dict[str, str]
    uri: str

class Playlist(BaseModel):
    id: str
    name: str
    description: Optional[str]
    public: bool
    collaborative: bool
    tracks: Dict[str, Any]
    images: List[Dict[str, Any]]
    owner: Dict[str, Any]
    external_urls: Dict[str, str]

# Basic routes
@api_router.get("/")
async def root():
    return {"message": "Spotify Music Dashboard API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Spotify Authentication Routes
@api_router.get("/auth/login")
async def spotify_login():
    """Redirect user to Spotify authorization"""
    try:
        sp_oauth = get_spotify_oauth()
        auth_url = sp_oauth.get_authorize_url()
        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Authentication error: {str(e)}")

@api_router.get("/auth/callback")
async def spotify_callback(code: str):
    """Handle Spotify OAuth callback"""
    try:
        sp_oauth = get_spotify_oauth()
        token_info = sp_oauth.get_access_token(code)
        
        # Store user session in database
        user_session = {
            "access_token": token_info["access_token"],
            "refresh_token": token_info["refresh_token"],
            "expires_at": token_info["expires_at"],
            "created_at": datetime.utcnow()
        }
        await db.user_sessions.insert_one(user_session)
        
        return {
            "access_token": token_info["access_token"],
            "refresh_token": token_info["refresh_token"],
            "expires_at": token_info["expires_at"]
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Callback error: {str(e)}")

@api_router.post("/auth/refresh")
async def refresh_token(refresh_token: str):
    """Refresh expired access token"""
    try:
        sp_oauth = get_spotify_oauth()
        token_info = sp_oauth.refresh_access_token(refresh_token)
        return {"access_token": token_info["access_token"]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token refresh error: {str(e)}")

# User Profile Routes
@api_router.get("/user/profile")
async def get_user_profile(access_token: str = Query(...)):
    """Get current user's Spotify profile"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        profile = sp.me()
        
        return UserProfile(
            id=profile["id"],
            display_name=profile.get("display_name", "Unknown"),
            email=profile.get("email"),
            product=profile.get("product", "free"),
            is_premium=profile.get("product") == "premium",
            followers=profile.get("followers", {}).get("total", 0),
            country=profile.get("country", "US"),
            images=profile.get("images", [])
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Profile error: {str(e)}")

# Music Search Routes
@api_router.get("/search")
async def search_tracks(
    q: str = Query(..., description="Search query"),
    type: str = Query("track", description="Search type: track, artist, album, playlist"),
    limit: int = Query(20, description="Number of results"),
    access_token: str = Query(...)
):
    """Search for music content"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        results = sp.search(q, limit=limit, type=type)
        return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search error: {str(e)}")

@api_router.get("/search/recommendations")
async def get_recommendations(
    seed_tracks: Optional[str] = Query(None, description="Comma-separated track IDs"),
    seed_artists: Optional[str] = Query(None, description="Comma-separated artist IDs"),
    seed_genres: Optional[str] = Query(None, description="Comma-separated genres"),
    limit: int = Query(20),
    access_token: str = Query(...)
):
    """Get music recommendations"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        
        # Parse seeds
        track_seeds = seed_tracks.split(",") if seed_tracks else []
        artist_seeds = seed_artists.split(",") if seed_artists else []
        genre_seeds = seed_genres.split(",") if seed_genres else []
        
        recommendations = sp.recommendations(
            seed_tracks=track_seeds[:5],  # Max 5 seeds
            seed_artists=artist_seeds[:5],
            seed_genres=genre_seeds[:5],
            limit=limit
        )
        return recommendations
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Recommendations error: {str(e)}")

# User Library Routes
@api_router.get("/user/playlists")
async def get_user_playlists(
    limit: int = Query(50),
    offset: int = Query(0),
    access_token: str = Query(...)
):
    """Get current user's playlists"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        playlists = sp.current_user_playlists(limit=limit, offset=offset)
        return playlists
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Playlists error: {str(e)}")

@api_router.get("/playlist/{playlist_id}")
async def get_playlist_tracks(
    playlist_id: str,
    access_token: str = Query(...)
):
    """Get tracks from a specific playlist"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        playlist = sp.playlist(playlist_id)
        tracks = sp.playlist_tracks(playlist_id)
        
        return {
            "playlist": playlist,
            "tracks": tracks
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Playlist tracks error: {str(e)}")

@api_router.get("/user/saved-tracks")
async def get_saved_tracks(
    limit: int = Query(50),
    offset: int = Query(0),
    access_token: str = Query(...)
):
    """Get user's saved/liked tracks"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        saved_tracks = sp.current_user_saved_tracks(limit=limit, offset=offset)
        return saved_tracks
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Saved tracks error: {str(e)}")

@api_router.get("/user/top-tracks")
async def get_top_tracks(
    time_range: str = Query("medium_term", description="short_term, medium_term, or long_term"),
    limit: int = Query(20),
    access_token: str = Query(...)
):
    """Get user's top tracks"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        top_tracks = sp.current_user_top_tracks(time_range=time_range, limit=limit)
        return top_tracks
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Top tracks error: {str(e)}")

@api_router.get("/user/top-artists")
async def get_top_artists(
    time_range: str = Query("medium_term"),
    limit: int = Query(20),
    access_token: str = Query(...)
):
    """Get user's top artists"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        top_artists = sp.current_user_top_artists(time_range=time_range, limit=limit)
        return top_artists
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Top artists error: {str(e)}")

@api_router.get("/user/recently-played")
async def get_recently_played(
    limit: int = Query(50),
    access_token: str = Query(...)
):
    """Get user's recently played tracks"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        recent = sp.current_user_recently_played(limit=limit)
        return recent
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Recently played error: {str(e)}")

# Artist and Album Routes
@api_router.get("/artist/{artist_id}")
async def get_artist(
    artist_id: str,
    access_token: str = Query(...)
):
    """Get artist information"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        artist = sp.artist(artist_id)
        albums = sp.artist_albums(artist_id, limit=20)
        top_tracks = sp.artist_top_tracks(artist_id)
        
        return {
            "artist": artist,
            "albums": albums,
            "top_tracks": top_tracks
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Artist error: {str(e)}")

@api_router.get("/album/{album_id}")
async def get_album(
    album_id: str,
    access_token: str = Query(...)
):
    """Get album information and tracks"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        album = sp.album(album_id)
        tracks = sp.album_tracks(album_id)
        
        return {
            "album": album,
            "tracks": tracks
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Album error: {str(e)}")

# Playback Control Routes (Premium only)
@api_router.get("/playback/devices")
async def get_devices(access_token: str = Query(...)):
    """Get available playback devices"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        devices = sp.devices()
        return devices
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Devices error: {str(e)}")

@api_router.get("/playback/state")
async def get_playback_state(access_token: str = Query(...)):
    """Get current playback state"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        state = sp.current_playback()
        return state
    except Exception as e:
        return {"is_playing": False, "device": None, "track": None}

@api_router.post("/playback/play")
async def start_playback(
    track_uri: str,
    position_ms: int = 0,
    device_id: Optional[str] = None,
    access_token: str = Query(...)
):
    """Start playback of a track"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        sp.start_playback(
            device_id=device_id,
            uris=[track_uri],
            position_ms=position_ms
        )
        return {"status": "playing", "position_ms": position_ms}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Playback error: {str(e)}")

@api_router.post("/playback/pause")
async def pause_playback(
    device_id: Optional[str] = None,
    access_token: str = Query(...)
):
    """Pause current playback"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        sp.pause_playback(device_id=device_id)
        return {"status": "paused"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Pause error: {str(e)}")

@api_router.post("/playback/next")
async def next_track(
    device_id: Optional[str] = None,
    access_token: str = Query(...)
):
    """Skip to next track"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        sp.next_track(device_id=device_id)
        return {"status": "skipped"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Next track error: {str(e)}")

@api_router.post("/playback/previous")
async def previous_track(
    device_id: Optional[str] = None,
    access_token: str = Query(...)
):
    """Skip to previous track"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        sp.previous_track(device_id=device_id)
        return {"status": "skipped"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Previous track error: {str(e)}")

# Analytics Routes
@api_router.get("/analytics/listening-stats")
async def get_listening_stats(access_token: str = Query(...)):
    """Get user's listening analytics"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        
        # Get various data for analytics
        top_tracks_short = sp.current_user_top_tracks(time_range="short_term", limit=50)
        top_tracks_medium = sp.current_user_top_tracks(time_range="medium_term", limit=50)
        top_artists_short = sp.current_user_top_artists(time_range="short_term", limit=50)
        top_artists_medium = sp.current_user_top_artists(time_range="medium_term", limit=50)
        recent_tracks = sp.current_user_recently_played(limit=50)
        
        # Calculate basic stats
        total_artists = len(set([artist['id'] for track in top_tracks_medium['items'] for artist in track['artists']]))
        total_genres = len(set([genre for artist in top_artists_medium['items'] for genre in artist['genres']]))
        
        return {
            "top_tracks_short_term": top_tracks_short,
            "top_tracks_medium_term": top_tracks_medium,
            "top_artists_short_term": top_artists_short,
            "top_artists_medium_term": top_artists_medium,
            "recently_played": recent_tracks,
            "stats": {
                "total_unique_artists": total_artists,
                "total_genres": total_genres,
                "tracks_analyzed": len(top_tracks_medium['items']),
                "artists_analyzed": len(top_artists_medium['items'])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Analytics error: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
import React, { useState, useEffect } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Spotify Web Playback SDK
const loadSpotifySDK = () => {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    
    document.body.appendChild(script);
    
    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve(window.Spotify);
    };
  });
};

// Context for managing auth state
const AuthContext = React.createContext();

// Context for managing player state
const PlayerContext = React.createContext();

// Player Provider Component
const PlayerProvider = ({ children }) => {
  const [player, setPlayer] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [deviceId, setDeviceId] = useState(null);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [queue, setQueue] = useState([]);

  const initializePlayer = async (accessToken) => {
    try {
      const spotifySDK = await loadSpotifySDK();
      
      const spotifyPlayer = new spotifySDK.Player({
        name: 'Spotify Music Hub Player',
        getOAuthToken: (cb) => cb(accessToken),
        volume: 0.5,
      });

      // Error handling
      spotifyPlayer.addListener('initialization_error', ({ message }) => {
        console.error('Spotify Player initialization error:', message);
      });

      spotifyPlayer.addListener('authentication_error', ({ message }) => {
        console.error('Spotify Player authentication error:', message);
      });

      spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('Spotify Player account error:', message);
      });

      spotifyPlayer.addListener('playback_error', ({ message }) => {
        console.error('Spotify Player playback error:', message);
      });

      // Playback status updates
      spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;

        setCurrentTrack(state.track_window.current_track);
        setIsPaused(state.paused);
        setPosition(state.position);
        setDuration(state.duration);
        
        // Update queue
        const nextTracks = state.track_window.next_tracks || [];
        const previousTracks = state.track_window.previous_tracks || [];
        setQueue([...previousTracks.reverse(), state.track_window.current_track, ...nextTracks]);
      });

      // Ready
      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('Spotify Player ready with Device ID', device_id);
        setDeviceId(device_id);
        setIsActive(true);
      });

      // Not Ready
      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('Spotify Player has gone offline', device_id);
        setIsActive(false);
      });

      // Connect to the player!
      await spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
      
    } catch (error) {
      console.error('Error initializing Spotify player:', error);
    }
  };

  const play = async () => {
    if (player) {
      await player.resume();
    }
  };

  const pause = async () => {
    if (player) {
      await player.pause();
    }
  };

  const skipToNext = async () => {
    if (player) {
      await player.nextTrack();
    }
  };

  const skipToPrevious = async () => {
    if (player) {
      await player.previousTrack();
    }
  };

  const seek = async (positionMs) => {
    if (player) {
      await player.seek(positionMs);
      setPosition(positionMs);
    }
  };

  const setPlayerVolume = async (vol) => {
    if (player) {
      await player.setVolume(vol);
      setVolume(vol);
    }
  };

  const playTrack = async (trackUri, accessToken) => {
    if (!deviceId || !accessToken) return;
    
    try {
      await fetch(`${API}/playback/play?access_token=${accessToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          track_uri: trackUri,
          device_id: deviceId,
        }),
      });
    } catch (error) {
      console.error('Error playing track:', error);
    }
  };

  const transferPlayback = async (accessToken) => {
    if (!deviceId || !accessToken) return;
    
    try {
      await fetch(`https://api.spotify.com/v1/me/player`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: false,
        }),
      });
    } catch (error) {
      console.error('Error transferring playback:', error);
    }
  };

  return (
    <PlayerContext.Provider value={{
      player,
      isActive,
      isPaused,
      currentTrack,
      position,
      duration,
      volume,
      deviceId,
      isPlayerExpanded,
      setIsPlayerExpanded,
      queue,
      initializePlayer,
      play,
      pause,
      skipToNext,
      skipToPrevious,
      seek,
      setPlayerVolume,
      playTrack,
      transferPlayback,
    }}>
      {children}
    </PlayerContext.Provider>
  );
};

// Custom hook to use player context
const usePlayer = () => {
  const context = React.useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};

// Auth Provider Component
const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { initializePlayer, transferPlayback } = usePlayer();

  useEffect(() => {
    // Check for stored token
    const storedToken = localStorage.getItem('spotify_access_token');
    if (storedToken) {
      setAccessToken(storedToken);
      fetchUserProfile(storedToken);
      initializePlayer(storedToken);
    } else {
      // Check for auth callback
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      if (code) {
        handleAuthCallback(code);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const handleAuthCallback = async (code) => {
    try {
      const response = await fetch(`${API}/auth/callback?code=${code}`);
      const data = await response.json();
      
      if (data.access_token) {
        setAccessToken(data.access_token);
        localStorage.setItem('spotify_access_token', data.access_token);
        localStorage.setItem('spotify_refresh_token', data.refresh_token);
        
        await fetchUserProfile(data.access_token);
        await initializePlayer(data.access_token);
        
        // Transfer playback to web player after short delay
        setTimeout(() => {
          transferPlayback(data.access_token);
        }, 2000);
        
        // Clean up URL
        window.history.replaceState({}, document.title, '/');
      }
    } catch (error) {
      console.error('Auth callback error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch(`${API}/user/profile?access_token=${token}`);
      if (response.ok) {
        const profile = await response.json();
        setUser(profile);
      }
    } catch (error) {
      console.error('Profile fetch error:', error);
    }
  };

  const login = async () => {
    try {
      const response = await fetch(`${API}/auth/login`);
      const data = await response.json();
      window.location.href = data.auth_url;
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
  };

  return (
    <AuthContext.Provider value={{ accessToken, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Bottom Player Bar Component
const BottomPlayerBar = () => {
  const { accessToken } = useAuth();
  const { 
    isActive, 
    isPaused, 
    currentTrack, 
    position, 
    duration, 
    volume,
    isPlayerExpanded,
    setIsPlayerExpanded,
    play, 
    pause, 
    skipToNext, 
    skipToPrevious, 
    seek, 
    setPlayerVolume 
  } = usePlayer();

  const [localPosition, setLocalPosition] = useState(position);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setLocalPosition(position);
    }
  }, [position, isDragging]);

  // Progress update interval
  useEffect(() => {
    if (!isPaused && isActive && !isDragging) {
      const interval = setInterval(() => {
        setLocalPosition(prev => Math.min(prev + 1000, duration));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isPaused, isActive, isDragging, duration]);

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value) => {
    const newPosition = (value / 100) * duration;
    setLocalPosition(newPosition);
    if (!isDragging) {
      seek(newPosition);
    }
  };

  const handleSeekStart = () => {
    setIsDragging(true);
  };

  const handleSeekEnd = () => {
    setIsDragging(false);
    seek(localPosition);
  };

  if (!isActive || !currentTrack) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-50">
      {/* Progress Bar */}
      <div className="w-full bg-gray-700 h-1 cursor-pointer group" 
           onClick={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const x = e.clientX - rect.left;
             const percentage = (x / rect.width) * 100;
             handleSeek(percentage);
           }}>
        <div 
          className="bg-green-500 h-1 transition-all duration-100 group-hover:bg-green-400"
          style={{ width: `${duration > 0 ? (localPosition / duration) * 100 : 0}%` }}
        />
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Track Info */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <img 
              src={currentTrack.album.images[0]?.url} 
              alt={currentTrack.name}
              className="w-14 h-14 rounded-lg object-cover cursor-pointer hover:scale-105 transition-transform"
              onClick={() => setIsPlayerExpanded(!isPlayerExpanded)}
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-white font-medium truncate cursor-pointer hover:underline"
                  onClick={() => setIsPlayerExpanded(!isPlayerExpanded)}>
                {currentTrack.name}
              </h3>
              <p className="text-gray-400 text-sm truncate">
                {currentTrack.artists.map(a => a.name).join(', ')}
              </p>
            </div>
          </div>

          {/* Player Controls */}
          <div className="flex items-center space-x-4">
            <span className="text-xs text-gray-400 w-10 text-right">
              {formatTime(localPosition)}
            </span>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={skipToPrevious}
                className="text-gray-400 hover:text-white transition-colors"
                title="Previous track"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>

              <button
                onClick={isPaused ? play : pause}
                className="bg-green-500 hover:bg-green-600 text-black rounded-full p-2 transition-colors"
                title={isPaused ? 'Play' : 'Pause'}
              >
                {isPaused ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              <button
                onClick={skipToNext}
                className="text-gray-400 hover:text-white transition-colors"
                title="Next track"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414zm6 0a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L14.586 10l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <span className="text-xs text-gray-400 w-10">
              {formatTime(duration)}
            </span>

            {/* Volume Control */}
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.774L4.724 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.724l3.659-3.774a1 1 0 011.617.774zM10 7.22l-1.659 1.711A1 1 0 017.724 9H3v2h4.724a1 1 0 01.617.089L10 12.78V7.22zm4.757-1.757a1 1 0 011.415 0A8 8 0 0118 12a8 8 0 01-1.828 5.123 1 1 0 01-1.415-1.414A6 6 0 0016 12a6 6 0 00-1.243-3.709 1 1 0 010-1.414zM14.5 7.757a1 1 0 011.414 0A4 4 0 0117 12a4 4 0 01-1.086 2.743 1 1 0 11-1.414-1.486A2 2 0 0015 12a2 2 0 00-.5-1.314 1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setPlayerVolume(parseFloat(e.target.value))}
                className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
                }}
              />
            </div>

            {/* Expand Button */}
            <button
              onClick={() => setIsPlayerExpanded(!isPlayerExpanded)}
              className="text-gray-400 hover:text-white transition-colors"
              title={isPlayerExpanded ? 'Minimize player' : 'Expand player'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d={isPlayerExpanded ? "m19 9-7 7-7-7" : "m5 15 7-7 7 7"} />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Expanded Player Component
const ExpandedPlayer = () => {
  const { accessToken } = useAuth();
  const { 
    currentTrack, 
    queue, 
    isPlayerExpanded,
    setIsPlayerExpanded,
    playTrack,
    volume,
    setPlayerVolume,
    play,
    pause,
    isPaused,
    skipToNext,
    skipToPrevious
  } = usePlayer();

  if (!isPlayerExpanded || !currentTrack) {
    return null;
  }

  const currentIndex = queue.findIndex(track => track.id === currentTrack.id);
  const upNext = queue.slice(currentIndex + 1, currentIndex + 6); // Show next 5 tracks

  const handleTrackPlay = async (trackUri) => {
    await playTrack(trackUri, accessToken);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700">
        <h2 className="text-2xl font-bold text-white">Now Playing</h2>
        <button
          onClick={() => setIsPlayerExpanded(false)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Current Track */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-md w-full">
            {/* Album Art */}
            <div className="aspect-square mb-8 relative group">
              <img 
                src={currentTrack.album.images[0]?.url} 
                alt={currentTrack.name}
                className="w-full h-full rounded-2xl shadow-2xl object-cover"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 rounded-2xl flex items-center justify-center">
                <button
                  onClick={isPaused ? play : pause}
                  className="opacity-0 group-hover:opacity-100 bg-green-500 hover:bg-green-600 text-black rounded-full p-4 transition-all duration-300 transform scale-90 hover:scale-100"
                >
                  {isPaused ? (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Track Info */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">{currentTrack.name}</h1>
              <p className="text-xl text-gray-400 mb-4">
                {currentTrack.artists.map(a => a.name).join(', ')}
              </p>
              <p className="text-lg text-gray-500">{currentTrack.album.name}</p>
            </div>

            {/* Large Controls */}
            <div className="flex items-center justify-center space-x-6 mb-8">
              <button
                onClick={skipToPrevious}
                className="text-gray-400 hover:text-white transition-colors"
                title="Previous track"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>

              <button
                onClick={isPaused ? play : pause}
                className="bg-green-500 hover:bg-green-600 text-black rounded-full p-4 transition-all duration-200 transform hover:scale-105"
                title={isPaused ? 'Play' : 'Pause'}
              >
                {isPaused ? (
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </button>

              <button
                onClick={skipToNext}
                className="text-gray-400 hover:text-white transition-colors"
                title="Next track"
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414zm6 0a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L14.586 10l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center space-x-4">
              <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.774L4.724 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.724l3.659-3.774a1 1 0 011.617.774zM10 7.22l-1.659 1.711A1 1 0 017.724 9H3v2h4.724a1 1 0 01.617.089L10 12.78V7.22z" clipRule="evenodd" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setPlayerVolume(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${volume * 100}%, #374151 ${volume * 100}%, #374151 100%)`
                }}
              />
              <span className="text-sm text-gray-400 w-10">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Right Side - Queue */}
        <div className="w-96 border-l border-gray-700 p-6 overflow-y-auto">
          <h3 className="text-xl font-bold text-white mb-6">Up Next</h3>
          
          {upNext.length > 0 ? (
            <div className="space-y-3">
              {upNext.map((track, index) => (
                <div 
                  key={`${track.id}-${index}`}
                  className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer group"
                  onClick={() => handleTrackPlay(track.uri)}
                >
                  <img 
                    src={track.album.images[2]?.url || track.album.images[0]?.url} 
                    alt={track.name}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate group-hover:text-green-400 transition-colors">
                      {track.name}
                    </p>
                    <p className="text-gray-400 text-sm truncate">
                      {track.artists.map(a => a.name).join(', ')}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 mt-12">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <p className="text-lg">No upcoming tracks</p>
              <p className="text-sm">Add songs to your queue or start a playlist</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Login Component
const LoginScreen = () => {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-800 flex items-center justify-center">
      <div className="max-w-md w-full mx-4 p-8 bg-black/50 backdrop-blur-lg rounded-2xl border border-green-500/20">
        <div className="text-center">
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto mb-4 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.062 14.615c-.156.25-.469.328-.719.172-1.969-1.203-4.469-1.484-7.406-.812-.281.062-.562-.125-.625-.406s.125-.562.406-.625c3.25-.75 6.016-.422 8.172.953.25.156.328.469.172.718zm1.031-2.297c-.203.312-.625.406-.937.203-2.25-1.406-5.687-1.812-8.344-1-.312.094-.656-.125-.75-.437s.125-.656.437-.75c3.063-.937 6.937-.484 9.375 1.047.313.203.407.625.204.937zm.094-2.406C14.594 10.547 9.5 10.281 6.281 11.281c-.375.125-.781-.078-.906-.453s.078-.781.453-.906C9.219 9.594 14.844 9.906 18.406 11.719c.344.203.453.656.25 1s-.656.453-1 .25z"/>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Spotify Music Hub</h1>
            <p className="text-green-400">Your personal music discovery & analytics dashboard</p>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center text-sm text-gray-300">
              <svg className="w-4 h-4 mr-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Music search & discovery
            </div>
            <div className="flex items-center text-sm text-gray-300">
              <svg className="w-4 h-4 mr-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Personal music analytics
            </div>
            <div className="flex items-center text-sm text-gray-300">
              <svg className="w-4 h-4 mr-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Playlists & recommendations
            </div>
            <div className="flex items-center text-sm text-gray-300">
              <svg className="w-4 h-4 mr-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Social music sharing
            </div>
          </div>

          <button
            onClick={login}
            className="w-full bg-green-500 hover:bg-green-600 text-black font-semibold py-3 px-6 rounded-full transition-all duration-200 transform hover:scale-105 flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.062 14.615c-.156.25-.469.328-.719.172-1.969-1.203-4.469-1.484-7.406-.812-.281.062-.562-.125-.625-.406s.125-.562.406-.625c3.25-.75 6.016-.422 8.172.953.25.156.328.469.172.718zm1.031-2.297c-.203.312-.625.406-.937.203-2.25-1.406-5.687-1.812-8.344-1-.312.094-.656-.125-.75-.437s.125-.656.437-.75c3.063-.937 6.937-.484 9.375 1.047.313.203.407.625.204.937zm.094-2.406C14.594 10.547 9.5 10.281 6.281 11.281c-.375.125-.781-.078-.906-.453s.078-.781.453-.906C9.219 9.594 14.844 9.906 18.406 11.719c.344.203.453.656.25 1s-.656.453-1 .25z"/>
            </svg>
            Connect with Spotify
          </button>
        </div>
      </div>
    </div>
  );
};

// Search Component
const SearchSection = () => {
  const { accessToken } = useAuth();
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searchType, setSearchType] = useState('track');
  const [loading, setLoading] = useState(false);

  const searchMusic = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(
        `${API}/search?q=${encodeURIComponent(query)}&type=${searchType}&limit=20&access_token=${accessToken}`
      );
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = async (trackUri) => {
    await playTrack(trackUri, accessToken);
  };

  const renderTrackResults = (tracks) => (
    <div className="grid gap-4">
      {tracks.map((track) => (
        <div key={track.id} className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition-colors group">
          <div className="flex items-center space-x-4">
            {track.album.images[0] && (
              <div className="relative">
                <img 
                  src={track.album.images[0].url} 
                  alt={track.name}
                  className="w-16 h-16 rounded-lg object-cover"
                />
                <button
                  onClick={() => handlePlayTrack(track.uri)}
                  className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                  title={`Play ${track.name}`}
                >
                  <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium truncate">{track.name}</h3>
              <p className="text-gray-400 text-sm truncate">
                {track.artists.map(a => a.name).join(', ')}
              </p>
              <p className="text-gray-500 text-xs">{track.album.name}</p>
              <div className="flex items-center mt-2 space-x-4">
                <span className="text-xs text-gray-500">
                  {Math.floor(track.duration_ms / 60000)}:{String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                </span>
                <span className="text-xs text-green-400">♫ {track.popularity}%</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {track.preview_url && (
                <audio controls className="w-32">
                  <source src={track.preview_url} type="audio/mpeg" />
                </audio>
              )}
              <button
                onClick={() => handlePlayTrack(track.uri)}
                className="bg-green-500 hover:bg-green-600 text-black p-2 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                title={`Play ${track.name}`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-gray-900 p-6 rounded-xl">
      <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
        <svg className="w-6 h-6 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Music Discovery
      </h2>
      
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for music, artists, albums..."
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-green-500 focus:ring-1 focus:ring-green-500 focus:outline-none"
            onKeyPress={(e) => e.key === 'Enter' && searchMusic()}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-green-500 focus:outline-none"
          >
            <option value="track">Tracks</option>
            <option value="artist">Artists</option>
            <option value="album">Albums</option>
            <option value="playlist">Playlists</option>
          </select>
          <button
            onClick={searchMusic}
            disabled={loading}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-black font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {results && (
        <div className="mt-6">
          {searchType === 'track' && results.tracks && renderTrackResults(results.tracks.items)}
          {searchType === 'artist' && results.artists && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.artists.items.map((artist) => (
                <div key={artist.id} className="bg-gray-800 p-4 rounded-lg text-center hover:bg-gray-700 transition-colors">
                  {artist.images[0] && (
                    <img 
                      src={artist.images[0].url} 
                      alt={artist.name}
                      className="w-full h-32 object-cover rounded-lg mb-3"
                    />
                  )}
                  <h3 className="text-white font-medium truncate">{artist.name}</h3>
                  <p className="text-green-400 text-sm">{artist.followers.total.toLocaleString()} followers</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Player Section Component
const PlayerSection = () => {
  const { accessToken } = useAuth();
  const { 
    currentTrack, 
    isActive, 
    isPaused,
    queue,
    position,
    duration,
    playTrack 
  } = usePlayer();

  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [userPlaylists, setUserPlaylists] = useState([]);

  useEffect(() => {
    if (accessToken) {
      fetchRecentlyPlayed();
      fetchUserPlaylists();
    }
  }, [accessToken]);

  const fetchRecentlyPlayed = async () => {
    try {
      const response = await fetch(`${API}/user/recently-played?limit=10&access_token=${accessToken}`);
      const data = await response.json();
      setRecentlyPlayed(data.items || []);
    } catch (error) {
      console.error('Error fetching recently played:', error);
    }
  };

  const fetchUserPlaylists = async () => {
    try {
      const response = await fetch(`${API}/user/playlists?limit=10&access_token=${accessToken}`);
      const data = await response.json();
      setUserPlaylists(data.items || []);
    } catch (error) {
      console.error('Error fetching playlists:', error);
    }
  };

  const handlePlayTrack = async (trackUri) => {
    await playTrack(trackUri, accessToken);
  };

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!isActive) {
    return (
      <div className="text-center text-white py-12">
        <div className="max-w-md mx-auto">
          <svg className="w-24 h-24 mx-auto mb-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <h2 className="text-2xl font-bold mb-4">Web Player Not Active</h2>
          <p className="text-gray-400 mb-6">The Spotify Web Player is not currently active. This could be because:</p>
          <ul className="text-left text-gray-400 space-y-2 mb-6">
            <li>• You need a Spotify Premium account</li>
            <li>• The player is still initializing</li>
            <li>• You need to refresh the page</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="bg-green-500 hover:bg-green-600 text-black font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Current Playing Card */}
      {currentTrack && (
        <div className="bg-gradient-to-r from-green-900 via-gray-900 to-green-900 p-6 rounded-xl">
          <h2 className="text-2xl font-bold text-white mb-6">Currently Playing</h2>
          <div className="flex items-center space-x-6">
            <img 
              src={currentTrack.album.images[1]?.url || currentTrack.album.images[0]?.url} 
              alt={currentTrack.name}
              className="w-32 h-32 rounded-xl shadow-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-3xl font-bold text-white mb-2">{currentTrack.name}</h3>
              <p className="text-xl text-green-400 mb-2">
                {currentTrack.artists.map(a => a.name).join(', ')}
              </p>
              <p className="text-lg text-gray-400 mb-4">{currentTrack.album.name}</p>
              
              {/* Progress Info */}
              <div className="flex items-center space-x-4 text-sm text-gray-400">
                <span>{formatTime(position)}</span>
                <span>/</span>
                <span>{formatTime(duration)}</span>
                <span>•</span>
                <span className={`px-2 py-1 rounded ${isPaused ? 'bg-yellow-600 text-black' : 'bg-green-600 text-black'}`}>
                  {isPaused ? 'Paused' : 'Playing'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Queue Section */}
        <div className="bg-gray-900 p-6 rounded-xl">
          <h3 className="text-xl font-bold text-white mb-6">Queue</h3>
          
          {queue.length > 1 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {queue.slice(1, 11).map((track, index) => (
                <div 
                  key={`queue-${track.id}-${index}`}
                  className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer group"
                  onClick={() => handlePlayTrack(track.uri)}
                >
                  <span className="text-gray-400 font-medium w-6">{index + 1}</span>
                  <img 
                    src={track.album.images[2]?.url || track.album.images[0]?.url} 
                    alt={track.name}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate group-hover:text-green-400 transition-colors">
                      {track.name}
                    </p>
                    <p className="text-gray-400 text-sm truncate">
                      {track.artists.map(a => a.name).join(', ')}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13" />
              </svg>
              <p>No tracks in queue</p>
              <p className="text-sm">Start playing music to see your queue</p>
            </div>
          )}
        </div>

        {/* Recently Played Section */}
        <div className="bg-gray-900 p-6 rounded-xl">
          <h3 className="text-xl font-bold text-white mb-6">Recently Played</h3>
          
          {recentlyPlayed.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentlyPlayed.map((item, index) => (
                <div 
                  key={`recent-${item.track.id}-${index}`}
                  className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer group"
                  onClick={() => handlePlayTrack(item.track.uri)}
                >
                  <img 
                    src={item.track.album.images[2]?.url || item.track.album.images[0]?.url} 
                    alt={item.track.name}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate group-hover:text-green-400 transition-colors">
                      {item.track.name}
                    </p>
                    <p className="text-gray-400 text-sm truncate">
                      {item.track.artists.map(a => a.name).join(', ')}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>No recently played tracks</p>
              <p className="text-sm">Your listening history will appear here</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Playlists */}
      <div className="bg-gray-900 p-6 rounded-xl">
        <h3 className="text-xl font-bold text-white mb-6">Your Playlists</h3>
        
        {userPlaylists.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {userPlaylists.map((playlist) => (
              <div key={playlist.id} className="bg-gray-800 p-4 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer group">
                {playlist.images[0] ? (
                  <img 
                    src={playlist.images[0].url} 
                    alt={playlist.name}
                    className="w-full h-24 object-cover rounded-lg mb-3"
                  />
                ) : (
                  <div className="w-full h-24 bg-gray-700 rounded-lg mb-3 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                <h4 className="text-white font-medium truncate group-hover:text-green-400 transition-colors">{playlist.name}</h4>
                <p className="text-gray-400 text-sm">{playlist.tracks.total} tracks</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>No playlists found</p>
            <p className="text-sm">Create playlists in Spotify to see them here</p>
          </div>
        )}
      </div>
    </div>
  );
};
const UserDashboard = () => {
  const { user, accessToken } = useAuth();
  const [topTracks, setTopTracks] = useState([]);
  const [topArtists, setTopArtists] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [timeRange, setTimeRange] = useState('medium_term');

  useEffect(() => {
    if (accessToken) {
      fetchDashboardData();
    }
  }, [accessToken, timeRange]);

  const fetchDashboardData = async () => {
    try {
      const [topTracksRes, topArtistsRes, playlistsRes, recentRes, analyticsRes] = await Promise.all([
        fetch(`${API}/user/top-tracks?time_range=${timeRange}&limit=10&access_token=${accessToken}`),
        fetch(`${API}/user/top-artists?time_range=${timeRange}&limit=8&access_token=${accessToken}`),
        fetch(`${API}/user/playlists?limit=8&access_token=${accessToken}`),
        fetch(`${API}/user/recently-played?limit=10&access_token=${accessToken}`),
        fetch(`${API}/analytics/listening-stats?access_token=${accessToken}`)
      ]);

      const [topTracksData, topArtistsData, playlistsData, recentData, analyticsData] = await Promise.all([
        topTracksRes.json(),
        topArtistsRes.json(),
        playlistsRes.json(),
        recentRes.json(),
        analyticsRes.json()
      ]);

      setTopTracks(topTracksData.items || []);
      setTopArtists(topArtistsData.items || []);
      setPlaylists(playlistsData.items || []);
      setRecentTracks(recentData.items || []);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    }
  };

  return (
    <div className="space-y-8">
      {/* User Profile Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 p-6 rounded-xl text-white">
        <div className="flex items-center space-x-6">
          {user.images && user.images[0] && (
            <img 
              src={user.images[0].url} 
              alt={user.display_name}
              className="w-20 h-20 rounded-full border-4 border-white/20"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold">{user.display_name}</h1>
            <div className="flex items-center space-x-4 mt-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                user.is_premium ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-white'
              }`}>
                {user.is_premium ? 'Premium' : 'Free'}
              </span>
              <span className="text-green-200">{user.followers} followers</span>
              <span className="text-green-200">{user.country}</span>
            </div>
          </div>
        </div>
        
        {/* Analytics Summary */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/20">
            <div className="text-center">
              <div className="text-2xl font-bold">{analytics.stats.total_unique_artists}</div>
              <div className="text-sm text-green-200">Artists</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{analytics.stats.total_genres}</div>
              <div className="text-sm text-green-200">Genres</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{analytics.stats.tracks_analyzed}</div>
              <div className="text-sm text-green-200">Top Tracks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{recentTracks.length}</div>
              <div className="text-sm text-green-200">Recent Plays</div>
            </div>
          </div>
        )}
      </div>

      {/* Time Range Selector */}
      <div className="flex justify-center">
        <div className="bg-gray-800 p-1 rounded-lg">
          {[
            { value: 'short_term', label: '4 Weeks' },
            { value: 'medium_term', label: '6 Months' },
            { value: 'long_term', label: 'All Time' }
          ].map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-4 py-2 rounded-md transition-colors ${
                timeRange === range.value 
                  ? 'bg-green-500 text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Top Tracks */}
        <div className="bg-gray-900 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-white mb-4">Your Top Tracks</h2>
          <div className="space-y-3">
            {topTracks.slice(0, 5).map((track, index) => (
              <div key={track.id} className="flex items-center space-x-3">
                <span className="text-green-400 font-bold text-lg w-6">{index + 1}</span>
                {track.album.images[0] && (
                  <img 
                    src={track.album.images[0].url} 
                    alt={track.name}
                    className="w-12 h-12 rounded-lg"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{track.name}</p>
                  <p className="text-gray-400 text-sm truncate">
                    {track.artists.map(a => a.name).join(', ')}
                  </p>
                </div>
                <div className="text-green-400 text-sm">♫ {track.popularity}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Artists */}
        <div className="bg-gray-900 p-6 rounded-xl">
          <h2 className="text-xl font-bold text-white mb-4">Your Top Artists</h2>
          <div className="space-y-3">
            {topArtists.slice(0, 5).map((artist, index) => (
              <div key={artist.id} className="flex items-center space-x-3">
                <span className="text-green-400 font-bold text-lg w-6">{index + 1}</span>
                {artist.images[0] && (
                  <img 
                    src={artist.images[0].url} 
                    alt={artist.name}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{artist.name}</p>
                  <p className="text-gray-400 text-sm">
                    {artist.followers.total.toLocaleString()} followers
                  </p>
                </div>
                <div className="text-green-400 text-sm">♫ {artist.popularity}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Playlists */}
      <div className="bg-gray-900 p-6 rounded-xl">
        <h2 className="text-xl font-bold text-white mb-4">Your Playlists</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {playlists.slice(0, 6).map((playlist) => (
            <div key={playlist.id} className="bg-gray-800 p-3 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
              {playlist.images[0] && (
                <img 
                  src={playlist.images[0].url} 
                  alt={playlist.name}
                  className="w-full h-24 object-cover rounded-lg mb-2"
                />
              )}
              <h3 className="text-white text-sm font-medium truncate">{playlist.name}</h3>
              <p className="text-gray-400 text-xs">{playlist.tracks.total} tracks</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Main App Component
const SpotifyMusicHub = () => {
  const { user, loading } = useAuth();
  const { currentTrack } = usePlayer();
  const [activeTab, setActiveTab] = useState('dashboard');

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: '🏠' },
    { id: 'search', name: 'Discover', icon: '🔍' },
    { id: 'player', name: 'Player', icon: '🎵' },
    { id: 'analytics', name: 'Analytics', icon: '📊' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading your music...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-black">
      <ExpandedPlayer />
      <BottomPlayerBar />
      {/* Navigation */}
      <nav className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-white">Spotify Hub</h1>
              <div className="flex space-x-1">
                {navigation.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      activeTab === item.id
                        ? 'bg-green-500 text-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-400">Welcome, {user.display_name}</span>
              <button 
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="text-gray-400 hover:text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className={`max-w-7xl mx-auto px-4 py-8 ${currentTrack ? 'pb-24' : ''}`}>
        {activeTab === 'dashboard' && <UserDashboard />}
        {activeTab === 'search' && <SearchSection />}
        {activeTab === 'player' && <PlayerSection />}
        {activeTab === 'analytics' && (
          <div className="text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Advanced Analytics</h2>
            <p>Deep music analytics and insights coming soon!</p>
          </div>
        )}
      </main>
    </div>
  );
};

// Main App with Auth Provider
function App() {
  return (
    <PlayerProvider>
      <AuthProvider>
        <SpotifyMusicHub />
      </AuthProvider>
    </PlayerProvider>
  );
}

export default App;
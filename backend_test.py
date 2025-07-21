#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Spotify Music Hub
Tests all endpoints for functionality, error handling, and response formatting
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://beb5641d-1a45-4e36-8052-d80836d27428.preview.emergentagent.com/api"
MOCK_ACCESS_TOKEN = "mock_spotify_token_for_testing"
INVALID_TOKEN = "invalid_token_123"

class SpotifyAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.results = []
        self.total_tests = 0
        self.passed_tests = 0
        self.failed_tests = 0
        
    def log_result(self, test_name: str, passed: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.total_tests += 1
        if passed:
            self.passed_tests += 1
            status = "✅ PASS"
        else:
            self.failed_tests += 1
            status = "❌ FAIL"
            
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        
        if response_data and not passed:
            result["response_data"] = response_data
            
        self.results.append(result)
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not passed:
            print(f"   Response: {response_data}")
        print()

    def test_basic_connectivity(self):
        """Test basic API connectivity and CORS"""
        print("=== Testing Basic Connectivity ===")
        
        try:
            # Test root endpoint
            response = self.session.get(f"{BASE_URL}/")
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "Spotify Music Dashboard API" in data["message"]:
                    self.log_result("Root endpoint connectivity", True, f"Status: {response.status_code}, Message: {data['message']}")
                else:
                    self.log_result("Root endpoint connectivity", False, f"Unexpected response format", data)
            else:
                self.log_result("Root endpoint connectivity", False, f"Status: {response.status_code}", response.text)
                
            # Test CORS headers
            cors_headers = [
                'access-control-allow-origin',
                'access-control-allow-credentials'
            ]
            
            found_cors = any(header in response.headers for header in cors_headers)
            if found_cors:
                self.log_result("CORS headers present", True, "CORS middleware configured")
            else:
                # Try OPTIONS request to check CORS
                try:
                    options_response = self.session.options(f"{BASE_URL}/", headers={'Origin': 'http://localhost:3000'})
                    if any(header in options_response.headers for header in cors_headers):
                        self.log_result("CORS headers present", True, "CORS middleware configured (via OPTIONS)")
                    else:
                        self.log_result("CORS headers present", False, "No CORS headers found", dict(options_response.headers))
                except:
                    self.log_result("CORS headers present", False, "No CORS headers found", dict(response.headers))
                
        except requests.exceptions.RequestException as e:
            self.log_result("Root endpoint connectivity", False, f"Connection error: {str(e)}")
            self.log_result("CORS headers present", False, "Could not test due to connection error")

    def test_status_endpoints(self):
        """Test status check endpoints"""
        print("=== Testing Status Endpoints ===")
        
        try:
            # Test GET status
            response = self.session.get(f"{BASE_URL}/status")
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("GET status endpoint", True, f"Returned {len(data)} status checks")
                else:
                    self.log_result("GET status endpoint", False, "Response is not a list", data)
            else:
                self.log_result("GET status endpoint", False, f"Status: {response.status_code}", response.text)
                
            # Test POST status
            test_data = {"client_name": "API_Test_Client"}
            response = self.session.post(f"{BASE_URL}/status", json=test_data)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "client_name" in data and data["client_name"] == "API_Test_Client":
                    self.log_result("POST status endpoint", True, f"Created status check with ID: {data['id']}")
                else:
                    self.log_result("POST status endpoint", False, "Invalid response format", data)
            else:
                self.log_result("POST status endpoint", False, f"Status: {response.status_code}", response.text)
                
        except requests.exceptions.RequestException as e:
            self.log_result("Status endpoints", False, f"Connection error: {str(e)}")

    def test_spotify_auth_endpoints(self):
        """Test Spotify authentication endpoints"""
        print("=== Testing Spotify Authentication ===")
        
        try:
            # Test login endpoint
            response = self.session.get(f"{BASE_URL}/auth/login")
            
            if response.status_code == 200:
                data = response.json()
                if "auth_url" in data and "spotify.com" in data["auth_url"]:
                    self.log_result("Spotify login endpoint", True, "Returns valid Spotify auth URL")
                else:
                    self.log_result("Spotify login endpoint", False, "Invalid auth URL format", data)
            else:
                self.log_result("Spotify login endpoint", False, f"Status: {response.status_code}", response.text)
                
            # Test callback endpoint (should fail without proper code)
            response = self.session.get(f"{BASE_URL}/auth/callback?code=invalid_code")
            
            if response.status_code == 400:
                self.log_result("Spotify callback error handling", True, "Properly rejects invalid auth code")
            else:
                self.log_result("Spotify callback error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
            # Test refresh token endpoint
            response = self.session.post(f"{BASE_URL}/auth/refresh?refresh_token=invalid_refresh_token")
            
            if response.status_code == 400:
                self.log_result("Token refresh error handling", True, "Properly rejects invalid refresh token")
            else:
                self.log_result("Token refresh error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
        except requests.exceptions.RequestException as e:
            self.log_result("Spotify auth endpoints", False, f"Connection error: {str(e)}")

    def test_user_endpoints_with_mock_token(self):
        """Test user endpoints with mock token (expect proper error handling)"""
        print("=== Testing User Endpoints (Mock Token) ===")
        
        user_endpoints = [
            ("/user/profile", "User profile"),
            ("/user/playlists", "User playlists"),
            ("/user/saved-tracks", "Saved tracks"),
            ("/user/top-tracks", "Top tracks"),
            ("/user/top-artists", "Top artists"),
            ("/user/recently-played", "Recently played")
        ]
        
        for endpoint, description in user_endpoints:
            try:
                response = self.session.get(f"{BASE_URL}{endpoint}?access_token={MOCK_ACCESS_TOKEN}")
                
                # Should return 401 or 400 for invalid token
                if response.status_code in [400, 401]:
                    self.log_result(f"{description} endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
                else:
                    self.log_result(f"{description} endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                    
            except requests.exceptions.RequestException as e:
                self.log_result(f"{description} endpoint", False, f"Connection error: {str(e)}")

    def test_search_endpoints(self):
        """Test search functionality"""
        print("=== Testing Search Endpoints ===")
        
        try:
            # Test search endpoint with mock token
            response = self.session.get(f"{BASE_URL}/search?q=test&access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code in [400, 401]:
                self.log_result("Search endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
            else:
                self.log_result("Search endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
            # Test search without query parameter
            response = self.session.get(f"{BASE_URL}/search?access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code == 422:  # FastAPI validation error
                self.log_result("Search parameter validation", True, "Properly validates required query parameter")
            else:
                self.log_result("Search parameter validation", False, f"Status: {response.status_code}", response.text)
                
            # Test recommendations endpoint
            response = self.session.get(f"{BASE_URL}/search/recommendations?seed_tracks=test&access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code in [400, 401]:
                self.log_result("Recommendations endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
            else:
                self.log_result("Recommendations endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
        except requests.exceptions.RequestException as e:
            self.log_result("Search endpoints", False, f"Connection error: {str(e)}")

    def test_artist_album_endpoints(self):
        """Test artist and album endpoints"""
        print("=== Testing Artist/Album Endpoints ===")
        
        try:
            # Test artist endpoint
            response = self.session.get(f"{BASE_URL}/artist/test_artist_id?access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code in [400, 401]:
                self.log_result("Artist endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
            else:
                self.log_result("Artist endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
            # Test album endpoint
            response = self.session.get(f"{BASE_URL}/album/test_album_id?access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code in [400, 401]:
                self.log_result("Album endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
            else:
                self.log_result("Album endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
            # Test playlist endpoint
            response = self.session.get(f"{BASE_URL}/playlist/test_playlist_id?access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code in [400, 401]:
                self.log_result("Playlist endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
            else:
                self.log_result("Playlist endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
        except requests.exceptions.RequestException as e:
            self.log_result("Artist/Album endpoints", False, f"Connection error: {str(e)}")

    def test_playback_endpoints(self):
        """Test playback control endpoints"""
        print("=== Testing Playback Control Endpoints ===")
        
        playback_endpoints = [
            ("GET", "/playback/devices", "Get devices"),
            ("GET", "/playback/state", "Get playback state"),
            ("POST", "/playback/play?track_uri=spotify:track:test", "Start playback"),
            ("POST", "/playback/pause", "Pause playback"),
            ("POST", "/playback/next", "Next track"),
            ("POST", "/playback/previous", "Previous track")
        ]
        
        for method, endpoint, description in playback_endpoints:
            try:
                if method == "GET":
                    response = self.session.get(f"{BASE_URL}{endpoint}?access_token={MOCK_ACCESS_TOKEN}")
                else:
                    # For POST endpoints, add access_token as query parameter
                    if "?" in endpoint:
                        response = self.session.post(f"{BASE_URL}{endpoint}&access_token={MOCK_ACCESS_TOKEN}")
                    else:
                        response = self.session.post(f"{BASE_URL}{endpoint}?access_token={MOCK_ACCESS_TOKEN}")
                
                # Most should return 400/401 for invalid token, but playback state might return empty state
                if endpoint == "/playback/state" and response.status_code == 200:
                    data = response.json()
                    if "is_playing" in data:
                        self.log_result(f"{description} endpoint", True, "Returns default playback state for invalid token")
                    else:
                        self.log_result(f"{description} endpoint", False, "Invalid response format", data)
                elif response.status_code in [400, 401]:
                    self.log_result(f"{description} endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
                else:
                    self.log_result(f"{description} endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                    
            except requests.exceptions.RequestException as e:
                self.log_result(f"{description} endpoint", False, f"Connection error: {str(e)}")

    def test_analytics_endpoints(self):
        """Test analytics endpoints"""
        print("=== Testing Analytics Endpoints ===")
        
        try:
            response = self.session.get(f"{BASE_URL}/analytics/listening-stats?access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code in [400, 401]:
                self.log_result("Analytics endpoint error handling", True, f"Properly handles invalid token (Status: {response.status_code})")
            else:
                self.log_result("Analytics endpoint error handling", False, f"Unexpected status: {response.status_code}", response.text)
                
        except requests.exceptions.RequestException as e:
            self.log_result("Analytics endpoint", False, f"Connection error: {str(e)}")

    def test_parameter_validation(self):
        """Test parameter validation"""
        print("=== Testing Parameter Validation ===")
        
        try:
            # Test missing access_token parameter
            response = self.session.get(f"{BASE_URL}/user/profile")
            
            if response.status_code == 422:  # FastAPI validation error
                self.log_result("Missing access_token validation", True, "Properly validates required access_token parameter")
            else:
                self.log_result("Missing access_token validation", False, f"Status: {response.status_code}", response.text)
                
            # Test invalid limit parameter
            response = self.session.get(f"{BASE_URL}/search?q=test&limit=invalid&access_token={MOCK_ACCESS_TOKEN}")
            
            if response.status_code == 422:
                self.log_result("Invalid parameter type validation", True, "Properly validates parameter types")
            else:
                self.log_result("Invalid parameter type validation", False, f"Status: {response.status_code}", response.text)
                
        except requests.exceptions.RequestException as e:
            self.log_result("Parameter validation", False, f"Connection error: {str(e)}")

    def run_all_tests(self):
        """Run all test suites"""
        print(f"Starting comprehensive backend API testing for: {BASE_URL}")
        print("=" * 80)
        
        # Run all test suites
        self.test_basic_connectivity()
        self.test_status_endpoints()
        self.test_spotify_auth_endpoints()
        self.test_user_endpoints_with_mock_token()
        self.test_search_endpoints()
        self.test_artist_album_endpoints()
        self.test_playback_endpoints()
        self.test_analytics_endpoints()
        self.test_parameter_validation()
        
        # Print summary
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total Tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.failed_tests}")
        print(f"Success Rate: {(self.passed_tests/self.total_tests)*100:.1f}%")
        
        if self.failed_tests > 0:
            print("\nFAILED TESTS:")
            for result in self.results:
                if "❌" in result["status"]:
                    print(f"- {result['test']}: {result['details']}")
        
        print("\n" + "=" * 80)
        return self.failed_tests == 0

if __name__ == "__main__":
    tester = SpotifyAPITester()
    success = tester.run_all_tests()
    
    if not success:
        sys.exit(1)
    else:
        print("All tests passed! ✅")
        sys.exit(0)
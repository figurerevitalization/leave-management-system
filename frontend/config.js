// Set this to your deployed backend URL (no trailing slash), e.g. https://leave-api.onrender.com
window.API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:5000'
  : 'https://YOUR-BACKEND.onrender.com';

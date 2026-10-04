# USD 2.0 Admin Panel

React/Vite administrative interface for USD 2.0.

## Development

```bash
npm install
npm run dev
```

By default the UI uses `http://localhost:3000` as the API and runs on `http://localhost:5173`.

Set `VITE_API_URL` when the API is hosted elsewhere.

Authentication keeps the short-lived access token in memory and uses the backend HttpOnly refresh cookie. The browser client never stores the refresh token in localStorage/sessionStorage.

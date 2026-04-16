const { getToken, saveToken, clearToken, getPrefs } = require('../utils/storage');

class AuthAPI {
  constructor() {
    this.token = null;
    this.user = null;
  }

  async init() {
    this.token = await getToken();
    if (this.token) {
      try {
        this.user = await this.getMe();
      } catch (e) {
        // Token expired or invalid
        this.token = null;
        await clearToken();
      }
    }
    return !!this.token;
  }

  async login(email, password) {
    const prefs = await getPrefs();
    const res = await fetch(`${prefs.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, source: 'plugin' })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Login failed');
    }

    const data = await res.json();
    this.token = data.token;
    await saveToken(this.token);

    this.user = data.user || { email };
    return this.user;
  }

  async getMe() {
    const prefs = await getPrefs();
    // Try validate-session first, fall back to just using the stored token
    try {
      const res = await fetch(`${prefs.apiUrl}/auth/validate-session`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        const data = await res.json();
        return data.user || data;
      }
    } catch (e) {}

    // If validate-session fails, the JWT may still be valid (stateless)
    // Try a lightweight workflow call to verify
    try {
      const res = await fetch(`${prefs.apiUrl}/workflow/user-preferences`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) return { email: 'Connected' };
    } catch (e) {}

    throw new Error('Session invalid');
  }

  async logout() {
    this.token = null;
    this.user = null;
    await clearToken();
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }
}

module.exports = new AuthAPI();

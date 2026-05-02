module.exports = {
  slug: 'integrity-failure',
  name: "Operation: Pandora's Box",
  summary:
    "ShopLab trusts what you send it - even when it shouldn't. A theme preference cookie holds more than just display settings. The VIP Dashboard is waiting. Can you get in?",
  description:
    "ShopLab lets logged-in users set their storefront theme (dark or light). " +
    "This preference is saved as a cookie called shoplab_prefs so it persists across sessions. " +
    "Convenient - but the server made a critical mistake.\n\n" +
    "When the server serialises the preference data into the cookie, it also embeds your membership tier. " +
    "On every subsequent request, instead of checking your tier from a trusted source, " +
    "it reads it straight back from the cookie - a value the client controls entirely.\n\n" +
    "There is a VIP Dashboard in the navigation bar. It is marked as premium-only. " +
    "Right now it shows you an Access Denied page. " +
    "Your objective: find the shoplab_prefs cookie, decode its contents, forge a new version that claims VIP tier, " +
    "and revisit the VIP Dashboard to claim the flag.",
  category: 'APP08:2025 Software or Data Integrity Failures',
  difficulty: 'hard',
  flag: 'SHOPLAB{pr3fs_s3r14l1z4t10n_t4mp3r}',
  learningObjectives: [
    'Understand why serialised state stored on the client must never be trusted without integrity verification',
    'Recognise Base64-encoded JSON as an easily tampered data format',
    'Distinguish between authentication (who you are) and authorisation (what tier/privileges the server grants you)',
    'Learn that embedding privilege data in client-controlled storage is a critical design flaw',
    'Apply the fix: HMAC-sign any server-issued blob, or keep authoritative state server-side only',
  ],
  hints: [
    {
      level: 1,
      hint:
        "The server saves your theme preference in a cookie. Try toggling the theme using the Sun/Moon icon in the top navigation bar. " +
        "Then open DevTools -> Application -> Cookies and look for a cookie called shoplab_prefs. What does its value look like?",
    },
    {
      level: 2,
      hint:
        "The shoplab_prefs cookie value is a Base64-encoded string. " +
        "Decode it in the browser console with: atob(document.cookie.split('shoplab_prefs=')[1]). " +
        "What JSON fields do you see inside? Pay close attention to every field - not just theme.",
    },
    {
      level: 3,
      hint:
        "Inside the decoded JSON you will find a field that has nothing to do with display preferences. " +
        "It describes your membership tier - something that should only ever be controlled server-side. " +
        "The VIP Dashboard reads exactly this field from the cookie to decide whether to grant access.",
    },
    {
      level: 4,
      hint:
        "Modify that sensitive field in the JSON object, then re-encode it: " +
        "btoa(JSON.stringify({ theme: 'dark', tier: '...', userId: ... })). " +
        "Go to DevTools -> Application -> Cookies, double-click the shoplab_prefs value, paste your new Base64 string, and press Enter.",
    },
    {
      level: 5,
      hint:
        "With the forged cookie in place, click the VIP button in the navigation bar - or navigate to /vip directly. " +
        "The page automatically checks your shoplab_prefs cookie on load. " +
        "If the server accepts your forged tier, the flag will appear. Use the Re-check Access button if you have already visited the page.",
    },
  ],
  surface: null,
};

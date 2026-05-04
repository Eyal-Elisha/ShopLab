async function subscribe(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // VULNERABILITY: If email is an object {}, this call to .toLowerCase()
    // will throw a "TypeError: email.toLowerCase is not a function"
    const normalizedEmail = email.toLowerCase();

    // In a real app, we would save to DB here
    res.json({
      message: `Successfully subscribed ${normalizedEmail} to our newsletter!`,
      status: 'success'
    });
  } catch (err) {
    // ANTI-PATTERN: Returning internal state and stack traces to the client
    // This is the core of the A10:2025 Mishandling of Exceptional Conditions vulnerability
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      stack: err.stack,
      debug_context: {
        node_env: process.env.NODE_ENV || 'development',
        internal_version: 'v1.4.2-beta',
        system_debug_flag: 'SHOPLAB{v3rb0s3_3rr0r_l3ak_410}'
      }
    });
  }
}

module.exports = {
  subscribe
};

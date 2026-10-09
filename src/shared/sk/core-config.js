/* ------------------------------------------------------------------
 * Seat Tracker - built-in configuration
 *
 * The publishable key is public by design: it only lets a signed-in team
 * member reach the data (see supabase/schema.sql). Never put the secret /
 * service_role key or the database password here.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};

  SK.config = {
    supabaseUrl: 'https://mqnukcyvjvifvgunhtpf.supabase.co',
    supabaseKey: 'sb_publishable_bm369-eDnGno1gvbKyONRQ_mTYQdPa3',
    version: '3.0.0'
  };

  if (typeof module === 'object' && module.exports) module.exports = SK;
})(globalThis);

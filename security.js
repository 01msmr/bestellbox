// Sicherheits-Header für alle Antworten (Seiten und API); Einbetten nur für die angegebenen Ursprünge
export function securityHeaders(requested = []) {
  const frameAncestors = requested.filter((o) => /^https?:\/\/[\w.-]+(:\d+)?$/.test(o)); // nur reine Ursprünge, keine weiteren Direktiven
  const embed = frameAncestors.length > 0;
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...(embed ? {} : { 'x-frame-options': 'DENY' }),
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", // Inline-Styles der Oberfläche (style-Attribute)
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      `frame-ancestors ${embed ? frameAncestors.join(' ') : "'none'"}`,
    ].join('; '),
  };
}

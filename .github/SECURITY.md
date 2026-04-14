# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please report it responsibly by emailing mail@0xarchit.is-a.dev instead of using the public issue tracker.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We take security seriously and will respond promptly.

## Security Best Practices

This project implements:

- **JWT Authentication**: Secure token-based authentication
- **Encryption**: AES-256-GCM encryption for sensitive data
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization
- **CSRF Protection**: State tokens for OAuth flows
- **Rate Limiting**: Request throttling via Upstash
- **HTTPS**: Enforced in production
- **Secure Headers**: CSP, HSTS, X-Frame-Options

## Dependency Security

- Dependencies are regularly audited
- Known vulnerabilities are addressed promptly
- Use `bun audit` to check for vulnerabilities

## Responsible Disclosure

We follow responsible disclosure practices:
- Vulnerabilities are addressed before public disclosure
- Security patches are released as priority updates
- Credits given to security researchers (with permission)
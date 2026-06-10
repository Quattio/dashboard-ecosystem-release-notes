import { jwtVerify } from "jose";

interface Env {
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  APP_NAME?: string;
}

function getLoginPageHTML(googleClientId: string, appName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName} - Login</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="apple-touch-icon" href="/favicon.png" />
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .login-container {
      background: white;
      padding: 48px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #333;
    }
    p {
      color: #666;
      margin: 0 0 24px 0;
    }
    .error {
      color: #d93025;
      margin-top: 16px;
      font-size: 14px;
    }
    #g_id_onload, .g_id_signin {
      display: flex;
      justify-content: center;
    }
  </style>
  <script src="https://accounts.google.com/gsi/client" async></script>
  <script>
    async function handleCredentialResponse(response) {
      const errorDiv = document.getElementById('error');
      try {
        errorDiv.textContent = 'Signing in...';
        errorDiv.style.color = '#666';

        const res = await fetch('/api/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
          credentials: 'include'
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Login failed');
        }

        const urlParams = new URLSearchParams(window.location.search);
        const returnUrl = urlParams.get('returnUrl');
        window.location.href = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
      } catch (error) {
        console.error('Login error:', error);
        errorDiv.style.color = '#d93025';
        errorDiv.textContent = error.message || 'Login failed. Please try again.';
      }
    }

    window.onload = function () {
      google.accounts.id.initialize({
        client_id: '${googleClientId}',
        callback: handleCredentialResponse,
        auto_select: true,
      });
      google.accounts.id.renderButton(
        document.getElementById('g_id_signin'),
        { theme: 'outline', size: 'large', width: 300, text: 'signin_with' }
      );
      google.accounts.id.prompt();
    };
  </script>
</head>
<body>
  <div class="login-container">
    <h1>${appName}</h1>
    <p>Sign in with your Quatt account to continue</p>
    <div id="g_id_signin"></div>
    <div id="error" class="error"></div>
  </div>
</body>
</html>
`;
}

const PUBLIC_PATHS = [
  "/favicon.ico",
  "/favicon.png",
  "/manifest.json",
  "/robots.txt",
];

function isValidReturnUrl(url: string): boolean {
  if (!url) return false;
  if (!url.startsWith("/") || url.startsWith("//")) return false;
  if (url.includes("..")) return false;
  if (url.length > 2048) return false;

  try {
    const parsed = new URL(url, "https://dummy.example.com");
    if (parsed.origin !== "https://dummy.example.com") return false;
    const pathWithQuery = url.split("#")[0];
    if (parsed.pathname !== pathWithQuery.split("?")[0]) return false;
    return true;
  } catch {
    return false;
  }
}

function createLoginRedirectUrl(
  request: Request,
  currentPath: string,
  search: string,
): URL {
  const loginUrl = new URL("/", request.url);
  const returnUrl = currentPath + search;
  if (isValidReturnUrl(returnUrl)) {
    loginUrl.searchParams.set("returnUrl", returnUrl);
  }
  return loginUrl;
}

async function verifySessionToken(sessionToken: string, sessionSecret: string) {
  try {
    const secret = new TextEncoder().encode(sessionSecret);
    const { payload } = await jwtVerify(sessionToken, secret, {
      issuer: "quatt-internal-tool",
      audience: "quatt-internal-tool",
    });
    return payload;
  } catch (error) {
    console.error("Session verification error:", error);
    return null;
  }
}

function getSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith("session="));

  if (!sessionCookie) return null;
  return sessionCookie.split("=")[1];
}

export const onRequest = async (context: {
  request: Request;
  next: () => Promise<Response>;
  env: Env;
}) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  if (PUBLIC_PATHS.includes(url.pathname)) {
    return next();
  }

  if (url.pathname === "/api/create-session") {
    return next();
  }

  const googleClientId = env.GOOGLE_CLIENT_ID as string | undefined;

  if (!googleClientId) {
    console.error("GOOGLE_CLIENT_ID not configured");
    return new Response(
      "Server configuration error: GOOGLE_CLIENT_ID not set. Please add it to Cloudflare environment variables.",
      { status: 500, headers: { "Content-Type": "text/plain" } },
    );
  }

  const sessionCookie = getSessionCookie(request);
  const appName = (env.APP_NAME as string | undefined) || "Quatt Internal Tool";

  if (!sessionCookie) {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(getLoginPageHTML(googleClientId, appName), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }

    const loginUrl = createLoginRedirectUrl(request, url.pathname, url.search);
    return Response.redirect(loginUrl, 303);
  }

  const sessionSecret = env.SESSION_SECRET as string | undefined;

  if (!sessionSecret) {
    console.error("SESSION_SECRET not configured");
    return new Response("Server configuration error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const payload = await verifySessionToken(sessionCookie, sessionSecret);

  if (!payload) {
    const headers = new Headers();
    headers.set(
      "Set-Cookie",
      "session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict",
    );

    if (url.pathname === "/" || url.pathname === "/index.html") {
      headers.set("Content-Type", "text/html");
      return new Response(getLoginPageHTML(googleClientId, appName), {
        status: 200,
        headers,
      });
    }

    const loginUrl = createLoginRedirectUrl(request, url.pathname, url.search);
    headers.set("Location", loginUrl.toString());
    return new Response(null, { status: 303, headers });
  }

  return next();
};

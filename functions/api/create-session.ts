import { jwtVerify, SignJWT } from "jose";

// Google's public keys for verifying ID tokens
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

interface SessionRequest {
  credential: string;
}

interface Env {
  GOOGLE_CLIENT_ID: string;
  SESSION_SECRET: string;
  ALLOWED_EMAIL_DOMAIN?: string;
}

async function getGooglePublicKeys(): Promise<any> {
  const response = await fetch(GOOGLE_JWKS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }
  return response.json();
}

async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
): Promise<{ payload?: any; error?: any }> {
  try {
    const tokenParts = credential.split(".");
    if (tokenParts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const header = JSON.parse(atob(tokenParts[0]));
    const kid = header.kid;

    if (!kid) {
      throw new Error("Token header missing kid");
    }

    const jwks = await getGooglePublicKeys();
    const key = jwks.keys.find((k: any) => k.kid === kid);

    if (!key) {
      throw new Error(`No matching key found for kid: ${kid}`);
    }

    const { payload } = await jwtVerify(credential, key, {
      issuer: "https://accounts.google.com",
      audience: clientId,
    });

    return { payload };
  } catch (error) {
    console.error("Token verification failed:", error);
    return {
      error: {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function createSessionToken(
  sub: string,
  email: string | undefined,
  name: string | undefined,
  picture: string | undefined,
  sessionSecret: string,
) {
  const secret = new TextEncoder().encode(sessionSecret);

  return new SignJWT({
    sub,
    email,
    name,
    picture,
    type: "session",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("quatt-internal-tool")
    .setAudience("quatt-internal-tool")
    .setExpirationTime("14d")
    .sign(secret);
}

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}) => {
  const { request, env } = context;

  try {
    const body = (await request.json()) as SessionRequest;
    const { credential } = body;

    if (!credential) {
      return new Response(JSON.stringify({ error: "Missing credential" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const clientId = env.GOOGLE_CLIENT_ID as string | undefined;
    const sessionSecret = env.SESSION_SECRET as string | undefined;

    if (!clientId || !sessionSecret) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await verifyGoogleIdToken(credential, clientId);

    if (result.error) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired Google token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const payload = result.payload;
    if (!payload || !payload.sub) {
      return new Response(
        JSON.stringify({ error: "Invalid token payload" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check email domain restriction
    const allowedDomain = (env.ALLOWED_EMAIL_DOMAIN as string | undefined) || "@quatt.io";
    if (!payload.email?.endsWith(allowedDomain)) {
      return new Response(
        JSON.stringify({
          error: `Access restricted to ${allowedDomain} accounts`,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const sessionToken = await createSessionToken(
      payload.sub,
      payload.email,
      payload.name,
      payload.picture,
      sessionSecret,
    );

    const isProduction = request.url.startsWith("https://");
    const expiresIn = 60 * 60 * 24 * 14; // 14 days
    const cookieOptions = [
      `session=${sessionToken}`,
      "Path=/",
      `Max-Age=${expiresIn}`,
      ...(isProduction ? ["HttpOnly", "Secure"] : []),
      "SameSite=Lax",
    ].join("; ");

    return new Response(
      JSON.stringify({
        success: true,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieOptions,
        },
      },
    );
  } catch (error) {
    console.error("Error creating session:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create session" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

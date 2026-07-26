import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  typ: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  sid: string;
  typ: "refresh";
};

/** Portal access JWT — `sub` is the client email, not a staff user id. */
export type PortalAccessTokenPayload = {
  sub: string;
  sid: string;
  typ: "portal_access";
};

export type PortalRefreshTokenPayload = {
  sub: string;
  sid: string;
  typ: "portal_refresh";
};

export function signAccessToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { sub: userId, sid: sessionId, typ: "access" } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export function signRefreshToken(userId: string, sessionId: string): string {
  return jwt.sign(
    { sub: userId, sid: sessionId, typ: "refresh" } satisfies RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (payload.typ !== "access") throw new Error("Invalid token type");
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (payload.typ !== "refresh") throw new Error("Invalid token type");
  return payload;
}

export function signPortalAccessToken(email: string, sessionId: string): string {
  return jwt.sign(
    {
      sub: email.toLowerCase().trim(),
      sid: sessionId,
      typ: "portal_access",
    } satisfies PortalAccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export function signPortalRefreshToken(email: string, sessionId: string): string {
  return jwt.sign(
    {
      sub: email.toLowerCase().trim(),
      sid: sessionId,
      typ: "portal_refresh",
    } satisfies PortalRefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"] },
  );
}

export function verifyPortalAccessToken(token: string): PortalAccessTokenPayload {
  const payload = jwt.verify(
    token,
    env.JWT_ACCESS_SECRET,
  ) as PortalAccessTokenPayload;
  if (payload.typ !== "portal_access") throw new Error("Invalid token type");
  return payload;
}

export function verifyPortalRefreshToken(
  token: string,
): PortalRefreshTokenPayload {
  const payload = jwt.verify(
    token,
    env.JWT_REFRESH_SECRET,
  ) as PortalRefreshTokenPayload;
  if (payload.typ !== "portal_refresh") throw new Error("Invalid token type");
  return payload;
}

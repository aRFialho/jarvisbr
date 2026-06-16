import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser, DeviceTokenPayload } from "../types.js";

export function signUserToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyUserToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
  return {
    id: String(payload.sub),
    email: String(payload.email),
    name: String(payload.name)
  };
}

export function signDeviceToken(payload: DeviceTokenPayload) {
  return jwt.sign(payload, env.deviceTokenSecret, { expiresIn: "30d", subject: payload.deviceId });
}

export function verifyDeviceToken(token: string): DeviceTokenPayload {
  const payload = jwt.verify(token, env.deviceTokenSecret) as jwt.JwtPayload;
  return {
    userId: String(payload.userId),
    deviceId: String(payload.deviceId ?? payload.sub),
    friendlyName: String(payload.friendlyName)
  };
}

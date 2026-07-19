import type { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.register(req.body, req, res);
    return sendSuccess(res, data, 201);
  } catch (err) {
    return next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.login(req.body, req, res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.refresh(req, res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.logout(req, res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.logoutAll(String(req.user!._id), res);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await authService.forgotPassword(req.body.email);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await authService.resetPassword(
      req.body.token,
      req.body.password,
    );
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await authService.verifyEmail(req.body.token);
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

export async function resendVerification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const data = await authService.resendVerification(
      String(req.user!._id),
      req.user!.email,
    );
    return sendSuccess(res, data);
  } catch (err) {
    return next(err);
  }
}

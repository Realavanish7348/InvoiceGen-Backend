import { Router } from "express";
import rateLimit from "express-rate-limit";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import * as controller from "./auth.controller.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "./auth.schema.js";

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests",
    },
  },
});

export const authRouter = Router();

authRouter.use(authLimiter);

authRouter.post(
  "/register",
  validate({ body: registerSchema }),
  controller.register,
);
authRouter.post("/login", validate({ body: loginSchema }), controller.login);
authRouter.post("/refresh", controller.refresh);
authRouter.post("/logout", controller.logout);
authRouter.post("/logout-all", requireAuth, controller.logoutAll);
authRouter.post(
  "/forgot-password",
  validate({ body: forgotPasswordSchema }),
  controller.forgotPassword,
);
authRouter.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  controller.resetPassword,
);
authRouter.post(
  "/verify-email",
  validate({ body: verifyEmailSchema }),
  controller.verifyEmail,
);
authRouter.post("/resend-verification", requireAuth, controller.resendVerification);

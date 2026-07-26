import type { Types } from "mongoose";

export type AuthUser = {
  _id: Types.ObjectId;
  email: string;
  name: string;
  activeCompanyId: Types.ObjectId;
  emailVerifiedAt?: Date | null;
};

export type PortalAuth = {
  email: string;
  sessionId: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      portal?: PortalAuth;
      companyId?: string;
      membershipRole?: string;
      requestId?: string;
    }
  }
}

export {};

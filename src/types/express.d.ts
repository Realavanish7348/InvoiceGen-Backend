import type { Types } from "mongoose";

export type AuthUser = {
  _id: Types.ObjectId;
  email: string;
  name: string;
  activeCompanyId: Types.ObjectId;
  emailVerifiedAt?: Date | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      companyId?: string;
      membershipRole?: string;
      requestId?: string;
    }
  }
}

export {};

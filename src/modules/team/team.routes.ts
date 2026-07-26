import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { requireRole, type MembershipRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  createWorkspaceSchema,
  invitationTokenQuerySchema,
  updateMemberRoleSchema,
} from "./team.schema.js";
import * as teamService from "./team.service.js";

async function listWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(
      res,
      await teamService.listWorkspaces(String(req.user!._id)),
    );
  } catch (err) {
    return next(err);
  }
}

async function createWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const workspace = await teamService.createWorkspace(
      String(req.user!._id),
      req.body.name,
    );
    return sendSuccess(res, workspace, 201);
  } catch (err) {
    return next(err);
  }
}

async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await teamService.listMembers(req.companyId!));
  } catch (err) {
    return next(err);
  }
}

async function listInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(res, await teamService.listInvitations(req.companyId!));
  } catch (err) {
    return next(err);
  }
}

async function createInvitation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const invite = await teamService.createInvitation(
      req.companyId!,
      String(req.user!._id),
      req.membershipRole as MembershipRole,
      req.body,
    );
    return sendSuccess(res, invite, 201);
  } catch (err) {
    return next(err);
  }
}

async function revokeInvitation(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    return sendSuccess(
      res,
      await teamService.revokeInvitation(req.companyId!, paramId(req)),
    );
  } catch (err) {
    return next(err);
  }
}

async function updateMember(req: Request, res: Response, next: NextFunction) {
  try {
    const member = await teamService.updateMemberRole(
      req.companyId!,
      String(req.user!._id),
      req.membershipRole as MembershipRole,
      paramId(req),
      req.body.role,
    );
    return sendSuccess(res, member);
  } catch (err) {
    return next(err);
  }
}

async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    return sendSuccess(
      res,
      await teamService.removeMember(
        req.companyId!,
        String(req.user!._id),
        req.membershipRole as MembershipRole,
        paramId(req),
      ),
    );
  } catch (err) {
    return next(err);
  }
}

async function previewInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query as { token: string };
    return sendSuccess(res, await teamService.previewInvitation(q.token));
  } catch (err) {
    return next(err);
  }
}

async function acceptInvite(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await teamService.acceptInvitation(req.body.token, {
      userId: req.user ? String(req.user._id) : undefined,
      name: req.body.name,
      password: req.body.password,
    });
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

/** Authenticated team management under /companies/current/* */
export const teamRouter = Router();
teamRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

teamRouter.get("/members", listMembers);
teamRouter.patch(
  "/members/:id",
  requireRole("owner"),
  validate({ params: objectIdParamSchema, body: updateMemberRoleSchema }),
  updateMember,
);
teamRouter.delete(
  "/members/:id",
  requireRole("owner", "admin"),
  validate({ params: objectIdParamSchema }),
  removeMember,
);

teamRouter.get(
  "/invitations",
  requireRole("owner", "admin"),
  listInvitations,
);
teamRouter.post(
  "/invitations",
  requireRole("owner", "admin"),
  validate({ body: createInvitationSchema }),
  createInvitation,
);
teamRouter.delete(
  "/invitations/:id",
  requireRole("owner", "admin"),
  validate({ params: objectIdParamSchema }),
  revokeInvitation,
);

/** User-scoped workspace list/create — no active-company context required */
export const companiesRouter = Router();
companiesRouter.use(requireAuth);
companiesRouter.get("/", listWorkspaces);
companiesRouter.post(
  "/",
  validate({ body: createWorkspaceSchema }),
  createWorkspace,
);

/** Public invitation preview/accept under /invitations */
export const invitationsPublicRouter = Router();

invitationsPublicRouter.get(
  "/preview",
  validate({ query: invitationTokenQuerySchema }),
  previewInvite,
);

/** Authenticated accept (email must match invite) */
invitationsPublicRouter.post(
  "/accept",
  requireAuth,
  validate({ body: acceptInvitationSchema }),
  acceptInvite,
);

/** New-account accept (no session) */
invitationsPublicRouter.post(
  "/accept-register",
  validate({ body: acceptInvitationSchema }),
  acceptInvite,
);

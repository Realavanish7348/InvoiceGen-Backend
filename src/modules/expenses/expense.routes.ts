import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess, sendPaginated } from "../../utils/apiResponse.js";
import { badRequest } from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
} from "./expense.schema.js";
import * as expenseService from "./expense.service.js";

const RECEIPT_SUBDIR = "receipts";
const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR, RECEIPT_SUBDIR);
fs.mkdirSync(uploadRoot, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    const companyId = req.companyId ?? "unknown";
    cb(null, `${companyId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Unsupported file type. Use PNG, JPEG, WEBP, or PDF."));
      return;
    }
    cb(null, true);
  },
});

function uploadReceiptMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  upload.single("receipt")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      return next(badRequest(message, "UPLOAD_ERROR"));
    }
    return next();
  });
}

async function listExpenses(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await expenseService.listExpenses({
      companyId: req.companyId!,
      page: req.query.page as number | undefined,
      limit: req.query.limit as number | undefined,
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      from: req.query.from as Date | undefined,
      to: req.query.to as Date | undefined,
    });
    return sendPaginated(res, items, { total, page, limit });
  } catch (err) {
    return next(err);
  }
}

async function getExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.getExpense(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, expense);
  } catch (err) {
    return next(err);
  }
}

async function createExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.createExpense(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, expense, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.updateExpense(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, expense);
  } catch (err) {
    return next(err);
  }
}

async function deleteExpense(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await expenseService.deleteExpense(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

async function uploadReceipt(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw badRequest("Receipt file is required", "FILE_REQUIRED");
    }
    const receiptUrl =
      `/${env.UPLOAD_DIR}/${RECEIPT_SUBDIR}/${req.file.filename}`.replace(
        /\\/g,
        "/",
      );
    const expense = await expenseService.updateReceiptUrl(
      req.companyId!,
      paramId(req),
      receiptUrl,
    );
    return sendSuccess(res, expense);
  } catch (err) {
    return next(err);
  }
}

export const expensesRouter = Router();
expensesRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

expensesRouter.get(
  "/",
  validate({ query: listExpensesQuerySchema }),
  listExpenses,
);
expensesRouter.post(
  "/",
  validate({ body: createExpenseSchema }),
  createExpense,
);
expensesRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getExpense,
);
expensesRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateExpenseSchema }),
  updateExpense,
);
expensesRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteExpense,
);
expensesRouter.post(
  "/:id/receipt",
  validate({ params: objectIdParamSchema }),
  uploadReceiptMiddleware,
  uploadReceipt,
);

import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  resolveCompanyContext,
  rejectClientCompanyId,
} from "../../middleware/resolveCompanyContext.js";
import { validate } from "../../middleware/validate.js";
import { paramId } from "../../utils/params.js";
import { sendSuccess, sendPaginated } from "../../utils/apiResponse.js";
import { objectIdParamSchema } from "../auth/auth.schema.js";
import {
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
} from "./product.schema.js";
import * as productService from "./product.service.js";

async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { items, total, page, limit } = await productService.listProducts({
      companyId: req.companyId!,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
    });
    return sendPaginated(res, items, { total, page, limit });
  } catch (err) {
    return next(err);
  }
}

async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.getProductById(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, product);
  } catch (err) {
    return next(err);
  }
}

async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.createProduct(
      req.companyId!,
      String(req.user!._id),
      req.body,
    );
    return sendSuccess(res, product, 201);
  } catch (err) {
    return next(err);
  }
}

async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.updateProduct(
      req.companyId!,
      paramId(req),
      req.body,
    );
    return sendSuccess(res, product);
  } catch (err) {
    return next(err);
  }
}

async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productService.deleteProduct(
      req.companyId!,
      paramId(req),
    );
    return sendSuccess(res, result);
  } catch (err) {
    return next(err);
  }
}

export const productsRouter = Router();
productsRouter.use(requireAuth, resolveCompanyContext, rejectClientCompanyId);

productsRouter.get(
  "/",
  validate({ query: listProductsQuerySchema }),
  listProducts,
);
productsRouter.get(
  "/:id",
  validate({ params: objectIdParamSchema }),
  getProduct,
);
productsRouter.post(
  "/",
  validate({ body: createProductSchema }),
  createProduct,
);
productsRouter.patch(
  "/:id",
  validate({ params: objectIdParamSchema, body: updateProductSchema }),
  updateProduct,
);
productsRouter.delete(
  "/:id",
  validate({ params: objectIdParamSchema }),
  deleteProduct,
);

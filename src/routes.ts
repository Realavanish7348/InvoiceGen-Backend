import { Router } from "express";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/user.routes.js";
import { businessProfileRouter } from "./modules/businessProfile/businessProfile.routes.js";
import { clientsRouter } from "./modules/clients/client.routes.js";
import { productsRouter } from "./modules/products/product.routes.js";
import { servicesRouter } from "./modules/services/service.routes.js";
import { taxRulesRouter } from "./modules/taxRules/taxRule.routes.js";
import { templatesRouter } from "./modules/templates/template.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { invoicesRouter } from "./modules/invoices/invoice.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { notificationsRouter } from "./modules/notifications/notification.routes.js";
import { subscriptionsRouter } from "./modules/subscriptions/subscription.routes.js";
import { paymentsRouter } from "./modules/payments/payment.routes.js";
import {
  invitationsPublicRouter,
  teamRouter,
  companiesRouter,
} from "./modules/team/team.routes.js";
import { portalRouter } from "./modules/portal/portal.routes.js";
import { expensesRouter } from "./modules/expenses/expense.routes.js";
import { reportsRouter } from "./modules/reports/report.routes.js";
import { aiRouter } from "./modules/ai/ai.routes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/business-profile", businessProfileRouter);
apiRouter.use("/clients", clientsRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/services", servicesRouter);
apiRouter.use("/tax-rules", taxRulesRouter);
apiRouter.use("/templates", templatesRouter);
apiRouter.use("/settings", settingsRouter);
apiRouter.use("/invoices", invoicesRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/subscriptions", subscriptionsRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/companies/current", teamRouter);
apiRouter.use("/companies", companiesRouter);
apiRouter.use("/invitations", invitationsPublicRouter);
apiRouter.use("/portal", portalRouter);
apiRouter.use("/expenses", expensesRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/ai", aiRouter);

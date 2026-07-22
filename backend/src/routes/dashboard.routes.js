import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller.js";
import { getStorms, syncStorms } from "../controllers/jtwc.controller.js";
import { proxyImage } from "../controllers/proxy.controller.js";
export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", dashboardController);
dashboardRouter.get("/dashboard/refresh", dashboardController);
dashboardRouter.get("/storms", getStorms);
dashboardRouter.post("/jtwc-sync", syncStorms);
dashboardRouter.get("/proxy-image", proxyImage);
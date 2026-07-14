import { Router } from "express";
import { dashboardController } from "../controllers/dashboard.controller.js";
export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", dashboardController);
dashboardRouter.get("/dashboard/refresh", dashboardController);
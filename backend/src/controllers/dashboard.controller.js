import { getDashboardData } from "../services/dashboard.service.js";

export async function dashboardController(request, response, next) {
  try {
    const result = await getDashboardData();
    response.set("Cache-Control", "no-store");
    response.json({
      success: true,
      updatedAt: new Date().toISOString(),
      warnings: result.warnings,
      data: result.data
    });
  } catch (error) {
    next(error);
  }
}

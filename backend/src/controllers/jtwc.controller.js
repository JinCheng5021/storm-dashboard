import { syncJtwcStorms, getActiveJtwcStorms } from "../services/jtwc.service.js";

export async function getStorms(req, res, next) {
  try {
    const storms = await getActiveJtwcStorms();
    res.json({ success: true, data: storms });
  } catch (error) {
    next(error);
  }
}

export async function syncStorms(req, res, next) {
  try {
    const result = await syncJtwcStorms();
    if (result.success) {
      res.json({ success: true, message: `Synced ${result.synced} storms successfully.` });
    } else {
      res.status(500).json({ success: false, message: result.error });
    }
  } catch (error) {
    next(error);
  }
}

export async function recalculateImpact(req, res, next) {
  try {
    const { recalculateStormImpact } = await import("../services/stormImpact.service.js");
    const result = await recalculateStormImpact();
    if (result.success) {
      res.json({ success: true, data: result.stats });
    } else {
      res.status(500).json({ success: false, message: result.error || result.message });
    }
  } catch (error) {
    next(error);
  }
}


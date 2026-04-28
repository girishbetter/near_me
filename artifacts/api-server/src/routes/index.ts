import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import statsRouter from "./stats";
import scrapeRouter from "./scrape";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(statsRouter);
router.use(scrapeRouter);

export default router;

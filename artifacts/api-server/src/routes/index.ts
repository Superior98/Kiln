import { Router, type IRouter } from "express";
import assistantRouter from "./assistant";
import healthRouter from "./health";
import publishRouter from "./publish";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assistantRouter);
router.use(publishRouter);

export default router;

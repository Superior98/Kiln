import { Router, type IRouter } from "express";
import assistantRouter from "./assistant";
import projectAgentRouter from "./project-agent";
import healthRouter from "./health";
import publishRouter from "./publish";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assistantRouter);
router.use(projectAgentRouter);
router.use(publishRouter);

export default router;

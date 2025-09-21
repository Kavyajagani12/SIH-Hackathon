import express from 'express';
import { getHomeStations, getDistricts } from '../controllers/homeController.js';

const router = express.Router();

// Home routes
router.get('/home', getHomeStations);
router.get('/districts', getDistricts);

export default router;
